---
title: "feat: Tunnel State Persistence + Auto-Start"
type: feat
date: 2026-01-28
status: reviewed
---

# Tunnel State Persistence + Auto-Start

## Overview

Save the tunnel "enabled" preference to the database so that when AGNT restarts, the tunnel automatically starts if it was previously enabled.

## Problem Statement

Currently, `TunnelService.enabled` is stored only in memory. When AGNT restarts, user must manually re-enable the tunnel.

## Proposed Solution

Persist tunnel state to SQLite and auto-start during backend initialization if previously enabled.

**Architecture:** Inline SQL in TunnelService (no UserModel abstraction needed for a single boolean).

## Technical Approach

### Database Schema

Add column to `users` table:

```sql
ALTER TABLE users ADD COLUMN tunnel_auto_start INTEGER DEFAULT 0;
```

### Implementation

**File: `backend/src/services/TunnelService.js`**

Import database at top:

```javascript
import db from '../models/database/index.js';
```

Add migration helper (call once during module load):

```javascript
// Safe migration - check column exists before adding
db.all(`PRAGMA table_info(users)`, (err, columns) => {
  const hasColumn = columns?.some(col => col.name === 'tunnel_auto_start');
  if (!hasColumn) {
    db.run(`ALTER TABLE users ADD COLUMN tunnel_auto_start INTEGER DEFAULT 0`);
    console.log('[Tunnel] Added tunnel_auto_start column to users table');
  }
});
```

Add initialization method:

```javascript
async initialize() {
  try {
    const row = await new Promise((resolve, reject) => {
      db.get(`SELECT tunnel_auto_start FROM users LIMIT 1`, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (row?.tunnel_auto_start === 1) {
      console.log('[Tunnel] Auto-starting (saved preference)...');
      await this.enable();
    }
  } catch (error) {
    console.error('[Tunnel] Auto-start failed:', error.message);
    // Don't clear preference - user can fix and restart
  }
}
```

Modify `enable()` to persist state:

```javascript
async enable() {
  this.enabled = true;
  this.retryCount = 0;
  await this.start();
  // Persist after successful start
  db.run(`UPDATE users SET tunnel_auto_start = 1`);
}
```

Modify `disable()` to persist state (make async to avoid race condition):

```javascript
async disable() {
  this.enabled = false;
  await new Promise((resolve) => {
    db.run(`UPDATE users SET tunnel_auto_start = 0`, resolve);
  });
  this.stop();
}
```

**File: `backend/server.js`**

Add TunnelService initialization after Skills Registry (around line 290):

```javascript
// Initialize Tunnel Service (auto-start if previously enabled)
console.log('Initializing Tunnel Service...');
await TunnelService.initialize().catch(err => {
  console.error('Tunnel Service initialization error (non-fatal):', err);
});
```

## Acceptance Criteria

- [ ] Tunnel preference persists across app restarts
- [ ] If tunnel was enabled, it auto-starts when AGNT launches
- [ ] If tunnel was disabled, it stays off on launch
- [ ] Existing installs get safe migration (default to disabled)

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Cloudflared not installed + auto-start | Error logged, state stays enabled for next retry |

## Files to Modify

| File | Changes |
|------|---------|
| `backend/src/services/TunnelService.js` | Add `initialize()`, modify `enable()`/`disable()`, add migration |
| `backend/server.js` | Call `TunnelService.initialize()` during startup |

## Testing Strategy

1. **Enable → Restart → Verify auto-start**
2. **Disable → Restart → Verify no auto-start**
3. **Fresh install → Verify default disabled**

## References

- Brainstorm: `docs/brainstorms/2026-01-28-local-webhook-server-brainstorm.md`
- TunnelService: `backend/src/services/TunnelService.js`
- Server startup: `backend/server.js` (lines 270-313)
