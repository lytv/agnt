<template>
  <div class="tunnel-settings">
    <div class="tunnel-header">
      <h3>
        Instant Webhooks
        <span class="beta-badge">BETA</span>
      </h3>
      <p class="subtitle">
        Receive webhooks instantly (&lt;500ms) instead of polling every 10 seconds
      </p>
    </div>

    <!-- Not Installed State -->
    <div v-if="!tunnelState.installed" class="tunnel-card install-card">
      <div class="install-content">
        <i class="fas fa-download"></i>
        <h4>Cloudflare Tunnel Required</h4>
        <p>Install cloudflared to enable instant webhooks</p>
        <div class="install-command">
          <code>{{ tunnelState.installCommand }}</code>
          <button class="copy-btn" @click="copyInstallCommand">
            <i :class="copiedInstall ? 'fas fa-check' : 'fas fa-copy'"></i>
          </button>
        </div>
        <p class="install-hint">After installing, restart AGNT to enable this feature</p>
      </div>
    </div>

    <!-- Installed State -->
    <div v-else class="tunnel-card">
      <div class="tunnel-toggle-row">
        <div class="toggle-info">
          <span class="toggle-label">Enable Instant Webhooks</span>
          <span class="toggle-description">
            {{ tunnelState.isNamedTunnel
              ? 'Using Named Tunnel (persistent URL across restarts)'
              : 'Using Quick Tunnel (temporary URL, changes on restart)' }}
          </span>
        </div>
        <label class="toggle-switch">
          <input
            type="checkbox"
            :checked="tunnelState.enabled"
            :disabled="isLoading"
            @change="toggleTunnel"
          />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <!-- Status Display -->
      <div class="tunnel-status">
        <div class="status-row">
          <span class="status-label">Status:</span>
          <span class="status-badge" :class="statusClass">
            <i class="fas fa-circle"></i>
            {{ statusText }}
          </span>
          <span v-if="isLoading" class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i>
          </span>
        </div>

        <!-- Tunnel URL -->
        <div v-if="tunnelState.url" class="url-row">
          <span class="url-label">Tunnel URL:</span>
          <div class="url-display">
            <code class="url-text">{{ tunnelState.url }}</code>
            <button class="copy-btn" @click="copyTunnelUrl">
              <i :class="copiedUrl ? 'fas fa-check' : 'fas fa-copy'"></i>
              <span v-if="copiedUrl" class="copied-text">Copied!</span>
            </button>
          </div>
        </div>

        <!-- Error Display -->
        <div v-if="tunnelState.error" class="error-row">
          <i class="fas fa-exclamation-triangle"></i>
          <span>{{ tunnelState.error }}</span>
          <button class="retry-btn" @click="startTunnel">
            <i class="fas fa-redo"></i> Retry
          </button>
        </div>
      </div>

      <!-- Info Box -->
      <div v-if="tunnelState.isNamedTunnel" class="info-box info-box-success">
        <i class="fas fa-check-circle"></i>
        <div class="info-content">
          <p><strong>Named Tunnel Active ✓</strong></p>
          <ul>
            <li><strong>Persistent URL</strong> - never changes across restarts</li>
            <li>Instant webhook delivery (&lt;500ms)</li>
            <li>Your workflows will always use the same webhook URL</li>
            <li>Configured via <code>~/.cloudflared/config.yml</code></li>
          </ul>
        </div>
      </div>
      <div v-else class="info-box">
        <i class="fas fa-info-circle"></i>
        <div class="info-content">
          <p><strong>Quick Tunnel Mode:</strong></p>
          <ul>
            <li>Instant webhook delivery (&lt;500ms)</li>
            <li>No account or API key required</li>
            <li><strong>URL changes</strong> each time tunnel restarts</li>
            <li><em>Tip:</em> Set up Named Tunnel for persistent URLs</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';

export default {
  name: 'TunnelSettings',
  setup() {
    const tunnelState = reactive({
      status: 'disconnected',
      url: null,
      enabled: false,
      installed: true,
      installCommand: 'brew install cloudflared',
      error: null,
      isNamedTunnel: false,
      persistentUrl: null,
    });

    const isLoading = ref(false);
    const copiedUrl = ref(false);
    const copiedInstall = ref(false);

    const statusClass = computed(() => {
      switch (tunnelState.status) {
        case 'connected':
          return 'status-connected';
        case 'starting':
          return 'status-starting';
        case 'error':
          return 'status-error';
        default:
          return 'status-disconnected';
      }
    });

    const statusText = computed(() => {
      switch (tunnelState.status) {
        case 'connected':
          return 'Connected';
        case 'starting':
          return 'Connecting...';
        case 'error':
          return 'Error';
        default:
          return 'Disconnected';
      }
    });

    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/tunnel/status');
        const data = await response.json();
        Object.assign(tunnelState, data);
      } catch (error) {
        console.error('Failed to fetch tunnel status:', error);
      }
    };

    const startTunnel = async () => {
      isLoading.value = true;
      try {
        const response = await fetch('/api/tunnel/start', { method: 'POST' });
        const data = await response.json();
        Object.assign(tunnelState, data);
      } catch (error) {
        console.error('Failed to start tunnel:', error);
        tunnelState.error = 'Failed to start tunnel';
      } finally {
        isLoading.value = false;
      }
    };

    const stopTunnel = async () => {
      isLoading.value = true;
      try {
        const response = await fetch('/api/tunnel/stop', { method: 'POST' });
        const data = await response.json();
        Object.assign(tunnelState, data);
      } catch (error) {
        console.error('Failed to stop tunnel:', error);
      } finally {
        isLoading.value = false;
      }
    };

    const toggleTunnel = async (event) => {
      if (event.target.checked) {
        await startTunnel();
      } else {
        await stopTunnel();
      }
    };

    const copyTunnelUrl = async () => {
      if (!tunnelState.url) return;
      try {
        await navigator.clipboard.writeText(tunnelState.url);
        copiedUrl.value = true;
        setTimeout(() => {
          copiedUrl.value = false;
        }, 2000);
      } catch (error) {
        console.error('Failed to copy:', error);
      }
    };

    const copyInstallCommand = async () => {
      try {
        await navigator.clipboard.writeText(tunnelState.installCommand);
        copiedInstall.value = true;
        setTimeout(() => {
          copiedInstall.value = false;
        }, 2000);
      } catch (error) {
        console.error('Failed to copy:', error);
      }
    };

    // WebSocket listener for real-time updates
    let socketHandler = null;

    onMounted(() => {
      fetchStatus();

      // Listen for tunnel status updates via Socket.IO
      if (window.socket) {
        socketHandler = (data) => {
          Object.assign(tunnelState, data);
          isLoading.value = false;
        };
        window.socket.on('tunnel:status', socketHandler);
      }
    });

    onUnmounted(() => {
      if (window.socket && socketHandler) {
        window.socket.off('tunnel:status', socketHandler);
      }
    });

    return {
      tunnelState,
      isLoading,
      copiedUrl,
      copiedInstall,
      statusClass,
      statusText,
      toggleTunnel,
      startTunnel,
      copyTunnelUrl,
      copyInstallCommand,
    };
  },
};
</script>

