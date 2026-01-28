---
title: Split External Chat Documentation into User and Developer Guides
type: docs
date: 2026-01-28
---

# Split External Chat Documentation into User and Developer Guides

## Overview

Replace the misleading `EXTERNAL_CHAT_GUIDE.md` (which documents a non-existent feature as if it works) with two honest, audience-specific guides that clearly communicate the feature's planned status while providing value to both end users and contributors.

**Context:** The current guide describes setup steps for External Chat (Telegram/Discord integration) but the feature isn't implemented—no backend services, no database tables, no UI. Users following it will fail immediately. This creates confusion and support burden.

**Brainstorm:** See `docs/brainstorms/2026-01-28-external-chat-docs-split-brainstorm.md` for detailed design decisions.

## Problem Statement

**Current state:**
- `EXTERNAL_CHAT_GUIDE.md` describes setup as if feature is ready
- References services that don't exist (`ExternalChatService`, `TelegramBotService`)
- Claims database tables exist (`external_accounts`) when they don't
- File is staged in git but shouldn't be committed

**Problems this causes:**
1. Users try to follow instructions and fail
2. Creates GitHub issues / Discord questions about "External Chat not working"
3. Erodes trust in documentation quality
4. Mixes user needs (when?) with dev needs (how?)

## Proposed Solution

Create **two separate guides** following AGNT's documentation patterns:

### 1. User Guide: `docs/EXTERNAL_CHAT.md` (100-150 lines)

**Target audience:** End users who want to know what's coming

**Purpose:**
- Set expectations (this is planned, not ready)
- Explain benefits (chat from anywhere, no browser)
- Provide prerequisites (create bots now, be ready later)
- Track progress (link to GitHub issue)

**Key sections:**
- Prominent `> [!IMPORTANT]` banner: "PLANNED FEATURE - Not yet available"
- What It Will Do (benefits, use cases)
- Implementation Status (✅/🚧/📋 table)
- Prerequisites You Can Do Now (BotFather, Discord portal setup)
- How to Track Progress (GitHub issue link)
- Comparison with Existing Features (vs. Webhooks, vs. Web UI)

**Tone:** Friendly, transparent, realistic (future tense: "will allow", "will support")

### 2. Developer Guide: `docs/development/EXTERNAL_CHAT_IMPLEMENTATION.md` (200-300 lines)

**Target audience:** Contributors who want to implement the feature

**Purpose:**
- Explain architecture (components, data flow)
- Define integration points (where to hook into existing code)
- Provide implementation checklist (phases, dependencies)
- Reference working patterns (TunnelService, WebhookRoutes)

**Key sections:**
- Architecture Overview (text-based diagram)
- Components (ExternalChatService, TelegramBotService, DiscordBotService, etc.)
- Database Schema (table definitions, relationships)
- Integration Points (OrchestratorService, TunnelService, Settings UI)
- Implementation Phases (Phase 1: DB, Phase 2: Backend, Phase 3: API, Phase 4: Frontend, Phase 5: Integration)
- Testing Strategy
- References (link to working code: TunnelService.js, WebhookRoutes.js)

**Tone:** Technical, actionable, high-level (no detailed code examples)

## Technical Approach

### Step 1: Create Directory Structure

