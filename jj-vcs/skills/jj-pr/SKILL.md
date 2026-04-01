---
name: jj-pr
description: >-
  Use when creating, opening, or submitting a pull request (PR) from a jj
  repository. Covers: "create a PR", "open a PR", "submit for review",
  "push and create a PR", "send this for review", "make a pull request".
  Instructs on proper use of jj bookmarks and gh CLI for PR creation.
user-invocable: true
allowed-tools:
  - Bash(jj git fetch)
  - Bash(jj log --no-pager:*)
  - Bash(jj rebase:*)
  - Bash(jj bookmark create:*)
  - Bash(jj git push --allow-new -r:*)
  - Bash(gh pr create:*)
---

# Pre-flight: sync and rebase check

**Always do this before creating the PR.**

1. Run `jj git fetch` to fetch the remote, which ensures `trunk()` is current.
2. Run `jj log --no-pager -r 'trunk()..@'` to see which commits will be included in the PR.
   - If the output shows only the expected change(s), proceed to [Workflow](#workflow).
   - If it shows **extra commits** that belong to a parent PR which has already been merged (common
     after squash-merges: `trunk()` advanced with a squash commit, but the original multi-commit
     chain is still in `@`'s ancestry), rebase your change(s) onto the new trunk:
     ```
     jj rebase -s <your-change-id> -o 'trunk()'
     ```
     Then re-run `jj log --no-pager -r 'trunk()..@'` to confirm only your change(s) remain.

# Workflow

1. If needed, create a new bookmark using `jj bookmark create <BOOKMARK_NAME> -r <CHANGE_ID>` using a short, descriptive
   `<BOOKMARK_NAME>` according to the user's preference or instructions
2. Push the `<BOOKMARK_NAME>` to GitHub using `jj git push -r <BOOKMARK_NAME>`
3. Create the PR on GitHub using `gh pr create --head <BOOKMARK_NAME>`, adding `--draft` if the user requested a draft
   Pull Request
4. Return the URL to the PR to the user.
