# External Chat Implementation Guide

> [!NOTE]
> This is a planning document for contributors. The feature is not yet implemented. See the [user guide](../EXTERNAL_CHAT.md) for end-user information.

## Architecture Overview

### High-Level Flow

```
User Message (Telegram/Discord)
    ↓
Webhook/WebSocket Listener
    ↓
ExternalChatService (routing + auth)
    ↓
Verify pairing (external_accounts table)
    ↓
OrchestratorService (process like web UI message)
    ↓
AI Provider (OpenAI, Anthropic, etc.)
    ↓
AI Response
    ↓
ExternalChatService (format response)
    ↓
TelegramBotService / DiscordBotService
    ↓
Platform API (send message)
    ↓
User receives response
```

### Component Responsibilities

| Component | Responsibility | Integration Point |
|-----------|----------------|-------------------|
| `ExternalChatService` | Message routing, authentication, conversation tracking | New service in `backend/src/services/` |
| `TelegramBotService` | Telegram Bot API wrapper, webhook handling | Uses TunnelService for public URL |
| `DiscordBotService` | Discord.js wrapper, WebSocket connection | Real-time message listener |
| `ExternalChatRoutes` | HTTP endpoints for pairing and webhooks | Express router in `backend/src/routes/` |
| `ExternalChatSettings` | UI for bot configuration and pairing | Vue component in Settings screen |

## Database Schema

### Tables to Add

#### external_accounts

Stores mappings between platform user IDs and AGNT user accounts.

```sql
CREATE TABLE external_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  platform TEXT NOT NULL,  -- 'telegram' or 'discord'
  external_id TEXT NOT NULL,  -- Platform-specific user ID
  paired_at INTEGER NOT NULL,  -- Unix timestamp
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(platform, external_id)
);

CREATE INDEX idx_external_accounts_user_platform
  ON external_accounts(user_id, platform);

CREATE INDEX idx_external_accounts_lookup
  ON external_accounts(platform, external_id);
```

#### pairing_codes

Temporary codes for account pairing (expire after 5 minutes).

```sql
CREATE TABLE pairing_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,  -- 6-digit alphanumeric
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,  -- Unix timestamp
  used BOOLEAN DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_pairing_codes_code
  ON pairing_codes(code) WHERE used = 0;

CREATE INDEX idx_pairing_codes_expiry
  ON pairing_codes(expires_at) WHERE used = 0;
```

### ER Diagram (Text)

```
users (existing)
  ├─── external_accounts (1:many)
  │      - maps Telegram/Discord IDs to AGNT users
  │      - enables message routing
  └─── pairing_codes (1:many)
         - temporary codes for linking accounts
         - expire after 5 minutes
```

## Integration Points

### 1. TunnelService (Existing)

**Location:** `backend/src/services/TunnelService.js`

**Current functionality:**
- Manages Cloudflare Tunnel (Named or Quick Tunnel)
- Provides public HTTPS URL for local server
- Auto-restart on boot, retry logic, state persistence

**Integration for External Chat:**
- Telegram webhooks will use: `https://{tunnel-url}/api/external-chat/telegram/webhook`
- No changes needed to TunnelService itself
- ExternalChatService registers webhook URL with Telegram API when tunnel starts
- Must handle tunnel URL changes (Quick Tunnels get new URLs on restart)

**Pattern reference:** See how `WebhookRoutes.js` uses the tunnel URL for workflow webhooks.

### 2. OrchestratorService (Existing)

**Location:** `backend/src/services/OrchestratorService.js`

**Current functionality:**
- Processes user messages
- Manages AI provider calls
- Handles conversation context
- Streams responses via WebSocket

**Integration for External Chat:**
```javascript
// New message source type
const messageContext = {
  source: 'telegram',  // or 'discord'
  externalId: '123456789',
  userId: 42,
  conversationId: 'conv-123',
  platform: 'telegram'
};

// Instead of streaming to WebSocket, stream to callback
orchestrator.processMessage(message, {
  ...messageContext,
  onChunk: (chunk) => {
    externalChatService.sendChunk(platform, externalId, chunk);
  }
});
```

