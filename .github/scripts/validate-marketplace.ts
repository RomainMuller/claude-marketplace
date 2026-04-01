#!/usr/bin/env bun
/**
 * Validates marketplace.json: well-formed JSON, plugins array present,
 * each entry has required fields, no duplicate plugin names, all on-disk
 * plugins represented, fields match plugin.json, sorted alphabetically.
 *
 * Usage:
 *   bun validate-marketplace.ts <path-to-marketplace.json> [--fix]
 */

import { readFile, readdir, writeFile, access } from "fs/promises";
import { dirname, join, resolve } from "path";

interface PluginInfo {
  name: string;
  description: string;
  dirName: string;
}

/** Returns true if the source refers to a remote (non-local) plugin. */
function isRemoteSource(source: string): boolean {
  return source.startsWith("github:");
}

/**
 * Discover all plugins on disk under `pluginRoot` by looking for
 * directories that contain a `.claude-plugin/plugin.json` file.
 */
async function discoverPlugins(
  pluginRoot: string,
): Promise<Map<string, PluginInfo>> {
  const plugins = new Map<string, PluginInfo>();
  const entries = await readdir(pluginRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const pluginJsonPath = join(pluginRoot, entry.name, ".claude-plugin", "plugin.json");
    try {
      await access(pluginJsonPath);
    } catch {
      continue; // no plugin.json → not a plugin
    }
    const raw = await readFile(pluginJsonPath, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    plugins.set(entry.name, {
      name: (data.name as string) ?? entry.name,
      description: (data.description as string) ?? "",
      dirName: entry.name,
    });
  }
  return plugins;
}

async function main() {
  const args = process.argv.slice(2);
  const fix = args.includes("--fix");
  const filePath = args.find((a) => !a.startsWith("--"));
  if (!filePath) {
    console.error("Usage: validate-marketplace.ts <path-to-marketplace.json> [--fix]");
    process.exit(2);
  }

  const content = await readFile(filePath, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    console.error(
      `ERROR: ${filePath} is not valid JSON: ${err instanceof Error ? err.message : err}`,
    );
    process.exit(1);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.error(`ERROR: ${filePath} must be a JSON object`);
    process.exit(1);
  }

  const marketplace = parsed as Record<string, unknown>;
  if (!Array.isArray(marketplace.plugins)) {
    console.error(`ERROR: ${filePath} missing "plugins" array`);
    process.exit(1);
  }

  // --- Structural validation (non-fixable) ---
  const errors: string[] = [];
  const seen = new Set<string>();
  const required = ["name", "description", "source"] as const;

  marketplace.plugins.forEach((p, i) => {
    if (!p || typeof p !== "object") {
      errors.push(`plugins[${i}]: must be an object`);
      return;
    }
    const entry = p as Record<string, unknown>;
    for (const field of required) {
      if (!entry[field]) {
        errors.push(
          `plugins[${i}] (${entry.name ?? "?"}): missing required field "${field}"`,
        );
      }
    }
    if (typeof entry.name === "string") {
      if (seen.has(entry.name)) {
        errors.push(`plugins[${i}]: duplicate plugin name "${entry.name}"`);
      }
      seen.add(entry.name);
    }
  });

  // --- Discover on-disk plugins ---
  const pluginRootRel =
    typeof (marketplace as Record<string, unknown>).metadata === "object" &&
    (marketplace as Record<string, unknown>).metadata !== null
      ? (((marketplace as Record<string, unknown>).metadata as Record<string, unknown>)
            .pluginRoot as string | undefined) ?? "."
      : ".";
  // pluginRoot is relative to the repo root (parent of .claude-plugin/)
  const repoRoot = resolve(dirname(filePath), "..");
  const pluginRoot = resolve(repoRoot, pluginRootRel);
  const onDisk = await discoverPlugins(pluginRoot);

  // --- Cross-reference validation (fixable) ---
  const fixableErrors: string[] = [];
  const plugins = marketplace.plugins as Record<string, unknown>[];

  /** Strip leading "./" from a source to get the bare directory name. */
  const sourceToDirName = (source: string) =>
    source.startsWith("./") ? source.slice(2) : source;

  const listedSources = new Set(
    plugins
      .filter((p) => p && typeof p === "object" && !isRemoteSource(p.source as string))
      .map((p) => sourceToDirName(p.source as string)),
  );

  // Check each listed plugin against on-disk state
  for (let i = 0; i < plugins.length; i++) {
    const entry = plugins[i];
    if (!entry || typeof entry !== "object") continue;
    const source = entry.source as string | undefined;
    if (!source) continue;

    // Remote plugins (e.g. github:owner/repo) are not checked against disk
    if (isRemoteSource(source)) continue;

    if (!source.startsWith("./")) {
      fixableErrors.push(
        `plugins[${i}] (${entry.name ?? "?"}): source "${source}" must start with "./"`,
      );
    }

    const dirName = sourceToDirName(source);
    const disk = onDisk.get(dirName);
    if (!disk) {
      fixableErrors.push(
        `plugins[${i}] (${entry.name ?? "?"}): source "${source}" does not exist on disk`,
      );
      continue;
    }
    if (entry.name !== disk.name) {
      fixableErrors.push(
        `plugins[${i}]: name "${entry.name}" should be "${disk.name}" (per plugin.json)`,
      );
    }
    if (entry.description !== disk.description) {
      fixableErrors.push(
        `plugins[${i}] (${entry.name ?? "?"}): description mismatch with plugin.json`,
      );
    }
  }

  // Check for on-disk plugins missing from the list
  for (const [dirName, info] of onDisk) {
    if (!listedSources.has(dirName)) {
      fixableErrors.push(
        `plugin "${info.name}" (${dirName}) exists on disk but is not listed`,
      );
    }
  }

  // Check sort order
  const names = plugins
    .filter((p) => p && typeof p === "object" && typeof p.name === "string")
    .map((p) => p.name as string);
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  if (names.some((n, i) => n !== sorted[i])) {
    fixableErrors.push("plugins array is not sorted alphabetically by name");
  }

  // --- Fix mode ---
  if (fix && (fixableErrors.length || errors.some((e) => e.includes("missing required field")))) {
    // Rebuild the plugins array from on-disk state
    const fixed: { name: string; description: string; source: string }[] = [];
    // Keep existing entries that have a valid on-disk source, updating fields;
    // preserve remote entries as-is.
    for (const entry of plugins) {
      if (!entry || typeof entry !== "object") continue;
      const source = entry.source as string | undefined;
      if (!source) continue;
      if (isRemoteSource(source)) {
        fixed.push({
          name: entry.name as string,
          description: entry.description as string,
          source,
        });
        continue;
      }
      const dirName = sourceToDirName(source);
      const disk = onDisk.get(dirName);
      if (!disk) continue; // remove non-existent
      fixed.push({
        name: disk.name,
        description: disk.description,
        source: `./${dirName}`,
      });
    }
    // Add missing on-disk plugins
    for (const [dirName, info] of onDisk) {
      if (!fixed.some((f) => sourceToDirName(f.source) === dirName)) {
        fixed.push({
          name: info.name,
          description: info.description,
          source: `./${dirName}`,
        });
      }
    }
    // Sort alphabetically
    fixed.sort((a, b) => a.name.localeCompare(b.name));

    // Write back
    const output = { ...parsed as Record<string, unknown>, plugins: fixed };
    await writeFile(filePath, JSON.stringify(output, null, 2) + "\n", "utf-8");

    console.log(`FIXED: ${filePath}`);
    for (const e of fixableErrors) console.log(`  - ${e}`);
    if (errors.length) {
      // Re-validate structural errors that couldn't be auto-fixed
      const remaining = errors.filter(
        (e) => !e.includes("missing required field"),
      );
      if (remaining.length) {
        console.error(`\nERROR: ${remaining.length} non-fixable error(s) remain:`);
        for (const e of remaining) console.error(`  - ${e}`);
        process.exit(1);
      }
    }
    process.exit(0);
  }

  // --- Report errors ---
  const allErrors = [...errors, ...fixableErrors];
  if (allErrors.length) {
    console.error(
      `ERROR: ${filePath} has ${allErrors.length} validation error(s):`,
    );
    for (const e of allErrors) console.error(`  - ${e}`);
    if (fixableErrors.length) {
      console.error(`\nHint: ${fixableErrors.length} error(s) are auto-fixable with --fix`);
    }
    process.exit(1);
  }

  console.log(
    `OK: ${marketplace.plugins.length} plugins, no duplicates, all required fields present`,
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
