# External Chat Implementation Guide

> [!NOTE]
> This is a planning document for contributors. The feature is not yet implemented. See the [user guide](../EXTERNAL_CHAT.md) for end-user information.

## Architecture Overview

### High-Level Flow

```
┌─────────────────┐
│ User sends msg  │
│ (Telegram/      │
│  Discord)       │
└────────┬────────┘
         │
         v
┌─────────────────────────────────────┐
│ ExternalChatService                 │
│ - Authenticate external ID          │
│ - Map to AGNT user                  │
│ - Route message                     │
└────────┬────────────────────────────┘
         │
         v
┌─────────────────────────────────────┐
│ OrchestratorService                 │
│ - Process message                   │
│ - Call AI provider                  │
│ - Stream response                   │
└────────┬────────────────────────────┘
         │
         v
┌─────────────────────────────────────┐
│ ExternalChatService                 │
│ - Receive stream events             │
│ - Buffer/format for platform        │
│ - Send to Telegram/Discord          │
└─────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Integration Point |
|-----------|----------------|-------------------|
| `ExternalChatService` | Message routing, authentication, response buffering | New service in `backend/src/services/` |
| `TelegramBotService` | Telegram API wrapper, webhook handling | Webhook receiver via TunnelService |
| `DiscordBotService` | Discord.js wrapper, WebSocket listener | Discord Gateway connection |
| `ExternalChatRoutes` | API endpoints for pairing, webhooks | Express router in `backend/src/routes/` |
| `ExternalChatSettings` | UI component for bot config | Vue component in Settings screen |

## Database Schema

### Tables to Add

#### `external_accounts`

Stores linked external accounts (Telegram, Discord) for each user.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY, AUTOINCREMENT | Unique record ID |
| `user_id` | INTEGER | FOREIGN KEY → users.id, NOT NULL | AGNT user ID |
| `platform` | TEXT | NOT NULL, CHECK ('telegram', 'discord') | Platform name |
| `external_id` | TEXT | NOT NULL | Platform-specific user ID |
| `external_username` | TEXT | | Optional username/handle |
| `paired_at` | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | When pairing occurred |
| `last_message_at` | DATETIME | | Last message timestamp |

**Indexes**:
- `UNIQUE INDEX idx_external_accounts_platform_id ON external_accounts(platform, external_id)`
- `INDEX idx_external_accounts_user_id ON external_accounts(user_id)`

#### `pairing_codes`

Temporary codes for linking external accounts.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY, AUTOINCREMENT | Unique record ID |
| `code` | TEXT | NOT NULL, UNIQUE | 6-digit pairing code |
| `user_id` | INTEGER | FOREIGN KEY → users.id, NOT NULL | AGNT user ID |
| `created_at` | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Code generation time |
| `expires_at` | DATETIME | NOT NULL | Expiration time (5 min) |
| `used` | INTEGER | NOT NULL, DEFAULT 0 | Boolean: 0=unused, 1=used |

**Indexes**:
- `INDEX idx_pairing_codes_code ON pairing_codes(code)`
- `INDEX idx_pairing_codes_user_id ON pairing_codes(user_id)`

### ER Diagram

```
users (existing)
  ├──< external_accounts (user_id → users.id)
  └──< pairing_codes (user_id → users.id)
```

## Integration Points

### 1. TunnelService (Existing)

**Location**: `backend/src/services/TunnelService.js`

**Current functionality**:
- Provides public URL via Cloudflare Tunnel for webhooks
- Already handles webhook routing

**Integration**:
- Telegram webhooks will use: `https://{tunnel-url}/api/external-chat/telegram/webhook`
- No changes needed to TunnelService itself
- ExternalChatRoutes will be added to the Express app like WebhookRoutes

**Reference**: See `backend/src/routes/WebhookRoutes.js` for similar webhook handling pattern.

### 2. OrchestratorService (Existing)

**Location**: `backend/src/services/OrchestratorService.js`

**Current functionality**:
- Handles chat messages from web UI
- Streams AI responses via WebSocket

**Changes needed**:
1. **Add support for external message sources**:
   ```javascript
   // Current: only supports WebSocket clients
   // New: support both WebSocket and external platforms
   processChatMessage(userId, agentId, message, responseHandler)
   ```

2. **Message context enhancement**:
   ```javascript
   {
     source: 'telegram' | 'discord' | 'web',
     externalId: '12345678',  // Telegram user ID
     userId: 'user-uuid',      // AGNT user ID
     agentId: 'agent-uuid',    // Target agent
     message: 'Hello, agent!'
   }
   ```

