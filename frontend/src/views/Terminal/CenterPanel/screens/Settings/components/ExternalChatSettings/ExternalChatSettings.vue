<template>
  <div class="external-chat-settings">
    <div class="external-chat-header">
      <h3>
        External Chat Integration
        <span class="beta-badge">BETA</span>
      </h3>
      <p class="subtitle">
        Chat with your AGNT agents via Telegram or Discord
      </p>
    </div>

    <!-- Not Configured State -->
    <div v-if="!serviceStatus.configured" class="external-chat-card install-card">
      <div class="install-content">
        <i class="fab fa-telegram-plane"></i>
        <h4>Telegram Bot Setup Required</h4>
        <p>Add your Telegram bot token to enable external chat</p>
        <div class="install-steps">
          <ol>
            <li>Message <code>@BotFather</code> on Telegram</li>
            <li>Use <code>/newbot</code> to create your bot</li>
            <li>Copy the bot token</li>
            <li>Add to your <code>.env</code> file:
              <div class="install-command">
                <code>TELEGRAM_BOT_TOKEN=your_token_here</code>
              </div>
            </li>
            <li>Restart AGNT</li>
          </ol>
        </div>
        <p class="install-hint">Need help? Check the <a href="https://core.telegram.org/bots/tutorial" target="_blank">Telegram Bot Tutorial</a></p>
      </div>
    </div>

    <!-- Configured State -->
    <div v-else class="external-chat-card">
      <!-- Service Status -->
      <div class="service-status">
        <div class="status-row">
          <span class="status-label">Telegram Bot:</span>
          <span class="status-badge" :class="statusClass">
            <i class="fab fa-telegram-plane"></i>
            {{ statusText }}
          </span>
        </div>
        <div v-if="serviceStatus.webhookUrl" class="url-row">
          <span class="url-label">Webhook URL:</span>
          <div class="url-display">
            <code class="url-text">{{ serviceStatus.webhookUrl }}</code>
            <button class="copy-btn" @click="copyWebhookUrl">
              <i :class="copiedWebhook ? 'fas fa-check' : 'fas fa-copy'"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Linked Accounts Section -->
      <div class="accounts-section">
        <div class="section-header">
          <h4>Linked Accounts</h4>
          <span class="account-count">{{ linkedAccounts.length }}</span>
        </div>

        <!-- No Accounts Yet -->
        <div v-if="linkedAccounts.length === 0" class="no-accounts">
          <i class="fas fa-link"></i>
          <p>No accounts linked yet</p>
          <p class="hint">Generate a pairing code below to link your Telegram account</p>
        </div>

        <!-- Account List -->
        <div v-else class="account-list">
          <div
            v-for="account in linkedAccounts"
            :key="account.id"
            class="account-item"
          >
            <div class="account-icon">
              <i :class="account.platform === 'telegram' ? 'fab fa-telegram-plane' : 'fab fa-discord'"></i>
            </div>
            <div class="account-info">
              <div class="account-name">{{ account.external_username || account.external_id }}</div>
              <div class="account-meta">
                <span class="platform-tag">{{ account.platform }}</span>
                <span class="paired-date">Paired {{ formatDate(account.paired_at) }}</span>
              </div>
            </div>
            <button
              class="unlink-btn"
              @click="unlinkAccount(account.id)"
              :disabled="isUnlinking"
            >
              <i class="fas fa-times"></i> Unlink
            </button>
          </div>
        </div>
      </div>

      <!-- Pairing Section -->
      <div class="pairing-section">
        <div class="section-header">
          <h4>Pair New Account</h4>
        </div>

        <div v-if="!pairingCode" class="generate-code">
          <p class="pairing-instructions">
            Generate a pairing code to link your Telegram account
          </p>
          <button
            class="generate-btn"
            @click="generatePairingCode"
            :disabled="isGenerating || linkedAccounts.length >= 1"
          >
            <i class="fas fa-plus"></i>
            {{ linkedAccounts.length >= 1 ? 'Maximum Accounts Linked' : 'Generate Pairing Code' }}
          </button>
        </div>

        <div v-else class="pairing-code-display">
          <div class="code-box">
            <div class="code-header">
              <span class="code-label">Your Pairing Code</span>
              <span class="code-expires">Expires in {{ timeRemaining }}</span>
            </div>
            <div class="code-value">
              <code>{{ pairingCode }}</code>
              <button class="copy-btn" @click="copyPairingCode">
                <i :class="copiedCode ? 'fas fa-check' : 'fas fa-copy'"></i>
              </button>
            </div>
          </div>

          <div class="pairing-steps">
            <p><strong>Next steps:</strong></p>
            <ol>
              <li>Open Telegram and find your bot</li>
              <li>Send this message: <code>/pair {{ pairingCode }}</code></li>
              <li>Bot will confirm when paired successfully</li>
            </ol>
          </div>

          <button class="cancel-btn" @click="cancelPairing">
            <i class="fas fa-times"></i> Cancel
          </button>
        </div>
      </div>

      <!-- Info Box -->
      <div class="info-box">
        <i class="fas fa-info-circle"></i>
        <div class="info-content">
          <p><strong>How it works:</strong></p>
          <ul>
            <li>Link your Telegram account using a pairing code</li>
            <li>Message your bot to chat with your AGNT agents</li>
            <li>Uses your default AI provider and model</li>
            <li>Conversation history is maintained</li>
            <li>One Telegram account per AGNT user (v1)</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';

