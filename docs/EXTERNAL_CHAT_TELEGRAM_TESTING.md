# External Chat (Telegram) - Testing Guide

## Implementation Complete ✓

All phases of the External Chat (Telegram) integration have been implemented successfully.

---

## What Was Implemented

### Backend (Phase 1-3)
- ✅ Database schema with security constraints
  - `external_accounts` table with UNIQUE constraints
  - `pairing_codes` table with attempt limiting
  - Foreign key enforcement enabled
  - Proper indexes for performance

- ✅ Services
  - `ExternalChatService` - Main orchestration service
  - `TelegramBotService` - Telegram Bot API wrapper
  - `ResponseBuffer` - Stream buffering utility

- ✅ API Routes
  - `POST /api/external-chat/pair` - Generate pairing code
  - `GET /api/external-chat/accounts` - List linked accounts
  - `DELETE /api/external-chat/accounts/:id` - Unlink account
  - `POST /api/external-chat/telegram/webhook` - Telegram webhook
  - `GET /api/external-chat/status` - Service status

- ✅ OrchestratorService Integration
  - `handleExternalChatMessage()` function
  - Real AI responses via user's default provider
  - Conversation history maintained
  - Streaming support with response buffering

### Frontend (Phase 4)
- ✅ Settings UI Component
  - ExternalChatSettings.vue component
  - Integrated into Settings screen
  - Navigation added to LeftPanel
  - Real-time pairing code display
  - Account management interface

### Security Features
- ✅ 8-char alphanumeric pairing codes (2.8 trillion combinations)
- ✅ 5 attempt limit per code
- ✅ Single-use codes (marked used after success)
- ✅ Transaction wrapper (prevents race conditions)
- ✅ Foreign key enforcement
- ✅ Constant-time webhook verification
- ✅ Ownership check on DELETE
- ✅ Rate limiting (3 codes/hour per user)
- ✅ One Telegram account per user

---

## Testing Instructions

### Prerequisites

1. **Create Telegram Bot**
   ```bash
   # On Telegram, message @BotFather
   /newbot
   # Follow prompts to create your bot
   # Copy the bot token
   ```

2. **Configure Environment**
   ```bash
   # Edit .env file
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   TELEGRAM_WEBHOOK_SECRET_TOKEN=$(openssl rand -hex 32)

   # If using Cloudflare Tunnel (recommended)
   TUNNEL_URL=https://your-tunnel-url.com

   # Or set webhook URL directly
   TELEGRAM_WEBHOOK_URL=https://your-public-url.com/api/external-chat/telegram/webhook
   ```

3. **Install Dependencies**
   ```bash
   npm install
   ```

### Test Procedure

#### Step 1: Start AGNT

**Option A: With Frontend Dev Server** (recommended for development)
```bash
# Terminal 1: Start tunnel (if not using ngrok)
cloudflared tunnel run agnt

# Terminal 2: Start frontend dev server
cd frontend && npm run dev

# Terminal 3: Start AGNT
npm start
```

**Option B: Production Mode**
```bash
# Build frontend first
cd frontend && npm run build && cd ..

# Start tunnel
cloudflared tunnel run agnt  # or: ngrok http 3333

# Start AGNT
npm start
```

#### Step 2: Verify Backend Initialization

Check console output for:
```
✓ Foreign keys enabled
✓ External Chat tables migration complete
Initializing External Chat Service...
✓ Telegram bot initialized
✓ Webhook set to: https://your-url.com/api/external-chat/telegram/webhook
✓ External Chat Service initialized
```

If you see "External Chat Service disabled (no TELEGRAM_BOT_TOKEN configured)", check your .env file.

#### Step 3: Access Settings UI

