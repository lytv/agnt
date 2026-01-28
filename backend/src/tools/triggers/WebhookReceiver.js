import axios from 'axios';
import { EventEmitter } from 'events';
import WebhookModel from '../../models/WebhookModel.js';
import WorkflowModel from '../../models/WorkflowModel.js';
import TunnelService from '../../services/TunnelService.js';

class LocalWebhookReceiver extends EventEmitter {
  constructor(processManager) {
    super();
    this.processManager = processManager;
    this.remoteUrl = process.env.REMOTE_URL;
    this.pollInterval = null;
    this.webhooks = new Map();

    // Load webhooks and auto-start polling if there are active webhook workflows
    this.initializeWebhooks();

    // Listen for tunnel status changes to auto-fallback to polling
    this._setupTunnelListener();

    console.log('LocalWebhookReceiver instantiated.');
  }

  /**
   * Setup listener for tunnel status changes
   * Automatically starts polling when tunnel disconnects
   */
  _setupTunnelListener() {
    TunnelService.on('statusChange', ({ status, url }) => {
      if (status === 'disconnected' && this.webhooks.size > 0) {
        console.log('[WebhookReceiver] Tunnel disconnected - starting polling fallback for remote webhooks');
        this.startPolling();
      } else if (status === 'connected') {
        console.log(`[WebhookReceiver] Tunnel connected at ${url} - instant webhook delivery enabled`);
        // Optionally stop polling when tunnel connects (webhooks will be delivered directly)
        // Note: Keep polling for existing remote-registered webhooks until they're re-registered
      }
    });
  }

  /**
   * Initialize webhooks on startup - loads from DB and auto-starts polling if needed
   */
  async initializeWebhooks() {
    try {
      // First load webhooks from local database into memory
      await this.loadWebhooksFromDatabase();

      // Check if any of these webhooks belong to active workflows
      if (this.webhooks.size > 0) {
        const activeWorkflowIds = await this._getActiveWebhookWorkflowIds();

        if (activeWorkflowIds.length > 0) {
          console.log(`LocalWebhookReceiver: Found ${activeWorkflowIds.length} active webhook workflows on startup. Auto-starting polling...`);

          // Re-register webhooks with remote server for active workflows
          for (const workflowId of activeWorkflowIds) {
            const webhook = this.webhooks.get(workflowId);
            if (webhook) {
              try {
                await this._reregisterWebhookOnRemote(workflowId, webhook);
              } catch (error) {
                console.error(`LocalWebhookReceiver: Error re-registering webhook for workflow ${workflowId}:`, error.message);
              }
            }
          }

          // Start polling for webhook triggers
          this.startPolling();
        } else {
          console.log('LocalWebhookReceiver: No active webhook workflows found on startup. Polling will start when a workflow is activated.');
        }
      } else {
        console.log('LocalWebhookReceiver: No webhooks found in database.');
      }
    } catch (error) {
      console.error('LocalWebhookReceiver: Error initializing webhooks:', error);
    }
  }

  /**
   * Get workflow IDs that have webhooks AND are in an active state
   */
  async _getActiveWebhookWorkflowIds() {
    try {
      const workflowIds = Array.from(this.webhooks.keys());
      if (workflowIds.length === 0) return [];

      // Get workflows that are in active states
      const activeWorkflows = await WorkflowModel.findByStatusBatch(['listening', 'running', 'queued'], 1000, 0);
      const activeIds = new Set(activeWorkflows.map((w) => w.id));

      // Return only webhook workflow IDs that are active
      return workflowIds.filter((id) => activeIds.has(id));
    } catch (error) {
      console.error('LocalWebhookReceiver: Error getting active webhook workflow IDs:', error);
      return [];
    }
  }

  /**
   * Re-register a webhook with the remote server (for server restart recovery)
   */
  async _reregisterWebhookOnRemote(workflowId, webhook) {
    try {
      const response = await axios.post(`${this.remoteUrl}/webhooks/register`, {
        workflowId,
        userId: webhook.userId || null,
        method: webhook.method || null,
        authType: webhook.authType || null,
        authToken: webhook.authToken || null,
        username: webhook.username || null,
        password: webhook.password || null,
        responseMode: webhook.responseMode || 'Immediate',
      });

      if (response.data.success) {
        console.log(`LocalWebhookReceiver: Re-registered webhook on remote for workflow ${workflowId}`);
      } else {
        console.warn(`LocalWebhookReceiver: Remote re-registration returned: ${response.data.error}`);
      }
    } catch (error) {
      console.error(`LocalWebhookReceiver: Error re-registering webhook on remote: ${error.message}`);
      // Don't throw - polling will still work even if remote registration fails
    }
  }

