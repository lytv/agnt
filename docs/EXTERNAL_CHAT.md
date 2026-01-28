# External Chat Integration (Telegram & Discord)

> [!IMPORTANT]
> **PLANNED FEATURE** - This integration is not yet available. This guide describes the intended functionality and helps you prepare for when it's ready.

## What It Will Do

External Chat will allow you to interact with your AGNT AI agents directly from Telegram and Discord—no browser required. Chat with your agents from your phone, receive notifications, and continue conversations seamlessly across platforms.

**Key benefits:**
- **Chat anywhere**: Use Telegram or Discord instead of opening a browser
- **Mobile-friendly**: Full agent conversations from your phone
- **Secure pairing**: One-time code links your messaging account to AGNT
- **Conversation continuity**: Pick up where you left off across all platforms

This feature leverages AGNT's existing Cloudflare Tunnel infrastructure to receive messages instantly without requiring port forwarding or a static IP.

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Cloudflare Tunnel | ✅ Complete | Already working for webhooks |
| Account Pairing System | 📋 Planned | Database + pairing flow |
| Telegram Bot | 📋 Planned | Message receiving + sending |
| Discord Bot | 📋 Planned | WebSocket listener |
| Settings UI | 📋 Planned | Configuration interface |

**Legend:** ✅ Complete | 🚧 In Progress | 📋 Planned

## Prerequisites You Can Do Now

While External Chat isn't ready yet, you can create your bots ahead of time so you're prepared when the feature launches.

### For Telegram

1. **Create a bot** using [@BotFather](https://t.me/botfather) on Telegram:
   - Send `/newbot` to @BotFather
   - Choose a name for your bot (e.g., "My AGNT Assistant")
   - Choose a username (must end in "bot", e.g., "myagnt_bot")
   - Save the **API Token** provided

2. **Save your token** somewhere secure—you'll need it when External Chat launches.

### For Discord

1. **Create an application** on the [Discord Developer Portal](https://discord.com/developers/applications):
   - Click "New Application"
   - Name your application (e.g., "AGNT Bot")

2. **Add a Bot** to your application:
   - Go to the "Bot" tab
   - Click "Add Bot"
   - Enable **Message Content Intent** in the Bot settings (required for reading messages)
   - Click "Reset Token" and save your **Bot Token**

3. **Invite the bot** to your server:
   - Go to the "OAuth2" > "URL Generator" tab
   - Select "bot" scope
   - Select "Send Messages" and "Read Messages" permissions
   - Use the generated URL to invite the bot to your server

4. **Save your token** securely—you'll need it when External Chat is ready.

## How It Will Work

When External Chat launches, the setup process will be:

1. **Configure your bot** in AGNT Settings > External Chat
2. **Generate a pairing code** in the AGNT UI
3. **Pair your account** by sending `/pair <code>` to your bot
4. **Start chatting** with your AGNT agents from Telegram or Discord

Messages you send to your bot will be routed to your AGNT agents, and responses will be sent back to you in real-time. Your conversation history will be synchronized across all platforms (web UI, Telegram, Discord).

## Comparison with Existing Features

| Feature | Use Case | Requires | Status |
|---------|----------|----------|--------|
| **Web UI** | Rich interface, full control | Browser, desktop/mobile app | ✅ Available |
| **Webhooks** | Trigger workflows from external events | Public endpoint, workflow setup | ✅ Available |
| **External Chat** | Conversational AI from messaging apps | Bot setup, account pairing | 📋 Planned |

**When to use each:**
- **Web UI**: Full-featured interface, complex workflows, visual feedback
- **Webhooks**: Automation triggers (GitHub, Stripe, etc.), background processing
- **External Chat**: Quick questions, mobile access, conversational interface

## Security & Privacy

When External Chat launches, it will use a secure pairing system:

- **One-time codes**: Expire after 5 minutes, single-use only
- **Account linking**: Your Telegram/Discord ID is securely mapped to your AGNT user account
- **Message encryption**: All webhook traffic uses HTTPS via Cloudflare Tunnel
- **Access control**: Only paired accounts can access your agents

## How to Track Progress

This feature is actively planned. To follow development:

- **GitHub Issues**: Track implementation progress (issue link will be added)
- **Discord**: Join the [AGNT Discord](https://discord.gg/agnt) for updates
- **Contribute**: Check the [Developer Implementation Guide](development/EXTERNAL_CHAT_IMPLEMENTATION.md) if you'd like to help build this feature

## Related Documentation

- [Instant Webhooks Guide](INSTANT_WEBHOOKS_GUIDE.md) - Working webhook integration using the same Cloudflare Tunnel infrastructure
- [Developer Implementation Guide](development/EXTERNAL_CHAT_IMPLEMENTATION.md) - Technical architecture and implementation plan for contributors
- [Self-Hosting Guide](SELF_HOSTING.md) - Docker deployment options for AGNT

---

**Questions or feedback?** Join the [AGNT Discord](https://discord.gg/agnt) or open an issue on [GitHub](https://github.com/agnt-gg/agnt).