**Changes needed:**
- Add support for external message sources (currently assumes web UI)
- Support streaming to callback functions (not just WebSocket)
- Track conversation context for external users
- Map external user IDs to AGNT user IDs

**Pattern reference:** Review how web UI messages are currently processed.

### 3. Settings Screen (Existing)

**Location:** `frontend/src/views/Terminal/CenterPanel/screens/Settings/Settings.vue`

**Current structure:**
- Left panel navigation (`SettingsPanel.vue`)
- Right panel content (section components)
- Real-time updates via Socket.IO

**Integration for External Chat:**
```vue
<!-- Add to left panel navigation -->
<button
  class="nav-item"
  :class="{ active: activeSection === 'externalChat' }"
  @click="activeSection = 'externalChat'"
>
  <MessageSquare class="nav-icon" />
  <span>External Chat</span>
</button>

<!-- Add to right panel content -->
<div v-else-if="activeSection === 'externalChat'" class="settings-content">
  <div class="content-header">
    <h2 class="content-title">External Chat Settings</h2>
    <p class="content-subtitle">Configure Telegram and Discord integration</p>
  </div>
  <div class="settings-grid">
    <ExternalChatSettings />
  </div>
</div>
```

**Pattern reference:** See `TunnelSettings.vue` (622 lines) for similar bot configuration UI with:
- Installation checks
- Enable/disable toggles
- Status indicators
- Real-time updates
- Copy-paste helpers

## Implementation Phases

### Phase 1: Database Schema
**Estimated effort:** 2-3 hours

**Tasks:**
- [ ] Create migration script: `backend/src/models/migrations/add_external_chat_tables.js`
- [ ] Add `external_accounts` table with indexes
- [ ] Add `pairing_codes` table with indexes
- [ ] Add database helper methods to `backend/src/models/database/index.js`
- [ ] Write database seed script for testing

**Verification:**
```bash
# Run migration
node backend/src/models/migrations/add_external_chat_tables.js

# Verify tables exist
sqlite3 ~/.agnt/data/agnt.db ".schema external_accounts"
sqlite3 ~/.agnt/data/agnt.db ".schema pairing_codes"

# Test insert/query
sqlite3 ~/.agnt/data/agnt.db "INSERT INTO pairing_codes (code, user_id, expires_at) VALUES ('TEST01', 1, ...)"
```

**Dependencies:** None

---

### Phase 2: Backend Services
**Estimated effort:** 8-10 hours

**Tasks:**
- [ ] Create `ExternalChatService.js` (message routing, pairing logic, conversation tracking)
- [ ] Create `TelegramBotService.js` (Telegram Bot API wrapper, webhook verification)
- [ ] Create `DiscordBotService.js` (Discord.js integration, WebSocket handling)
- [ ] Add pairing code generation (6-digit alphanumeric, crypto-random)
- [ ] Add rate limiting for pairing attempts (3 codes per hour per user)
- [ ] Add automatic cleanup for expired pairing codes (cron job)

**Verification:**
```bash
# Unit tests
npm test backend/src/services/ExternalChatService.test.js
npm test backend/src/services/TelegramBotService.test.js
npm test backend/src/services/DiscordBotService.test.js

# Manual verification
node -e "const svc = require('./backend/src/services/ExternalChatService'); console.log(svc.generatePairingCode())"
```

**Dependencies:** Phase 1 (database schema)

**npm packages needed:**
- `node-telegram-bot-api` - Telegram Bot API client
- `discord.js` - Discord API wrapper
- `crypto` (built-in) - Secure random code generation

---

### Phase 3: API Routes
**Estimated effort:** 4-6 hours

**Tasks:**
- [ ] Create `ExternalChatRoutes.js` in `backend/src/routes/`
- [ ] POST `/api/external-chat/pair` - Generate pairing code for current user
- [ ] POST `/api/external-chat/telegram/webhook` - Receive Telegram messages
- [ ] POST `/api/external-chat/discord/events` - Receive Discord events (if using webhooks)
- [ ] GET `/api/external-chat/status` - Get connection status for UI
- [ ] DELETE `/api/external-chat/unpair/:platform` - Disconnect account

