---
title: External Chat Integration (Telegram)
type: feat
date: 2026-01-28
---

# External Chat Integration (Telegram-First)

## Overview

Implement complete External Chat integration allowing users to interact with AGNT agents via Telegram. This is a **Telegram-first** implementation; Discord support will be added later as a separate task.

## Problem Statement

Users currently can only chat with AGNT agents through the web UI. Many users want to interact with their agents via messaging platforms they already use, starting with Telegram.

## Proposed Solution

Build a 6-phase implementation following the architecture in `docs/development/EXTERNAL_CHAT_IMPLEMENTATION.md`:

0. **Critical Fixes** - Security and data integrity prerequisites (from code review)
1. **Database Schema** - Tables for external accounts and pairing codes
2. **Backend Services** - ExternalChatService + TelegramBotService
3. **API Routes** - Pairing, linking, and webhook endpoints
4. **Frontend UI** - Settings component for managing linked accounts
5. **Orchestrator Integration** - End-to-end message flow

---

## ⚠️ Code Review Findings (2026-01-28)

> **CRITICAL**: The following issues were identified during multi-agent code review and MUST be addressed before/during implementation.

### Security Fixes Required

| Issue | Risk | Fix |
|-------|------|-----|
| **Pairing code brute force** | Account takeover | Use 8-char alphanumeric codes + 5 attempt limit per code |
| **Missing ownership check on DELETE** | Unauthorized unlinking | Add `WHERE id = ? AND user_id = ?` to unlink query |
| **Same Telegram can pair to multiple users** | Data leak | Add check: reject if `external_id` already paired |
| **Pairing codes reusable** | Replay attack | Mark code `used=1` immediately after successful pairing |
| **Webhook secret timing attack** | Secret discovery | Use `crypto.timingSafeEqual()` for comparison |

### Data Integrity Fixes Required

| Issue | Risk | Fix |
|-------|------|-----|
| **Foreign keys disabled** | Orphaned records | Add `PRAGMA foreign_keys = ON` before migrations |
| **No transaction on pairing** | Race condition, double-pairing | Wrap pairing flow in `BEGIN IMMEDIATE TRANSACTION` |
| **Expired codes accumulate** | DB bloat | Add hourly cleanup of expired codes |

### Performance Fixes Required

| Issue | Risk | Fix |
|-------|------|-----|
| **ResponseBuffer unbounded** | OOM crash in 30-60 days | Add `maxBufferSize` (4KB), 10s force-flush, `destroy()` |
| **No buffer cleanup** | Memory leak | Track active buffers, cleanup after 15 min inactivity |
| **Missing user-level rate limit** | Resource exhaustion | Add 30 msg/min per user (not just per external_id) |

### Clarified Design Decisions

| Question | Answer |
|----------|--------|
| Can one user link multiple Telegram accounts? | **No** - One Telegram account per AGNT user for v1. Add `UNIQUE(user_id, platform)` constraint. |
| What if two users try to pair same Telegram? | **Reject second** - Return error "This Telegram account is already linked to another user." |
| Are pairing codes single-use? | **Yes** - Delete or mark `used=1` immediately after successful pairing. |
| Are images/files supported? | **Text only for v1** - Reply "Sorry, I can only process text messages right now." |
| What's the AI response timeout? | **60 seconds** - After timeout, send "This is taking longer than expected. Please try again." |
| How is conversation context maintained? | **Use `external_id` as session key** - Fetch last N messages for context. |
| Should bot show typing indicator? | **Yes** - Call `sendChatAction('typing')` every 5 seconds during processing. |
| What if response > 4096 chars? | **Split at sentence boundaries** - Send multiple messages sequentially. |

---

## Technical Approach

### Architecture

