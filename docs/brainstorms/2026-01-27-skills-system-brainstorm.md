# Skills System Brainstorm
**Date:** 2026-01-27
**Status:** Design Complete
**Next Step:** Implementation Planning (`/workflows:plan`)

## What We're Building

A **Skills system** for AGNT agents, modeled after Claude Code's Skills architecture. Skills are filesystem-based capability packages that combine **specialized instructions** (system prompts) with **required tools** to give agents domain expertise.

**Example:** A "Deep Research" skill might include:
- **Instructions:** "Cross-verify facts from 3+ sources, cite URLs, summarize findings"
- **Required Tools:** `web_search`, `web_scrape`
- **When Used:** User assigns "Deep Research" to an agent → agent gains research expertise + auto-gets search tools

**User Goal:** Enable AGNT agents to use skill packages similar to Claude Code skills, without manually crafting prompts or selecting tools every time.

---

## Why This Approach

### Core Architectural Decision: Filesystem-Based (Claude Model)

**Chosen Approach:** Skills are SKILL.md files in `.agnt/skills/` directories, parsed at runtime. No database storage (for now).

**Why Filesystem Over Database?**
1. **Claude Compatibility:** Direct parity with Claude Code's SKILL.md format
2. **Git-Friendly:** Skills version-controlled with project code
3. **Simple Editing:** Users edit markdown files (no UI builder needed for MVP)
4. **Fast to Build:** No database migrations, no schema changes
5. **Portable:** Copy skill folders between projects easily

**Trade-offs Accepted:**
- ❌ Slower reads (file I/O vs. DB query) → Acceptable for MVP; cache later if needed
- ❌ No built-in analytics → Not required for v1
- ❌ Manual file editing → Target audience is developers comfortable with markdown

---

## Key Decisions

### 1. Skill Storage Location
**Decision:** Project-level only (`.agnt/skills/`)

**Why:**
- Skills are project-specific workflows/expertise
- Shared across team via git
- Empty by default (users create their own)
- No built-in skills shipped with AGNT (keeps it unopinionated)

**Future Extensions (Not MVP):**
- User-level skills (`~/.agnt/skills/`) for personal library
- Plugin-provided skills (`backend/plugins/*/skills/`)
- Built-in skills (`backend/src/services/skills/definitions/`)

### 2. Skill Activation Model
**Decision:** Manual assignment only

**How It Works:**
1. User creates skill in `.agnt/skills/deep-research/SKILL.md`
2. User assigns skill to agent via UI (similar to assigning tools)
3. Agent loads skill instructions + required tools at runtime

**Why Not Auto-Detection?**
- Simpler MVP (no LLM call needed to decide relevance)
- Predictable behavior (user controls what skills are active)
- Faster execution (no description-matching logic)

**Future:** Add auto-suggestion in UI ("This agent might benefit from 'Deep Research'")

### 3. Tool Availability Handling
**Decision:** Auto-add required tools to agent

**Flow:**
1. User assigns "Deep Research" skill to agent
2. Skill declares `requiredTools: ['web_search', 'web_scrape']`
3. Backend automatically adds these tools to `agent.assignedTools` array
4. Agent can now use search tools without manual tool assignment

**Why This vs. Warnings/Blocking?**
- **Best UX:** User doesn't need to think about tool dependencies
- **Skills as bundles:** Skill = instructions + tools (atomic unit)
- **Safe:** Adding tools doesn't break anything (agent just has more capabilities)

**Edge Case:** If tool doesn't exist (not installed via plugin), agent will fail gracefully at runtime with "Tool not found" error.

### 4. SKILL.md Format
**Decision:** Follow Claude Code's YAML frontmatter + markdown body format

**Structure:**
```markdown
---
name: "Deep Research"
description: "Conduct multi-source research with fact verification."
requiredTools: ["web_search", "web_scrape"]
---

# Deep Research Instructions

When conducting research:
1. Search minimum 3 sources
2. Cross-verify facts
3. Cite URLs in format [Source](url)
4. Summarize key findings in bullets
```

**Why YAML Frontmatter?**
- Structured metadata (easy to parse)
- Extensible (add fields like `category`, `version` later)
- Standard in static site generators (familiar to developers)

