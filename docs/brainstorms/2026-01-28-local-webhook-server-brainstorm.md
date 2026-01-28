# Local Webhook Server Brainstorm

**Date:** 2026-01-28
**Status:** Ready for Planning
**Original Spec:** `docs/plans/LOCAL_WEBHOOK_SERVER.md`

---

## What We're Building

A Local Webhook Server that allows AGNT to receive webhooks directly on the user's machine through tunnel providers (Cloudflare Tunnel, ngrok), eliminating the need for the remote api.agnt.gg polling system.

### Core Goals
1. **Instant webhook delivery** - No 10-second polling delay
2. **Remove PRO dependency** - Local webhooks work without PRO license
3. **Self-contained operation** - Works offline or in restricted networks

---

## Why This Approach

### Chosen Architecture: Plugin-Based with Provider Adapters

We chose a **TunnelService with adapter pattern** because:
- AGNT already uses plugin/adapter patterns throughout the codebase
- Easy to add new providers (localtunnel, manual URL) in future versions
- Clean separation between tunnel management logic and provider-specific code
- Each provider adapter is self-contained and testable

### Alternatives Considered

| Approach | Why Not Chosen |
|----------|----------------|
| Simple Provider Switch | Gets messy with multiple providers, duplicate code |
| External npm packages | Less control, ngrok npm requires auth even for free tier |

---

## Key Decisions

### 1. Platform Priority
- **macOS first** - Start with brew-based installation
- Other platforms (Windows, Linux, Docker) added later

### 2. Tunnel Providers (v1)
- **Cloudflare Tunnel** - Quick tunnels (no account), named tunnels (fixed URL)
- **ngrok** - Popular, has free tier, easy setup
- *Future:* localtunnel, manual URL entry

### 3. Mode Selection
- **Global toggle** - One setting affects all webhooks (not per-workflow)
- User chooses between Remote (api.agnt.gg) or Local (tunnel) mode globally

### 4. Tunnel Lifecycle
- **Auto-start on app launch** - If local mode configured, tunnel starts automatically
- **Notify only on error** - Show notification if tunnel fails, user troubleshoots manually
- No auto-retry or fallback to remote mode

### 5. Architecture Pattern
- **TunnelService** - Main service coordinating tunnel lifecycle
- **TunnelAdapter interface** - Common contract for all providers
- **CloudflareAdapter** - Cloudflare-specific implementation
- **NgrokAdapter** - ngrok-specific implementation

---

## Proposed Structure

```
backend/src/
├── services/
│   └── TunnelService.js          # Main tunnel orchestrator
├── tunnels/
│   ├── TunnelAdapter.js          # Base adapter interface
│   ├── CloudflareAdapter.js      # Cloudflare implementation
│   └── NgrokAdapter.js           # ngrok implementation
└── routes/
    └── TunnelRoutes.js           # API endpoints for tunnel management
```

### TunnelAdapter Interface
```javascript
class TunnelAdapter {
  async checkInstalled()        // Is CLI tool available?
  async install()               // Auto-install (brew on macOS)
  async start(port)             // Start tunnel
  async stop()                  // Stop tunnel
  getUrl()                      // Get current public URL
  getStatus()                   // connected | disconnected | error
  on(event, callback)           // url-ready, error, stopped
}
```

---

## Open Questions

1. **ngrok auth token** - ngrok requires auth token even for free tier. Should we prompt user to create account, or make ngrok a "premium" option?

2. **URL persistence** - Quick tunnels get random URLs on restart. Should we store/display the last known URL, or always show "URL will change on restart" warning?

3. **Multiple workflows** - If multiple workflows have webhook triggers, do they all share the same tunnel URL with different paths (`/api/local-webhook/:workflowId`)?

4. **Settings storage** - Store tunnel config in `.env`, SQLite database, or new settings file?

---

## Success Criteria

- [ ] User can enable Local Webhook mode in settings
- [ ] Tunnel auto-starts when AGNT launches (if configured)
- [ ] Webhook URL displayed in UI and easily copyable
- [ ] Webhooks received instantly (no polling delay)
- [ ] Clear error messaging when tunnel fails
- [ ] Works without PRO license

---

## Next Steps

Run `/workflows:plan` to create detailed implementation plan with:
- File-by-file changes
- Task breakdown
- Execution order
- Testing strategy
