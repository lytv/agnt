import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';

/**
 * CloudflaredConfig - Utility for reading and parsing cloudflared config
 * Detects Named Tunnels and extracts persistent URLs
 */
class CloudflaredConfig {
  constructor() {
    this.configPath = path.join(os.homedir(), '.cloudflared', 'config.yml');
  }

  /**
   * Check if Named Tunnel config exists
   * @returns {boolean}
   */
  exists() {
    try {
      return fs.existsSync(this.configPath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Read and parse cloudflared config.yml
   * @returns {object|null} Parsed config or null if not found/invalid
   */
  read() {
    try {
      if (!this.exists()) {
        return null;
      }

      const content = fs.readFileSync(this.configPath, 'utf8');
      const config = yaml.load(content);

      return config;
    } catch (error) {
      console.error('[CloudflaredConfig] Error reading config:', error.message);
      return null;
    }
  }

  /**
   * Extract hostname from config (Named Tunnel URL)
   * @returns {string|null} Persistent hostname or null if not found
   */
  getHostname() {
    try {
      const config = this.read();
      if (!config) return null;

      // Look for hostname in ingress rules
      if (config.ingress && Array.isArray(config.ingress)) {
        for (const rule of config.ingress) {
          if (rule.hostname && rule.hostname !== 'http_status:404') {
            return rule.hostname;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('[CloudflaredConfig] Error extracting hostname:', error.message);
      return null;
    }
  }

  /**
   * Get tunnel ID from config
   * @returns {string|null}
   */
  getTunnelId() {
    try {
      const config = this.read();
      return config?.tunnel || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get credentials file path from config
   * @returns {string|null}
   */
  getCredentialsFile() {
    try {
      const config = this.read();
      return config?.['credentials-file'] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if Named Tunnel is configured (has tunnel ID and hostname)
   * @returns {boolean}
   */
  isNamedTunnelConfigured() {
    const hostname = this.getHostname();
    const tunnelId = this.getTunnelId();
    return !!(hostname && tunnelId);
  }

  /**
   * Get full webhook URL for Named Tunnel
   * @param {string} workflowId
   * @returns {string|null}
   */
  getWebhookUrl(workflowId) {
    const hostname = this.getHostname();
    if (!hostname) return null;

    return `https://${hostname}/api/webhooks/trigger/${workflowId}`;
  }

  /**
   * Get tunnel info summary
   * @returns {object}
   */
  getInfo() {
    return {
      configured: this.isNamedTunnelConfigured(),
      hostname: this.getHostname(),
      tunnelId: this.getTunnelId(),
      credentialsFile: this.getCredentialsFile(),
      configPath: this.configPath,
    };
  }
}

export default new CloudflaredConfig();
