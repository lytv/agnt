// SkillLoader.js - Parse SKILL.md files and extract structured data
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