```
┌─────────────────┐     ┌─────────────────────────────────────┐     ┌─────────────────┐
│ Telegram User   │────▶│ Telegram Webhook (via Tunnel)       │────▶│ ExternalChat    │
│                 │     │ POST /api/external-chat/telegram/   │     │ Service         │
└─────────────────┘     └─────────────────────────────────────┘     └────────┬────────┘
                                                                     │
                                                                     ▼
┌─────────────────┐     ┌─────────────────────────────────────┐     ┌─────────────────┐
│ Telegram User   │◀────│ TelegramBotService                  │◀────│ Orchestrator    │
│                 │     │ (buffered streaming)                │     │ (main chat)     │
└─────────────────┘     └─────────────────────────────────────┘     └─────────────────┘
```

### Clarified Decisions (from Research)

| Question | Answer | Source |
|----------|--------|--------|
| **Default agent?** | NO default agent concept in AGNT. Agent selection is always explicit. | `backend/src/routes/AgentRoutes.js:17-18` - agentId required in URL |
| **Multi-user pairing?** | Each user pairs from their own AGNT session via JWT token. Architecture supports this natively. | `backend/src/routes/Middleware.js:75-151` - user_id extracted from JWT |
| **Message storage?** | SQLite with `user_id` isolation (existing pattern). Messages stored in new `external_chat_messages` table. | `backend/src/models/database/index.js` - existing pattern |

### Agent Selection for Telegram

**Simplified approach for v1:**
- Telegram messages use **main Orchestrator chat** (no specific agent)
- User can configure a "default agent" in External Chat settings (future)
- For now: chats go through the main chat with all available tools

**Reference:** `backend/src/services/OrchestratorService.js:766-779` - distinguishes "main chat" vs "agent chat"

### Multi-User Context (Pairing Flow)

**How it works:**
1. User A opens AGNT Settings → External Chat → clicks "Generate Code"
2. API generates code scoped to `userId` from JWT token
3. User A sends `/pair 123456` to Telegram bot
4. Bot validates code against `userId`, links Telegram to User A
5. User B (different session) generates separate code for themselves

**Architecture support:**
- JWT token contains `user_id` → `authenticateToken` middleware extracts it
- Sessions store per-user data → `req.session.userData`
- Socket.IO rooms per user → `user:{userId}` room isolation
- Database queries filtered by `user_id` → `pairing_codes.user_id`

**Reference:** `backend/src/routes/Middleware.js:75-151` - JWT token extraction

### File Structure

```
backend/src/
├── services/
│   ├── ExternalChatService.js       # Main orchestration
│   └── telegram/
│       └── TelegramBotService.js    # Telegram API wrapper
├── routes/
│   └── ExternalChatRoutes.js        # API endpoints
└── models/
    └── ExternalChatModel.js         # Database operations

frontend/src/views/Terminal/CenterPanel/screens/Settings/components/
└── ExternalChatSettings/
    ├── ExternalChatSettings.vue     # Main container
    ├── PairingCodeCard.vue          # Generate code UI
    └── LinkedAccountCard.vue        # Display linked account
```

### Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Pairing codes (8-char alphanumeric, 5-min expiry, single-use) | Secure against brute force (2.8 trillion combinations), user-friendly |
| 5 attempt limit per code | Prevents brute force even if attacker knows code format |
| Webhook via TunnelService | Reuses existing instant webhook infrastructure |
| Response buffering (500ms, max 4KB, 10s force-flush) | Reduces API calls + prevents memory leaks |
| Separate Telegram handler | Don't refactor universalChatHandler - create new handler |
| One Telegram account per user | Simplifies v1, prevents confusion about which account receives responses |

### Technical Details & Decisions (from Research)

#### 1. Migration Pattern

**Location:** `backend/src/models/database/index.js:543-615`

AGNT uses **inline migrations** with `ALTER TABLE ADD COLUMN` pattern:
```javascript
db.run(`ALTER TABLE table_name ADD COLUMN new_column TYPE`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('Error:', err);
  }
});
```

**For External Chat:** Add migration to the `runMigrations()` function in `database/index.js` (not a separate SQL file).

#### 2. OrchestratorService Integration

**Recommendation:** Do NOT refactor `universalChatHandler` - it's tightly coupled to HTTP response.

**Approach:** Create a **separate Telegram handler** that:
1. Receives webhook at `/api/external-chat/telegram/webhook`
2. Maps Telegram message format to internal format
3. Calls the same core chat logic (can be extracted if needed)
4. Sends responses via TelegramBotService

