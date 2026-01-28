import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import treeKill from 'tree-kill';
import { broadcast } from '../utils/realtimeSync.js';

/**
 * TunnelService - Manages Cloudflare Quick Tunnel for instant local webhooks
 *
 * Uses cloudflared to create an ad-hoc tunnel that exposes localhost:3333
 * to the internet with zero configuration required.
 */
class TunnelService extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.cachedUrl = null;
    this.status = 'disconnected'; // 'disconnected', 'starting', 'connected', 'error'
    this.retryCount = 0;
    this.maxRetries = 3;
    this.enabled = false; // User preference - should tunnel auto-start
    this.error = null;
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
    console.log('[Tunnel] Starting cloudflared...');

    const port = process.env.PORT || 3333;

    this.process = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // cloudflared outputs the URL to stderr
    this.process.stderr.on('data', (data) => {
      const text = data.toString();
      // Match the trycloudflare.com URL
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !this.cachedUrl) {
        this.cachedUrl = match[0];
        this.status = 'connected';
        this.retryCount = 0;
        this.error = null;
        this._broadcast();
        console.log('[Tunnel] Connected:', this.cachedUrl);
      }
    });

    this.process.stdout.on('data', (data) => {
      // Some versions may output to stdout
      const text = data.toString();
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !this.cachedUrl) {
        this.cachedUrl = match[0];
        this.status = 'connected';
        this.retryCount = 0;
        this.error = null;
        this._broadcast();
        console.log('[Tunnel] Connected:', this.cachedUrl);
      }
    });

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
    this.cachedUrl = null;
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
  }

  /**
   * Disable tunnel
   */
  disable() {
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
