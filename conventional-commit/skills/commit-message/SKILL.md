---
name: commit-message
description: >-
  Use when writing or generating a commit message or change description.
  Covers: "commit", "describe this change", "jj describe", "jj commit",
  "jj split", "write a commit message", "commit these changes",
  "message for this commit". Enforces conventional commit format.
allowed-tools:
  - WebFetch(domain:www.conventionalcommits.org)
---

# Commit Messages standards

## General considerations

Unless there are other specific instructions in the context of a repository, I use [conventional commit][conv-commit].
The commit message standards documented on a repository (or failing that, [conventional commit][conv-commit]) MUST be
honored. This is not negotiable, as this is the cornerstone to fluid collaboration on the repositories.

## Commit message structure (generally applicable)

You will only generate commit messages that conform to the following structure:
```
<subject line>

<body>

<header trailers>
```

### Subject Line

- When fixing a bug, the subject line should express what bug is being fixed (from the user's point of view, ideally)
- The subject line should be 50 characters long or less; and should not exceed 72 characters
- [Conventional commit][conv-commit] subject lines should not be capitalized (acronyms and proper nouns within should
  still be cased appropriately):
  - GOOD: `fix(component): panic when IP address is missing`
  - BAD: `fix(component): panic when ip address is missing` - `IP` should be all upper-case
  - BAD: `fix(component): Panic when IP address is missing` - the first should not be capitalized (unless it's an
    acronym or proper noun).
- Use the _imperative mood_ in subject lines, making them seem like you're giving a command.
  - Using the imperative mood in makes them more consistent and command-like, which is helpful in understanding the
    actions taken.
- The subject line must not end with a period
- References to code names, file paths, etc... must be enclosed between `backticks`.

### Body
- The subject line and body must be separated by a blank line
- The body should be wrapped at 72 characters
- Use the body to explain _what_ change is being made and _why_ it is being made
  - Be concise, but not terse. Optimize for humans to understand the context and intention.
  - Remember these are useful several months after the fact when trying to make sense of a change in unpleasant
    circumstances (i.e, a mean bug is being investigated)
  - When fixing a bug, the "why" includes elements explaining the mechanism which triggers the bug & relevant elements
    of the root cause analysis.
  - The "why" must convey enough context to convince others that:
    - The correct issue has been identified
    - The change correctly addresses the issue on hand
  - The "what" must be a succinct description of changes in the PR. For details, the user will read the full diff.
    - This serves as a "map" for a reviewer to be able to review the change more easily
- The body should only ever contain a "testing plan" section if MANUAL testing is required as part of the change's QA
  - In particular, stating "CI is green" or similar things is redundant (we disallow merging PRs unless the CI is green)
- Use active voice when writing the body, as it is easier to read and process by humans than passive voice.
- References to code names, file paths, etc... must be enclosed between `backticks`.

### Header Trailers

- The body is followed by header lines, separated from the body by a blank line
  - References to GitHub issues (but NOT to Jira tickets, this is only in the bookmark/branch name):
    - GitHub issues: `Fixes: Owner/Repo#ID`

[conv-commit]: https://www.conventionalcommits.org/en/v1.0.0/#specification