**Reference:** `backend/src/services/OrchestratorService.js:254-505` - universalChatHandler implementation

#### 3. EventEmitter Cleanup

**Issue Found:** Existing codebase has no explicit `.off()` or `removeAllListeners()` calls (potential memory leak).

**For ExternalChatService:**
- Use singleton pattern (like TunnelService)
- Subscriptions persist for app lifetime (acceptable for desktop app)
- No dynamic subscriptions needed - service is always active

#### 4. Rate Limiting Strategy

**Per user limits:**
- Pairing codes: 3/hour per user (prevents brute force)
- Messages: 10/minute per external_id (prevents spam)

**Telegram API limits:**
- Telegram: 30 messages/second per bot (buffering handles this)
- Implement sliding window counter in ExternalChatService

#### 5. Error Responses to Telegram

**Bot error messages:**
| Error | Bot Response |
|-------|-------------|
| Expired code | "Code expired. Generate a new code in AGNT Settings." |
| Invalid code | "Invalid code. Use /pair ######" |
| Rate limited | "Too many requests. Please wait." |
| Agent error | "Sorry, AGNT is unavailable. Please try again." |

#### 6. Frontend Store Pattern

**Socket.IO event handling:** Follow `TunnelSettings.vue` pattern:
```javascript
// onMounted
socketHandler = (data) => { /* update state */ };
socket.on('external-chat:account-linked', socketHandler);

// onUnmounted
if (socket) {
  socket.off('external-chat:account-linked', socketHandler);
}
```

**Store location:** `frontend/src/store/features/externalChat.js` (new file)

## Implementation Phases

### Phase 1: Database Schema

**Goal**: Create migrations for `external_accounts` and `pairing_codes` tables with proper constraints.

**Files to modify:**
- `backend/src/models/database/index.js` - Add migration in `runMigrations()` function

**⚠️ CRITICAL: Enable Foreign Keys First**
```javascript
// Add at the TOP of runMigrations() function, BEFORE any table creation
db.run('PRAGMA foreign_keys = ON', (err) => {
  if (err) {
    console.error('CRITICAL: Failed to enable foreign keys:', err);
  }
});
```

**Migration pattern** (inline in `database/index.js:543-615`):
```javascript
// Add to runMigrations() function
db.run(`CREATE TABLE IF NOT EXISTS external_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('telegram', 'discord')),
  external_id TEXT NOT NULL,
  external_username TEXT,
  paired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`, (err) => {
  if (err) console.error('Error creating external_accounts table:', err);
});

// SECURITY: Prevent same Telegram account linking to multiple AGNT users
db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_platform_id
  ON external_accounts(platform, external_id)`, (err) => {
  if (err) console.error('Error creating index:', err);
});

// SECURITY: Enforce one Telegram account per AGNT user (v1 simplicity)
db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_user_platform
  ON external_accounts(user_id, platform)`, (err) => {
  if (err) console.error('Error creating index:', err);
});

// Index for user lookups (unlink, list accounts)
db.run(`CREATE INDEX IF NOT EXISTS idx_external_accounts_user_id
  ON external_accounts(user_id)`, (err) => {
  if (err) console.error('Error creating index:', err);
});

db.run(`CREATE TABLE IF NOT EXISTS pairing_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`, (err) => {
  if (err) console.error('Error creating pairing_codes table:', err);
});

db.run(`CREATE INDEX IF NOT EXISTS idx_pairing_codes_code ON pairing_codes(code)`, (err) => {
  if (err) console.error('Error creating index:', err);
});

// Index for expired code cleanup
db.run(`CREATE INDEX IF NOT EXISTS idx_pairing_codes_expires ON pairing_codes(expires_at)`, (err) => {
  if (err) console.error('Error creating index:', err);
});
```

**Verification:**
- Tables exist in `agnt.db`
- Can insert/query test records
- Foreign key constraints work (test with `PRAGMA foreign_keys` = 1)
- UNIQUE constraints prevent duplicate pairings

