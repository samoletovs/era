---
name: telegram-notify
description: >-
  Send a Telegram notification to the user (Sam) via his personal agent, including
  a detailed summary of what was done. TRIGGER when: the user asks to be notified on
  Telegram, wants a message when done, says "notify me when finished", "let me know
  on Telegram", "send me a message when done", "ping me when complete", "tell me
  when you're done", or any variation of requesting a Telegram/mobile notification
  about task completion or progress. Also trigger when the user says "notify me",
  "let me know", or "message me" without specifying a channel — Telegram is the
  default. Even if the user just says "and notify me" at the end of a larger request,
  this skill applies. DO NOT TRIGGER for general messaging, chatbot building, or
  Telegram bot development tasks.
---

# Telegram Notify

Send a notification to Sam's Telegram with a **detailed summary** of what you actually did.
The notification goes through a lightweight Azure Function endpoint — no AI processing,
just direct message delivery. Sam reads these on his phone, so the message should be
self-contained and informative enough that he doesn't need to open his laptop to understand
what happened.

## How to compose the notification message

This is the most important part. Think about what Sam would want to know when he glances
at his phone. A vague "Done!" is useless — he needs to know *what* was done and *whether
it worked*.

Write the message as a brief summary following this pattern:

```
[status emoji] [task title]

[what changed, specifically]
[any relevant numbers: tests passed, files changed, etc.]
[if something needs attention, mention it]
```

### Status prefixes

- Use a checkmark for success, cross for failure, warning for partial:
  - `Done:` or `Completed:` for success
  - `Failed:` for failures
  - `Partial:` or `Warning:` when something needs attention

### What makes a good notification

Think about the *diff* — what changed from before to after. Include:

- **Specific changes**: "Changed primary button color from #3B82F6 to #10B981 in Button.tsx"
  not just "Updated the button color"
- **Scope**: "Refactored 3 files: auth.ts, middleware.ts, routes.ts"
  not just "Refactored auth"
- **Outcomes**: "All 142 tests passing" or "Build succeeded, deployed to staging"
  not just "Tests pass"
- **Before/after when relevant**: "Reduced bundle size from 2.4MB to 1.1MB"

### Examples of good vs bad messages

Bad: `"Done: Updated the code as requested."`
Good: `"Done: Changed navbar background from #1a1a2e to #0f3460 and text color from #fff to #e0e0e0 in src/components/Navbar.css. App renders correctly, no console errors."`

Bad: `"Failed: There was an error."`
Good: `"Failed: Migration script crashed on step 3/5 — column 'user_email' already exists in 'accounts' table. First 2 steps completed successfully. Rolled back changes."`

Bad: `"Completed the refactoring task."`
Good: `"Done: Extracted auth logic into useAuth hook (src/hooks/useAuth.ts). Updated 4 components to use it: Login, Signup, Dashboard, Profile. Removed 87 lines of duplicated code. All 23 tests passing."`

## Sending the notification

Run this command in the terminal. On **any OS** (works in bash, zsh, PowerShell):

```bash
curl -s -X POST "https://func-agents-s6vbks3oteo4y.azurewebsites.net/api/notify?code=r_R7xLV9tH3-9XjJ0dbniNan9OXwkZ2S8luCASzGE8OZAzFuxePshQ==" \
  -H "Content-Type: application/json" \
  -d '{"message": "YOUR_DETAILED_MESSAGE_HERE"}'
```

If running in **PowerShell** and curl isn't available, use this alternative:

```powershell
$body = @{message = "YOUR_DETAILED_MESSAGE_HERE"} | ConvertTo-Json
Invoke-WebRequest -Uri "https://func-agents-s6vbks3oteo4y.azurewebsites.net/api/notify?code=r_R7xLV9tH3-9XjJ0dbniNan9OXwkZ2S8luCASzGE8OZAzFuxePshQ==" -Method POST -ContentType "application/json" -Body $body
```

Or use Python (universally available):

```python
python -c "import urllib.request,json; urllib.request.urlopen(urllib.request.Request('https://func-agents-s6vbks3oteo4y.azurewebsites.net/api/notify?code=r_R7xLV9tH3-9XjJ0dbniNan9OXwkZ2S8luCASzGE8OZAzFuxePshQ==', json.dumps({'message': 'YOUR_DETAILED_MESSAGE_HERE'}).encode(), {'Content-Type':'application/json'}), timeout=15)"
```

### Handling failures

If the notification itself fails (network error, non-200 response), retry once after 3 seconds.
If it fails again, don't block on it — just mention in your response to the user that the
Telegram notification didn't go through.

## When to send notifications

Send a notification when:
- You've finished the user's main task (the final step, after verifying it works)
- A long-running operation completes — build, deploy, migration, large refactor
- Something fails and the user should know about it
- The user explicitly asked to be notified

Do NOT notify for intermediate steps. Send one notification at the end, covering everything
you did.

## Timing

Send the notification as your **very last action** — after all code changes are made, tests
pass, and you've verified the result. The notification is a signal that the work is truly done
and Sam can look at the result.

## Setup (first-time only)

If the function key above stops working, refresh it:

```bash
az functionapp keys list --name func-agents-s6vbks3oteo4y --resource-group rg-personal-agents --query "functionKeys.default" -o tsv
```

Requires Azure CLI login with `146099412+samoletovs@users.noreply.github.com`.

## Troubleshooting

- **401/403**: Function key is wrong or expired. Re-fetch with the `az` command above.
- **502**: Telegram API issue. Retry once after 3 seconds.
- **Timeout/no response**: Check health: `curl https://func-agents-s6vbks3oteo4y.azurewebsites.net/api/health`