3. **Response streaming**:
   - Current: Streams to WebSocket via `sendEvent()`
   - New: Allow ExternalChatService to subscribe to response events
   - Pattern: EventEmitter or callback-based streaming

**Reference**: See `backend/src/services/AgentService.js` for event-based streaming patterns.

### 3. Settings Screen (Existing)

**Location**: `frontend/src/views/Terminal/CenterPanel/screens/Settings/Settings.vue`

**Current functionality**:
- Tabbed settings interface (API Keys, Themes, Webhooks)
- Real-time status updates via Socket.IO

**Integration**:
1. Add "External Chat" section to left navigation:
   ```javascript
   { id: 'external-chat', label: 'External Chat', icon: 'chat-bubble' }
   ```

2. Create `ExternalChatSettings.vue` component (similar to `TunnelSettings.vue`):
   - Display pairing code generation
   - Show linked accounts (platform, username, last message time)
   - Bot status indicators (connected/disconnected)
   - Unlink button for each account

3. Real-time updates:
   - Listen for `external-chat:account-linked` event
   - Listen for `external-chat:message-received` event
   - Update UI without page refresh

**Reference**: See `frontend/src/views/Terminal/CenterPanel/screens/Settings/components/TunnelSettings/TunnelSettings.vue` for similar settings UI pattern.

## Implementation Phases

### Phase 1: Database Schema

**Tasks**:
- [ ] Create migration: `external_accounts` table with indexes
- [ ] Create migration: `pairing_codes` table with indexes
- [ ] Add foreign key constraints
- [ ] Add check constraint for `platform` enum

**SQL Migration**:
```sql
-- File: backend/migrations/YYYYMMDDHHMMSS_add_external_chat_tables.sql

CREATE TABLE external_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('telegram', 'discord')),
  external_id TEXT NOT NULL,
  external_username TEXT,
  paired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_external_accounts_platform_id
  ON external_accounts(platform, external_id);
CREATE INDEX idx_external_accounts_user_id
  ON external_accounts(user_id);

CREATE TABLE pairing_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_pairing_codes_code ON pairing_codes(code);
CREATE INDEX idx_pairing_codes_user_id ON pairing_codes(user_id);
```

**Verification**:
- Tables exist in `agnt.db` (use `sqlite3` CLI or DB browser)
- Can insert/query test records
- Foreign key constraints work (test cascading deletes)

### Phase 2: Backend Services

**Tasks**:
- [ ] Create `ExternalChatService.js` (message routing + auth)
- [ ] Create `TelegramBotService.js` (Telegram API wrapper)
- [ ] Create `DiscordBotService.js` (Discord.js wrapper)
- [ ] Add pairing code generation logic (6-digit random, 5-min expiry)
- [ ] Add account linking logic (validate code, create record)

**File Structure**:
```
backend/src/services/
├── ExternalChatService.js     # Main orchestration
├── telegram/
│   └── TelegramBotService.js  # Telegram API wrapper
└── discord/
    └── DiscordBotService.js   # Discord.js wrapper
```

**ExternalChatService.js** (high-level):
```javascript
class ExternalChatService extends EventEmitter {
  constructor(database) {
    // Initialize platform services
    this.telegramService = new TelegramBotService()
    this.discordService = new DiscordBotService()
  }

  async generatePairingCode(userId) {
    // Generate 6-digit code, store in DB with 5-min expiry
  }

  async linkAccount(code, platform, externalId, username) {
    // Validate code, create external_account record
  }

  async routeMessage(platform, externalId, messageText) {
    // Look up user_id, call OrchestratorService
  }

  async sendResponse(platform, externalId, message) {
    // Route to appropriate platform service
  }
}
```

**Verification**:
- Services can be instantiated without errors
- Unit tests pass for core methods
- Mock database calls work correctly

### Phase 3: API Routes

**Tasks**:
- [ ] Create `ExternalChatRoutes.js` in `backend/src/routes/`
- [ ] POST `/api/external-chat/pair` (generate pairing code)
- [ ] POST `/api/external-chat/link` (link account with code)
- [ ] POST `/api/external-chat/telegram/webhook` (receive Telegram messages)
- [ ] GET `/api/external-chat/accounts` (list linked accounts)
- [ ] DELETE `/api/external-chat/accounts/:id` (unlink account)

**Example Route Handler**:
```javascript
// POST /api/external-chat/pair
router.post('/pair', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const code = await externalChatService.generatePairingCode(userId)
    res.json({ code, expiresIn: 300 }) // 5 minutes
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
```

