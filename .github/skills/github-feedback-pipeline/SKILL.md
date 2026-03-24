---
name: github-feedback-pipeline
description: >-
  Set up a feedback-to-code pipeline for any project: in-app feedback button that
  creates GitHub issues, auto-labeling workflow, and optionally AI-powered triage
  and auto-implementation. Adapts automatically based on available credentials —
  supports GitHub Copilot coding agent, Claude Code, OpenAI, and Azure OpenAI.
  Use this skill when the user wants to add a feedback form, user feedback system,
  issue-to-code pipeline, auto-fix workflow, GitHub issue automation, or any
  variation of "let users submit feedback that gets automatically triaged and
  implemented." Also trigger when the user says "add feedback button", "set up
  auto-fix", "automate issue resolution", or wants to replicate a feedback
  pipeline on another project. DO NOT trigger for general GitHub Actions
  questions, manual issue management, or CI/CD pipelines without feedback/triage.
---

# GitHub Feedback Pipeline

Set up a feedback pipeline for any project. The pipeline adapts automatically
based on what's available on the repo — no configuration questions needed.

## Auto-Detection

In Step 1, run these checks to determine what automation is possible:

```bash
# 1. Check repo secrets for AI provider credentials
gh secret list

# 2. Check if GitHub Copilot coding agent is available on this repo
#    (requires Copilot subscription on the repo owner's account/org)
gh api repos/OWNER/REPO/copilot --jq '.enabled' 2>/dev/null || echo "not available"
```

The pipeline adapts based on what's detected:

### Automation tiers

| Available | Triage | Auto-implement | Cost |
|-----------|--------|----------------|------|
| **Copilot coding agent** (repo owner has Copilot) | Auto-label only | Assign `copilot` to issues | Free (included in Copilot sub) |
| **API credits** (`ANTHROPIC_API_KEY` secret) | AI triage + label | Claude Code Action creates PRs | ~$0.50-1.00/issue |
| **API credits** (`OPENAI_API_KEY` or `AZURE_OPENAI_KEY`) | AI triage + label | Manual (VS Code) | ~$0.01-0.05/issue for triage |
| **Nothing detected** | Auto-label only | Manual (VS Code) | Free |

**Important constraint**: GitHub Copilot coding agent is tied to the **repo owner's** account
or organization. If the repo owner doesn't have a Copilot subscription, the coding agent
won't be available — even if the developer using VS Code has Copilot on a different account.
The developer can still use Copilot in VS Code to implement issues manually — it just won't
auto-create PRs on GitHub.

### What's always set up (free)
1. Feedback button (in-app issue creation)
2. Auto-label workflow (GitHub Actions — free)
3. `CLAUDE.md` / project instructions (architecture docs for any AI assistant)
4. GitHub labels

### What's added when automation is available
5. *If Copilot*: auto-label workflow assigns `copilot` to labeled issues
6. *If API credentials*: triage workflow (evaluates issues, posts assessment)
7. *If Anthropic key*: implementation workflow (Claude Code creates PRs)

### Default path (always works)
Issues stay labeled. Developer picks them up in VS Code using whatever AI assistant
they have — GitHub Copilot, Claude Code, Cursor, or none. This is the expected path
for most projects. Automated implementation is a bonus, not a requirement.

## How it works

### Without automation (default)
```
User submits feedback (in-app button)
        ↓
GitHub Issue created (with title prefix)
        ↓
Auto-label workflow fires (adds correct label from title)
        ↓
Developer picks up issues in VS Code
  → Uses any AI assistant (Copilot, Claude Code, etc.)
  → Pushes changes and closes issue
```

### With Copilot coding agent
```
User submits feedback (in-app button)
        ↓
GitHub Issue created (with title prefix)
        ↓
Auto-label workflow fires:
  1. Adds correct label from title
  2. Assigns "copilot" to the issue
        ↓
Copilot coding agent picks it up
  → Reads CLAUDE.md for project context
  → Creates a PR with the fix/feature
  → Free (included in Copilot subscription)
```

### With API credentials (full pipeline)
```
User submits feedback (in-app button)
        ↓
GitHub Issue created (with title prefix)
        ↓
Triage workflow fires:
  1. Auto-labels the issue from title emoji prefix
  2. Calls AI to evaluate against quality criteria
  ✅ Approved → adds "approved" label, explains reasoning
  ❌ Rejected → adds "rejected" label, explains why, closes issue
  ❓ Needs info → adds "needs-info" label, asks clarifying questions
        ↓
(If Anthropic key) Claude Implement creates PR for approved issues
(If Copilot available) Assigns copilot to approved issues
(Otherwise) Issues wait for manual implementation in VS Code
```

**Important**: When using API-powered triage, auto-labeling and triage MUST be in the
same workflow job. GitHub Actions does not re-trigger workflows when labels are added
by `GITHUB_TOKEN` (anti-loop protection). The reference template handles this correctly.

## Setup Workflow

Follow these steps in order. Read each reference file as needed.

### Step 1: Detect the project and available automation

Before doing anything, understand the project and what automation is possible:

