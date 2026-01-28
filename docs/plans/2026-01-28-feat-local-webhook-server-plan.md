---
title: "feat: Local Webhook Server (Cloudflare Tunnel)"
type: feat
date: 2026-01-28
brainstorm: docs/brainstorms/2026-01-28-local-webhook-server-brainstorm.md
---

# feat: Local Webhook Server (Cloudflare Tunnel)

## Overview

Add a Local Webhook Server using **Cloudflare Quick Tunnels** to allow AGNT to receive webhooks instantly on the user's machine. This eliminates the 10-second polling delay of the remote system and removes the requirement for a PRO license.

**Philosophy:** "Omakase" — strict, opinionated, simple. We support one provider (Cloudflare) because it requires zero configuration (no accounts, no tokens) and works out of the box.

## Problem Statement

Current webhook architecture:
1. External service -> api.agnt.gg
2. Local AGNT polls api.agnt.gg (10s delay)

**Issues:**
- High latency (10s) makes chat/interactive workflows feel sluggish.
- Requires dependency on external availability.
- Complex PRO license checks.

## Proposed Solution

Run a local `cloudflared` process that creates an instant, ad-hoc tunnel. The system automatically detects if the binary is present and uses it.

### Architecture: The Majestic Monolith

No adapters. No interfaces. No complex state machines. Just a single service that manages a child process.

```
┌─────────────────────────────────────┐
│           TunnelService             │
│  - Spawns 'cloudflared'             │
│  - Parses stderr for URL            │
│  - Caches URL for sync access       │
│  - Handles cleanup on exit          │
└─────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Provider** | **Cloudflare Only** | Zero config. No auth tokens. No sign-up. |
| **Storage** | **No new table** | Store `webhook_mode: 'local'` in existing user settings. |
| **Lifecycle** | **Auto-managed** | If enabled, starts on boot. Retries on failure. |
| **Cleanup** | **Aggressive** | Use `tree-kill` to ensure no zombie processes on exit. |
| **UX** | **One-Click Install** | If binary missing, UI offers "Install via Brew" button. |
| **Latency** | **< 500ms** | Direct path from internet to localhost. |

## Technical Considerations

### New/Modified Files

```
backend/src/
├── services/
│   └── TunnelService.js          # Singleton. Manages cloudflared process.
├── routes/
│   └── TunnelRoutes.js           # Simple status/control endpoints.
```

**Modified:**
- `backend/server.js`: Initialize TunnelService, ensure cleanup on `SIGINT`/`SIGTERM`.
- `backend/src/tools/triggers/WebhookReceiver.js`: Use `TunnelService.getUrl()` (synchronous).
- `package.json`: Add `tree-kill` for safe process termination.

### Database Changes

None. We will use the existing settings mechanism or a simple JSON file for local preferences if needed.

### Dynamic URL Resolution (Synchronous)

`WebhookReceiver` must remain fast and synchronous.

```javascript
// TunnelService maintains the state
getWebhookUrl(workflowId) {
  // If tunnel is active and we have a URL, use it
  if (this.isLocalMode && this.cachedUrl) {
    return `${this.cachedUrl}/api/webhooks/${workflowId}`;
  }
  // Fallback to remote
  return `${process.env.REMOTE_URL}/webhook/${workflowId}`;
}
```

## Acceptance Criteria

### Strict Requirements
- [ ] **Latency:** End-to-end webhook trigger < 500ms.
- [ ] **Zero Zombies:** On app exit, `ps aux | grep cloudflared` must be empty.
- [ ] **Zero Config:** User does NOT need to create a Cloudflare account.
- [ ] **Resilience:** Auto-retry connection 3 times with exponential backoff before failing.
- [ ] **UX:** If `cloudflared` is missing, show a "Install" button that runs the install command.

## Implementation Tasks

### Phase 1: Core Service
- [x] Add `tree-kill` dependency.
- [x] Implement `TunnelService.js` (spawn, parse, cache URL).
- [x] Implement robust error handling (retries) and cleanup (exit hooks).
- [x] Add `TunnelRoutes.js` (status, start, stop, install).

### Phase 2: Integration
- [x] Update `WebhookReceiver.js` to prefer local tunnel URL when available.
- [x] Add real-time event broadcasting (`tunnel:status`, `tunnel:url`).

### Phase 3: UI
- [x] Settings -> Webhooks: Simple "Enable Instant Webhooks" toggle.
- [x] "Install Cloudflare Tunnel" state if binary missing.
- [x] Display current Tunnel URL (read-only).

## Code Example: TunnelService.js

```javascript
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import treeKill from 'tree-kill';

class TunnelService extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.cachedUrl = null;
    this.status = 'disconnected'; // 'starting', 'connected', 'error'
    this.retryCount = 0;
  }

  async start() {
    if (this.process) return;

    this.status = 'starting';
    this.emit('change', this.status);

    this.process = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:3333'], {
      stdio: ['ignore', 'pipe', 'pipe'] // Ignore stdin, pipe stdout/stderr
    });

    this.process.stderr.on('data', (data) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match) {
        this.cachedUrl = match[0];
        this.status = 'connected';
        this.retryCount = 0;
        this.emit('change', this.status);
        console.log('[Tunnel] Connected:', this.cachedUrl);
      }
    });

    this.process.on('close', (code) => {
      this.cleanup();
      if (code !== 0 && this.retryCount < 3) {
        console.log('[Tunnel] Crashed, retrying...');
        this.retryCount++;
        setTimeout(() => this.start(), 1000 * this.retryCount);
      } else if (code !== 0) {
        this.status = 'error';
        this.emit('change', this.status);
      }
    });
  }

  stop() {
    if (this.process && this.process.pid) {
      treeKill(this.process.pid);
      this.cleanup();
    }
  }

  cleanup() {
    this.process = null;
    this.cachedUrl = null;
    this.status = 'disconnected';
    this.emit('change', this.status);
  }

  // Synchronous getter for WebhookReceiver
  getUrl() {
    return this.cachedUrl;
  }
}

export default new TunnelService();
```