### Phase 2: Backend Services (Telegram Only)

**Goal**: Create ExternalChatService and TelegramBotService with security fixes.

**Files to create:**
- `backend/src/services/ExternalChatService.js`
- `backend/src/services/telegram/TelegramBotService.js`
- `backend/src/utils/ResponseBuffer.js` (extracted utility)

**ExternalChatService.js**:
```javascript
class ExternalChatService extends EventEmitter {
  constructor(database) {
    super();
    this.db = database;
    this.telegramService = new TelegramBotService();
    this.activeBuffers = new Map(); // Track for cleanup

    // Cleanup expired codes hourly
    setInterval(() => this.cleanupExpiredCodes(), 60 * 60 * 1000);

    // Cleanup stale buffers every 5 minutes
    setInterval(() => this.cleanupStaleBuffers(), 5 * 60 * 1000);
  }

  async generatePairingCode(userId) {
    // Generate 8-char alphanumeric code (2.8 trillion combinations)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars
    const code = Array.from({length: 8}, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');

    // Store with 5-min expiry, attempt_count = 0
  }

  async linkAccount(code, platform, externalId, username) {
    // ⚠️ CRITICAL: Wrap in transaction to prevent race conditions
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN IMMEDIATE TRANSACTION');

        // 1. Validate code (not expired, not used, attempts < 5)
        // 2. Increment attempt_count
        // 3. If valid: mark used=1, create external_account
        // 4. COMMIT or ROLLBACK
      });
    });
  }

  async routeMessage(platform, externalId, messageText) {
    // Look up user_id, call OrchestratorService
  }

  cleanupExpiredCodes() {
    this.db.run('DELETE FROM pairing_codes WHERE expires_at < datetime("now")');
  }

  cleanupStaleBuffers() {
    const now = Date.now();
    for (const [key, buffer] of this.activeBuffers.entries()) {
      if (now - buffer.lastActivity > 15 * 60 * 1000) { // 15 min
        buffer.destroy();
        this.activeBuffers.delete(key);
      }
    }
  }
}
```

**TelegramBotService.js**:
```javascript
class TelegramBotService {
  constructor() {
    this.bot = null;
    this.webhookUrl = null;
  }

  async initialize(botToken, webhookUrl) {
    // Initialize node-telegram-bot-api
  }

  async handleWebhook(update) {
    // Parse message, extract text and user info
    // Emit 'message' event with parsed data
  }

  async sendMessage(chatId, text, options) {
    // Send message to Telegram (with buffering)
  }

  async sendTypingIndicator(chatId) {
    // Call sendChatAction('typing') - repeat every 5s during processing
  }
}
```

**ResponseBuffer.js** (with fixes):
```javascript
class ResponseBuffer {
  constructor(sendFn, delayMs = 500, maxBufferSize = 4096) {
    this.buffer = '';
    this.timer = null;
    this.sendFn = sendFn;
    this.delayMs = delayMs;
    this.maxBufferSize = maxBufferSize;
    this.lastActivity = Date.now();
  }

  add(chunk) {
    this.buffer += chunk;
    this.lastActivity = Date.now();
    clearTimeout(this.timer);

    // SECURITY: Force flush if buffer too large
    if (this.buffer.length > this.maxBufferSize) {
      this.flush();
      return;
    }

    // Send immediately if sentence-ending punctuation
    if (/[.!?]$/.test(chunk.trim())) {
      this.flush();
    } else {
      // Max 10 second delay before force flush
      this.timer = setTimeout(() => this.flush(), Math.min(this.delayMs, 10000));
    }
  }

  flush() {
    if (this.buffer.trim()) {
      // Split long messages at sentence boundaries (Telegram 4096 char limit)
      const messages = this.splitMessage(this.buffer, 4000);
      messages.forEach(msg => this.sendFn(msg));
    }
    this.buffer = '';
    clearTimeout(this.timer);
  }

  splitMessage(text, maxLength) {
    if (text.length <= maxLength) return [text];
    // Split at sentence boundaries
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const messages = [];
    let current = '';
    for (const sentence of sentences) {
      if ((current + sentence).length > maxLength) {
        if (current) messages.push(current.trim());
        current = sentence;
      } else {
        current += sentence;
      }
    }
    if (current) messages.push(current.trim());
    return messages;
  }

  destroy() {
    clearTimeout(this.timer);
    this.buffer = '';
  }
}
```