1. Read the project's `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, or equivalent
2. Check if it's a web app (React, Vue, Svelte, vanilla HTML) or a CLI/library/backend
3. Look for an existing `CLAUDE.md` or `.github/` directory
4. Identify the GitHub remote: `git remote -v` to get `OWNER/REPO`
5. Check the default branch name
6. **Detect automation level**:
   ```bash
   # Check for API credentials
   gh secret list --repo OWNER/REPO
   # Check for Copilot coding agent
   gh api repos/OWNER/REPO --jq '.owner.type' 2>/dev/null
   ```
   - If `ANTHROPIC_API_KEY` found → full triage + implementation available
   - If `OPENAI_API_KEY` or `AZURE_OPENAI_KEY` found → triage available
   - If repo owner has Copilot → Copilot auto-assign available
   - If nothing → manual path only (still set up feedback + auto-label)

Report what was detected and proceed accordingly.

### Step 2: Add the feedback component

**For web apps (React/TypeScript):**
Read `references/feedback-button-react.tsx` and adapt it:
- Replace `REPO_OWNER` and `REPO_NAME` with the actual values
- Adjust the feedback categories to match the project
- Match the project's existing styling approach
- Place the component where it makes sense in the app's layout

**For web apps (vanilla HTML/JS):**
Read `references/feedback-button-html.html` and adapt it.

**For non-web projects (CLI, library, backend):**
Skip the feedback component. Optionally create `.github/ISSUE_TEMPLATE/` with templates.

### Step 3: Create CLAUDE.md

Read `references/claude-instructions-template.md` for the template structure.

Generate a project-specific `CLAUDE.md` at the repo root. This benefits ALL paths —
VS Code AI assistants, Copilot coding agent, and Claude Code all read it.

If a CLAUDE.md already exists, review and update rather than replacing.

### Step 4: Add the auto-label workflow

Read `references/workflow-auto-label.yml` and copy to `.github/workflows/auto-label-issues.yml`.

**If Copilot coding agent is available**, modify the workflow to also assign `copilot`
to the issue after labeling:
```javascript
// After adding the label:
await github.rest.issues.addAssignees({
  owner: context.repo.owner,
  repo: context.repo.repo,
  issue_number: context.issue.number,
  assignees: ['copilot']
});
```

### Step 5: Add AI triage workflow (if API credentials detected)

Skip if no API credentials were found in Step 1.

Read `references/workflow-claude-implement.yml` and copy to `.github/workflows/claude-triage.yml`.

The triage workflow:
- Auto-labels from title emoji prefix
- Calls the AI provider to evaluate the issue
- Posts a triage comment (approved/rejected/needs-info)
- If approved and Anthropic key available: fires `repository_dispatch` for implementation
- If approved and Copilot available: assigns `copilot` to the issue
- Otherwise: issue stays labeled for manual pickup

### Step 6: Add implementation workflow (if Anthropic key detected)

Skip if no `ANTHROPIC_API_KEY` found.

Read `references/workflow-implement.yml` and copy to `.github/workflows/claude-implement.yml`.

This uses `repository_dispatch` from the triage workflow. They must be separate because
GitHub Actions won't re-trigger from labels added by `GITHUB_TOKEN`.

### Step 7: Create GitHub labels

```bash
gh label create "approved" --description "Triaged and approved for implementation" --color 0E8A16 --force
gh label create "rejected" --description "Triaged and rejected" --color D93F0B --force
gh label create "needs-info" --description "More information needed" --color FBCA04 --force
```

Also verify `bug` and `enhancement` labels exist.

### Step 8: Verify the setup

1. Commit and push all new files
2. Create a test issue:
   ```bash
   gh issue create --title "[💡 Feature Idea] Test — verify feedback pipeline" \
     --body "Test issue to verify the pipeline. Please triage and close."
   ```
3. Verify auto-label fires: `gh run list --limit 3`
4. If triage is set up: verify triage comment appears
5. If Copilot is set up: verify copilot was assigned
6. Close the test issue

### Step 9 (Optional): Telegram notifications

If the `telegram-notify` skill is available, mention it as an add-on for post-triage notifications.

## Cost Reference

**Real-world cost data (March 2026):**

| Method | Cost per issue | Notes |
|--------|---------------|-------|
| Copilot coding agent | $0 | Included in Copilot subscription. Best option when available. |
| VS Code + AI assistant | $0 | Manual but free. Developer uses Copilot/Claude Code locally. |
| AI triage only (GPT-4.1 nano via Azure) | ~$0.001 | Cheapest API option for triage. |
| AI triage only (Anthropic Haiku) | ~$0.01-0.05 | |
| AI triage + implementation (Claude Code) | ~$0.50-1.00 | Expensive. 2 issues = $1.90 in testing. |

**Recommendation**: Use Copilot coding agent when the repo is under an account with Copilot.
For personal repos without Copilot, use auto-label + manual VS Code implementation.
Only use API-powered implementation when you have a funded subscription that justifies the cost.

## Concurrency

The workflow uses `concurrency: claude-implement-${{ github.event.issue.number }}` to prevent
multiple runs from conflicting on the same issue, while allowing different issues to be
processed in parallel.