<style scoped>
.tunnel-settings {
  width: 100%;
}

.tunnel-header {
  margin-bottom: 24px;
}

.tunnel-header h3 {
  margin: 0 0 8px 0;
  font-size: 1.5em;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 12px;
}

.beta-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.5em;
  color: var(--color-green);
  background: rgba(25, 239, 131, 0.15);
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid rgba(25, 239, 131, 0.4);
  font-weight: 600;
}

.subtitle {
  margin: 0;
  color: var(--color-light-med-navy);
  font-size: 0.9em;
}

.tunnel-card {
  background: var(--color-dull-white);
  border: 1px solid var(--color-light-navy);
  border-radius: 12px;
  padding: 24px;
}

body.dark .tunnel-card {
  background: rgba(0, 0, 0, 10%);
  border: 1px solid var(--terminal-border-color);
}

.install-card {
  text-align: center;
  padding: 48px 24px;
}

.install-content i {
  font-size: 3em;
  color: var(--color-green);
  margin-bottom: 16px;
}

.install-content h4 {
  margin: 0 0 8px 0;
  font-size: 1.3em;
  color: var(--color-text);
}

.install-content > p {
  margin: 0 0 24px 0;
  color: var(--color-light-med-navy);
}

.install-command {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--color-darker-1);
  border: 1px solid var(--terminal-border-color);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.install-command code {
  font-family: 'Courier New', monospace;
  font-size: 1em;
  color: var(--color-green);
}

.install-hint {
  font-size: 0.85em;
  opacity: 0.7;
  margin: 0 !important;
}

.tunnel-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--terminal-border-color);
  margin-bottom: 20px;
}

.toggle-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toggle-label {
  font-size: 1.1em;
  font-weight: 600;
  color: var(--color-text);
}

.toggle-description {
  font-size: 0.85em;
  color: var(--color-light-med-navy);
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 52px;
  height: 28px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--color-grey);
  transition: 0.3s;
  border-radius: 28px;
}

.toggle-slider:before {
  position: absolute;
  content: '';
  height: 22px;
  width: 22px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--color-green);
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(24px);
}

.toggle-switch input:disabled + .toggle-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

.tunnel-status {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 20px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-label,
.url-label {
  color: var(--color-light-med-navy);
  font-weight: 600;
  min-width: 100px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 0.9em;
}

.status-badge i {
  font-size: 0.6em;
}

.status-connected {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.status-starting {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}

.status-error {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.status-disconnected {
  background: rgba(127, 129, 147, 0.2);
  color: var(--color-grey);
}

.loading-spinner {
  color: var(--color-green);
}

.url-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.url-display {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.url-text {
  flex: 1;
  background: var(--color-darker-1);
  border: 1px solid var(--terminal-border-color);
  padding: 8px 12px;
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: 0.85em;
  color: var(--color-green);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-btn {
  background: none;
  border: 1px solid var(--terminal-border-color);
  color: var(--color-text);
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.copy-btn:hover {
  background: var(--color-green);
  border-color: var(--color-green);
  color: var(--color-dark-navy);
}

.copied-text {
  font-size: 0.85em;
  font-weight: 600;
}

.error-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #ef4444;
}

.error-row i {
  font-size: 1.2em;
}

.retry-btn {
  margin-left: auto;
  background: none;
  border: 1px solid #ef4444;
  color: #ef4444;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85em;
  transition: all 0.2s ease;
}

.retry-btn:hover {
  background: #ef4444;
  color: white;
}

.info-box {
  display: flex;
  gap: 16px;
  padding: 16px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 8px;
}

.info-box-success {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.info-box > i {
  color: #3b82f6;
  font-size: 1.2em;
  margin-top: 2px;
}

.info-box-success > i {
  color: #22c55e;
}

.info-content {
  flex: 1;
}

.info-content p {
  margin: 0 0 8px 0;
  color: var(--color-text);
  font-size: 0.9em;
}

.info-content ul {
  margin: 0;
  padding-left: 20px;
  color: var(--color-light-med-navy);
  font-size: 0.85em;
  line-height: 1.6;
}
</style>
