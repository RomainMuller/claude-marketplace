---
name: jj-pr-update
description: >-
  Use when a PR branch needs to be updated against the base branch (e.g. to
  resolve merge conflicts or incorporate upstream changes). Covers: "update my
  PR", "merge main into my branch", "resolve conflicts with main", "my PR has
  conflicts", "sync my branch with main". Uses a merge commit strategy — never
  rebases.
user-invocable: true
allowed-tools:
  - Bash(gh pr view:*)
  - Bash(jj git fetch)
  - Bash(jj log --no-pager:*)
  - Bash(jj show --no-pager:*)
  - Bash(jj new:*)
  - Bash(jj resolve --list:*)
  - Bash(jj bookmark move:*)
  - Bash(jj git push:*)
  - TaskCreate
  - Agent
---

# PR Update via Merge (MUST NOT rebase)

The correct way to incorporate upstream changes into a PR branch is to create a
**merge commit**. Rebasing rewrites history and can corrupt in-flight PR reviews;
a merge commit preserves the full history and is safe to push to the existing PR
branch. You MUST NOT rebase under any circumstances.

## Step 1 — Identify the PR context

If a PR number or URL is available in context, you MUST retrieve the branch
names using:

```
gh pr view <PR> --json headRefName,baseRefName
```

This returns only the two fields needed: `headRefName` (`<pr-head>`) and
`baseRefName` (`<pr-base>`). You MUST NOT fetch additional PR data beyond this.

If no PR reference is in context, ask the user to provide `<pr-head>` and
`<pr-base>` explicitly before proceeding.

## Step 2 — Fetch the latest remote state

```
jj git fetch
```

This updates all remote-tracking bookmarks (e.g. `main@origin`,
`my-feature@origin`) so the merge incorporates the true current upstream state.

## Step 3 — Create the merge changeset

```
jj new <pr-head>@origin <pr-base>@origin -m "Merge origin/<pr-base> into <pr-head>"
```

This creates a new commit whose parents are:
1. The current tip of the PR branch on origin (`<pr-head>@origin`)
2. The current tip of the base branch on origin (`<pr-base>@origin`)

The working copy (`@`) is now the merge commit. When conflicts exist, `jj new`
always emits a `Warning:` block listing them:

```
Warning: There are unresolved conflicts at these paths:
file.txt    2-sided conflict
```

If no such warning appears there are no conflicts — skip to Step 5.

## Step 4 — Resolve conflicts

Parse the conflicted file list from `jj new`'s warning output, then create one
task per conflicted file (using `TaskCreate`), then dispatch one sub-agent per
task in parallel (using the `Agent` tool). Each sub-agent MUST receive:

- The file path to resolve
- `<pr-head>` and `<pr-base>` as context

Each sub-agent MUST follow this resolution process:

1. **Gather context before touching anything.** Examine recent commits that
   touched the file on the base branch side to understand *why* the change was
   made:
   ```
   jj log --no-pager -r ':<pr-base>@origin' -- <file>
   ```
   Then inspect the relevant commit(s):
   ```
   jj show --no-pager <rev> -- <file>
   ```
   Cross-reference with what the PR branch was trying to achieve. The goal is to
   reconcile *intent*, not just syntax.

2. **Resolve intelligently.** Read the conflict markers (`<<<<<<<` / `%%%%%%%` /
   `+++++++` / `>>>>>>>`) and produce a merged result that honours both sides'
   intent. You MUST NOT blindly pick one side.

3. **Ask when genuinely ambiguous.** If the right resolution cannot be
   determined from code and history alone (e.g. two sides changed the same logic
   in incompatible ways with no clear winner), you MUST NOT guess. Instead,
   surface a directed question to the user that describes exactly what each side
   is doing and asks which intent should win (or how to reconcile them).

4. **Write the resolved file** with all conflict markers removed.

After all sub-agents complete, run `jj resolve --list --no-pager` to confirm no
conflicts remain.

## Step 5 — Quality assurance

You MUST run whatever the project configures for formatting, linting, and
testing, scoped to the files touched by the merge. You MUST NOT skip this step —
merged code must pass CI before being pushed.

## Step 6 — Move the bookmark to the merge commit

```
jj bookmark move <pr-head> --to @
```

The `<pr-head>` bookmark now points to the resolved merge commit.

## Step 7 — Summarize and offer to push

1. Summarize what conflicts were resolved and how (brief, per-file).
2. You MUST NOT push automatically. Ask the user:

   > Merge commit is ready. Push `<pr-head>` to origin?

Only push if the user explicitly confirms:

```
jj git push --bookmark <pr-head>
```
