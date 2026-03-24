# Project Name — Claude Code Instructions

<!--
  This file tells Claude (the AI agent) how to work with your codebase.
  It's read automatically by the Claude auto-implement workflow before
  making any changes. Keep it accurate and up-to-date.

  TEMPLATE INSTRUCTIONS:
  Replace all [PLACEHOLDERS] with your project's actual information.
  Delete sections that don't apply (e.g., Style section for backend projects).
  Add project-specific rules that an AI should know about.
-->

## Project Overview
[One or two sentences describing what this project does and who it's for.]

## Architecture
- `src/` — [Main source directory description]
- `[other key directories]` — [What they contain]

<!--
  Be specific about what each directory does. Claude uses this to know
  which files to read and modify for different types of issues.

  Example:
  - `src/engine/` — Pure TypeScript game engine (state, effects, events)
  - `src/data/` — Event definitions by category
  - `src/ui/` — React components
  - `src/api/` — REST endpoints
-->

## Key Rules
<!--
  List the coding conventions and patterns that Claude must follow.
  Focus on things that aren't obvious from reading the code.

  Examples:
  - All state mutations must be immutable (use spread operator)
  - Use dependency injection, never import singletons directly
  - Error handling: always use Result<T, Error> pattern, never throw
-->

## For Bug Fixes
- [How to identify the root cause — e.g., "Check TypeScript types first"]
- [How to verify the fix — e.g., "Run `npm run build` to verify"]

## For New Features
- [Where to add new code — e.g., "Add new events to `src/data/extra-events.ts`"]
- [Patterns to follow — e.g., "Follow existing patterns in the closest similar file"]
- [What to export — e.g., "Export new events from `src/data/index.ts`"]

## Testing
- `[build command]` — must pass with zero errors
- `[test command]` — [description of test suite]

<!--
  If there are E2E tests, integration tests, or other verification steps,
  list them here so Claude knows to run them.
-->

## Style
<!--
  Only include this section for UI projects. Delete for pure backends/CLIs.
  Describe the visual design system so Claude's changes look consistent.

  Example:
  - Theme: Warm parchment (cream #F5F0E8 background)
  - Fonts: Lora (headings), Source Sans 3 (body)
  - Primary color: #9E3039
  - Accent: #B8860B
-->

## Triage Rules
<!--
  Optional: Add project-specific triage criteria that override or extend
  the defaults. These are used by the Claude triage workflow.

  Examples:
  - Always approve accessibility improvements
  - Reject requests to change the core game mechanic
  - Balance changes need specific numbers (e.g., "+10% to economy"), reject vague ones
  - Reject issues requesting changes to third-party dependencies
-->
