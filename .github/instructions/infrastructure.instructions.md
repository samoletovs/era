---
description: "Use when editing Bicep templates, ARM parameters, or Azure infrastructure definitions."
applyTo: "infrastructure/**/*.bicep"
---

# Infrastructure conventions

- Use parameter defaults for dev environment
- Always enable managed identity (`SystemAssigned`)
- Enforce HTTPS-only on all web resources
- Use Key Vault for secrets, never hardcode
- Minimum TLS 1.2 everywhere
- Tag all resources with `environment` and `project` tags
