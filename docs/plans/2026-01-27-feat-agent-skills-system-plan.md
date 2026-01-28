---
title: feat: Add Skills System for Agents
type: feat
date: 2026-01-27
---

# Agent Skills System Implementation

## Overview

Add a filesystem-based Skills system to AGNT that enables agents to use capability packages modeled after Claude Code's Skills architecture. Skills combine **specialized instructions** (system prompts) with **required tools** to give agents domain expertise without manual prompt engineering.

**Example Use Case:** A user creates a "Deep Research" skill in `.agnt/skills/deep-research/SKILL.md` that includes research methodology instructions and requires `web_search` + `web_scrape` tools. When assigned to an agent, the agent automatically gains research expertise and search capabilities.

**Key Features:**
- ✅ Filesystem-based (SKILL.md files in `.agnt/skills/` directories)
- ✅ Manual assignment via UI (user explicitly assigns skills to agents)
- ✅ Auto-add required tools (skills bundle tools with instructions)
- ✅ Claude Code compatible (YAML frontmatter + markdown format)
- ✅ Git-friendly (skills version-controlled with project)

**Scope:** MVP implementation with manual assignment only. Auto-detection, progressive loading, and skill creation UI are future enhancements.

---

## Problem Statement / Motivation

**Current State:** Users must manually:
1. Write custom system prompts for each agent use case
2. Select and assign individual tools to agents
3. Maintain consistency across similar agents
4. Re-create expertise for each new agent

**Pain Points:**
- **Repetitive prompt engineering** - Users recreate similar instructions for research, code review, analysis tasks
- **Tool management overhead** - Users must remember which tools are needed for which workflows
- **Knowledge not reusable** - Expertise trapped in individual agent configurations, not shareable
- **Team collaboration gaps** - No way to share "best practice" agent configurations

**User Request:** Enable AGNT agents to use skill packages similar to Claude Code skills, combining expertise (prompts) with capabilities (tools) in reusable, shareable units.

---

## Proposed Solution

### Architecture: Filesystem-Based Registry

Skills are markdown files (`.agnt/skills/{skill-id}/SKILL.md`) with YAML frontmatter + instruction body:

```markdown
---
name: "Deep Research"
description: "Conduct multi-source research with fact verification."
requiredTools: ["web_search", "web_scrape"]
---

# Deep Research Instructions

When conducting research:
1. Search minimum 3 sources
2. Cross-verify facts across sources
3. Cite URLs in format [Source](url)
4. Summarize key findings in bullets
```

**On agent load**, the system:
1. Reads agent's `assignedSkills` array from database
2. Loads skill definitions from filesystem via SkillRegistry
3. Injects skill instructions into agent's system prompt
4. Auto-adds `requiredTools` to agent's available tools

### Component Architecture

```
Backend:
├── SkillLoader (parse SKILL.md files)
│   └── Extract YAML frontmatter + markdown instructions
├── SkillRegistry (singleton, loads all skills at startup)
│   ├── Scan .agnt/skills/ directories
│   ├── Validate skill structure
│   └── Provide getSkill(id) / getAllSkills()
├── AgentModel (database persistence)
│   └── Add assignedSkills column (JSON array)
└── AgentService (context building)
    ├── Load assigned skills from registry
    ├── Inject skill instructions → system prompt
    └── Auto-add skill.requiredTools → agent.assignedTools

Frontend:
├── Skills Browser (list available skills)
│   ├── Card-based grid layout
│   ├── Show: name, description, required tools (badges)
│   └── "Assign to Agent" button
└── Agent Configure Tab (assign skills to agents)
    └── Multi-select skill picker (similar to tools)
```

---

## Technical Approach

### Phase 1: Backend Core (SkillLoader + SkillRegistry)

#### 1.1 SkillLoader (`backend/src/services/skills/SkillLoader.js`)

**Purpose:** Parse SKILL.md files and extract structured data.

**Key Methods:**

```javascript
// SkillLoader.js
import fs from 'fs/promises';
import yaml from 'js-yaml';

export class SkillLoader {
  /**
   * Parse SKILL.md file content
   * @param {string} content - Raw file content
   * @returns {Object} Parsed skill definition
   */
  static parseSkillFile(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
      throw new Error('Invalid SKILL.md format: missing frontmatter');
    }

    const [, frontmatterStr, instructions] = match;
    const frontmatter = yaml.load(frontmatterStr);

    // Validate required fields
    if (!frontmatter.name || !frontmatter.description) {
      throw new Error('Missing required fields: name, description');
    }

    return {
      name: frontmatter.name,
      description: frontmatter.description,
      requiredTools: frontmatter.requiredTools || [],
      instructions: instructions.trim(),
    };
  }

  /**
   * Load and parse skill from filepath
   * @param {string} skillPath - Path to SKILL.md
   * @param {string} skillId - Skill identifier (folder name)
   * @returns {Object} Complete skill object with id
   */
  static async loadSkill(skillPath, skillId) {
    try {
      const content = await fs.readFile(skillPath, 'utf-8');
      const skill = this.parseSkillFile(content);
      return { id: skillId, ...skill };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`SKILL.md not found at ${skillPath}`);
      }
      throw error;
    }
  }
}
```