**Progressive Loading (Future Optimization):**
- Level 1: Load only frontmatter (name, description, requiredTools) → 50 tokens
- Level 2: Load full markdown body when agent uses skill → 500 tokens
- Level 3: Load external references (REFERENCE.md) on demand → 2000+ tokens

**MVP:** Load full SKILL.md always (optimize later).

---

## Architecture Overview

### Backend Components

#### 1. SkillRegistry (`backend/src/services/skills/SkillRegistry.js`)
**Responsibility:** Discover, load, and validate skills from filesystem.

**Methods:**
- `initialize()`: Scan `.agnt/skills/` directories, parse all SKILL.md files
- `getSkill(id)`: Return skill definition by ID (e.g., "deep-research")
- `getAllSkills()`: Return all discovered skills (for UI dropdown)
- `validateSkill(skillData)`: Check required fields (name, description)

**Lifecycle:**
- Initialized once at server startup
- Hot-reload: Watch `.agnt/skills/` for changes (future)

#### 2. SkillLoader (`backend/src/services/skills/SkillLoader.js`)
**Responsibility:** Parse SKILL.md files.

**Methods:**
- `parseSkillFile(filePath)`: Read file, extract YAML + markdown
- `extractFrontmatter(content)`: Parse YAML block between `---` delimiters
- `extractInstructions(content)`: Get markdown body after frontmatter

**Output:**
```javascript
{
  id: "deep-research",           // Derived from folder name
  name: "Deep Research",         // From YAML
  description: "...",            // From YAML
  requiredTools: ["web_search"], // From YAML
  instructions: "# Deep Research\n..." // Markdown body
}
```

#### 3. AgentModel (`backend/src/models/AgentModel.js`)
**Changes:**
- Add `assignedSkills` field (JSON array) to agents table:
  ```sql
  ALTER TABLE agents ADD COLUMN assignedSkills TEXT; -- JSON: ["deep-research", "code-review"]
  ```
- Parse/stringify in `createOrUpdate()` and `findOne()`

#### 4. AgentService (`backend/src/services/AgentService.js`)
**Changes in `_getAgentContext()`:**

**Before:**
```javascript
const agent = await AgentModel.findOne(agentId);
const systemPrompt = agent.systemPrompt || "You are a helpful assistant.";
return { agent, systemPrompt };
```

**After:**
```javascript
const agent = await AgentModel.findOne(agentId);
let systemPrompt = agent.systemPrompt || "You are a helpful assistant.";

// Load assigned skills
if (agent.assignedSkills?.length) {
  const skillIds = JSON.parse(agent.assignedSkills);
  const skills = skillIds.map(id => SkillRegistry.getSkill(id)).filter(Boolean);

  // Inject skill instructions into system prompt
  skills.forEach(skill => {
    systemPrompt += `\n\n## Skill: ${skill.name}\n${skill.instructions}`;
  });

  // Auto-add required tools to agent
  const skillTools = skills.flatMap(s => s.requiredTools || []);
  agent.assignedTools = [...new Set([...agent.assignedTools, ...skillTools])]; // Dedupe
}

