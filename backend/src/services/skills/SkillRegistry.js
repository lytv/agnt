// SkillRegistry.js - Central registry to load, cache, and serve skill definitions
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