**Error Handling:**
- Missing `---` delimiters → throw (malformed file)
- Invalid YAML → throw (parse error)
- Missing required fields → throw (validation error)
- File not found → throw (ENOENT)

**Dependencies:**
- Add `js-yaml` to package.json: `npm install js-yaml`

**Reference Patterns:**
- PluginManager manifest parsing: `/Users/mac/tools/agnt/backend/src/plugins/PluginManager.js:149-161`

---

#### 1.2 SkillRegistry (`backend/src/services/skills/SkillRegistry.js`)

**Purpose:** Central registry to load, cache, and serve skill definitions.

**Key Methods:**

```javascript
// SkillRegistry.js
import path from 'path';
import fs from 'fs/promises';
import { SkillLoader } from './SkillLoader.js';

export class SkillRegistry {
  static instance = null;

  constructor() {
    this.skills = new Map(); // skillId -> skill definition
    this.initialized = false;
  }

  static getInstance() {
    if (!SkillRegistry.instance) {
      SkillRegistry.instance = new SkillRegistry();
    }
    return SkillRegistry.instance;
  }

  /**
   * Initialize registry by scanning .agnt/skills/ directory
   */
  async initialize() {
    if (this.initialized) return;

    try {
      const skillsDir = this.getSkillsDirectory();
      await this.ensureSkillsDirectory(skillsDir);
      await this.scanSkills(skillsDir);
      this.initialized = true;
      console.log(`[SkillRegistry] Loaded ${this.skills.size} skills`);
    } catch (error) {
      console.error('[SkillRegistry] Initialization failed:', error);
      // Don't throw - allow server to start even if skills fail to load
    }
  }

  /**
   * Get skills directory path (project-level .agnt/skills/)
   */
  getSkillsDirectory() {
    const userDataPath = process.env.USER_DATA_PATH || process.cwd();
    return path.join(userDataPath, 'skills');
  }

  /**
   * Ensure skills directory exists
   */
  async ensureSkillsDirectory(skillsDir) {
    try {
      await fs.mkdir(skillsDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }

  /**
   * Scan skills directory and load all SKILL.md files
   */
  async scanSkills(skillsDir) {
    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });
      const skillDirs = entries.filter(e => e.isDirectory());

      for (const dir of skillDirs) {
        const skillId = dir.name; // Folder name = skill ID
        const skillPath = path.join(skillsDir, skillId, 'SKILL.md');

        try {
          const skill = await SkillLoader.loadSkill(skillPath, skillId);
          this.skills.set(skillId, skill);
          console.log(`[SkillRegistry] Loaded skill: ${skillId}`);
        } catch (error) {
          console.warn(`[SkillRegistry] Failed to load skill ${skillId}:`, error.message);
          // Skip this skill, continue loading others
        }
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('[SkillRegistry] No skills directory found, starting empty');
      } else {
        throw error;
      }
    }
  }

  /**
   * Get skill by ID
   * @param {string} id - Skill identifier
   * @returns {Object|null} Skill definition or null if not found
   */
  getSkill(id) {
    return this.skills.get(id) || null;
  }

  /**
   * Get all loaded skills
   * @returns {Array} Array of skill definitions
   */
  getAllSkills() {
    return Array.from(this.skills.values());
  }

  /**
   * Reload skills (for hot-reload in future)
   */
  async reload() {
    this.skills.clear();
    this.initialized = false;
    await this.initialize();
  }
}
```

**Reference Patterns:**
- PluginManager singleton: `/Users/mac/tools/agnt/backend/src/plugins/PluginManager.js:56-74`
- ProviderRegistry caching: `/Users/mac/tools/agnt/backend/src/services/ai/ProviderRegistry.js:1-20`

---

### Phase 2: Database Schema & AgentModel

#### 2.1 Database Migration (`backend/src/models/database/index.js`)

**Add `assignedSkills` column to agents table:**

```sql
-- In createTables() function, update agents table definition:
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  icon TEXT,
  category TEXT,
  tools TEXT,              -- JSON array of tool IDs
  workflows TEXT,          -- JSON array of workflow IDs
  assignedSkills TEXT,     -- JSON array of skill IDs (NEW)
  provider TEXT,
  model TEXT,
  created_by TEXT NOT NULL,
  last_active DATETIME,
  success_rate REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Migration for existing databases:**

```javascript
// In database/index.js, add to migrations section (after line 600)
try {
  await db.run('ALTER TABLE agents ADD COLUMN assignedSkills TEXT');
  console.log('Added assignedSkills column to agents table');
} catch (error) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration error:', error);
  }
}
```

**File:** `/Users/mac/tools/agnt/backend/src/models/database/index.js`
**Lines:** 148-166 (agents table), 542-607 (migration pattern)

---

#### 2.2 AgentModel Updates (`backend/src/models/AgentModel.js`)

**Changes in `createOrUpdate()` method:**

```javascript
// Line 18: Add to destructuring
const {
  name,
  description,
  status,
  icon,
  category,
  assignedTools = [],
  assignedWorkflows = [],
  assignedSkills = [],  // NEW
  provider,
  model
} = agent;