**Key features:**
- Pairing code generation (8-char alphanumeric, 5-min expiry, rate limited to 3/hour)
- 5 attempt limit per code (prevents brute force)
- Account linking with transaction wrapper
- Message routing to OrchestratorService
- Response buffering (500ms, max 4KB, 10s force-flush)
- Automatic cleanup of expired codes and stale buffers

**Verification:**
- Services instantiate without errors
- Unit tests pass for core methods
- Transaction prevents race conditions in pairing

### Phase 3: API Routes

**Goal**: Create ExternalChatRoutes.js with all endpoints.

**Files to create:**
- `backend/src/routes/ExternalChatRoutes.js`

**Endpoints:**
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/external-chat/pair` | Generate pairing code | Yes |
| POST | `/api/external-chat/link` | Link account with code | Yes |
| POST | `/api/external-chat/telegram/webhook` | Receive Telegram messages | No (webhook verify) |
| GET | `/api/external-chat/accounts` | List linked accounts | Yes |
| DELETE | `/api/external-chat/accounts/:id` | Unlink account | Yes |

**Webhook security:**
- Verify Telegram `X-Telegram-Bot-Api-Secret-Token` header
- Rate limit: 10 messages/minute per external_id

**Verification:**
- Routes return 200 OK for valid requests
- Webhook test delivers message to ExternalChatService

### Phase 4: Frontend UI ✅ DONE

**Goal**: Create ExternalChatSettings component.

**Files created:**
- `frontend/src/views/Terminal/CenterPanel/screens/Settings/components/ExternalChatSettings/ExternalChatSettings.vue` ✅

**Files modified:**
- `frontend/src/views/Terminal/CenterPanel/screens/Settings/Settings.vue` - Added navigation item and content section ✅
- `frontend/src/views/Terminal/LeftPanel/types/SettingsPanel/SettingsPanel.vue` - Added External Chat nav item ✅

**UI Features implemented:**
- "Generate Pairing Code" button
- 6-digit code display with countdown timer (5:00)
- Copy code to clipboard
- List of linked accounts (platform icon, username, paired date)
- Unlink button for each account
- Socket.IO real-time updates
- Rate limiting display (remaining codes/hour)

**Socket.IO events:**
- `external-chat:account-linked` - New account linked ✅
- `external-chat:account-unlinked` - Account unlinked ✅

**Verification:**
- UI renders in Settings without errors
- Can generate pairing code
- Countdown timer works
- Socket.IO events update UI

### Phase 5: OrchestratorService Integration

**Goal**: Complete end-to-end flow from Telegram → AGNT → AI → Telegram.

**Files to modify:**
- `backend/src/services/OrchestratorService.js` - Minimal changes (just add to imports if needed)

**Approach (from research):**
1. **Do NOT refactor** `universalChatHandler` - it's tightly coupled to HTTP response
2. **Create separate Telegram handler** in ExternalChatService:
   - Maps Telegram message to chat request format
   - Creates ResponseBuffer for Telegram delivery
   - Calls orchestrator logic or equivalent

**Response Buffer pattern:**
```javascript
class ResponseBuffer {
  constructor(sendFn, delayMs = 500) {
    this.buffer = '';
    this.timer = null;
    this.sendFn = sendFn;
    this.delayMs = delayMs;
  }

