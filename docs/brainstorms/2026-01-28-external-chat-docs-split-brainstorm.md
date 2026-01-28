# External Chat Documentation Split - Brainstorm

**Date:** 2026-01-28
**Status:** Ready for Implementation
**Related Files:**
- `docs/EXTERNAL_CHAT_GUIDE.md` (to be deleted)
- `docs/plans/2026-01-27-feat-telegram-integration-plan.md` (reference)

---

## What We're Building

Split the misleading `EXTERNAL_CHAT_GUIDE.md` (which documents a non-existent feature as if it works) into two separate, honest guides:

1. **User Guide** (`docs/EXTERNAL_CHAT.md`) - 100-150 lines
   - Target audience: End users who want to know what's coming
   - Clear "Planned Feature" warnings
   - Vision of what the feature will do
   - Prerequisites (bot setup for when it's ready)
   - Timeline/status updates

2. **Developer Guide** (`docs/development/EXTERNAL_CHAT_IMPLEMENTATION.md`) - 200-300 lines
   - Target audience: Contributors who want to implement it
   - High-level architecture (no code examples)
   - Component overview (services, routes, UI)
   - Database schema definitions
   - Integration points with existing code
   - Implementation checklist

---

## Why This Approach

### Problem with Current State
The existing `EXTERNAL_CHAT_GUIDE.md`:
- Describes setup steps as if feature is working
- References services that don't exist (ExternalChatService, TelegramBotService)
- Claims database tables exist (`external_accounts`) - they don't
- Users following it will fail immediately

### Why Split (Not Just Add Disclaimer)
- **Different audiences**: Users want "when?" and "what?", developers want "how?"
- **Separate lifecycles**: User guide stays stable (vision), dev guide evolves during implementation
- **Clear expectations**: No confusion about what's available now vs. later
- **AGNT precedent**: Already has `docs/` for users, `docs/development/` for contributors

### Why Minimal Approach
1. **Fast to implement**: Can write in one session
2. **Low maintenance**: Won't get stale as plans change
3. **Matches AGNT style**: Existing guides are concise (INSTANT_WEBHOOKS_GUIDE.md = 44 lines)
4. **Flexible**: Easy to expand when implementation starts
5. **Honest**: Clear about planned status without overpromising details

---

## Key Decisions

### Decision 1: Delete Existing Guide
**Choice:** Remove `EXTERNAL_CHAT_GUIDE.md` completely
**Why:** It's misleading - better to start fresh than try to salvage
**Alternative considered:** Keep as `.old` reference (rejected - creates clutter)

### Decision 2: File Locations
**Choice:**
- User guide: `docs/EXTERNAL_CHAT.md` (top level)
- Dev guide: `docs/development/EXTERNAL_CHAT_IMPLEMENTATION.md` (technical)

**Why:**
- Matches existing AGNT organization (see `docs/SELF_HOSTING.md`, `docs/development/`)
- Clear separation: users browse `docs/`, developers browse `docs/development/`
- Consistent with other features (webhooks guide is top-level)

**Alternative considered:** Both in `docs/planned/` (rejected - dev guide is for contributors now, not "someday")

### Decision 3: Detail Level
**User Guide:**
- Brief overview (what it will do)
- Prerequisite steps (BotFather, Discord portal)
- Planned workflow (without fake instructions)
- Status checklist (✅ Tunnel, 🚧 Pairing, 📋 Bots)
- How to help (GitHub issue, contribute)

**Dev Guide:**
- Architecture diagram (text-based, not visual)
- 4-5 key components (ExternalChatService, TelegramBotService, etc.)
- Database schema (table names, columns, relationships)
- Integration points (where to hook into OrchestratorService, TunnelService)
- Implementation phases (Phase 1: DB, Phase 2: Backend, etc.)

**Why high-level, not detailed:**
- User asked for "high-level architecture" specifically
- AGNT devs are experienced - they can reference TunnelService.js as pattern
- Detailed specs risk becoming outdated before implementation starts

### Decision 4: Tone & Style
**User Guide:**
- Friendly, transparent ("We're working on this!")
- Focus on benefits (chat from anywhere, no browser needed)
- Realistic timeline (Q2 2026 or "when ready")

**Dev Guide:**
- Technical, pragmatic
- Reference existing working features (TunnelService, WebhookRoutes)
- Actionable checklist format

**Why:** Matches AGNT's existing documentation tone (see CLAUDE.md, SELF_HOSTING.md)

---

## What Success Looks Like

### User Guide Success Criteria
✅ First-time user immediately knows feature isn't ready yet
✅ User understands what the feature will do (high-level benefits)
✅ User knows where to track progress (GitHub issue link)
✅ User can complete prerequisites now (create bots) to be ready
✅ No confusion with existing Webhooks feature

### Dev Guide Success Criteria
✅ Contributor knows what components need building
✅ Clear architecture overview (5-minute read)
✅ Database schema defined (can write migration immediately)
✅ Integration points identified (knows where to hook into existing code)
✅ Implementation phases ordered logically (DB → Backend → API → Frontend → Integration)

### Overall Success
✅ No users try to follow non-working instructions
✅ Reduced GitHub issues/Discord questions about "External Chat not working"
✅ Contributors can start implementation without guessing architecture
✅ Documentation stays accurate as feature develops

---

## Open Questions

### For User Guide
- **Q:** Should we provide exact timeline (e.g., "Q2 2026") or vague ("Coming Soon")?
  - **Recommendation:** Use "Planned for 2026" - specific enough to be useful, flexible enough not to overpromise

- **Q:** Include screenshots/mockups of planned UI?
  - **Recommendation:** No - ExternalChatSettings UI isn't designed yet, would be speculative

### For Dev Guide
- **Q:** How much detail on security (pairing system, rate limiting)?
  - **Recommendation:** Brief mention, link to TunnelService.js as reference for auth patterns

- **Q:** Should we list specific npm packages (e.g., `node-telegram-bot-api`, `discord.js`)?
  - **Recommendation:** Yes, briefly - helps contributors understand technical approach

---

## Implementation Notes

### Content to Reuse from Existing Guide
- Bot setup steps (BotFather, Discord portal) - move to user guide
- Overview paragraph - adapt for "planned" context
- Security/pairing explanation - move to dev guide with "to be implemented" caveat

### New Content to Write
**User Guide:**
- Implementation status table (✅ Prerequisites, 🚧 In Progress, 📋 Planned)
- Comparison: External Chat vs. Webhooks vs. Web UI (when to use each)
- FAQ: "When will this be ready?", "Can I help build it?"

**Dev Guide:**
- Component responsibility matrix (ExternalChatService does X, TelegramBotService does Y)
- Database ER diagram (text-based: external_accounts → users, pairing_codes → external_accounts)
- API endpoint summary (POST /pair, POST /telegram/webhook, etc.)
- Testing checklist (unit tests for pairing, E2E for message flow)

### Existing Files to Reference
- `backend/src/services/TunnelService.js` - Service architecture pattern
- `backend/src/routes/WebhookRoutes.js` - Route structure pattern
- `frontend/src/views/Terminal/CenterPanel/screens/Settings/components/TunnelSettings/TunnelSettings.vue` - Settings UI pattern
- `docs/INSTANT_WEBHOOKS_GUIDE.md` - Documentation style reference
- `docs/plans/2026-01-27-feat-telegram-integration-plan.md` - Original implementation plan

---

## Next Steps

1. **Create user guide** (`docs/EXTERNAL_CHAT.md`)
   - Structure: Overview → What It Will Do → Prerequisites → Status → How to Help
   - Tone: Friendly, transparent, brief

2. **Create dev guide** (`docs/development/EXTERNAL_CHAT_IMPLEMENTATION.md`)
   - Structure: Architecture → Components → Database → Integration → Checklist
   - Tone: Technical, actionable, high-level

3. **Delete misleading guide** (`docs/EXTERNAL_CHAT_GUIDE.md`)
   - Check if it's staged in git (it is) - unstage and delete

4. **Update references** (if any)
   - Check if `README.md` or other docs link to old guide
   - Update to point to new user guide

5. **Optional: Create GitHub issue**
   - Title: "Implement External Chat Integration (Telegram & Discord)"
   - Link to new dev guide
   - User guide can reference this issue for status updates

---

## Risk Mitigation

### Risk: Users expect feature after reading user guide
**Mitigation:**
- Add prominent banner: "⚠️ **PLANNED FEATURE** - Not yet available"
- Use future tense throughout ("will allow", "will support")
- Include status table showing what's done (Tunnel ✅) vs. planned (Bots 📋)

### Risk: Dev guide becomes outdated during implementation
**Mitigation:**
- Keep it high-level (architecture, not code)
- Add note at top: "This is a planning document. See backend/src/services/ for actual implementation."
- Update guide as phases complete (Phase 1 ✅, Phase 2 🚧, etc.)

### Risk: Confusion with existing Webhooks feature
**Mitigation:**
- Add comparison section in user guide (Webhooks = workflow triggers, External Chat = AI conversations)
- Cross-link: "For workflow webhooks, see INSTANT_WEBHOOKS_GUIDE.md"

---

## Timeline Estimate

**Brainstorm:** ✅ Complete
**User Guide:** ~30 minutes to write
**Dev Guide:** ~45 minutes to write
**Cleanup:** ~15 minutes (delete old, check references)

**Total:** ~90 minutes from brainstorm to completion

---

## References

- `docs/EXTERNAL_CHAT_GUIDE.md` (current, misleading)
- `docs/plans/2026-01-27-feat-telegram-integration-plan.md` (original plan)
- `docs/INSTANT_WEBHOOKS_GUIDE.md` (style reference, similar working feature)
- `backend/src/services/TunnelService.js` (implementation pattern)
- Research from compound-engineering:repo-research-analyst agent