**Webhook signature verification:**
```javascript
// Telegram: verify X-Telegram-Bot-Api-Secret-Token header
// Discord: verify signature using bot secret (if using webhooks)
```

**Verification:**
```bash
# Test pairing endpoint
curl -X POST http://localhost:3333/api/external-chat/pair \
  -H "Authorization: Bearer <token>" \
  -d '{"userId": 1}'

# Test webhook (mock Telegram request)
curl -X POST http://localhost:3333/api/external-chat/telegram/webhook \
  -H "Content-Type: application/json" \
  -d '{"message": {"text": "Hello", "from": {"id": 123}}}'
```

**Dependencies:** Phase 2 (services)

---

### Phase 4: Frontend UI
**Estimated effort:** 6-8 hours

**Tasks:**
- [ ] Create `ExternalChatSettings/` directory in `frontend/src/views/Terminal/CenterPanel/screens/Settings/components/`
- [ ] Create `ExternalChatSettings.vue` main component
- [ ] Add Telegram configuration section (bot token input, webhook status)
- [ ] Add Discord configuration section (bot token input, connection status)
- [ ] Add pairing code generator (button → display 6-digit code)
- [ ] Add paired accounts list (platform, external ID, paired date)
- [ ] Add unpair button for each account
- [ ] Real-time status updates via Socket.IO
- [ ] Add navigation item to `SettingsPanel.vue`

**UI mockup structure:**
```
┌─ External Chat Settings ───────────────────┐
│                                             │
│ 🔐 Account Pairing                          │
│ ┌─────────────────────────────────────────┐│
│ │ Generate a code to pair your Telegram  ││
│ │ or Discord account with AGNT.          ││
│ │                                         ││
│ │ [Generate Pairing Code]  ABC123         ││
│ │ Code expires in: 4:32                   ││
│ └─────────────────────────────────────────┘│
│                                             │
│ 📱 Telegram Bot                              │
│ Bot Token: [************************] ✓     │
│ Webhook: https://xyz.trycloudflare.com/... │
│                                             │
│ 💬 Discord Bot                               │
│ Bot Token: [************************] ✓     │
│ Status: Connected ●                         │
│                                             │
│ 🔗 Paired Accounts                           │
│ • Telegram: @username (Jan 28, 2026)  [x]  │
│ • Discord: user#1234 (Jan 28, 2026)   [x]  │
└─────────────────────────────────────────────┘
```

**Verification:**
- UI renders in Settings screen
- Can generate pairing code
- Code expires after 5 minutes
- Real-time status updates when bot connects
- Can unpair accounts

**Dependencies:** Phase 3 (API routes)

**Pattern reference:** `TunnelSettings.vue` for similar bot configuration patterns

---

### Phase 5: OrchestratorService Integration
**Estimated effort:** 4-6 hours

**Tasks:**
- [ ] Modify `OrchestratorService.js` to accept external message sources
- [ ] Add conversation context management for external users
- [ ] Support streaming responses to callback (not just WebSocket)
- [ ] Track active conversations per external account
- [ ] Add message history retrieval for external users
- [ ] Sync conversation history across platforms (web UI, Telegram, Discord)

**Code changes:**
```javascript
// Before: assumes WebSocket
async processMessage(message, socket, userId) {
  // ... stream to socket.emit('chunk', data)
}

// After: support callbacks
async processMessage(message, { socket, onChunk, userId, source }) {
  // ... stream to socket OR onChunk(data)
}
```

**Verification:**
```bash
# E2E test
# 1. Send message via Telegram
# 2. Verify message appears in web UI conversation history
# 3. Send message via web UI
# 4. Verify response appears in Telegram
# 5. Check conversation continuity
```

**Dependencies:** Phase 2-4 (all previous phases)

---

## Testing Strategy

### Unit Tests

**ExternalChatService:**
- Pairing code generation (randomness, uniqueness)
- Pairing code validation (expiry, one-time use)
- Account lookup (platform + external ID → user ID)
- Rate limiting (max 3 codes per hour)

**TelegramBotService:**
- Message parsing (text, commands, media)
- Webhook signature verification
- Message sending (text formatting, error handling)

**DiscordBotService:**
- WebSocket connection handling
- Message event parsing
- Message sending (embeds, mentions)