// Line 22-23: Serialize arrays
const toolsJson = JSON.stringify(assignedTools);
const workflowsJson = JSON.stringify(assignedWorkflows);
const skillsJson = JSON.stringify(assignedSkills);  // NEW

// Line 25-27: Update query
const query = `
  INSERT OR REPLACE INTO agents (
    id, name, description, status, icon, category,
    tools, workflows, assignedSkills,  -- NEW
    provider, model, created_by, last_active, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const params = [
  id, name, description, status, icon, category,
  toolsJson, workflowsJson, skillsJson,  // NEW
  provider, model, userId, new Date().toISOString(), new Date().toISOString()
];
```

**Changes in `findOne()` method:**

```javascript
// Line 60-61: Parse JSON fields
agent.assignedTools = agent.tools ? JSON.parse(agent.tools) : [];
agent.assignedWorkflows = agent.workflows ? JSON.parse(agent.workflows) : [];
agent.assignedSkills = agent.assignedSkills ? JSON.parse(agent.assignedSkills) : [];  // NEW
```

**File:** `/Users/mac/tools/agnt/backend/src/models/AgentModel.js`
**Lines:** 5-66

**Reference Pattern:** Existing tools/workflows JSON serialization (lines 22-23, 60-61)

---

### Phase 3: AgentService Integration

#### 3.1 Context Building Updates (`backend/src/services/AgentService.js`)

**Inject skill instructions and auto-add tools in `_getAgentContext()` method:**

```javascript
// After line 270 (after system prompt construction)

// Load and inject assigned skills
if (agent.assignedSkills && agent.assignedSkills.length > 0) {
  const SkillRegistry = (await import('../services/skills/SkillRegistry.js')).SkillRegistry;
  const registry = SkillRegistry.getInstance();

  const skills = agent.assignedSkills
    .map(skillId => registry.getSkill(skillId))
    .filter(Boolean); // Remove null/undefined (skills not found)

  if (skills.length > 0) {
    // Inject skill instructions into system prompt
    skills.forEach(skill => {
      systemPrompt += `\n\n## Skill: ${skill.name}\n\n${skill.instructions}`;
    });

    // Auto-add required tools from skills
    const skillTools = skills.flatMap(skill => skill.requiredTools || []);
    const uniqueTools = new Set([...agent.assignedTools, ...skillTools]);
    agent.assignedTools = Array.from(uniqueTools);

    console.log(`[AgentService] Injected ${skills.length} skills, added ${skillTools.length} tools`);
  }
}
```

**File:** `/Users/mac/tools/agnt/backend/src/services/AgentService.js`
**Location:** After line 270, before returning context
**Reference:** Lines 191-281 (full context building method)

**Critical Logic:**
- **Filter null skills**: `filter(Boolean)` - gracefully handle skills that don't exist
- **Deduplicate tools**: Use `Set` to avoid duplicate tool assignments
- **Append to prompt**: Skills come AFTER base system prompt (augmentation pattern)

---

#### 3.2 Agent Response Formatting

**Include `assignedSkills` in agent responses:**

```javascript
// In getAllAgents() (line 127)
const formattedAgents = agents.map(agent => ({
  ...agent,
  assignedTools: agent.assignedTools || [],
  assignedWorkflows: agent.assignedWorkflows || [],
  assignedSkills: agent.assignedSkills || [],  // NEW
}));

// In getAgent() (line 155-156)
agent.assignedTools = agent.assignedTools || [];
agent.assignedWorkflows = agent.assignedWorkflows || [];
agent.assignedSkills = agent.assignedSkills || [];  // NEW
```

**File:** `/Users/mac/tools/agnt/backend/src/services/AgentService.js`
**Lines:** 127, 155-156

---

### Phase 4: API Routes

#### 4.1 Skill Routes (`backend/src/routes/SkillRoutes.js`) - NEW FILE

```javascript
// SkillRoutes.js
import express from 'express';
import { SkillRegistry } from '../services/skills/SkillRegistry.js';

const router = express.Router();

/**
 * GET /api/skills
 * Get all available skills
 */
router.get('/', async (req, res) => {
  try {
    const registry = SkillRegistry.getInstance();
    const skills = registry.getAllSkills();
    res.status(200).json({ skills });
  } catch (error) {
    console.error('[SkillRoutes] Error fetching skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills', details: error.message });
  }
});

/**
 * GET /api/skills/:id
 * Get specific skill by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const registry = SkillRegistry.getInstance();
    const skill = registry.getSkill(id);

    if (!skill) {
      return res.status(404).json({ error: `Skill not found: ${id}` });
    }

    res.status(200).json({ skill });
  } catch (error) {
    console.error('[SkillRoutes] Error fetching skill:', error);
    res.status(500).json({ error: 'Failed to fetch skill', details: error.message });
  }
});

/**
 * POST /api/skills/reload
 * Reload all skills from filesystem (for development)
 */
