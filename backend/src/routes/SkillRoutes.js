// SkillRoutes.js - API endpoints for skills management
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
