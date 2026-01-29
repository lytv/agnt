import express from 'express';
import { authenticateToken } from './Middleware.js';

/**
 * ExternalChatRoutes - API endpoints for External Chat (Telegram/Discord)
 *
 * Endpoints:
 * - POST /api/external-chat/pair - Generate pairing code
 * - GET /api/external-chat/accounts - List linked accounts
 * - DELETE /api/external-chat/accounts/:id - Unlink account
 * - POST /api/external-chat/telegram/webhook - Telegram webhook
 * - GET /api/external-chat/status - Service status
 */
export default function ExternalChatRoutes(externalChatService) {
  const router = express.Router();
  /**
   * Generate a pairing code
   * POST /api/external-chat/pair
   */
  router.post('/pair', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id || req.userId;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const result = await externalChatService.generatePairingCode(userId);

      res.json({
        success: true,
        code: result.code,
        expiresAt: result.expiresAt,
        expiresIn: result.expiresIn
      });
    } catch (error) {
      console.error('[ExternalChatRoutes] Error generating pairing code:', error);

      if (error.message.includes('Rate limit')) {
        return res.status(429).json({ error: error.message });
      }

      res.status(500).json({ error: 'Failed to generate pairing code' });
    }
  });

  /**
   * Get linked accounts for current user
   * GET /api/external-chat/accounts
   */
  router.get('/accounts', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id || req.userId;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const accounts = await externalChatService.getAccountsByUser(userId);

      res.json({
        success: true,
        accounts: accounts.map(acc => ({
          id: acc.id,
          platform: acc.platform,
          externalId: acc.external_id,
          externalUsername: acc.external_username,
          pairedAt: acc.paired_at ? new Date(acc.paired_at).toISOString() : null,
          lastMessageAt: acc.last_message_at ? new Date(acc.last_message_at).toISOString() : null
        }))
      });
    } catch (error) {
      console.error('[ExternalChatRoutes] Error getting accounts:', error);
      res.status(500).json({ error: 'Failed to get linked accounts' });
    }
  });

  /**
   * Unlink an account
   * DELETE /api/external-chat/accounts/:id
   */
  router.delete('/accounts/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id || req.userId;
      const accountId = parseInt(req.params.id, 10);

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (isNaN(accountId)) {
        return res.status(400).json({ error: 'Invalid account ID' });
      }

      await externalChatService.unlinkAccount(accountId, userId);

      // Notify via Socket.IO
      externalChatService.notifyUser(userId, 'external-chat:account-unlinked', {
        id: accountId
      });

      res.json({ success: true });
    } catch (error) {
      console.error('[ExternalChatRoutes] Error unlinking account:', error);

      if (error.message.includes('not found') || error.message.includes('unauthorized')) {
        return res.status(404).json({ error: 'Account not found' });
      }

      res.status(500).json({ error: 'Failed to unlink account' });
    }
  });

  /**
   * Telegram webhook endpoint
   * POST /api/external-chat/telegram/webhook
   */
  router.post('/telegram/webhook', async (req, res) => {
    try {
      const telegramService = externalChatService.getTelegramService();

      if (!telegramService || !telegramService.isInitialized()) {
        console.error('[ExternalChatRoutes] Telegram service not initialized');
        return res.status(503).json({ error: 'Telegram service unavailable' });
      }

      // Verify webhook secret (constant-time comparison)
      const secretToken = req.headers['x-telegram-bot-api-secret-token'];
      if (!telegramService.verifyWebhook(secretToken)) {
        console.error('[ExternalChatRoutes] Invalid webhook signature');
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Process the update
      const update = req.body;

      if (!update) {
        return res.status(400).json({ error: 'Empty request body' });
      }

      // Handle webhook asynchronously (respond immediately to Telegram)
      res.json({ ok: true });

      // Process in background
      setImmediate(async () => {
        try {
          await telegramService.handleWebhook(update);
        } catch (error) {
          console.error('[ExternalChatRoutes] Webhook processing error:', error);
        }
      });
    } catch (error) {
      console.error('[ExternalChatRoutes] Webhook error:', error);
      // Still respond 200 to prevent Telegram retries
      res.status(200).json({ ok: true, error: 'Internal error' });
    }
  });

  /**
   * Get service status
   * GET /api/external-chat/status
   */
  router.get('/status', authenticateToken, async (req, res) => {
    try {
      const telegramService = externalChatService.getTelegramService();
      const botInfo = telegramService?.getBotInfo();
      const isTelegramConfigured = !!process.env.TELEGRAM_BOT_TOKEN;
      const isTelegramActive = telegramService?.isInitialized() || false;

      // Build webhook URL if tunnel is configured
      let webhookUrl = null;
      if (isTelegramConfigured && process.env.TUNNEL_URL) {
        webhookUrl = `${process.env.TUNNEL_URL}/api/external-chat/telegram/webhook`;
      }

      res.json({
        success: true,
        configured: isTelegramConfigured,
        active: isTelegramActive,
        webhookUrl: webhookUrl,
        // Legacy fields for backward compatibility
        initialized: externalChatService.isInitialized(),
        telegram: {
          enabled: isTelegramConfigured,
          initialized: isTelegramActive,
          botUsername: botInfo?.username || null
        }
      });
    } catch (error) {
      console.error('[ExternalChatRoutes] Error getting status:', error);
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  return router;
}