router.post('/reload', async (req, res) => {
  try {
    const registry = SkillRegistry.getInstance();
    await registry.reload();
    const skills = registry.getAllSkills();
    res.status(200).json({
      message: 'Skills reloaded',
      count: skills.length
    });
  } catch (error) {
    console.error('[SkillRoutes] Error reloading skills:', error);
    res.status(500).json({ error: 'Failed to reload skills', details: error.message });
  }
});

export default router;
```

**Register routes in server:**

```javascript
// In backend/server.js (after existing route registrations)
import skillRoutes from './src/routes/SkillRoutes.js';
app.use('/api/skills', skillRoutes);
```

**File Reference:** `/Users/mac/tools/agnt/backend/src/routes/AgentRoutes.js:1-22` (pattern to follow)

---

### Phase 5: Frontend UI

#### 5.1 Skills Browser View - NEW COMPONENT

**Create:** `frontend/src/views/Terminal/CenterPanel/screens/Skills/SkillsBrowser.vue`

```vue
<template>
  <div class="skills-browser">
    <div class="header">
      <h2>Available Skills</h2>
      <p class="subtitle">Assign expertise packages to your agents</p>
    </div>

    <div v-if="loading" class="loading-state">
      <i class="fas fa-spinner fa-spin"></i> Loading skills...
    </div>

    <div v-else-if="skills.length === 0" class="empty-state">
      <i class="fas fa-graduation-cap"></i>
      <p>No skills found</p>
      <p class="help-text">Create SKILL.md files in .agnt/skills/ directory</p>
    </div>

    <div v-else class="skills-grid">
      <div
        v-for="skill in skills"
        :key="skill.id"
        class="skill-card"
      >
        <div class="skill-icon">
          <i class="fas fa-graduation-cap"></i>
        </div>
        <h3 class="skill-name">{{ skill.name }}</h3>
        <p class="skill-description">{{ skill.description }}</p>

        <div v-if="skill.requiredTools.length > 0" class="required-tools">
          <div class="tools-label">Required Tools:</div>
          <div class="tool-badges">
            <span
              v-for="tool in skill.requiredTools"
              :key="tool"
              class="tool-badge"
            >
              {{ tool }}
            </span>
          </div>
        </div>

        <button
          class="assign-button"
          @click="openAssignModal(skill)"
        >
          <i class="fas fa-plus"></i> Assign to Agent
        </button>
      </div>
    </div>

    <!-- Agent Assignment Modal -->
    <AssignSkillModal
      v-if="showAssignModal"
      :skill="selectedSkill"
      @close="closeAssignModal"
      @assigned="handleSkillAssigned"
    />
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import { useStore } from 'vuex';
import AssignSkillModal from './components/AssignSkillModal.vue';

export default {
  name: 'SkillsBrowser',
  components: { AssignSkillModal },

  setup() {
    const store = useStore();
    const skills = ref([]);
    const loading = ref(true);
    const showAssignModal = ref(false);
    const selectedSkill = ref(null);

    const loadSkills = async () => {
      try {
        loading.value = true;
        const response = await fetch('/api/skills');
        const data = await response.json();
        skills.value = data.skills || [];
      } catch (error) {
        console.error('Failed to load skills:', error);
        store.dispatch('showNotification', {
          message: 'Failed to load skills',
          type: 'error'
        });
      } finally {
        loading.value = false;
      }
    };

    const openAssignModal = (skill) => {
      selectedSkill.value = skill;
      showAssignModal.value = true;
    };

    const closeAssignModal = () => {
      showAssignModal.value = false;
      selectedSkill.value = null;
    };

    const handleSkillAssigned = () => {
      closeAssignModal();
      store.dispatch('showNotification', {
        message: 'Skill assigned successfully',
        type: 'success'
      });
    };

    onMounted(() => {
      loadSkills();
    });

    return {
      skills,
      loading,
      showAssignModal,
      selectedSkill,
      openAssignModal,
      closeAssignModal,
      handleSkillAssigned,
    };
  }
};
</script>

<style scoped>
.skills-browser {
  padding: 2rem;
}

.header {
  margin-bottom: 2rem;
}

.skills-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.skill-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1.5rem;
  transition: all 0.2s;
}

.skill-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.skill-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background: var(--primary-color);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  font-size: 24px;
  color: white;
}

