import express from 'express';
import WebhookModel from '../models/WebhookModel.js';
import { authenticateToken } from './Middleware.js';
import WorkflowProcessBridge from '../workflow/WorkflowProcessBridge.js';

const WebhookRoutes = express.Router();

// Get all webhooks for the authenticated user
WebhookRoutes.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const webhooks = await WebhookModel.findByUserId(userId);
    res.json({ success: true, webhooks });
  } catch (error) {
    console.error('Error fetching webhooks:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch webhooks' });
  }
});

// Get webhook by workflow ID
WebhookRoutes.get('/workflow/:workflowId', authenticateToken, async (req, res) => {
  try {
    const { workflowId } = req.params;
    const webhook = await WebhookModel.findByWorkflowId(workflowId);

    if (!webhook) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    res.json({ success: true, webhook });
  } catch (error) {
    console.error('Error fetching webhook:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch webhook' });
  }
});

// Delete webhook by workflow ID
WebhookRoutes.delete('/workflow/:workflowId', authenticateToken, async (req, res) => {
  try {
    const { workflowId } = req.params;
    const result = await WebhookModel.deleteByWorkflowId(workflowId);

    if (!result.deleted) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    res.json({ success: true, message: 'Webhook deleted successfully' });
  } catch (error) {
    console.error('Error deleting webhook:', error);
    res.status(500).json({ success: false, error: 'Failed to delete webhook' });
  }
});

/**
 * ALL /api/webhooks/trigger/:workflowId
 * Receive webhook triggers from Cloudflare Tunnel (or direct calls)
 * This is the LOCAL endpoint that processes incoming webhooks instantly
 * No authentication middleware - webhook auth is handled by WebhookReceiver
 */
WebhookRoutes.all('/trigger/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;

    // Build trigger data from request
    const triggerData = {
      type: 'webhook',
      method: req.method,
      headers: req.headers,
      body: req.body,
      query: req.query,
      params: req.params,
    };

    console.log(`[Webhook Trigger] Received ${req.method} request for workflow ${workflowId}`);

    // Process webhook through WorkflowProcess via IPC (where WebhookReceiver lives)
    const result = await WorkflowProcessBridge.sendMessage('PROCESS_WEBHOOK_TRIGGER', {
      workflowId,
      triggerData,
    });

    // Handle response based on result
    if (!result) {
      console.log(`[Webhook Trigger] Workflow ${workflowId} not found or not ready`);
      return res.status(404).json({
        success: false,
        error: 'Webhook not found or workflow not ready',
      });
    }

    // Custom response (auth failure, method not allowed, wait for result, etc.)
    if (result.status) {
      const responseHeaders = result.headers || {};
      Object.entries(responseHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      return res.status(result.status).json(result.body || { message: result.message });
    }

    // Success - return 200 OK
    res.status(200).json({ success: true, message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('[Webhook Trigger] Error processing webhook:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default WebhookRoutes;