export default {
  name: 'ExternalChatSettings',
  setup() {
    const serviceStatus = reactive({
      configured: false,
      active: false,
      webhookUrl: null,
    });

    const linkedAccounts = ref([]);
    const pairingCode = ref(null);
    const pairingExpiry = ref(null);
    const isGenerating = ref(false);
    const isUnlinking = ref(false);
    const copiedWebhook = ref(false);
    const copiedCode = ref(false);

    let countdownInterval = null;

    const statusClass = computed(() => {
      return serviceStatus.active ? 'status-connected' : 'status-disconnected';
    });

    const statusText = computed(() => {
      return serviceStatus.active ? 'Active' : 'Inactive';
    });

    const timeRemaining = computed(() => {
      if (!pairingExpiry.value) return '5:00';

      const now = Date.now();
      const expiry = new Date(pairingExpiry.value).getTime();
      const remaining = Math.max(0, expiry - now);

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    });

    // Fetch service status
    async function fetchServiceStatus() {
      try {
        const response = await fetch('/api/external-chat/status', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          serviceStatus.configured = data.configured;
          serviceStatus.active = data.active;
          serviceStatus.webhookUrl = data.webhookUrl;
        }
      } catch (error) {
        console.error('Error fetching service status:', error);
      }
    }

    // Fetch linked accounts
    async function fetchLinkedAccounts() {
      try {
        const response = await fetch('/api/external-chat/accounts', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          linkedAccounts.value = data.accounts || [];
        }
      } catch (error) {
        console.error('Error fetching linked accounts:', error);
      }
    }

    // Generate pairing code
    async function generatePairingCode() {
      if (isGenerating.value) return;

      isGenerating.value = true;

      try {
        const response = await fetch('/api/external-chat/pair', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          pairingCode.value = data.code;
          pairingExpiry.value = data.expires_at;

          // Start countdown
          startCountdown();
        } else {
          const error = await response.json();
          alert(error.error || 'Failed to generate pairing code');
        }
      } catch (error) {
        console.error('Error generating pairing code:', error);
        alert('Failed to generate pairing code');
      } finally {
        isGenerating.value = false;
      }
    }

    // Unlink account
    async function unlinkAccount(accountId) {
      if (!confirm('Are you sure you want to unlink this account?')) return;

      isUnlinking.value = true;

      try {
        const response = await fetch(`/api/external-chat/accounts/${accountId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (response.ok) {
          // Refresh accounts list
          await fetchLinkedAccounts();
        } else {
          const error = await response.json();
          alert(error.error || 'Failed to unlink account');
        }
      } catch (error) {
        console.error('Error unlinking account:', error);
        alert('Failed to unlink account');
      } finally {
        isUnlinking.value = false;
      }
    }

    // Cancel pairing
    function cancelPairing() {
      pairingCode.value = null;
      pairingExpiry.value = null;
      stopCountdown();
    }

    // Copy functions
    function copyWebhookUrl() {
      navigator.clipboard.writeText(serviceStatus.webhookUrl);
      copiedWebhook.value = true;
      setTimeout(() => copiedWebhook.value = false, 2000);
    }

    function copyPairingCode() {
      navigator.clipboard.writeText(pairingCode.value);
      copiedCode.value = true;
      setTimeout(() => copiedCode.value = false, 2000);
    }

    // Countdown timer
    function startCountdown() {
      stopCountdown();
      countdownInterval = setInterval(() => {
        const now = Date.now();
        const expiry = new Date(pairingExpiry.value).getTime();

        if (now >= expiry) {
          cancelPairing();
        }
      }, 1000);
    }

    function stopCountdown() {
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }

    // Date formatting
    function formatDate(dateString) {
      const date = new Date(dateString);
      const now = new Date();
      const diff = now - date;

      // Less than 1 minute
      if (diff < 60000) return 'just now';

      // Less than 1 hour
      if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
      }

      // Less than 1 day
      if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
      }

      // Less than 7 days
      if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `${days} day${days > 1 ? 's' : ''} ago`;
      }

      // Format as date
      return date.toLocaleDateString();
    }

    // Poll for pairing success
    let pollingInterval = null;
    function startPolling() {
      pollingInterval = setInterval(async () => {
        const oldCount = linkedAccounts.value.length;
        await fetchLinkedAccounts();

        // If new account added, clear pairing code
        if (linkedAccounts.value.length > oldCount && pairingCode.value) {
          cancelPairing();
        }
      }, 3000); // Poll every 3 seconds
    }

    function stopPolling() {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }

    // Lifecycle
    onMounted(async () => {
      await fetchServiceStatus();
      await fetchLinkedAccounts();
      startPolling();
    });

    onUnmounted(() => {
      stopCountdown();
      stopPolling();
    });

    return {
      serviceStatus,
      linkedAccounts,
      pairingCode,
      pairingExpiry,
      isGenerating,
      isUnlinking,
      copiedWebhook,
      copiedCode,
      statusClass,
      statusText,
      timeRemaining,
      generatePairingCode,
      unlinkAccount,
      cancelPairing,
      copyWebhookUrl,
      copyPairingCode,
      formatDate,
    };
  },
};
</script>

<style scoped>
.external-chat-settings {
  padding: 1rem;
}

.external-chat-header h3 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.beta-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  background: var(--accent-color);
  color: white;
  font-size: 0.7rem;
  border-radius: 4px;
  font-weight: 600;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin-bottom: 1.5rem;
}

.external-chat-card {
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1.5rem;
}

.install-card {
  text-align: center;
  padding: 2rem;
}

.install-content i {
  font-size: 3rem;
  color: var(--accent-color);
  margin-bottom: 1rem;
}

.install-content h4 {
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.install-content > p {
  color: var(--text-secondary);
  margin-bottom: 1.5rem;
}

.install-steps {
  text-align: left;
  max-width: 500px;
  margin: 0 auto 1rem;
  background: var(--background-color);
  padding: 1.5rem;
  border-radius: 6px;
}

.install-steps ol {
  padding-left: 1.5rem;
  margin: 0;
}

.install-steps li {
  margin-bottom: 0.75rem;
  color: var(--text-primary);
}

.install-command {
  margin: 0.5rem 0;
  background: var(--background-color);
  padding: 0.75rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.install-command code {
  flex: 1;
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 0.85rem;
  color: var(--text-primary);
}

.install-hint {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-top: 1rem;
}

.install-hint a {
  color: var(--accent-color);
  text-decoration: none;
}

.install-hint a:hover {
  text-decoration: underline;
}

/* Service Status */
.service-status {
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-color);
}

.status-row, .url-row {
  display: flex;
  align-items: center;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.status-label, .url-label {
  font-weight: 500;
  color: var(--text-secondary);
  margin-right: 0.75rem;
  min-width: 100px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
}

.status-connected {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.status-disconnected {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.url-display {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--background-color);
  padding: 0.5rem;
  border-radius: 4px;
}

.url-text {
  flex: 1;
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 0.8rem;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Accounts Section */
.accounts-section {
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-color);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.section-header h4 {
  font-size: 1.1rem;
  color: var(--text-primary);
  margin: 0;
}

.account-count {
  background: var(--accent-color);
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
}

.no-accounts {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.no-accounts i {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  opacity: 0.5;
}

.hint {
  font-size: 0.85rem;
  margin-top: 0.5rem;
}

.account-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.account-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--background-color);
  border-radius: 6px;
}

.account-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--accent-color);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 1.25rem;
}

.account-info {
  flex: 1;
}

.account-name {
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.account-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.platform-tag {
  background: var(--surface-color);
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  text-transform: capitalize;
}

.unlink-btn {
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid var(--error-color);
  color: var(--error-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.unlink-btn:hover:not(:disabled) {
  background: var(--error-color);
  color: white;
}

.unlink-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Pairing Section */
.pairing-section {
  margin-bottom: 1.5rem;
}

.generate-code {
  text-align: center;
  padding: 1.5rem;
}

.pairing-instructions {
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.generate-btn {
  padding: 0.75rem 1.5rem;
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  transition: all 0.2s;
}

.generate-btn:hover:not(:disabled) {
  background: var(--accent-hover-color);
  transform: translateY(-1px);
}

.generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pairing-code-display {
  padding: 1.5rem;
  background: var(--background-color);
  border-radius: 6px;
}

.code-box {
  margin-bottom: 1.5rem;
}

.code-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
}

.code-label {
  color: var(--text-secondary);
  font-weight: 500;
}

.code-expires {
  color: var(--warning-color);
  font-weight: 600;
}

.code-value {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--surface-color);
  border-radius: 6px;
  border: 2px solid var(--accent-color);
}

.code-value code {
  flex: 1;
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--accent-color);
  text-align: center;
}

.pairing-steps {
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.pairing-steps p {
  margin-bottom: 0.5rem;
  color: var(--text-secondary);
}

.pairing-steps ol {
  padding-left: 1.5rem;
  margin: 0;
}

.pairing-steps li {
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.pairing-steps code {
  background: var(--surface-color);
  padding: 0.25rem 0.5rem;
  border-radius: 3px;
  font-family: 'Monaco', 'Courier New', monospace;
}

.cancel-btn {
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.cancel-btn:hover {
  background: var(--surface-color);
  border-color: var(--text-secondary);
}

.copy-btn {
  padding: 0.375rem 0.75rem;
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.copy-btn:hover {
  background: var(--surface-color);
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.copy-btn i.fa-check {
  color: var(--success-color);
}

/* Info Box */
.info-box {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: rgba(59, 130, 246, 0.05);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 6px;
  font-size: 0.875rem;
}

.info-box i {
  color: rgba(59, 130, 246, 0.8);
  font-size: 1.25rem;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.info-content {
  flex: 1;
  color: var(--text-secondary);
}

.info-content p {
  margin: 0 0 0.5rem 0;
}

.info-content ul {
  margin: 0;
  padding-left: 1.25rem;
}

.info-content li {
  margin-bottom: 0.25rem;
}

.info-content code {
  background: var(--surface-color);
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  font-family: 'Monaco', 'Courier New', monospace;
}
</style>