  async registerWebhook(workflowId, userId, method, authType, authToken, username, password, responseMode = 'Immediate') {
    // Generate webhook URL - prefer tunnel URL if available, fallback to remote
    const tunnelUrl = TunnelService.getUrl();
    const isNamedTunnel = TunnelService.isNamedTunnel;
    const webhookUrl = tunnelUrl
      ? `${tunnelUrl}/api/webhooks/trigger/${workflowId}`
      : `${this.remoteUrl}/webhook/${workflowId}`;

    // Enhanced logging for tunnel vs polling mode
    if (tunnelUrl) {
      const tunnelType = isNamedTunnel ? 'Named Tunnel - PERSISTENT URL ✓' : 'Quick Tunnel';
      console.log(`[Webhook] ✓ Registering webhook for workflow ${workflowId}`);
      console.log(`[Webhook]   URL: ${webhookUrl}`);
      console.log(`[Webhook]   Mode: INSTANT (via ${tunnelType})`);
      if (isNamedTunnel) {
        console.log(`[Webhook]   ℹ URL will never change (persists across restarts)`);
      }
    } else {
      console.log(`[Webhook] ⚠ Registering webhook for workflow ${workflowId}`);
      console.log(`[Webhook]   URL: ${webhookUrl}`);
      console.log(`[Webhook]   Mode: POLLING (10s delay) - Enable Instant Webhooks in Settings for faster delivery`);
    }

    // Store the webhook configuration locally in memory
    this.webhooks.set(workflowId, {
      method,
      authType,
      authToken,
      username,
      password,
      workflowId,
      responseMode,
    });

    // Only register with remote server if NOT using tunnel
    if (!tunnelUrl) {
      try {
        const response = await axios.post(`${this.remoteUrl}/webhooks/register`, {
          workflowId,
          userId,
          method: method || null,
          authType: authType || null,
          authToken: authToken || null,
          username: username || null,
          password: password || null,
          responseMode: responseMode || 'Immediate',
        });

        if (response.data.success) {
          console.log(`[Webhook] Registered on remote server for workflow ${workflowId}`);
        } else {
          console.warn(`[Webhook] Remote registration returned: ${response.data.error}`);
        }
      } catch (remoteError) {
        console.error(`[Webhook] Error registering on remote server: ${remoteError.message}`);
        // Continue even if remote registration fails - polling will still work
      }

      // Start polling for remote webhooks
      this.startPolling();
    }

    // Check if webhook already exists in local database
    try {
      const existing = await WebhookModel.findByWorkflowId(workflowId);

      if (!existing) {
        // Only create if it doesn't exist
        await WebhookModel.create({
          workflow_id: workflowId,
          user_id: userId,
          webhook_url: webhookUrl,
          method: method || null,
          auth_type: authType || null,
        });
        console.log(`Webhook persisted to local database for workflow ${workflowId}`);
      } else {
        console.log(`Webhook already exists in local database for workflow ${workflowId}`);
      }
    } catch (dbError) {
      console.error(`Error persisting webhook to local database: ${dbError.message}`);
      // Continue even if DB save fails
    }

    return webhookUrl;
  }
  startPolling() {
    // Prevent duplicate polling intervals
    if (this.pollInterval) {
      console.log('LocalWebhookReceiver: Polling already active, skipping duplicate start.');
      return;
    }
    console.log('LocalWebhookReceiver: Starting polling...');
    this.pollInterval = setInterval(() => {
      this.pollForTriggers();
    }, 10000); // Poll every 10 seconds
  }
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('LocalWebhookReceiver: Polling stopped.');
    }
  }
  // async pollForTriggers() {
  //   console.log(
  //     "LocalWebhookReceiver: Polling remote server for webhook triggers..."
  //   );
  //   try {
  //     const response = await axios.get(`${this.remoteUrl}/webhooks/poll`);
  //     console.log("LocalWebhookReceiver: Poll response:", response.data);
  //     const { triggers } = response.data;
  //     console.log(
  //       `LocalWebhookReceiver: Received ${triggers.length} webhook triggers`
  //     );
  //     for (const trigger of triggers) {
  //       console.log("LocalWebhookReceiver: Trigger data:", trigger);
  //       await this._triggerWorkflow(trigger.workflowId, trigger.triggerData);
  //     }
  //   } catch (error) {
  //     console.error(
  //       "LocalWebhookReceiver: Error polling for webhook triggers:",
  //       error
  //     );
  //   }
  // }
  async pollForTriggers() {
    try {
      const response = await axios.get(`${this.remoteUrl}/webhooks/poll`);
      const { triggers } = response.data;

      // Only log if there are triggers to process
      if (triggers.length === 0) return;

      console.log(`LocalWebhookReceiver: Received ${triggers.length} webhook triggers`);

      const processedTriggerIds = [];
      const results = {};

      for (const trigger of triggers) {
        console.log('LocalWebhookReceiver: Trigger data:', trigger);
        const result = await this._processWebhookTrigger(trigger.workflowId, trigger.triggerData);

        // Only mark as processed if the workflow was actually triggered
        // If result is null or has pendingRetry flag, don't confirm - let it be retried
        if (result && !result.pendingRetry) {
          processedTriggerIds.push(trigger.id);
          results[trigger.id] = result;
        } else if (result === null) {
          // Workflow not ready yet - don't confirm, will retry on next poll
          console.log(`LocalWebhookReceiver: Workflow ${trigger.workflowId} not ready, will retry on next poll`);
        }
      }

      // Confirm processed triggers
      if (processedTriggerIds.length > 0) {
        try {
          await axios.post(`${this.remoteUrl}/webhooks/confirm-processed`, {
            processedTriggerIds,
            results,
          });
          console.log(`LocalWebhookReceiver: Confirmed processing of ${processedTriggerIds.length} triggers`);
        } catch (confirmError) {
          console.error('LocalWebhookReceiver: Error confirming processed triggers:', confirmError);
        }
      }
    } catch (error) {
      console.error('LocalWebhookReceiver: Error polling for webhook triggers:', error);
    }
  }
  async _processWebhookTrigger(workflowId, triggerData) {
    const webhook = this.webhooks.get(workflowId);
    if (!webhook) {
      // Return null instead of 404 - this allows the Workflow Process to handle it
      // The main process may not have the webhook in memory, but the Workflow Process does
      console.log(`LocalWebhookReceiver: Webhook not found in local memory for workflow ${workflowId}, deferring to other process`);
      return null;
    }

    if (webhook.method && triggerData.method !== webhook.method) {
      console.log(`LocalWebhookReceiver: Method not allowed: ${triggerData.method} for webhook ${workflowId}`);
      return { status: 405, message: 'Method not allowed' };
    }

    if (webhook.authType && webhook.authType.toLowerCase() !== 'none') {
      const authTypeLower = webhook.authType.toLowerCase();
      if (authTypeLower === 'basic') {
        const authHeader = triggerData.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Basic ')) {
          console.log(`LocalWebhookReceiver: Unauthorized - Basic auth failed for webhook ${workflowId}`);
          return { status: 401, message: 'Unauthorized - Basic auth failed' };
        }
        const base64Credentials = authHeader.split(' ')[1];
        const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
        const [username, password] = credentials.split(':');
        if (username !== webhook.username || password !== webhook.password) {
          console.log(`LocalWebhookReceiver: Unauthorized - Invalid credentials for webhook ${workflowId}`);
          return { status: 401, message: 'Unauthorized - Invalid credentials' };
        }
      } else if (authTypeLower === 'bearer' || authTypeLower === 'webhook') {
        const providedToken = triggerData.headers['authorization'] || triggerData.headers['x-webhook-token'];
        if (!providedToken || providedToken !== `Bearer ${webhook.authToken}`) {
          console.log(`LocalWebhookReceiver: Unauthorized - Invalid token for webhook ${workflowId}`);
          return { status: 401, message: 'Unauthorized - Invalid token' };
        }
      }
    }

    const result = await this._triggerWorkflow(workflowId, triggerData, webhook.responseMode === 'Wait for Result');

    // If result is null, workflow isn't ready - return null to signal retry
    if (result === null) {
      return null;
    }

    if (webhook.responseMode === 'Wait for Result' && result) {
      // Resolve the response body template
      const activeEngine = this.processManager.activeWorkflows.get(workflowId);
      let responseBody = result; // Default to full result if no template

      if (webhook.responseBody && activeEngine) {
        try {
          responseBody = activeEngine.parameterResolver.resolveTemplate(webhook.responseBody);
          // Try to parse as JSON if the content type implies JSON
          if (webhook.responseContentType === 'application/json' && typeof responseBody === 'string') {
            try {
              responseBody = JSON.parse(responseBody);
            } catch (e) {
              // Keep as string if parsing fails
            }
          }
        } catch (error) {
          console.error(`Error resolving response body template for workflow ${workflowId}:`, error);
        }
      }

      return {
        status: 200,
        headers: {
          'Content-Type': webhook.responseContentType || 'application/json',
        },
        body: responseBody,
        outputs: result.outputs, // Keep raw outputs for polling confirmation if needed
      };
    }

    if (result === null) {
      return null;
    }
    return result || { status: 200, message: 'Webhook processed successfully' };
  }
  async _triggerWorkflow(workflowId, triggerData, waitForCompletion = false) {
    console.log(`LocalWebhookReceiver: Attempting trigger for workflow ID: ${workflowId}, Wait: ${waitForCompletion}`);
    const activeEngine = this.processManager.activeWorkflows.get(workflowId);
    if (activeEngine && (activeEngine.isListening || activeEngine.isRunning)) {
      console.log(`LocalWebhookReceiver: Triggering workflow ${workflowId}`);
      return await activeEngine.processWorkflowTrigger(triggerData, { waitForCompletion });
    } else {
      console.log(`LocalWebhookReceiver: Workflow ${workflowId} not found locally or not in listening state.`);
      console.log(`Active Workflows: ${Array.from(this.processManager.activeWorkflows.keys()).join(', ')}`);
      if (this.processManager.activeWorkflows.has(workflowId)) {
        const engine = this.processManager.activeWorkflows.get(workflowId);
        console.log(`Engine state for ${workflowId}: isListening=${engine.isListening}, isRunning=${engine.isRunning}`);
      }
      return null;
    }
  }
  async unregisterWebhook(workflowId) {
    console.log(`LocalWebhookReceiver: Unregistering webhook for workflow ${workflowId}`);

    // Remove from local memory
    this.webhooks.delete(workflowId);

    // Unregister from remote server
    try {
      const response = await axios.post(`${this.remoteUrl}/webhooks/unregister`, { workflowId });
      if (response.data.success) {
        console.log(`LocalWebhookReceiver: Successfully unregistered webhook on remote for workflow ${workflowId}`);
      } else {
        console.warn(`LocalWebhookReceiver: Remote unregister returned: ${response.data.error}`);
      }
    } catch (error) {
      console.error(`LocalWebhookReceiver: Error unregistering webhook on remote for workflow ${workflowId}:`, error.message);
      // Continue even if remote unregister fails
    }

    // Remove from local database
    try {
      await WebhookModel.deleteByWorkflowId(workflowId);
      console.log(`Webhook removed from local database for workflow ${workflowId}`);
    } catch (dbError) {
      console.error(`Error removing webhook from local database: ${dbError.message}`);
    }
  }

  async loadWebhooksFromDatabase() {
    try {
      const webhooks = await WebhookModel.loadAll();
      console.log(`Loading ${webhooks.length} webhooks from database`);

      for (const webhook of webhooks) {
        this.webhooks.set(webhook.workflow_id, {
          method: webhook.method,
          authType: webhook.auth_type,
          workflowId: webhook.workflow_id,
          // Note: We don't store sensitive auth credentials in DB, only metadata
        });
      }

      console.log(`Loaded ${webhooks.length} webhooks into memory`);
    } catch (error) {
      console.error('Error loading webhooks from database:', error);
    }
  }
  shutdown() {
    this.stopPolling();
    console.log('LocalWebhookReceiver: Shut down.');
  }
}

export default LocalWebhookReceiver;