  add(chunk) {
    this.buffer += chunk;
    clearTimeout(this.timer);

    // Send immediately if sentence-ending punctuation
    if (/[.!?]$/.test(chunk.trim())) {
      this.flush();
    } else {
      this.timer = setTimeout(() => this.flush(), this.delayMs);
    }
  }
}
```

**Verification:**
- Message from Telegram → AI response in Telegram
- Conversation history maintained (if implemented)
- Response buffering works (no spam)

## Acceptance Criteria

### Functional Requirements
- [ ] User can generate pairing code in AGNT Settings (scoped to their user_id)
- [ ] User can send `/pair <code>` to Telegram bot and link account
- [ ] User can send message to Telegram bot and receive AI response (main chat)
- [ ] Conversation appears in both Telegram and AGNT UI
- [ ] User can unlink Telegram account
- [ ] Pairing code expires after 5 minutes
- [ ] In multi-user setup, each user pairs their own Telegram account
- [ ] Webhook signature verified (X-Telegram-Bot-Api-Secret-Token)

### Non-Functional Requirements
- [ ] All tests pass (unit + integration)
- [ ] No console errors
- [ ] Response buffered (not streamed word-by-word)
- [ ] Webhook signature verified

### Quality Gates
- [ ] Unit tests for ExternalChatService (pairing, linking, routing)
- [ ] Unit tests for TelegramBotService (parsing, sending)
- [ ] Integration tests for pairing flow
- [ ] Manual E2E test with real Telegram bot

## Dependencies & Risks

### Dependencies
- `node-telegram-bot-api` package (add to package.json)
- TunnelService for webhook URL
- Cloudflare Tunnel or ngrok for local development

### Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Telegram bot token not configured | **Critical** | Feature disabled until token added to `.env` |
| Tunnel not running | High | Webhook fails - bot remains unresponsive |
| Rate limits exceeded | Medium | Response buffering reduces API calls by 90% |
| Duplicate account linking | Low | UNIQUE constraint on (platform, external_id) |

## Environment Variables

**Add to `.env.example`:**
```bash
# Telegram Bot (REQUIRED for External Chat to work)
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBHOOK_SECRET_TOKEN=  # Optional: for webhook verification
```

**Setup Guide:**
1. Create bot via @BotFather on Telegram
2. Copy the bot token
3. Add to `.env` file
4. Restart AGNT backend

**Note:** Webhook requires public URL. For local development:
- Use Cloudflare Tunnel (cloudflared) - see `docs/INSTANT_WEBHOOKS_GUIDE.md`
- Or use ngrok: `ngrok http 3333`

## Success Metrics

1. **Pairing success rate**: >95% of pairing attempts succeed
2. **Response time**: <5 seconds from Telegram message to AI response
3. **Error rate**: <1% of messages fail to deliver
4. **User satisfaction**: Manual testing confirms smooth flow

## Out of Scope (For Later)

- Discord integration (separate task after Telegram works)
- WhatsApp, Slack, or other platforms
- Message history sync (basic real-time only)
- Advanced features (typing indicators, read receipts)
- Multi-agent selection from Telegram

## References

### Internal Documentation
- `docs/development/EXTERNAL_CHAT_IMPLEMENTATION.md` - Architecture guide
- `docs/EXTERNAL_CHAT.md` - User documentation
- `docs/INSTANT_WEBHOOKS_GUIDE.md` - TunnelService usage

### Working Code Patterns
- `backend/src/services/TunnelService.js:33-48` - EventEmitter pattern
- `backend/src/services/OrchestratorService.js:254-505` - universalChatHandler, sendEvent
- `backend/src/routes/WebhookRoutes.js:60-106` - Webhook handling
- `backend/src/routes/TunnelRoutes.js` - API endpoints pattern
- `backend/src/models/database/index.js:543-615` - Migration pattern
- `frontend/src/views/Terminal/CenterPanel/screens/Settings/components/TunnelSettings/TunnelSettings.vue` - Settings UI pattern
- `frontend/src/composables/useRealtimeSync.js:257-264` - Socket.IO cleanup pattern

### External APIs
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api)

## Implementation Order

1. **Start**: Phase 1 (Database) - Low risk, foundation
2. **Phase 2**: Backend Services - Core logic
3. **Phase 3**: API Routes - Frontend integration
4. **Phase 4**: Frontend UI - User-facing
5. **Phase 5**: Orchestrator Integration - Complete flow
6. **Testing**: E2E tests with real Telegram bot

**Estimated effort**: 20-30 hours total
