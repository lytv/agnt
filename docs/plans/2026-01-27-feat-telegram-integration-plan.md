# Telegram Chat Streaming and Bidirectional Communication

This plan outlines the steps to integrate Telegram with the AGNT chat system, allowing users to stream chat results to a Telegram bot and reply directly from Telegram. This version includes setup for Cloudflare Tunnel to handle webhooks in local development.

## Proposed Changes

### [Backend]

#### [MODIFY] [package.json](file:///Users/mac/tools/agnt/package.json)
- Add `node-telegram-bot-api` to dependencies.

#### [NEW] [TelegramService.js](file:///Users/mac/tools/agnt/backend/src/services/TelegramService.js)
- Implement `TelegramService` to manage the bot lifecycle.
- Handle incoming messages from Telegram and route them to `OrchestratorService`.
- Provide a method to stream chat deltas to a specific Telegram chat.

#### [MODIFY] [OrchestratorService.js](file:///Users/mac/tools/agnt/backend/src/services/OrchestratorService.js)
- Refactor `universalChatHandler` to extract the core chat logic into a reusable method `processChatMessage`.
- Add hooks to `sendEvent` to forward `content_delta` and `done` events to `TelegramService`.

#### [MODIFY] [server.js](file:///Users/mac/tools/agnt/backend/server.js)
- Initialize `TelegramService` on server start.

#### [MODIFY] [.env.example](file:///Users/mac/tools/agnt/.env.example)
- Add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `CLOUDFLARE_TUNNEL_URL` as optional configuration.

### [Infrastructure/Local Dev]

#### [NEW] [setup-tunnel.sh](file:///Users/mac/tools/agnt/scripts/setup-tunnel.sh)
- Script to automate starting `cloudflared` and setting the Telegram webhook.
- Command: `cloudflared tunnel --url http://localhost:3333`
- Webhook registration: `curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${CLOUDFLARE_TUNNEL_URL}/api/telegram/webhook"`

## Verification Plan

### Automated Tests
- Mock Telegram bot to verify message routing.
- Unit tests for `TelegramService` message handling.

### Manual Verification
1.  **Bot Setup**: Create bot via @BotFather and get token.
2.  **Tunnel**: Run `scripts/setup-tunnel.sh`.
3.  **Config**: Update `.env` with token and tunnel URL.
4.  **Test**: Send message from Telegram and verify stream/reply.