### Integration Tests

**Pairing flow:**
1. Generate code via API
2. Verify code stored in database
3. Simulate pairing (send `/pair <code>` from Telegram)
4. Verify account linked in `external_accounts` table
5. Verify code marked as used

**Message routing:**
1. Send message from Telegram
2. Verify ExternalChatService receives it
3. Verify OrchestratorService processes it
4. Verify response sent back to Telegram
5. Check conversation history in database

**Error handling:**
- Expired pairing codes
- Invalid bot tokens
- Rate limiting triggers
- Network failures (retry logic)

### E2E Tests (Playwright)

```javascript
test('Generate pairing code in UI', async ({ page }) => {
  await page.goto('http://localhost:3333/settings');
  await page.click('text=External Chat');
  await page.click('button:has-text("Generate Pairing Code")');

  const code = await page.textContent('.pairing-code');
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
});

test('Webhook receives test message', async ({ request }) => {
  const response = await request.post('/api/external-chat/telegram/webhook', {
    data: { message: { text: 'Test', from: { id: 123 } } }
  });
  expect(response.status()).toBe(200);
});
```

## Security Considerations

### Account Pairing
- **Code expiry:** 5 minutes to prevent brute force
- **One-time use:** Codes cannot be reused
- **Rate limiting:** Max 3 codes per user per hour
- **Crypto-random:** Use `crypto.randomBytes()` for code generation, not `Math.random()`

### Webhook Security
- **Telegram:** Verify `X-Telegram-Bot-Api-Secret-Token` header
- **Discord:** Verify webhook signature using bot secret
- **Input validation:** Sanitize all user input (message text, user IDs)
- **SQL injection:** Use parameterized queries (already handled by better-sqlite3)

### Data Privacy
- **Minimal storage:** Only store necessary mapping data (platform, external ID, user ID)
- **No message content:** Don't store raw message content in `external_accounts` table
- **Conversation isolation:** Users can only access their own conversations
- **Account unlinking:** Provide clear way to disconnect accounts

### Rate Limiting
- **Pairing attempts:** 3 codes per hour per user
- **Message rate:** Inherit Telegram/Discord's rate limits
- **Webhook calls:** Validate origin to prevent abuse

**Reference pattern:** See `TunnelService.js` for retry logic and error handling patterns.

## References

### Working Code Patterns

**Service architecture:**
- `backend/src/services/TunnelService.js` - EventEmitter pattern, state persistence, retry logic, WebSocket broadcasting
- `backend/src/services/OrchestratorService.js` - Message processing, AI provider calls, conversation management

**Route structure:**
- `backend/src/routes/WebhookRoutes.js` - Webhook handling, WorkflowProcessBridge integration, error handling

**UI components:**
- `frontend/src/views/Terminal/CenterPanel/screens/Settings/components/TunnelSettings/TunnelSettings.vue` - Settings UI pattern, real-time updates, installation checks, status indicators

### Related Documentation

- [Instant Webhooks Guide](../INSTANT_WEBHOOKS_GUIDE.md) - Similar feature using TunnelService for webhooks
- [Telegram Integration Plan](../plans/2026-01-27-feat-telegram-integration-plan.md) - Original technical plan (more detailed implementation)
- [User Guide](../EXTERNAL_CHAT.md) - End-user documentation

### External APIs

- [Telegram Bot API](https://core.telegram.org/bots/api) - Official Telegram Bot API documentation
- [Discord.js Guide](https://discord.js.org/docs/packages/discord.js/main) - Discord.js v14+ documentation
- [Discord Developer Portal](https://discord.com/developers/docs/intro) - Official Discord API documentation
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) - Tunnel documentation (already integrated)

---

## Next Steps

1. **Review this plan** - Ensure all team members understand the architecture
2. **Create GitHub issue** - Track implementation progress publicly
3. **Start with Phase 1** - Database schema is the foundation
4. **Iterate rapidly** - Each phase is independently testable
5. **Update user guide** - Remove "PLANNED" banner and add setup instructions when ready

**Questions?** Open a GitHub issue or discuss in the [AGNT Discord](https://discord.gg/agnt).