1. Open AGNT (http://localhost:5173 or http://localhost:3333)
2. Login to your account
3. Go to **Settings** (gear icon)
4. Click **External Chat** in the left navigation

#### Step 4: Verify Service Status

In the External Chat settings, you should see:
- ✅ **Status:** Active
- ✅ **Webhook URL:** https://your-tunnel-url.com/api/external-chat/telegram/webhook
- **Linked Accounts:** 0

#### Step 5: Generate Pairing Code

1. Click **"Generate Pairing Code"** button
2. You should see:
   - An 8-character code (e.g., `AB3CD4EF`)
   - Countdown timer (5:00 → 4:59 → ...)
   - Instructions for pairing

#### Step 6: Pair Telegram Account

1. Open Telegram
2. Search for your bot (by username from BotFather)
3. Start conversation: `/start`
4. Send pairing command: `/pair AB3CD4EF` (use your actual code)

**Expected Response:**
```
✅ Successfully paired!

Your Telegram account is now linked to AGNT.
You can start chatting now!
```

#### Step 7: Verify Pairing in UI

Back in AGNT Settings → External Chat:
- The pairing code should disappear
- **Linked Accounts** count should show: **1**
- You should see your account listed with:
  - Telegram icon
  - Your Telegram username
  - "Paired X minutes ago"
  - **Unlink** button

#### Step 8: Test Message Flow

1. In Telegram, send a message to your bot:
   ```
   Hello! What can you help me with?
   ```

2. **Expected Behavior:**
   - Bot shows typing indicator
   - After a few seconds, bot responds with AI-generated message
   - Response uses your default AI provider (Anthropic/OpenAI/etc)

3. **Send More Messages:**
   ```
   What's the weather like?
   Tell me a joke
   What's 2+2?
   ```

4. **Verify Conversation History:**
   - Each new message should maintain context
   - Bot should "remember" previous messages in conversation

#### Step 9: Test Long Responses

Send a message that triggers a long response:
```
Write a detailed explanation of how machine learning works
```

**Expected Behavior:**
- Response is split into multiple messages at sentence boundaries
- Each message is under 4096 characters (Telegram limit)
- Messages arrive in order

#### Step 10: Test Unlink

1. In AGNT Settings → External Chat
2. Click **Unlink** button on your Telegram account
3. Confirm the dialog
4. **Expected:**
   - Account removed from list
   - Linked Accounts count: **0**

5. Try sending a message to the bot

**Expected Response:**
```
❌ Your account is not linked to AGNT.

To connect:
1. Open AGNT Settings → External Chat
2. Generate a pairing code
3. Send /pair YOUR_CODE here
```

---

## Testing Checklist

### Backend Tests

- [ ] Database tables created successfully
- [ ] Foreign keys enforced (test with DELETE user)
- [ ] Pairing code generation works
- [ ] 8-char alphanumeric format (no ambiguous chars)
- [ ] 5 attempt limit enforced
- [ ] Code expires after 5 minutes
- [ ] Single-use codes (can't reuse after success)
- [ ] Transaction prevents race conditions
- [ ] Webhook verification with secret token
- [ ] Rate limiting (3 codes/hour per user)
- [ ] One Telegram account per user enforced

### Frontend Tests

- [ ] Settings → External Chat navigation works
- [ ] Service status displays correctly
- [ ] "Not Configured" state shows when no bot token
- [ ] "Generate Pairing Code" button works
- [ ] Countdown timer displays correctly
- [ ] Copy pairing code button works
- [ ] Linked accounts list displays
- [ ] Unlink button works
- [ ] Polling for new accounts works
- [ ] Error handling displays properly

### Integration Tests

- [ ] Pairing flow end-to-end works
- [ ] Bot receives messages
- [ ] AI responses stream back correctly
- [ ] Typing indicator shows while processing
- [ ] Response buffering works (500ms delay)
- [ ] Long responses split at sentence boundaries
- [ ] Conversation history maintained
- [ ] Multiple conversations isolated by external_id
- [ ] Unlinked accounts rejected

### Security Tests

- [ ] Cannot pair same Telegram to multiple users
- [ ] Cannot pair multiple Telegrams to one user (v1)
- [ ] Cannot unlink another user's account
- [ ] Expired codes rejected
- [ ] Used codes rejected
- [ ] Attempt limit enforced
- [ ] Webhook secret validated
- [ ] Foreign key prevents orphaned records

### Edge Cases

- [ ] Pairing code expires while user is entering it
- [ ] User generates new code while old one active
- [ ] Concurrent messages from same user
- [ ] Very long messages (>4096 chars)
- [ ] Message contains special markdown characters
- [ ] AI provider not configured (error message shown)
- [ ] Tunnel/webhook goes down (graceful error)
- [ ] Bot token invalid/revoked

---

## Troubleshooting

### Bot Not Receiving Messages

**Check:**
1. Webhook URL is publicly accessible
   ```bash
   curl https://your-tunnel-url.com/api/external-chat/telegram/webhook
   # Should return: Method not allowed (POST only)
   ```

2. Telegram webhook is set correctly
   ```bash
   # Check webhook info
   curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
   ```

3. Backend logs show webhook requests
   ```
   [ExternalChat] Received webhook from Telegram
   [ExternalChat] Processing message from...
   ```

### Pairing Code Not Working

**Check:**
1. Code hasn't expired (5 minutes)
2. Code hasn't been used already
3. Attempt count < 5
4. Backend logs for errors

**Reset:**
```sql
-- Clear pairing codes
DELETE FROM pairing_codes;
```

### "Account Already Linked" Error

**Check:**
```sql
-- Find existing link
SELECT * FROM external_accounts WHERE external_id = 'YOUR_TELEGRAM_ID';

-- Unlink if needed
DELETE FROM external_accounts WHERE external_id = 'YOUR_TELEGRAM_ID';
```

### No AI Response

**Check:**
1. User has API key configured (Settings → API Keys)
2. Backend logs show LLM client creation
3. No rate limiting from AI provider

**Test Direct:**
```bash
# Check user's default provider
SELECT default_provider, default_model FROM users WHERE id = 'USER_ID';
```

---

## Database Inspection

Useful queries for debugging:

```sql
-- View all pairing codes
SELECT * FROM pairing_codes ORDER BY created_at DESC LIMIT 10;

-- View all linked accounts
SELECT * FROM external_accounts;

-- View conversation logs
SELECT * FROM conversation_logs WHERE conversationId LIKE 'external-%';

-- Check foreign key enforcement
PRAGMA foreign_keys;

-- View indexes
SELECT * FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('external_accounts', 'pairing_codes');
```

---

## API Testing with cURL

### Get Service Status
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3333/api/external-chat/status
```

### Generate Pairing Code
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3333/api/external-chat/pair
```

### List Linked Accounts
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3333/api/external-chat/accounts
```

### Unlink Account
```bash
curl -X DELETE \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3333/api/external-chat/accounts/1
```

### Simulate Webhook (for testing)
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: YOUR_SECRET" \
  -d '{
    "update_id": 123456789,
    "message": {
      "message_id": 1,
      "from": {
        "id": YOUR_TELEGRAM_ID,
        "first_name": "Test",
        "username": "testuser"
      },
      "chat": {
        "id": YOUR_TELEGRAM_ID,
        "type": "private"
      },
      "date": 1234567890,
      "text": "Hello bot"
    }
  }' \
  http://localhost:3333/api/external-chat/telegram/webhook
```

---

## Performance Monitoring

### Check Response Buffer

Monitor memory usage:
```javascript
// In ExternalChatService
console.log('Active buffers:', this.activeBuffers.size);
this.activeBuffers.forEach((buffer, key) => {
  console.log(`Buffer ${key}:`, buffer.buffer.length, 'chars');
});
```

### Check Cleanup Jobs

Verify cleanup is running:
```
[ExternalChat] Cleanup: Deleted 3 expired codes
[ExternalChat] Cleanup: Cleared 1 stale buffer
```

---

## Next Steps

1. **Test with Real Users** - Share bot with team members
2. **Monitor Performance** - Watch response times and buffer usage
3. **Add Analytics** - Track pairing success rate, message count
4. **Discord Support** - Implement similar flow for Discord (Phase 6)
5. **Agent Selection** - Allow choosing specific agent for external chat
6. **Message History UI** - Show external chat conversations in AGNT UI

---

## Known Limitations (v1)

- ✅ One Telegram account per user (by design)
- ✅ Text messages only (no images/files)
- ✅ No message editing (Telegram edit events ignored)
- ✅ No group chat support (private chat only)
- ✅ No bot commands besides /pair, /start, /help, /status
- ✅ No custom system prompts per user (uses default)

These are intentional simplifications for v1. Future versions may expand features.

---

## Success Criteria

Implementation is successful if:

1. ✅ User can pair Telegram account without errors
2. ✅ Messages flow bidirectionally (user → AI → user)
3. ✅ Conversation context is maintained across messages
4. ✅ Security constraints prevent unauthorized access
5. ✅ UI reflects pairing status accurately
6. ✅ No memory leaks after 24h continuous operation
7. ✅ Response time < 5 seconds for typical queries

---

**Implementation Date:** 2026-01-28
**Status:** ✅ Complete and Ready for Testing
**Version:** AGNT v0.3.7+external-chat