**Webhook Security**:
- Verify Telegram webhook signature (`X-Telegram-Bot-Api-Secret-Token`)
- Verify Discord request signature (HMAC validation)
- Rate limit webhook endpoints (prevent spam)

**Verification**:
- Routes return 200 OK for valid requests
- Webhook test delivers message to ExternalChatService
- Error handling works (expired code, invalid signature)

### Phase 4: Frontend UI

**Tasks**:
- [ ] Create `ExternalChatSettings/` directory in Settings components
- [ ] Create `ExternalChatSettings.vue` main component
- [ ] Create `LinkedAccount.vue` child component (displays one account)
- [ ] Add navigation item to Settings panel
- [ ] Implement pairing code generation UI
- [ ] Implement linked accounts list with unlink button
- [ ] Add real-time status updates via Socket.IO

**Component Structure**:
```
frontend/src/views/Terminal/CenterPanel/screens/Settings/components/
└── ExternalChatSettings/
    ├── ExternalChatSettings.vue    # Main container
    ├── PairingCodeCard.vue         # Generate/display code
    └── LinkedAccountCard.vue       # One linked account
```

**UI Flow**:
1. User clicks "Generate Pairing Code"
2. API call to `/api/external-chat/pair`
3. Display 6-digit code with countdown timer
4. Real-time event when account is linked
5. Code disappears, new account appears in list

**Verification**:
- UI renders in Settings without errors
- Can generate pairing code successfully
- Countdown timer works (5 minutes)
- Socket.IO events update UI in real-time

### Phase 5: OrchestratorService Integration

**Tasks**:
- [ ] Refactor `OrchestratorService.universalChatHandler` to support external sources
- [ ] Add `ExternalChatService` as response stream subscriber
- [ ] Implement conversation context management (track chat history per platform)
- [ ] Buffer response deltas for external platforms (group small chunks)

**Changes to OrchestratorService**:
```javascript
// Before: Only WebSocket responses
sendEvent(eventType, data) {
  this.io.emit(eventType, data)
}

// After: Support multiple response handlers
sendEvent(eventType, data, context) {
  // Existing: WebSocket
  if (context.source === 'web') {
    this.io.emit(eventType, data)
  }

  // New: External platforms
  if (context.source === 'telegram' || context.source === 'discord') {
    this.emit('external-response', { platform: context.source, externalId: context.externalId, data })
  }
}
```

**Response Buffering**:
- AI responses stream as small chunks (1-5 words)
- Telegram/Discord APIs have rate limits
- Buffer chunks for 500ms or until punctuation (`.`, `?`, `!`)
- Send buffered text as complete sentences

**Verification**:
- Can send message from Telegram → receive AI response
- Conversation history maintained across messages
- Response buffering works (no spam, readable chunks)

## Testing Strategy

### Unit Tests

**ExternalChatService**:
- `generatePairingCode()` creates valid 6-digit code
- `linkAccount()` validates code expiration
- `linkAccount()` prevents duplicate links (same external_id)
- `routeMessage()` rejects unauthenticated external IDs

**TelegramBotService**:
- `parseIncomingMessage()` extracts text and user info
- `sendMessage()` formats message for Telegram API
- `verifyWebhookSignature()` validates requests

**DiscordBotService**:
- `handleMessage()` extracts text from Discord event
- `sendMessage()` formats message for Discord API

### Integration Tests

**Pairing Flow**:
1. Generate code via API
2. Link account via API (with valid code)
3. Verify `external_accounts` record created
4. Verify code marked as used

**Message Routing**:
1. Mock Telegram webhook with message
2. Verify `ExternalChatService.routeMessage()` called
3. Verify `OrchestratorService` receives message
4. Mock AI response
5. Verify response sent back to ExternalChatService

**Error Handling**:
- Expired pairing codes rejected
- Invalid webhook signatures rejected
- Unauthenticated external IDs rejected

### E2E Tests (Playwright)

**Pairing Flow**:
1. Open Settings → External Chat
2. Click "Generate Pairing Code"
3. Verify code displayed with countdown
4. (Manually trigger pairing via API)
5. Verify account appears in linked accounts list

**Message Flow** (requires test bots):
1. Send test message to Telegram bot
2. Verify conversation appears in AGNT UI
3. Reply from AGNT UI
4. Verify reply appears in Telegram

## Security Considerations

### Account Pairing

**Threat**: Attacker guesses pairing codes
- **Mitigation**: 6-digit codes = 1 million combinations
- **Mitigation**: 5-minute expiration
- **Mitigation**: One-time use (code deleted after linking)
- **Mitigation**: Rate limit: 3 codes per user per hour

