---
description: "Deploy ERA infrastructure and app to Azure, then send a Telegram notification"
agent: "agent"
argument-hint: "Target environment: dev, staging, or prod"
---

# Deploy to Azure

Deploy the ERA application to the specified Azure environment.

Steps:
1. Run `npm run build` to build both frontend and backend
2. Deploy infrastructure: `az deployment group create --resource-group era-rg --template-file infrastructure/main.bicep --parameters environment=<env>`
3. Deploy the application to Azure App Service
4. Verify the health endpoint responds
5. Send a Telegram notification with deployment details using the `telegram-notify` skill
