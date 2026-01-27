# Skills Feature Implementation Plan

## Goal Description
Implement a "Skills" feature for the AGNT backend. A Skill is a high-level capability package that combines specific **Tools** with specialized **Instructions** (prompts). This allows users to easily assign complex capabilities (e.g., "Deep Research", "Code Analysis") to agents without manual prompt engineering.

## User Review Required
> [!IMPORTANT]
> **Database Schema Change**: This plan requires adding a new `assignedSkills` field (JSON/Text) to the `agents` table. Existing agents will have this field as empty/null.

## Proposed Changes

### Backend: Skill Architecture

#### [NEW] [SkillRegistry.js](file:///Users/mac/tools/agnt/backend/src/services/skills/SkillRegistry.js)
-   **Purpose**: Central registry to load, validate, and serve skill definitions.
-   **Functionality**:
    -   Load built-in skills from `backend/src/services/skills/definitions`.
    -   (Future) Load skills from plugins.
    -   Provide `getSkill(id)` and `getAllSkills()` methods.

#### [NEW] [Skill Definitions](file:///Users/mac/tools/agnt/backend/src/services/skills/definitions/)
-   Create a directory for storing built-in skill definitions (JSON/JS files).
-   **Example Structure (`research-pro.js`)**:
    ```javascript
    export default {
      id: 'research-pro',
      name: 'Research Pro',
      description: 'Advanced research capability with multi-source verification.',
      requiredTools: ['web_search', 'web_scrape'],
      systemPrompt: '...'
    }
    ```

### Backend: Agent Enhancements

#### [MODIFY] [AgentModel.js](file:///Users/mac/tools/agnt/backend/src/models/AgentModel.js)
-   Update `createOrUpdate`: Handle `assignedSkills` input and save to DB.
-   Update `findOne`: Parse `assignedSkills` from DB JSON string.

#### [MODIFY] [AgentService.js](file:///Users/mac/tools/agnt/backend/src/services/AgentService.js)
-   Update `_getAgentContext`:
    1.  Fetch assigned skills from `SkillRegistry`.
    2.  **Prompt Injection**: Append skill `systemPrompt` to the agent's base system prompt.
    3.  **Tool Injection**: Automatically add `requiredTools` from skills to the agent's available toolset (deduplicating if necessary).

## Verification Plan

### Manual Verification
1.  **Create Custom Skill**: Add a dummy skill "Joke Master" that requires no tools but has a prompt to "always end responses with a joke".
2.  **Assign Skill**: Update an existing agent to include "Joke Master".
3.  **Chat Test**: Chat with the agent and verify it follows the "Joke Master" instruction.
4.  **Tool Verification**: Assign a skill with tools (e.g., `web_search`) to an agent that didn't have it. Verify the agent can now use `web_search`.

### Automated Tests
-   Unit test for `SkillRegistry` loading.
-   Integration test for `AgentService` prompt construction (checking if skill prompt is present).