return { agent, systemPrompt };
```

### Frontend Components

#### Skills Management UI (`frontend/src/views/Terminal/.../Skills.vue`)
**Layout:** Similar to Plugins.vue (card-based grid)

**Tabs:**
1. **Browse Skills** (default):
   - List all skills from `.agnt/skills/`
   - Show: name, description, required tools (badges)
   - Button: "Assign to Agent" → opens agent selector modal

2. **Create Skill** (future):
   - Form to generate SKILL.md file
   - Fields: name, description, instructions (textarea), required tools (multi-select)
   - Button: "Save" → writes to `.agnt/skills/{slug}/SKILL.md`

**Agent Assignment Flow:**
1. User clicks "Assign to Agent" on a skill card
2. Modal shows list of agents
3. User selects agent → updates `agent.assignedSkills` array
4. Backend auto-adds `skill.requiredTools` to agent

---

## Implementation Scope (MVP)

### What's In:
✅ **SkillRegistry**: Load skills from `.agnt/skills/` directories
✅ **SKILL.md Parser**: YAML frontmatter + markdown body
✅ **Agent Integration**: Inject skill instructions into system prompt
✅ **Auto-add Tools**: Add `requiredTools` to agent's tool list
✅ **Database Schema**: Add `assignedSkills` column to agents table
✅ **Frontend UI**: Browse skills, assign to agents (read-only, no creation UI)

### What's Out (Future):
❌ Built-in skills shipped with AGNT
❌ User-level skills (`~/.agnt/skills/`)
❌ Plugin-provided skills
❌ Auto-detection of relevant skills
❌ Progressive loading (always load full SKILL.md)
❌ Hot-reload on file changes
❌ Skill creation UI (users edit files manually)
❌ Skill analytics/usage tracking

---

## Open Questions

### 1. Skill ID Generation
**Question:** How to derive skill ID from folder name?

**Options:**
- **Folder name as-is:** `.agnt/skills/deep-research/` → ID = "deep-research"
- **Slugify name field:** `name: "Deep Research"` → ID = "deep-research" (collision risk)

**Recommendation:** Use folder name as canonical ID. If SKILL.md `name` doesn't match, log warning.

### 2. Multiple Skills with Same ID
**Question:** What if user creates two skills with same folder name?

**Options:**
- **Last wins:** Overwrite previous skill (silent)
- **Error:** Throw error on duplicate IDs
- **Namespace by path:** `.agnt/skills/research/deep/` → ID = "research-deep"

**Recommendation:** Error on duplicate (fail fast). IDs must be unique.

### 3. Skill Validation Failures
**Question:** What if SKILL.md is malformed (missing name, invalid YAML)?

**Options:**
- **Skip silently:** Log warning, don't load skill
- **Throw error:** Crash server startup
- **Partial load:** Load what's valid, ignore broken fields

**Recommendation:** Log error, skip skill, continue loading others. Show validation errors in UI.

### 4. Tool References That Don't Exist
**Question:** Skill requires `web_search` but no plugin provides it. What happens?

**Current Decision:** Auto-add anyway. Agent fails at runtime if tool not found.

**Alternative:** Pre-validate tools exist before adding? (Adds complexity)

**Stick with current:** Fail gracefully at runtime. Log warning in UI: "Skill requires 'web_search' but it's not installed."

---

## Success Criteria

### Manual Verification
1. ✅ Create skill: `.agnt/skills/joke-master/SKILL.md` with prompt "Always end responses with a joke"
2. ✅ Assign "Joke Master" skill to agent via UI
3. ✅ Chat with agent → verify it tells jokes
4. ✅ Create skill requiring `web_search` tool
5. ✅ Assign to agent that didn't have search → verify agent can now search

### Automated Tests
1. Unit test: SkillLoader parses valid SKILL.md correctly
2. Unit test: SkillLoader handles malformed YAML gracefully
3. Integration test: AgentService includes skill instructions in system prompt
4. Integration test: AgentService auto-adds required tools to agent
5. E2E test: Create skill → assign to agent → chat uses skill

---

## Migration Path

### Database Migration
```sql
-- migration: add_skills_to_agents.sql
ALTER TABLE agents ADD COLUMN assignedSkills TEXT DEFAULT '[]';
```

**Rollback:**
```sql
-- rollback: remove_skills_from_agents.sql
ALTER TABLE agents DROP COLUMN assignedSkills;
```

### Backwards Compatibility
- Existing agents: `assignedSkills` = `NULL` or `"[]"` → no skills loaded
- No breaking changes to existing agent functionality
- Skills are purely additive (don't modify existing behavior)

---

## Documentation Needs

### For Users:
1. **Quick Start Guide:** "Creating Your First Skill"
   - SKILL.md format
   - Example: "Joke Master" skill (no tools)
   - Example: "Web Research" skill (with tools)

2. **Skills Reference:**
   - YAML frontmatter fields (required vs. optional)
   - Markdown formatting tips
   - How to reference external files (REFERENCE.md)

### For Developers:
1. **Architecture Doc:** How SkillRegistry works
2. **API Doc:** `SkillRegistry.getSkill()`, `AgentService._getAgentContext()`
3. **Testing Guide:** How to test skills in development

---

## Next Steps

Run `/workflows:plan` to create detailed implementation plan based on this design.

**Implementation Order:**
1. Backend: SkillLoader + SkillRegistry
2. Backend: AgentModel schema migration
3. Backend: AgentService integration
4. Frontend: Skills UI (browse + assign)
5. Documentation + tests

**Estimated Scope:** ~8-12 new/modified files, ~800 lines of code
