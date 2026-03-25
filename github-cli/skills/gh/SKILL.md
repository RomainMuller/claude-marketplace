---
name: gh
description: >-
  Load this skill BEFORE running any gh command.
  Reference for correct gh CLI and GitHub API usage, especially in co-located
  jj (Jujutsu) repositories. Trigger this skill whenever: (1) creating or
  updating a PR from a jj repo (gh pr create needs --head/--base explicitly);
  (2) leaving a code review, adding inline comments, approving or requesting
  changes on a PR — whether via gh pr review, gh api, or gh api graphql;
  (3) checking PR status or listing PRs in a jj repo; (4) walking through a PR
  together before approving it; (5) posting a comment on a PR or GitHub issue;
  (6) any gh api graphql mutation touching pull request reviews
  (addPullRequestReview, addPullRequestReviewThread, submitPullRequestReview).
  The jj co-located setup breaks gh branch auto-detection; the GraphQL review
  API has specific input shapes that must be right on the first attempt.
  Use proactively whenever a GitHub PR or issue interaction is in scope.
allowed-tools:
  - Bash(gh:*)
---

# gh CLI in co-located jj repositories

The git working directory in a co-located jj repo often has a detached HEAD or
points somewhere unexpected. `gh` relies on `git symbolic-ref HEAD` to detect
the current branch — this is unreliable here. **Always be explicit.**

## General rules

- Always pass `--repo owner/repo` when there is any doubt about repository context.
- Always pass `--head <bookmark>` when a command needs to know the current branch.
- Always pass `--base <branch>` when a command needs the target branch (never
  let it guess from `git remote`).

---

## Common commands

### gh pr create

```bash
# Auto-fill title and body from commit messages (most common)
gh pr create \
  --head <bookmark-name> \
  --base main \
  --fill

# Override title but auto-fill body from commits
gh pr create \
  --head <bookmark-name> \
  --base main \
  --fill \
  --title "feat(x): my override title"

# Fully manual
gh pr create \
  --head <bookmark-name> \
  --base main \
  --title "..." \
  --body "..."
```

- `--fill` populates title and body from commit messages; `--fill-first` uses
  only the first commit. When `--title` or `--body` are also passed, they take
  precedence over the auto-filled values.
- Use `--body ""` to suppress the interactive editor when you want an empty body.
- Add `--draft` for draft PRs.
- Always pass both `--head` and `--base`.

### gh pr view / status

```bash
# Most reliable: use the PR number
gh pr view 123

# If you don't know the number, specify the head branch
gh pr view --head <bookmark-name>

# Don't use plain `gh pr status` — it may not detect the branch
gh pr list --author @me --state open
```

### gh pr list

```bash
gh pr list --head <bookmark-name>
gh pr list --base main --state open
```

---

## PR Review workflow (GraphQL)

The three-step flow: **create pending review → add comment threads → submit**.

### Step 0 — get the PR node ID

The GraphQL mutations need the PR's node ID, not the number:

```bash
PR_ID=$(gh pr view <number> --json id -q '.id')
```

### Step 1 — create a pending review

```bash
REVIEW_ID=$(gh api graphql -f query='
  mutation($prId: ID!) {
    addPullRequestReview(input: { pullRequestId: $prId }) {
      pullRequestReview { id }
    }
  }
' -f prId="$PR_ID" -q '.data.addPullRequestReview.pullRequestReview.id')
```

Omitting `event` in the input leaves the review in `PENDING` state (a draft
review). Do NOT pass `event: PENDING` — `PENDING` is not a valid enum value for
`PullRequestReviewEvent`; omitting the field achieves the pending state.

### Step 2 — add inline comment threads

```bash
gh api graphql -f query='
  mutation($reviewId: ID!, $path: String!, $line: Int!, $body: String!) {
    addPullRequestReviewThread(input: {
      pullRequestReviewId: $reviewId
      path: $path
      line: $line
      side: RIGHT
      body: $body
    }) {
      thread { id }
    }
  }
' \
  -f reviewId="$REVIEW_ID" \
  -f path="src/foo.ts" \
  -F line=42 \
  -f body="Your comment here"
```

Key notes:
- `side` is `RIGHT` (new file) or `LEFT` (old file). Default to `RIGHT`.
- `line` is the **file line number**, not the diff position.
- Use `-F` (uppercase) for integer fields (`line`, `startLine`).
- Use `-f` (lowercase) for string fields.
- For multi-line comments, add `startLine` (must be ≤ `line`) and optionally `startSide`.
- `pullRequestReviewId` targets a specific pending review. You can also use
  `pullRequestId` alone — GitHub will find or create your pending review — but
  being explicit with the review ID is safer.

### Step 3 — submit the review

```bash
gh api graphql -f query='
  mutation($reviewId: ID!, $event: PullRequestReviewEvent!, $body: String) {
    submitPullRequestReview(input: {
      pullRequestReviewId: $reviewId
      event: $event
      body: $body
    }) {
      pullRequestReview { id state }
    }
  }
' \
  -f reviewId="$REVIEW_ID" \
  -f event="REQUEST_CHANGES" \
  -f body="Overall summary comment (optional)"
```

Valid `event` values: `COMMENT`, `APPROVE`, `REQUEST_CHANGES`.

---

## PR Review — REST alternative

For simple reviews (all comments in one shot, no incremental building):

```bash
gh api -X POST /repos/{owner}/{repo}/pulls/{pr_number}/reviews \
  --field body="Review body" \
  --field event="REQUEST_CHANGES" \
  --field 'comments=[{"path":"src/foo.ts","line":42,"body":"comment"}]'
```

`event`: `COMMENT`, `APPROVE`, `REQUEST_CHANGES`.

For inline comments, `line` is the file line number. Optionally add `side`
(`LEFT`/`RIGHT`) and `start_line`/`start_side` for multi-line spans.

---

## gh api tips

- `-f key=value` — string field (also used for the `query` param in GraphQL)
- `-F key=value` — non-string field: integer, boolean, or JSON
- `--jq` / `-q` — filter the JSON response inline
- `--paginate` — follow pagination links automatically
- GraphQL responses live under `.data.<mutationName>` or `.data.<queryName>`

---

## What to check when a call fails

1. **Missing `--head` or `--base`** — add them explicitly.
2. **GraphQL variable type mismatch** — integers need `-F`, strings need `-f`.
3. **`event: PENDING` rejected** — omit the `event` field entirely for a
   pending review; `PENDING` is a state, not a valid input event.
4. **`position` vs `line`** — `position` is the diff position (deprecated);
   use `line` with the actual file line number instead.
5. **Wrong field name in `addPullRequestReviewThread`** — the field is
   `pullRequestReviewId`, not `reviewId` or `prReviewId`.