.skill-name {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.skill-description {
  color: var(--text-secondary);
  margin-bottom: 1rem;
  line-height: 1.5;
}

.required-tools {
  margin-bottom: 1rem;
}

.tools-label {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.tool-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tool-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: var(--tag-bg);
  border-radius: 12px;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.assign-button {
  width: 100%;
  padding: 0.75rem;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}

.assign-button:hover {
  background: var(--primary-hover);
}

.empty-state, .loading-state {
  text-align: center;
  padding: 4rem;
  color: var(--text-secondary);
}
</style>
```

**Reference Pattern:** Plugins UI at `/Users/mac/tools/agnt/frontend/src/views/Terminal/.../Plugins.vue`

---

#### 5.2 Agent Configure Tab Updates

**File:** `frontend/src/views/Terminal/CenterPanel/screens/Agents/components/AgentDetails/tabs/ConfigureTab.vue`

**Add skills section after tools (after line 88):**

```vue
<!-- Assigned Skills -->
<div class="config-group">
  <h4 class="section-title">
    <i class="fas fa-graduation-cap"></i>
    Assigned Skills
  </h4>
  <ListWithSearch
    :items="availableSkills"
    v-model="agentConfig.skills"
    label-key="name"
    id-key="id"
    placeholder="Search and select skills..."
    description="Skills bundle expertise (instructions) with required tools"
  />
  <div v-if="skillToolsAdded.length > 0" class="skill-tools-notice">
    <i class="fas fa-info-circle"></i>
    Auto-added tools from skills:
    <span
      v-for="tool in skillToolsAdded"
      :key="tool"
      class="tool-badge"
    >
      {{ tool }}
    </span>
  </div>
</div>
```

**Update script section:**

```javascript
// Add to data/refs (line 238-239)
const agentConfig = ref({
  name: '',
  description: '',
  tools: [],
  workflows: [],
  skills: [],  // NEW
  provider: '',
  model: ''
});

const availableSkills = ref([]);
const skillToolsAdded = ref([]);

// Add to initializeAgentConfig() (line 238-250)
const initializeAgentConfig = (agent) => {
  agentConfig.value = {
    name: agent.name || '',
    description: agent.description || '',
    tools: agent.assignedTools ? [...agent.assignedTools] : [],
    workflows: agent.assignedWorkflows ? [...agent.assignedWorkflows] : [],
    skills: agent.assignedSkills ? [...agent.assignedSkills] : [],  // NEW
    provider: agent.provider || '',
    model: agent.model || ''
  };
};

// Add skill loading (in onMounted or setup)
const loadSkills = async () => {
  try {
    const response = await fetch('/api/skills');
    const data = await response.json();
    availableSkills.value = data.skills || [];
  } catch (error) {
    console.error('Failed to load skills:', error);
  }
};

// Calculate auto-added tools from skills (reactive computed)
const updateSkillTools = () => {
  const selectedSkills = availableSkills.value.filter(
    s => agentConfig.value.skills.includes(s.id)
  );
  const tools = selectedSkills.flatMap(s => s.requiredTools || []);
  skillToolsAdded.value = [...new Set(tools)]; // Dedupe
};

// Watch skills changes
watch(() => agentConfig.value.skills, updateSkillTools);

// Update saveConfiguration() (line 370)
const payload = {
  ...agentConfig.value,
  assignedTools: agentConfig.value.tools,
  assignedWorkflows: agentConfig.value.workflows,
  assignedSkills: agentConfig.value.skills,  // NEW
};
```

**Lines:** 82-88 (tools section), 238-250 (init), 355-396 (save)

---

### Phase 6: Server Initialization

**Initialize SkillRegistry at server startup:**

```javascript
// In backend/server.js (after imports, before routes)
import { SkillRegistry } from './src/services/skills/SkillRegistry.js';

// Initialize SkillRegistry
const skillRegistry = SkillRegistry.getInstance();
await skillRegistry.initialize();
```

**File:** `/Users/mac/tools/agnt/backend/server.js`
**Location:** After database initialization, before route registration

---

## Technical Considerations

### Architecture

**Filesystem vs. Database Trade-offs:**
- ✅ **Pro:** Git-friendly, version-controlled, easy to edit
- ✅ **Pro:** No database migrations for skill content changes
- ⚠️ **Con:** Slower reads (file I/O) - acceptable for MVP, cache later if needed

**Singleton Registry Pattern:**
- Skills loaded once at startup, cached in memory
- Reduces filesystem I/O per agent execution
- Hot-reload method available for development (`POST /api/skills/reload`)

### Performance

**System Prompt Size:**
- Each skill adds ~500-2000 tokens to system prompt
- Recommendation: Limit agents to 3-5 skills maximum
- Future optimization: Progressive loading (load only when agent uses skill)

**Tool Deduplication:**
- Use `Set` to prevent duplicate tools: `[...new Set([...old, ...new])]`
- Important when multiple skills require same tool (e.g., `web_search`)

**Caching Strategy:**
- MVP: Load all skills at startup, keep in memory
- Future: Lazy-load skills on-demand, cache parsed results

### Security

**File Path Security:**
- Skills directory is project-scoped (`.agnt/skills/`) - trusted location
- No user input in file paths (skill IDs from folder names only)
- YAML parsing via `js-yaml` (safe parser, no code execution)

**Prompt Injection:**
- Skills are from trusted `.agnt/skills/` directory (version-controlled)
- Not user-supplied at runtime (unlike chat messages)
- Safe to inject into system prompt without sanitization

### Backwards Compatibility

- Existing agents: `assignedSkills = NULL` or `"[]"` → no skills loaded
- No breaking changes to existing agent functionality
- Skills are purely additive (don't modify base behavior)

### Error Handling

**Graceful Degradation:**
- Malformed SKILL.md → log error, skip skill, continue loading others
- Missing skill (referenced in agent but not found) → filter out, don't crash
- Invalid YAML → log parse error, skip skill
- Missing required tools → add anyway, fail at runtime with clear error message

**Logging Strategy:**
- `console.log`: Successful skill loading
- `console.warn`: Skill parsing warnings (missing fields, deprecated format)
- `console.error`: Critical errors (filesystem access, registry init failures)

---

## Acceptance Criteria

### Functional Requirements

**Backend:**
- [ ] SkillLoader parses valid SKILL.md files (YAML frontmatter + markdown body)
- [ ] SkillRegistry scans `.agnt/skills/` and loads all valid skills at startup
- [ ] SkillRegistry provides `getSkill(id)` and `getAllSkills()` methods
- [ ] Database migration adds `assignedSkills` column to agents table
- [ ] AgentModel serializes/deserializes `assignedSkills` as JSON array
- [ ] AgentService injects skill instructions into agent system prompt
- [ ] AgentService auto-adds skill.requiredTools to agent.assignedTools
- [ ] API route `/api/skills` returns all available skills
- [ ] API route `/api/skills/:id` returns specific skill by ID

**Frontend:**
- [ ] Skills browser displays all available skills in card grid layout
- [ ] Skill cards show: name, description, required tools (badges)
- [ ] "Assign to Agent" button opens agent selector modal
- [ ] Agent Configure tab includes skills multi-select picker
- [ ] Assigned skills saved when updating agent configuration
- [ ] UI shows which tools were auto-added from skills

**Integration:**
- [ ] Assigning skill to agent automatically adds required tools
- [ ] Unassigning skill from agent does NOT remove tools (manual removal)
- [ ] Agent chat uses skill instructions in system prompt
- [ ] Multiple skills can be assigned to single agent (instructions concatenated)

### Non-Functional Requirements

**Performance:**
- [ ] Skills loaded at server startup (< 1 second for 50 skills)
- [ ] Agent context building with skills (< 100ms additional overhead)
- [ ] Skills registry cached in memory (no filesystem I/O per request)

**Reliability:**
- [ ] Malformed SKILL.md files don't crash server (graceful skip)
- [ ] Missing skills referenced in agents don't prevent agent loading
- [ ] Server starts successfully even if skills directory is empty

**Usability:**
- [ ] Clear error messages for invalid SKILL.md format
- [ ] UI shows validation errors for malformed skills
- [ ] Tool auto-add behavior is visible to users (UI notice)

### Quality Gates

- [ ] Unit tests: SkillLoader parses valid/invalid SKILL.md correctly
- [ ] Unit tests: SkillRegistry loads skills and handles errors gracefully
- [ ] Integration tests: AgentService includes skill instructions in prompt
- [ ] Integration tests: AgentService auto-adds tools from skills
- [ ] E2E test: Create skill → assign to agent → verify chat behavior
- [ ] Code review: Architecture follows existing patterns (PluginManager, AgentService)

---

## Success Metrics

### Usage Metrics (Post-Launch)
- **Skill Adoption:** % of agents with assigned skills (target: 30%+ within 1 month)
- **Skill Creation:** # of custom skills created by users (measure after 2 weeks)
- **Skill Reuse:** # of agents using the same skill (indicates value of reusability)

### Technical Metrics
- **Performance:** Agent context build time increase < 10% with skills
- **Reliability:** Zero server crashes from malformed skills (100% graceful handling)
- **Adoption:** Skills API called on 50%+ of agent loads

### User Feedback
- Survey: "Usefulness of Skills feature" (1-5 scale, target: 4+)
- Support tickets: Track skill-related questions (goal: < 5% of total tickets)

---

## Dependencies & Risks

### External Dependencies

**New NPM Packages:**
- `js-yaml` (v4.1.0+) - YAML parsing for SKILL.md frontmatter
  - Installation: `npm install js-yaml`
  - Risk: None - widely used, stable, MIT license

**Existing Dependencies:**
- `fs/promises` - Node.js built-in (filesystem operations)
- `path` - Node.js built-in (path resolution)

### Internal Dependencies

**Backend:**
- AgentModel (modify existing)
- AgentService (modify existing)
- Database schema (migration required)
- ToolRegistry (read-only, no changes)

**Frontend:**
- Agent Configure tab (modify existing)
- ListWithSearch component (reuse existing)
- Vuex store (existing notification system)

### Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **System prompt too large** (too many skills) | Agent performance degradation | Medium | Limit skills per agent (UI warning at 5+ skills); future: progressive loading |
| **Skill format evolves** (breaking changes) | Old skills fail to load | Low | Version field in YAML frontmatter; backward-compatible parser |
| **User confusion** (when to use skills vs. custom prompts) | Low adoption | Medium | Clear documentation + examples; UI tooltips |
| **Tool conflicts** (multiple skills require conflicting tools) | Runtime errors | Low | Tools don't conflict (additive only); deduplication handles overlap |
| **Hot-reload issues** (filesystem watch complexity) | Dev experience | Low | Manual reload via API for MVP; file watching is future enhancement |

**Contingency Plans:**
- If prompt size becomes issue: Implement progressive loading (load skills on-demand)
- If adoption low: Add skill templates (built-in examples users can copy)
- If tool conflicts arise: Add tool compatibility matrix (future enhancement)

---

## Implementation Plan

### Phase 1: Backend Core (2-3 hours)
**Files to create:**
- `backend/src/services/skills/SkillLoader.js`
- `backend/src/services/skills/SkillRegistry.js`

**Dependencies:**
- Install `js-yaml`: `npm install js-yaml`

**Testing:**
- Create test SKILL.md files in `.agnt/skills/test-skill/`
- Unit test: SkillLoader.parseSkillFile()
- Unit test: SkillRegistry.scanSkills()

### Phase 2: Database & Model (1 hour)
**Files to modify:**
- `backend/src/models/database/index.js` (add column)
- `backend/src/models/AgentModel.js` (serialize/deserialize)

**Testing:**
- Manual: Create agent with assignedSkills = ["test-skill"]
- Verify: Database stores JSON string, model parses array

### Phase 3: Service Integration (1-2 hours)
**Files to modify:**
- `backend/src/services/AgentService.js` (_getAgentContext method)

**Testing:**
- Integration test: Agent loads skills, prompt includes instructions
- Integration test: Agent auto-adds required tools

### Phase 4: API Routes (1 hour)
**Files to create:**
- `backend/src/routes/SkillRoutes.js`

**Files to modify:**
- `backend/server.js` (register routes, initialize registry)

**Testing:**
- Manual: `curl http://localhost:3333/api/skills`
- Verify: Returns all loaded skills

### Phase 5: Frontend UI (3-4 hours)
**Files to create:**
- `frontend/src/views/Terminal/.../Skills/SkillsBrowser.vue`
- `frontend/src/views/Terminal/.../Skills/components/AssignSkillModal.vue`

**Files to modify:**
- `frontend/src/views/Terminal/.../Agents/.../ConfigureTab.vue`

**Testing:**
- E2E: Navigate to Skills browser, see loaded skills
- E2E: Assign skill to agent, verify saved

### Phase 6: E2E Testing (1-2 hours)
**Files to create:**
- `tests/e2e/skills.spec.js`

**Test Scenarios:**
1. Load skills from filesystem
2. Assign skill to agent via UI
3. Chat with agent - verify skill instructions used
4. Create skill with required tools - verify auto-added

### Phase 7: Documentation (1 hour)
**Files to create/update:**
- `docs/features/SKILLS.md` - User guide
- `docs/api/SKILLS_API.md` - API reference
- `README.md` - Add Skills feature mention

---

## MVP Scope Summary

### ✅ Included in MVP
- Filesystem-based skills (SKILL.md in `.agnt/skills/`)
- YAML frontmatter + markdown instructions
- SkillRegistry singleton (load at startup)
- Manual skill assignment via UI
- Auto-add required tools
- Skills browser (read-only)
- Agent configure tab (assign skills)
- Database schema migration
- Basic error handling (skip malformed skills)

### ❌ Not in MVP (Future Enhancements)
- Built-in skills shipped with AGNT
- User-level skills (`~/.agnt/skills/`)
- Plugin-provided skills
- Auto-detection of relevant skills
- Progressive loading (on-demand)
- Hot-reload on file changes
- Skill creation UI (manual file editing only)
- Skill analytics/usage tracking
- Skill versioning
- Skill dependencies (skill requires other skill)

---

## References & Research

### Internal Code References

**Backend Architecture:**
- PluginManager (registry pattern): `/Users/mac/tools/agnt/backend/src/plugins/PluginManager.js:56-431`
- ProviderRegistry (singleton): `/Users/mac/tools/agnt/backend/src/services/ai/ProviderRegistry.js:1-20`
- AgentModel (JSON serialization): `/Users/mac/tools/agnt/backend/src/models/AgentModel.js:5-118`
- AgentService (context building): `/Users/mac/tools/agnt/backend/src/services/AgentService.js:191-281`
- ToolRegistry (tool management): `/Users/mac/tools/agnt/backend/src/tools/ToolRegistry.js:10-295`
- Database schema: `/Users/mac/tools/agnt/backend/src/models/database/index.js:148-166`

**Frontend Patterns:**
- ConfigureTab (tool assignment): `/Users/mac/tools/agnt/frontend/src/views/Terminal/.../ConfigureTab.vue:82-88`
- Agent details: `/Users/mac/tools/agnt/frontend/src/views/Terminal/.../AgentDetails/`

**Testing:**
- E2E test structure: `/Users/mac/tools/agnt/tests/e2e/agents.spec.js:9-47`
- Test fixtures: `/Users/mac/tools/agnt/tests/e2e/fixtures/auth.js:34-49`

### Design Documents

- **Brainstorm:** `/Users/mac/tools/agnt/docs/brainstorms/2026-01-27-skills-system-brainstorm.md`
  - Architecture decisions (filesystem vs. database)
  - Tool auto-add logic
  - SKILL.md format specification
  - Open questions and recommendations

- **Feature Plan:** `/Users/mac/tools/agnt/docs/SKILLS_FEATURE_PLAN.md`
  - Original feature description
  - Database schema proposal
  - Manual verification steps

### External References

**Claude Code Skills Documentation:**
- [Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Creating custom Skills](https://support.claude.com/en/articles/12512198)
- SKILL.md format with YAML frontmatter
- Progressive disclosure pattern (metadata → instructions → references)

**YAML Parsing:**
- `js-yaml` library: https://github.com/nodeca/js-yaml
- Frontmatter parsing pattern (Jekyll/Hugo static site generators)

---

## File Checklist

### New Files (7)
- [ ] `backend/src/services/skills/SkillLoader.js`
- [ ] `backend/src/services/skills/SkillRegistry.js`
- [ ] `backend/src/routes/SkillRoutes.js`
- [ ] `frontend/src/views/Terminal/.../Skills/SkillsBrowser.vue`
- [ ] `frontend/src/views/Terminal/.../Skills/components/AssignSkillModal.vue`
- [ ] `tests/e2e/skills.spec.js`
- [ ] `docs/features/SKILLS.md`

### Modified Files (5)
- [ ] `backend/src/models/database/index.js` (add assignedSkills column)
- [ ] `backend/src/models/AgentModel.js` (serialize/deserialize skills)
- [ ] `backend/src/services/AgentService.js` (inject skills in _getAgentContext)
- [ ] `backend/server.js` (register routes, initialize registry)
- [ ] `frontend/src/views/.../ConfigureTab.vue` (skills picker)

### Configuration Files (1)
- [ ] `package.json` (add js-yaml dependency)

---

## Example Skill Files

### Example 1: Joke Master (No Tools)

**File:** `.agnt/skills/joke-master/SKILL.md`

```markdown
---
name: "Joke Master"
description: "Always end responses with a relevant joke or pun."
requiredTools: []
---

# Joke Master Instructions

You are a witty assistant who loves to lighten the mood. After providing helpful information, always conclude your response with a relevant joke, pun, or humorous observation related to the topic.

**Guidelines:**
- Keep jokes appropriate and lighthearted
- Make jokes relevant to the conversation topic
- Use wordplay and puns when possible
- If you can't think of a topic-related joke, use a general tech/AI joke

**Example:**
User: "How do I optimize my database queries?"
Assistant: [Helpful answer about indexing, query optimization, etc.]

And remember: Why did the database administrator leave his wife? She had one-to-many relationships! 😄
```

### Example 2: Deep Research (With Tools)

**File:** `.agnt/skills/deep-research/SKILL.md`

```markdown
---
name: "Deep Research"
description: "Conduct thorough multi-source research with fact verification and citation."
requiredTools: ["web_search", "web_scrape"]
---

# Deep Research Methodology

When conducting research, follow this systematic approach:

## Research Process

1. **Initial Search** (Minimum 3 sources)
   - Use web_search to find reputable sources
   - Prioritize: academic papers, official documentation, established news outlets
   - Avoid: single-source claims, opinion blogs without citations

2. **Cross-Verification**
   - Compare information across all sources
   - Flag discrepancies and note conflicting claims
   - Weight sources by credibility (primary > secondary > tertiary)

3. **Citation Format**
   - Always cite sources: [Source Name](URL)
   - Include publication date if available: [Source, 2026](URL)
   - Use inline citations after each major claim

4. **Summary Structure**
   - **Key Findings:** Bullet points of verified facts
   - **Consensus vs. Debate:** Note areas of agreement and disagreement
   - **Confidence Level:** Indicate certainty (High/Medium/Low)
   - **Sources:** Numbered list of all references

## Output Example

**Key Findings:**
- Fact 1 verified across 3 sources [1][2][3]
- Fact 2 confirmed by official documentation [4]

**Confidence Level:** High (consistent across reputable sources)

**Sources:**
1. [Official Docs](https://example.com/docs)
2. [Research Paper, 2025](https://scholar.example.com/paper)
3. [Industry Report](https://report.example.com)
```

---

## Notes

- **Database Migration:** Safe to run multiple times (checks for duplicate column)
- **Skill ID:** Derived from folder name (e.g., `.agnt/skills/deep-research/` → ID = "deep-research")
- **Tool Conflicts:** None expected (tools are additive, not exclusive)
- **Rollback Plan:** Remove assignedSkills column if needed (no data loss - skills stored in files)
