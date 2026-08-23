# ERA — Copilot workspace instructions

## Project

ERA (Enterprise Resource Agents) — cloud ERP.

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: Azure Cosmos DB (NoSQL)
- **Auth**: Microsoft Entra ID
- **Infrastructure**: Bicep → Azure
- **CI/CD**: GitHub Actions

## Build and test

```bash
npm install          # Install all dependencies
npm run dev           # Start frontend + backend in parallel
npm run build         # Production build
npm test              # Run unit tests (vitest)
npm run test:e2e      # Run e2e tests (playwright)
npm run lint          # Lint all source files
```

## Conventions

- TypeScript strict mode everywhere
- Shared types live in `src/shared/types/` — never duplicate across front/backend
- `zod` for runtime validation at API boundaries
- Sentence case for all UI text (per design-system skill)
- Inter font family for UI (per design-system skill)
- See `README.md` for module overview and architecture

## Design Principle: Zero-Config, Agent-Driven

ERA is a future ERP run by AI agents. Users provide facts, the system decides how to process them.

- **Never add a settings field** for something that can be derived from country legislation or posting rules
- **Posting rules** (in `src/shared/rules/{cc}.ts`) encode all accounting logic — GL accounts, VAT treatment, FX gain/loss accounts
- When building a new feature, ask: "Can the system figure this out automatically?" If yes, use rules, not settings
- Every feature should be operable by an AI agent end-to-end — minimize required user interaction
- New country = new posting rules file, not new settings UI

## Git

- GitHub account: `samoletovs`
- Descriptive commit messages
- Push to `origin/main`

## Deployments

- Infrastructure: `az deployment group create --resource-group era-rg --template-file infrastructure/main.bicep`
- Always send a Telegram notification after deployment using the `telegram-notify` skill

<!-- CANONICAL — maintained in samoletovs/nauroLabs-github at config/copilot-pr-guard.md.
     Rolled out by scripts/install-pr-guard.ps1. Edit it there, not in the copy. -->

## Before you open a pull request

Measured across 131 merged PRs in this lab: **15% were self-declared `[WIP]` or
no-ops**. Each one still cost a full 10–30 minute agent run, and agent runs are
the single largest line in the lab's CI bill — around 63% of the monthly
allowance. A PR that says it isn't finished is the most expensive possible way to
report that you couldn't finish.

So: do not open a pull request unless all three of these are true.

**1. You changed behaviour.**
A change that only adds comments, reformats code, or restates the issue is not a
fix. If you discover the work is already done, **say so in a comment on the issue
and stop** — do not open a PR titled `No-op: already implemented`. The comment is
the useful artifact; the PR is noise that a human then has to close.

**2. You finished.**
Never open a PR titled `[WIP]`, `[Draft]`, or `Partial`. If something blocks you,
comment on the issue with: what you were trying to do, what you tried, the exact
error or ambiguity that stopped you, and what decision you need from a human.
That comment is worth more than a half-finished branch and costs a fraction as
much to act on.

**3. You verified it, and you say how.**
The PR description must state what you ran and what it printed. "Should work" and
"this should fix the issue" are not verification.

- If the repo has tests, add one that **fails without your change**. A test that
  passes either way certifies the implementation, not the requirement.
- If the change is not testable, say plainly what you checked by hand.
- If you could not verify it, say that too, in the description, rather than
  leaving it implied.

**Write the description properly.** It is the only part of your work that reaches
a human on a phone screen, and the merge gate refuses PRs whose body is empty or
boilerplate. Say what was broken, what you changed, and how you know it works.
