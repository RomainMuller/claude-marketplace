---
name: jj-pr
description: >-
  Use when creating, opening, or submitting a pull request (PR) from a jj
  repository. Covers: "create a PR", "open a PR", "submit for review",
  "push and create a PR", "send this for review", "make a pull request".
  Instructs on proper use of jj bookmarks and gh CLI for PR creation.
user-invocable: true
allowed-tools:
  - Bash(jj bookmark create:*)
  - Bash(jj git push --allow-new -r:*)
  - Bash(gh pr create:*)
---

# Workflow

1. If needed, create a new bookmark using `jj bookmark create <BOOKMARK_NAME> -r <CHANGE_ID>` using a short, descriptive
   `<BOOKMARK_NAME>` according to the user's preference or instructions
2. Push the `<BOOKMARK_NAME>` to GitHub using `jj git push -r <BOOKMARK_NAME>`
3. Create the PR on GitHub using `gh pr create --head <BOOKMARK_NAME>`, adding `--draft` if the user requested a draft
   Pull Request
4. Return the URL to the PR to the user.