**Threat**: User accidentally shares code publicly
- **Mitigation**: Code expires quickly (5 minutes)
- **Mitigation**: UI warns: "Don't share this code"
- **Mitigation**: User can generate new code (invalidates old one)

### Webhook Security

**Threat**: Attackers send fake webhook requests
- **Mitigation**: Verify Telegram webhook signature (HMAC)
- **Mitigation**: Verify Discord webhook signature (Ed25519)
- **Mitigation**: Rate limit webhook endpoints (per IP)

**Threat**: Replay attacks (re-send captured webhook)
- **Mitigation**: Telegram includes timestamp in signature
- **Mitigation**: Reject requests older than 5 minutes

**Threat**: DDoS via webhook spam
- **Mitigation**: Rate limit per external_id (10 messages/minute)
- **Mitigation**: Cloudflare Tunnel provides DDoS protection

### Data Storage

**Threat**: Unauthorized access to linked accounts
- **Mitigation**: Store only necessary data (external_id, username)
- **Mitigation**: No message content stored (stateless routing)
- **Mitigation**: Foreign key cascade: deleting user removes links

## Performance Considerations

### Response Buffering

**Problem**: AI streams 1-5 words/chunk → 100+ API calls/response
- **Solution**: Buffer chunks for 500ms or until sentence boundary
- **Result**: 5-10 API calls/response (90% reduction)

**Implementation**:
```javascript
class ResponseBuffer {
  constructor(sendFn, delayMs = 500) {
    this.buffer = ''
    this.timer = null
    this.sendFn = sendFn
    this.delayMs = delayMs
  }

  add(chunk) {
    this.buffer += chunk
    clearTimeout(this.timer)

    // Send immediately if sentence-ending punctuation
    if (/[.!?]$/.test(chunk.trim())) {
      this.flush()
    } else {
      this.timer = setTimeout(() => this.flush(), this.delayMs)
    }
  }

  flush() {
    if (this.buffer) {
      this.sendFn(this.buffer)
      this.buffer = ''
    }
  }
}
```

### Database Queries

**Optimization**: Index `(platform, external_id)` for fast lookups
**Optimization**: Cache user_id lookup in memory (LRU cache, 1000 entries)

### Rate Limiting

**Telegram API**: 30 messages/second per bot
**Discord API**: 5 messages/5 seconds per channel
**AGNT rate limit**: 10 messages/minute per user (prevents spam)

## References

### Working Code Patterns

**Service Architecture**:
- `backend/src/services/TunnelService.js` - EventEmitter pattern, lifecycle management
- `backend/src/services/AgentService.js` - Response streaming, error handling

**Route Structure**:
- `backend/src/routes/WebhookRoutes.js` - Webhook handling, WorkflowProcessBridge integration
- `backend/src/routes/TunnelRoutes.js` - API endpoints for service control

**Settings UI**:
- `frontend/src/views/Terminal/CenterPanel/screens/Settings/components/TunnelSettings/TunnelSettings.vue` - Real-time status, toggle controls

### Related Documentation

- [User Guide](../EXTERNAL_CHAT.md) - End-user documentation
- [Instant Webhooks Guide](../INSTANT_WEBHOOKS_GUIDE.md) - Similar feature using Tunnel
- [Telegram Integration Plan](../plans/2026-01-27-feat-telegram-integration-plan.md) - Original technical plan

### External APIs

- [Telegram Bot API](https://core.telegram.org/bots/api) - Official API reference
- [Discord.js Documentation](https://discord.js.org/) - Node.js library for Discord
- [Discord API](https://discord.com/developers/docs/intro) - Official REST API
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) - Webhook routing

## Next Steps

1. **Community feedback**: Share this plan for architectural review
2. **Database migration**: Start with Phase 1 (low risk, foundation)
3. **Backend services**: Build core services (Phase 2) with unit tests
4. **API routes**: Add endpoints (Phase 3) for frontend integration
5. **Frontend UI**: Build Settings component (Phase 4)
6. **OrchestratorService integration**: Complete end-to-end flow (Phase 5)
7. **Testing**: E2E tests with real bots

**Estimated effort**: 20-30 hours for full implementation (across 5 phases)

## Contributing

Want to help build this feature? Here's how:

1. **Pick a phase**: Start with Phase 1 (database) or Phase 2 (services)
2. **Follow patterns**: Reference existing code (TunnelService, WebhookRoutes)
3. **Write tests**: Unit tests required for all new services
4. **Open PR**: Small, focused PRs (one phase at a time)

Questions? Ask in GitHub Discussions or Discord.
