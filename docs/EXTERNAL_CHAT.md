# External Chat Integration (Telegram & Discord)

> [!IMPORTANT]
> **PLANNED FEATURE** - This integration is not yet available. This guide describes the intended functionality and helps you prepare for when it's ready.

## What It Will Do

External Chat will allow you to interact with your AGNT agents directly from messaging apps you already use every day. Instead of opening the AGNT desktop app or web interface, you'll be able to:

- **Chat with agents from anywhere**: Send messages to your agents via Telegram or Discord and receive AI responses in real-time.
- **Continue conversations seamlessly**: Your chat history will sync between the messaging app and AGNT's web interface.
- **Trigger workflows**: Start automated workflows by sending commands to your bot.

This is perfect for quick interactions when you're on mobile, want notifications, or prefer conversational interfaces over traditional UIs.

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Cloudflare Tunnel | ✅ Complete | Already working for webhooks |
| Account Pairing System | 📋 Planned | Database + pairing flow |
| Telegram Bot | 📋 Planned | Message receiving + sending |
| Discord Bot | 📋 Planned | WebSocket listener |
| Settings UI | 📋 Planned | Configuration interface |
| Conversation Sync | 📋 Planned | Bidirectional message history |

**Legend**: ✅ Complete | 🚧 In Progress | 📋 Planned

## Prerequisites You Can Do Now

While the feature isn't ready yet, you can prepare by creating your bot accounts. When External Chat launches, you'll be able to connect them immediately.

### For Telegram

1. **Create a bot via BotFather**:
   - Open Telegram and search for `@BotFather`
   - Send `/newbot` and follow the prompts
   - Choose a name (e.g., "My AGNT Bot") and username (e.g., "my_agnt_bot")
   - **Save the bot token** - you'll need this later

2. **Get your Chat ID** (optional):
   - Start a chat with your new bot
   - Send any message
   - Visit `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Find `"chat":{"id":...}` in the response - this is your Chat ID

### For Discord

1. **Create a Discord application**:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application" and give it a name
   - Navigate to the "Bot" section and click "Add Bot"
   - **Save the bot token** - you'll need this later

2. **Configure bot permissions**:
   - In the Bot section, enable "Message Content Intent"
   - In OAuth2 → URL Generator, select scopes: `bot`, `applications.commands`
   - Select permissions: "Send Messages", "Read Message History"
   - Copy the generated URL to invite the bot to your server

> [!NOTE]
> These setup steps work today. You're just creating the bot accounts - the AGNT integration will be configured later.

## How It Will Work

Once implemented, here's the user experience:

1. **In AGNT Settings**: Generate a 6-digit pairing code
2. **In Telegram/Discord**: Send `/pair <code>` to your bot
3. **Confirmation**: AGNT links your messaging account to your user profile
4. **Start chatting**: Send messages to the bot, receive AI responses

Your conversations will appear in both the messaging app and AGNT's web interface, synced in real-time.

## Comparison with Existing Features

| Feature | Use Case | Requires |
|---------|----------|----------|
| **Web UI** | Rich interface, full control | Browser, desktop/mobile app |
| **Webhooks** | Trigger workflows from external events | Public endpoint, workflow setup |
| **External Chat** | Conversational AI from messaging apps | Bot setup, account pairing |

**Use External Chat when**: You want quick access to your agents without opening AGNT, prefer mobile-first interactions, or want notifications for responses.

**Use Webhooks when**: You need to trigger automated workflows from external services (GitHub, Stripe, etc.) without human interaction.

**Use Web UI when**: You need full control over agent configuration, workflow design, or plugin management.

## How to Track Progress

This feature is planned for a future release. To stay updated:

- **Watch the GitHub repository**: [github.com/lytv/agnt](https://github.com/lytv/agnt)
- **Join the Discord community**: [discord.gg/agnt](https://discord.gg/agnt)
- **Check the changelog**: Updates will be announced in release notes

Want to contribute? See the [Developer Implementation Guide](development/EXTERNAL_CHAT_IMPLEMENTATION.md) for technical details.

## Security & Privacy

When implemented, External Chat will use:

- **Time-limited pairing codes** (expire after 5 minutes)
- **One-time use codes** (prevent replay attacks)
- **Webhook signature verification** (validate Telegram/Discord requests)
- **Local database storage** (your linked accounts stay on your machine)

No message content is sent to external services except the messaging platforms you explicitly connect.

## Frequently Asked Questions

### When will this be available?

There's no fixed timeline yet. Implementation depends on community feedback and prioritization. Follow the GitHub repository for updates.

### Can I help build this?

Yes! This is an open-source project. Check the [Developer Implementation Guide](development/EXTERNAL_CHAT_IMPLEMENTATION.md) for architecture details and implementation phases.

### Will this work with self-hosted AGNT?

Yes. External Chat will work with Docker deployments, Electron apps, and hybrid setups. You'll just need a public URL for webhooks (already supported via Cloudflare Tunnel).

### Will other platforms be supported (WhatsApp, Slack, etc.)?

Telegram and Discord are the initial targets. Other platforms may be added based on demand and API availability.

## Related Documentation

- [Instant Webhooks Guide](INSTANT_WEBHOOKS_GUIDE.md) - Working webhook integration using Cloudflare Tunnel
- [Self-Hosting Guide](SELF_HOSTING.md) - Docker deployment options
- [Developer Implementation Guide](development/EXTERNAL_CHAT_IMPLEMENTATION.md) - Technical architecture for contributors
