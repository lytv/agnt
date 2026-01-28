# Phase 3: Local Webhook Server UI

## Overview

This document describes the frontend work needed to complete the Local Webhook Server feature. The backend is fully implemented and tested.

## Prerequisites

Backend implementation complete:
- `backend/src/services/TunnelService.js` - Tunnel management singleton
- `backend/src/routes/TunnelRoutes.js` - REST API endpoints
- WebSocket event: `tunnel:status` broadcasts state changes

## API Endpoints

### GET /api/tunnel/status
Returns current tunnel state:
```json
{
  "status": "disconnected|starting|connected|error",
  "url": "https://abc123.trycloudflare.com" | null,
  "enabled": true|false,
  "installed": true|false,
  "installCommand": "brew install cloudflared",
  "error": "error message" | null
}
```

### POST /api/tunnel/start
Enables and starts the tunnel. Returns same shape as status.

### POST /api/tunnel/stop
Disables and stops the tunnel. Returns same shape as status.

### GET /api/tunnel/install
Returns install info:
```json
{
  "installed": true|false,
  "command": "brew install cloudflared",
  "platform": "darwin|linux|win32"
}
```

## WebSocket Events

Listen for `tunnel:status` event on the existing Socket.IO connection:
```javascript
socket.on('tunnel:status', (state) => {
  // state has same shape as GET /api/tunnel/status
  console.log('Tunnel status changed:', state);
});
```

## UI Requirements

### Location
Add to Settings page, likely under a "Webhooks" or "Advanced" section.

### Components Needed

#### 1. Tunnel Status Card
```
┌─────────────────────────────────────────────────────┐
│ Instant Webhooks                                    │
│                                                     │
│ [Toggle: Enable Instant Webhooks]                   │
│                                                     │
│ Status: ● Connected                                 │
│ URL: https://abc123.trycloudflare.com [Copy]        │
│                                                     │
│ Webhooks will be received instantly (<500ms)        │
│ instead of polling every 10 seconds.                │
└─────────────────────────────────────────────────────┘
```

#### 2. States to Handle

**State: Disconnected (cloudflared installed)**
- Toggle OFF
- Status: "Disconnected"
- No URL shown

**State: Starting**
- Toggle ON (disabled during start)
- Status: "Connecting..." with spinner
- No URL shown

**State: Connected**
- Toggle ON
- Status: "Connected" with green indicator
- Show URL with copy button

**State: Error**
- Toggle ON
- Status: "Error" with red indicator
- Show error message
- Retry button

**State: Not Installed**
- Toggle disabled
- Show install prompt:
  ```
  Cloudflare Tunnel not installed.

  Run this command to install:
  [brew install cloudflared] [Copy]

  Then restart AGNT.
  ```

### Copy Button Behavior
When user clicks copy on the tunnel URL:
1. Copy URL to clipboard
2. Show toast: "Tunnel URL copied"

### Existing Patterns to Follow

Check these files for UI patterns:
- `frontend/src/views/Settings.vue` - Settings page structure
- `frontend/src/components/` - Existing component patterns
- `frontend/src/services/api.js` - API service pattern
- `frontend/src/store/` - Vuex store pattern (if state needed globally)

### API Service

Add to `frontend/src/services/api.js` or create `frontend/src/services/tunnelService.js`:

```javascript
export const tunnelService = {
  async getStatus() {
    const response = await fetch('/api/tunnel/status');
    return response.json();
  },

  async start() {
    const response = await fetch('/api/tunnel/start', { method: 'POST' });
    return response.json();
  },

  async stop() {
    const response = await fetch('/api/tunnel/stop', { method: 'POST' });
    return response.json();
  },

  async getInstallInfo() {
    const response = await fetch('/api/tunnel/install');
    return response.json();
  }
};
```

### WebSocket Integration

Use existing Socket.IO connection to listen for real-time updates:

```javascript
// In component setup or mounted
socket.on('tunnel:status', (state) => {
  this.tunnelStatus = state;
});
```

## Acceptance Criteria

- [ ] Toggle shows current tunnel state on page load
- [ ] Toggle starts tunnel when enabled
- [ ] Toggle stops tunnel when disabled
- [ ] Status updates in real-time via WebSocket
- [ ] URL is copyable when tunnel is connected
- [ ] Install instructions shown when cloudflared not installed
- [ ] Error state shows error message and allows retry
- [ ] Loading state shown during start/stop operations

## Design Notes

- Keep it simple - single card/section in settings
- Follow existing AGNT design patterns
- No complex state management needed - component-local state is fine
- Use existing toast/notification system for feedback
