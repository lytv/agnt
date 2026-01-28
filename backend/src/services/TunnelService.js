import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import treeKill from 'tree-kill';
import { broadcast } from '../utils/realtimeSync.js';
import db from '../models/database/index.js';
import CloudflaredConfig from '../utils/cloudflaredConfig.js';

// Safe migration - add tunnel_auto_start column if not exists
db.all(`PRAGMA table_info(users)`, (err, columns) => {
  if (err) {
    console.error('[Tunnel] Error checking users table schema:', err);
    return;
  }
  const hasColumn = columns?.some(col => col.name === 'tunnel_auto_start');
  if (!hasColumn) {
    db.run(`ALTER TABLE users ADD COLUMN tunnel_auto_start INTEGER DEFAULT 0`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('[Tunnel] Error adding tunnel_auto_start column:', err);
      } else {
        console.log('[Tunnel] Added tunnel_auto_start column to users table');
      }
    });
  }
});

/**
 * TunnelService - Manages Cloudflare Tunnel for instant local webhooks
 *
 * Supports two modes:
 * 1. Named Tunnel (persistent URL) - Reads from ~/.cloudflared/config.yml
 * 2. Quick Tunnel (temporary URL) - Falls back if no Named Tunnel configured
 */
class TunnelService extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.cachedUrl = null;
    this.persistentUrl = null; // Named Tunnel URL (never changes)
    this.isNamedTunnel = false; // true if using Named Tunnel
    this.status = 'disconnected'; // 'disconnected', 'starting', 'connected', 'error'
    this.retryCount = 0;
    this.maxRetries = 3;
    this.enabled = false; // User preference - should tunnel auto-start
    this.error = null;

    // Check for Named Tunnel config on startup
    this._detectNamedTunnel();
  }

  /**
   * Detect if user has Named Tunnel configured
   * If yes, set persistent URL immediately
   */
  _detectNamedTunnel() {
    if (CloudflaredConfig.isNamedTunnelConfigured()) {
      const hostname = CloudflaredConfig.getHostname();
      this.persistentUrl = `https://${hostname}`;
      this.isNamedTunnel = true;
      console.log('[Tunnel] Named Tunnel detected');
      console.log(`[Tunnel] Persistent URL: ${this.persistentUrl}`);
    } else {
      console.log('[Tunnel] No Named Tunnel configured - will use Quick Tunnel');
    }
  }

  /**
   * Initialize tunnel service - auto-start if previously enabled
   * Called during server startup
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      const row = await new Promise((resolve, reject) => {
        db.get(`SELECT tunnel_auto_start FROM users LIMIT 1`, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (row?.tunnel_auto_start === 1) {
        console.log('[Tunnel] Auto-starting (saved preference)...');
        await this.enable();
      }
    } catch (error) {
      console.error('[Tunnel] Auto-start failed:', error.message);
      // Don't clear preference - user can fix and restart
    }
  }

  /**
   * Check if cloudflared binary is available
   * @returns {Promise<boolean>}
   */
  async isInstalled() {
    return new Promise((resolve) => {
      const check = spawn('which', ['cloudflared']);
      check.on('close', (code) => {
        resolve(code === 0);
      });
      check.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Get install command for the current platform
   * @returns {string}
   */
  getInstallCommand() {
    const platform = process.platform;
    if (platform === 'darwin') {
      return 'brew install cloudflared';
    } else if (platform === 'linux') {
      return 'curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared';
    } else if (platform === 'win32') {
      return 'winget install Cloudflare.cloudflared';
    }
    return 'brew install cloudflared';
  }

  /**
   * Start the tunnel
   * @returns {Promise<void>}
   */
  async start() {
    if (this.process) {
      console.log('[Tunnel] Already running');
      return;
    }

    const installed = await this.isInstalled();
    if (!installed) {
      this.status = 'error';
      this.error = 'cloudflared not installed';
      this._broadcast();
      console.log('[Tunnel] cloudflared not installed');
      return;
    }

    this.status = 'starting';
    this.error = null;
    this._broadcast();

    const port = process.env.PORT || 3333;

    // Use Named Tunnel if configured, otherwise Quick Tunnel
    if (this.isNamedTunnel) {
      console.log('[Tunnel] Starting Named Tunnel (persistent URL)...');
      const tunnelId = CloudflaredConfig.getTunnelId();
      this.process = spawn('cloudflared', ['tunnel', 'run', tunnelId], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // For Named Tunnel, URL is known immediately
      this.cachedUrl = this.persistentUrl;
      this.status = 'connected';
      this.retryCount = 0;
      this.error = null;
      this._broadcast();
      console.log('[Tunnel] Named Tunnel connected:', this.cachedUrl);
    } else {
      console.log('[Tunnel] Starting Quick Tunnel (temporary URL)...');
      this.process = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
    }

    // For Quick Tunnel, parse URL from stderr
    if (!this.isNamedTunnel) {
      this.process.stderr.on('data', (data) => {
        const text = data.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !this.cachedUrl) {
          this.cachedUrl = match[0];
          this.status = 'connected';
          this.retryCount = 0;
          this.error = null;
          this._broadcast();
          console.log('[Tunnel] Quick Tunnel connected:', this.cachedUrl);
        }
      });

      this.process.stdout.on('data', (data) => {
        const text = data.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !this.cachedUrl) {
          this.cachedUrl = match[0];
          this.status = 'connected';
          this.retryCount = 0;
          this.error = null;
          this._broadcast();
          console.log('[Tunnel] Quick Tunnel connected:', this.cachedUrl);
        }
      });
    }

    this.process.on('error', (err) => {
      console.error('[Tunnel] Process error:', err.message);
      this.error = err.message;
      this._cleanup();
      this._handleRetry();
    });

    this.process.on('close', (code) => {
      console.log(`[Tunnel] Process exited with code ${code}`);
      this._cleanup();

      if (code !== 0 && this.enabled) {
        this._handleRetry();
      }
    });
  }

  /**
   * Handle retry logic with exponential backoff
   */
  _handleRetry() {
    if (this.retryCount < this.maxRetries && this.enabled) {
      this.retryCount++;
      const delay = 1000 * Math.pow(2, this.retryCount - 1); // Exponential backoff
      console.log(`[Tunnel] Retry ${this.retryCount}/${this.maxRetries} in ${delay}ms...`);
      this.status = 'starting';
      this._broadcast();
      setTimeout(() => this.start(), delay);
    } else if (this.retryCount >= this.maxRetries) {
      this.status = 'error';
      this.error = 'Max retries exceeded';
      this._broadcast();
      console.error('[Tunnel] Max retries exceeded, giving up');
    }
  }

  /**
   * Stop the tunnel
   */
  stop() {
    this.enabled = false;
    if (this.process && this.process.pid) {
      console.log('[Tunnel] Stopping...');
      treeKill(this.process.pid, 'SIGTERM', (err) => {
        if (err) {
          console.error('[Tunnel] Error killing process:', err);
          // Force kill if SIGTERM fails
          treeKill(this.process.pid, 'SIGKILL');
        }
      });
    }
    this._cleanup();
    this._broadcast();
  }

  /**
   * Clean up internal state
   */
  _cleanup() {
    this.process = null;
    // Keep persistentUrl for Named Tunnel (it never changes)
    if (!this.isNamedTunnel) {
      this.cachedUrl = null;
    }
    if (this.status !== 'error') {
      this.status = 'disconnected';
    }
  }

  /**
   * Broadcast status update via WebSocket
   */
  _broadcast() {
    const state = this.getState();
    broadcast('tunnel:status', state);
    this.emit('change', state);

    // Emit statusChange event for WebhookReceiver to handle fallback
    if (this.status === 'connected' || this.status === 'disconnected') {
      this.emit('statusChange', { status: this.status, url: this.cachedUrl });
    }
  }

  /**
   * Get current tunnel URL (synchronous for WebhookReceiver)
   * @returns {string|null}
   */
  getUrl() {
    return this.cachedUrl;
  }

  /**
   * Get webhook URL for a workflow
   * @param {string} workflowId
   * @returns {string}
   */
  getWebhookUrl(workflowId) {
    if (this.cachedUrl) {
      return `${this.cachedUrl}/api/webhooks/trigger/${workflowId}`;
    }
    // Fallback to remote URL
    return `${process.env.REMOTE_URL}/webhook/${workflowId}`;
  }

  /**
   * Get current state for API/UI
   * @returns {object}
   */
  getState() {
    return {
      status: this.status,
      url: this.cachedUrl,
      enabled: this.enabled,
      installed: null, // Will be populated async
      installCommand: this.getInstallCommand(),
      error: this.error,
      isNamedTunnel: this.isNamedTunnel,
      persistentUrl: this.persistentUrl,
    };
  }

  /**
   * Get state with installation check (async)
   * @returns {Promise<object>}
   */
  async getStateAsync() {
    const state = this.getState();
    state.installed = await this.isInstalled();
    return state;
  }

  /**
   * Enable tunnel (will auto-start on boot)
   */
  async enable() {
    this.enabled = true;
    this.retryCount = 0;
    await this.start();
    // Persist after successful start
    db.run(`UPDATE users SET tunnel_auto_start = 1`, (err) => {
      if (err) console.error('[Tunnel] Error persisting enabled state:', err);
    });
  }

  /**
   * Disable tunnel
   */
  async disable() {
    this.enabled = false;
    await new Promise((resolve) => {
      db.run(`UPDATE users SET tunnel_auto_start = 0`, (err) => {
        if (err) console.error('[Tunnel] Error persisting disabled state:', err);
        resolve();
      });
    });
    this.stop();
  }

  /**
   * Shutdown - called on process exit
   */
  shutdown() {
    console.log('[Tunnel] Shutting down...');
    this.stop();
  }
}

// Export singleton instance
export default new TunnelService();