**New directory:**
- `docs/development/` (doesn't exist yet)

**Verification:** Check if directory exists before creating

### Step 2: Write User Guide

**File:** `docs/EXTERNAL_CHAT.md`

**Template structure:**
```markdown
# External Chat Integration (Telegram & Discord)

> [!IMPORTANT]
> **PLANNED FEATURE** - This integration is not yet available. This guide describes the intended functionality and helps you prepare for when it's ready.

## What It Will Do

[2-3 paragraphs: benefits, use cases, why it's useful]

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Cloudflare Tunnel | ✅ Complete | Already working for webhooks |
| Account Pairing System | 📋 Planned | Database + pairing flow |
| Telegram Bot | 📋 Planned | Message receiving + sending |
| Discord Bot | 📋 Planned | WebSocket listener |
| Settings UI | 📋 Planned | Configuration interface |

## Prerequisites You Can Do Now

### For Telegram
[BotFather setup steps - these work today]

### For Discord
[Discord Developer Portal setup steps - these work today]

## Comparison with Existing Features

| Feature | Use Case | Requires |
|---------|----------|----------|
| **Web UI** | Rich interface, full control | Browser, desktop/mobile app |
| **Webhooks** | Trigger workflows from external events | Public endpoint, workflow setup |
| **External Chat** | Conversational AI from messaging apps | Bot setup, account pairing |

## How to Track Progress

[Link to GitHub issue when created]
[Invite to contribute]

## Related Documentation

- [Instant Webhooks Guide](INSTANT_WEBHOOKS_GUIDE.md) - Working webhook integration
- [Developer Implementation Guide](development/EXTERNAL_CHAT_IMPLEMENTATION.md) - Technical architecture
```

**Style references:**
- Length: Similar to `INSTANT_WEBHOOKS_GUIDE.md` (44 lines) but slightly longer
- Callouts: Like `SKILLS_FEATURE_PLAN.md` (`> [!IMPORTANT]`)
- Tables: Like `SELF_HOSTING.md` (feature comparison matrices)

### Step 3: Write Developer Guide

**File:** `docs/development/EXTERNAL_CHAT_IMPLEMENTATION.md`

**Template structure:**
```markdown
# External Chat Implementation Guide

> [!NOTE]
> This is a planning document for contributors. The feature is not yet implemented. See the [user guide](../EXTERNAL_CHAT.md) for end-user information.

## Architecture Overview

### High-Level Flow

[Text-based diagram showing: User Message (Telegram/Discord) → ExternalChatService → OrchestratorService → AI Response → Back to platform]

### Component Responsibilities

| Component | Responsibility | Integration Point |
|-----------|----------------|-------------------|
| `ExternalChatService` | Message routing, authentication | New service in `backend/src/services/` |
| `TelegramBotService` | Telegram API wrapper | Webhook receiver via TunnelService |
| `DiscordBotService` | Discord.js wrapper | WebSocket listener |
| `ExternalChatRoutes` | API endpoints | Express router in `backend/src/routes/` |
| `ExternalChatSettings` | UI component | Vue component in Settings screen |

## Database Schema

### Tables to Add

**external_accounts:**
- `id` (PRIMARY KEY)
- `user_id` (FOREIGN KEY → users.id)
- `platform` (enum: 'telegram', 'discord')
- `external_id` (platform-specific user ID)
- `paired_at` (timestamp)
- Index: `(user_id, platform, external_id)`

**pairing_codes:**
- `id` (PRIMARY KEY)
- `code` (6-digit string, unique)
- `user_id` (FOREIGN KEY → users.id)
- `expires_at` (timestamp, 5 minutes)
- `used` (boolean)

### ER Diagram

[Text-based: external_accounts → users, pairing_codes → users]

## Integration Points

### 1. TunnelService (Existing)

**Location:** `backend/src/services/TunnelService.js`

**Integration:**
- Already provides public URL for webhooks
- Telegram bot will use: `https://{tunnel-url}/api/external-chat/telegram/webhook`
- No changes needed to TunnelService itself

### 2. OrchestratorService (Existing)

**Location:** `backend/src/services/OrchestratorService.js`

**Integration:**
- Add support for external message sources (currently web UI only)
- Pass message context: `{ source: 'telegram', externalId: '...', userId: '...' }`
- Stream responses back to ExternalChatService instead of WebSocket

### 3. Settings Screen (Existing)

**Location:** `frontend/src/views/Terminal/CenterPanel/screens/Settings/Settings.vue`

**Integration:**
- Add "External Chat" section to left navigation
- Create `ExternalChatSettings.vue` component (similar to `TunnelSettings.vue`)
- Real-time status updates via Socket.IO

## Implementation Phases

### Phase 1: Database Schema
**Tasks:**
- [ ] Create migration: `external_accounts` table
- [ ] Create migration: `pairing_codes` table
- [ ] Add indexes for performance

**Verification:**
- Tables exist in `agnt.db`
- Can insert/query test records

### Phase 2: Backend Services
**Tasks:**
- [ ] Create `ExternalChatService.js` (message routing + auth)
- [ ] Create `TelegramBotService.js` (Telegram API wrapper)
- [ ] Create `DiscordBotService.js` (Discord.js wrapper)
- [ ] Add pairing code generation logic

**Verification:**
- Services can be instantiated
- Unit tests pass

### Phase 3: API Routes
**Tasks:**
- [ ] Create `ExternalChatRoutes.js`
- [ ] POST `/api/external-chat/pair` (generate code)
- [ ] POST `/api/external-chat/telegram/webhook` (receive messages)
- [ ] WebSocket handler for Discord messages

**Verification:**
- Routes return 200 OK
- Webhook test delivers to ExternalChatService

### Phase 4: Frontend UI
**Tasks:**
- [ ] Create `ExternalChatSettings/` directory
- [ ] Create `ExternalChatSettings.vue` component
- [ ] Add navigation item to Settings panel
- [ ] Real-time pairing status updates

**Verification:**
- UI renders in Settings
- Can generate pairing code
- Status updates work

### Phase 5: OrchestratorService Integration
**Tasks:**
- [ ] Add external message source support
- [ ] Conversation context management
- [ ] Response streaming to external platforms

**Verification:**
- Can send message from Telegram → receive AI response
- Conversation history maintained

## Testing Strategy

### Unit Tests
- ExternalChatService: pairing logic, auth
- TelegramBotService: message parsing, sending
- DiscordBotService: WebSocket handling

### Integration Tests
- Pairing flow end-to-end
- Message routing (Telegram → AGNT → AI → Telegram)
- Error handling (expired codes, invalid tokens)

### E2E Tests (Playwright)
- Generate pairing code in UI
- Verify webhook receives test message
- Check conversation appears in UI

## Security Considerations

**Account Pairing:**
- Codes expire after 5 minutes
- One-time use only
- Rate limit: 3 codes per user per hour

**Webhook Security:**
- Verify Telegram webhook signature
- Verify Discord bot token
- Validate external IDs against database

**Reference:** See `TunnelService.js` for similar auth patterns

## References

### Working Code Patterns
- `backend/src/services/TunnelService.js` - Service architecture, EventEmitter pattern, retry logic
- `backend/src/routes/WebhookRoutes.js` - Route structure, WorkflowProcessBridge integration
- `frontend/src/views/Terminal/CenterPanel/screens/Settings/components/TunnelSettings/TunnelSettings.vue` - Settings UI pattern

### Related Documentation
- [Instant Webhooks Guide](../INSTANT_WEBHOOKS_GUIDE.md) - Similar feature (webhooks via Tunnel)
- [Telegram Integration Plan](2026-01-27-feat-telegram-integration-plan.md) - Original technical plan
- [User Guide](../EXTERNAL_CHAT.md) - End-user documentation

### External APIs
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Discord.js Documentation](https://discord.js.org/)
- [Discord API](https://discord.com/developers/docs/intro)
```

**Style references:**
- Technical depth: Like `LITE_MODE.md` (code examples, patterns)
- Architecture: High-level component descriptions, no detailed code
- Tables: Component responsibilities, implementation phases

### Step 4: Delete Misleading Guide

**Actions:**
1. Unstage `docs/EXTERNAL_CHAT_GUIDE.md` from git if staged
2. Delete the file
3. Verify no other files reference it

**Verification:**
```bash
# Check for references
grep -r "EXTERNAL_CHAT_GUIDE.md" docs/
grep -r "EXTERNAL_CHAT_GUIDE.md" README.md
```

### Step 5: Update Cross-References

**Check these files for links to old guide:**
- `README.md` (documentation table)
- `docs/QUICKSTART_INDEX.md` (if it links)
- Other guides (search for cross-references)

**Update to point to:**
- User guide: `docs/EXTERNAL_CHAT.md`
- Dev guide: `docs/development/EXTERNAL_CHAT_IMPLEMENTATION.md`

## Acceptance Criteria

### User Guide (docs/EXTERNAL_CHAT.md)
- [x] File created with 100-150 lines
- [x] Prominent "PLANNED FEATURE" banner at top
- [x] Future tense throughout ("will allow", "will support")
- [x] Implementation status table with ✅/🚧/📋 indicators
- [x] Prerequisites section (BotFather, Discord portal)
- [x] Comparison table (External Chat vs. Webhooks vs. Web UI)
- [x] Links to dev guide and related docs
- [x] No setup instructions that don't work today

### Developer Guide (docs/development/EXTERNAL_CHAT_IMPLEMENTATION.md)
- [x] File created with 200-300 lines
- [x] Architecture overview (text-based diagram)
- [x] Component responsibility table
- [x] Database schema definitions (tables, columns, relationships)
- [x] Integration points with existing services
- [x] Implementation phases (5 phases with tasks)
- [x] References to working code (TunnelService, WebhookRoutes, etc.)
- [x] Testing strategy section
- [x] Security considerations section

### Cleanup
- [x] `docs/EXTERNAL_CHAT_GUIDE.md` deleted
- [x] `docs/development/` directory created
- [x] No references to old guide in other docs
- [x] Cross-references updated to point to new guides

### Quality Gates
- [x] Markdown formatting valid (no broken links)
- [x] Follows AGNT documentation conventions
- [x] Matches style of existing guides (INSTANT_WEBHOOKS_GUIDE.md, LITE_MODE.md)
- [x] GitHub-style callouts used correctly (`> [!IMPORTANT]`, `> [!NOTE]`)
- [x] Tables formatted consistently
- [x] Code blocks have language tags

## Success Metrics

**User perspective:**
- Users immediately understand feature isn't ready (within first 5 seconds)
- Users know what the feature will do (benefits clear)
- Users can complete prerequisites now (create bots)
- Users know where to track progress (GitHub issue link)
- No confused "External Chat not working" support questions

**Developer perspective:**
- Contributors understand architecture in 5 minutes
- Clear starting point (Phase 1: Database)
- Know where to integrate (TunnelService, OrchestratorService)
- Can reference working patterns (TunnelService.js)
- Implementation checklist provides structure

**Documentation quality:**
- Passes markdown linting
- Links work (no 404s)
- Follows AGNT conventions (checked against CLAUDE.md)
- Style consistent with existing guides

## Non-Goals

**Out of scope for this task:**
- ❌ Implementing the External Chat feature itself
- ❌ Creating GitHub issue for tracking (can be done separately)
- ❌ Writing detailed code examples in dev guide (keep high-level)
- ❌ Creating UI mockups or screenshots (feature not built yet)
- ❌ Updating plugin documentation (not related to External Chat)

## Dependencies & Risks

### Dependencies
- **None** - This is pure documentation work
- Files to read: Existing guides as style references
- Files to delete: `EXTERNAL_CHAT_GUIDE.md`

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Users still try to follow "prerequisites" expecting full feature | Medium | Clear callouts: "These steps prepare you for when feature is ready" |
| Dev guide becomes outdated during implementation | Low | Keep high-level (architecture, not code) + note at top |
| Other docs link to old guide | Low | Grep for references, update links |
| Directory `docs/development/` conflicts with future structure | Low | Already planned in brainstorm, matches conventions |

## Implementation Notes

### Content to Reuse from Existing Guide

From `docs/EXTERNAL_CHAT_GUIDE.md`:
- **Bot setup steps** (BotFather, Discord portal) → Move to user guide "Prerequisites" section
- **Overview paragraph** → Adapt for "planned" context in user guide
- **Security/pairing explanation** → Move to dev guide with "to be implemented" caveat
- **Technical flow** → Adapt for dev guide architecture section

### New Content to Write

**User guide:**
- Implementation status table (map components to ✅/🚧/📋)
- Comparison table (External Chat vs. Webhooks vs. Web UI)
- "What It Will Do" benefits section
- "How to Track Progress" with GitHub issue placeholder
- Friendly FAQ (When? Can I help?)

**Dev guide:**
- Component responsibility matrix
- Database ER diagram (text-based)
- Integration points with code file paths
- Implementation phases checklist (5 phases)
- Testing strategy (unit, integration, E2E)
- Security considerations (rate limiting, auth)

### Style References to Follow

**User guide style:**
- **Length model:** `INSTANT_WEBHOOKS_GUIDE.md` (44 lines) but expanded to 100-150
- **Callout model:** `SKILLS_FEATURE_PLAN.md` (`> [!IMPORTANT]`)
- **Table model:** `SELF_HOSTING.md` (feature matrices, decision tables)
- **Tone:** Friendly, transparent, realistic

**Dev guide style:**
- **Architecture model:** `LITE_MODE.md` (what's enabled/disabled, helper patterns)
- **Technical depth:** High-level components, not detailed code
- **Checklist model:** Implementation phases with verification steps
- **Tone:** Technical, actionable, reference-heavy

### File Paths Referenced in Guides

**User guide will link to:**
- `development/EXTERNAL_CHAT_IMPLEMENTATION.md` (dev guide)
- `INSTANT_WEBHOOKS_GUIDE.md` (related working feature)
- GitHub issue (once created)

**Dev guide will link to:**
- `../EXTERNAL_CHAT.md` (user guide)
- `backend/src/services/TunnelService.js` (pattern reference)
- `backend/src/routes/WebhookRoutes.js` (pattern reference)
- `frontend/src/views/Terminal/CenterPanel/screens/Settings/components/TunnelSettings/TunnelSettings.vue` (UI pattern)
- `2026-01-27-feat-telegram-integration-plan.md` (original plan)

## Timeline

**Total estimated effort:** 90 minutes

1. **Research & setup** - ✅ Complete (brainstorm + research done)
2. **Create directory structure** - 5 minutes
3. **Write user guide** - 30 minutes
4. **Write dev guide** - 45 minutes
5. **Cleanup & verification** - 10 minutes

## References

### Internal Documentation
- `docs/brainstorms/2026-01-28-external-chat-docs-split-brainstorm.md` - Design decisions and rationale
- `docs/EXTERNAL_CHAT_GUIDE.md` - Existing misleading guide (to be deleted)
- `docs/INSTANT_WEBHOOKS_GUIDE.md:1` - Style reference (concise feature guide)
- `docs/SELF_HOSTING.md:1` - Style reference (comprehensive guide)
- `docs/QUICKSTART_INDEX.md:1` - Style reference (decision matrices)
- `docs/LITE_MODE.md:1` - Style reference (developer guide)
- `docs/SKILLS_FEATURE_PLAN.md:1` - Style reference (planned feature)

### Related Plans
- `docs/plans/2026-01-27-feat-telegram-integration-plan.md` - Original technical implementation plan

### Code References
- `backend/src/services/TunnelService.js:1` - Working service pattern
- `backend/src/routes/WebhookRoutes.js:1` - Working route pattern
- `frontend/src/views/Terminal/CenterPanel/screens/Settings/components/TunnelSettings/TunnelSettings.vue:1` - Settings UI pattern

### External References
- None needed (pure internal documentation task)
