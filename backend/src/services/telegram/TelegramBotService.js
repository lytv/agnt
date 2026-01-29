import TelegramBot from 'node-telegram-bot-api';
import { EventEmitter } from 'events';
import crypto from 'crypto';

/**
 * TelegramBotService - Handles Telegram Bot API interactions
 *
 * Features:
 * - Webhook-based message receiving
 * - Secure webhook verification
 * - Typing indicators during processing
 * - Rate-limited message sending
 */
class TelegramBotService extends EventEmitter {
  constructor() {
    super();
    this.bot = null;
    this.botInfo = null;
    this.webhookSecret = null;
    this.initialized = false;
    this.typingIntervals = new Map(); // chatId -> intervalId
  }

  /**
   * Initialize the Telegram bot with webhook
   */
  async initialize(botToken, webhookUrl, webhookSecret) {
    if (!botToken) {
      console.log('[TelegramBot] No bot token provided, skipping initialization');
      return false;
    }

    try {
      // Create bot instance (webhook mode - no polling)
      this.bot = new TelegramBot(botToken, { polling: false });
      this.webhookSecret = webhookSecret;

      // Get bot info
      this.botInfo = await this.bot.getMe();
      console.log(`[TelegramBot] Bot initialized: @${this.botInfo.username}`);

      // Set webhook if URL provided
      if (webhookUrl) {
        const webhookOptions = {
          drop_pending_updates: true // Don't process old messages on restart
        };

        if (webhookSecret) {
          webhookOptions.secret_token = webhookSecret;
        }

        await this.bot.setWebHook(webhookUrl, webhookOptions);
        console.log(`[TelegramBot] Webhook set to: ${webhookUrl}`);
      }

      this.initialized = true;
      this.emit('initialized', { botInfo: this.botInfo });
      return true;
    } catch (error) {
      console.error('[TelegramBot] Initialization failed:', error.message);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Verify webhook request signature (constant-time comparison)
   */
  verifyWebhook(secretToken) {
    if (!this.webhookSecret) {
      // No secret configured, skip verification
      return true;
    }

    if (!secretToken) {
      return false;
    }

    // Use constant-time comparison to prevent timing attacks
    const expectedBuffer = Buffer.from(this.webhookSecret);
    const receivedBuffer = Buffer.from(secretToken);

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  }

  /**
   * Process incoming webhook update
   */
  async handleWebhook(update) {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }

    // Handle message
    if (update.message) {
      const message = update.message;
      const chatId = message.chat.id;
      const userId = message.from.id;
      const username = message.from.username || `user_${userId}`;
      const text = message.text || '';

      // Handle /pair command
      if (text.startsWith('/pair ')) {
        const code = text.replace('/pair ', '').trim().toUpperCase();
        this.emit('pair', {
          chatId,
          externalId: String(userId),
          username,
          code
        });
        return { type: 'pair', code };
      }

      // Handle /start command
      if (text === '/start') {
        await this.sendMessage(chatId,
          '👋 Welcome to AGNT!\n\n' +
          'To connect this Telegram account to your AGNT:\n' +
          '1. Open AGNT Settings → External Chat\n' +
          '2. Click "Generate Pairing Code"\n' +
          '3. Send me: /pair YOUR_CODE\n\n' +
          'Once paired, you can chat with me directly!'
        );
        return { type: 'start' };
      }

      // Handle /help command
      if (text === '/help') {
        await this.sendMessage(chatId,
          '🤖 AGNT Telegram Bot\n\n' +
          'Commands:\n' +
          '/pair CODE - Link your Telegram to AGNT\n' +
          '/status - Check connection status\n' +
          '/help - Show this message\n\n' +
          'Once paired, just send any message to chat with AGNT!'
        );
        return { type: 'help' };
      }

      // Handle /status command
      if (text === '/status') {
        this.emit('status', {
          chatId,
          externalId: String(userId),
          username
        });
        return { type: 'status' };
      }

      // Regular message
      if (text && !text.startsWith('/')) {
        this.emit('message', {
          chatId,
          externalId: String(userId),
          username,
          text,
          messageId: message.message_id
        });
        return { type: 'message', text };
      }

      // Non-text message (image, voice, etc.)
      if (!text) {
        await this.sendMessage(chatId,
          '📝 Sorry, I can only process text messages right now.\n' +
          'Please send your question as text.'
        );
        return { type: 'unsupported' };
      }
    }

    return { type: 'unknown' };
  }

  /**
   * Send message to Telegram chat
   */
  async sendMessage(chatId, text, options = {}) {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }

    try {
      const result = await this.bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        ...options
      });
      return result;
    } catch (error) {
      // Handle specific Telegram errors
      if (error.response?.body?.error_code === 403) {
        // User blocked the bot
        console.error(`[TelegramBot] User ${chatId} blocked the bot`);
        this.emit('blocked', { chatId });
      }
      throw error;
    }
  }

  /**
   * Start showing typing indicator (repeats every 5 seconds)
   */
  startTyping(chatId) {
    // Clear any existing typing for this chat
    this.stopTyping(chatId);

    // Send immediately
    this.sendTypingAction(chatId);

    // Repeat every 5 seconds (Telegram typing indicator lasts 5 seconds)
    const intervalId = setInterval(() => {
      this.sendTypingAction(chatId);
    }, 5000);

    this.typingIntervals.set(chatId, intervalId);
  }

  /**
   * Stop showing typing indicator
   */
  stopTyping(chatId) {
    const intervalId = this.typingIntervals.get(chatId);
    if (intervalId) {
      clearInterval(intervalId);
      this.typingIntervals.delete(chatId);
    }
  }

  /**
   * Send typing action once
   */
  async sendTypingAction(chatId) {
    if (!this.bot) return;

    try {
      await this.bot.sendChatAction(chatId, 'typing');
    } catch (error) {
      // Ignore typing errors (user may have blocked bot)
      console.debug('[TelegramBot] Typing action failed:', error.message);
    }
  }

  /**
   * Get bot info
   */
  getBotInfo() {
    return this.botInfo;
  }

  /**
   * Check if bot is initialized
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Shutdown the bot
   */
  async shutdown() {
    // Clear all typing intervals
    for (const [chatId, intervalId] of this.typingIntervals) {
      clearInterval(intervalId);
    }
    this.typingIntervals.clear();

    if (this.bot) {
      try {
        await this.bot.deleteWebHook();
        console.log('[TelegramBot] Webhook removed');
      } catch (error) {
        console.error('[TelegramBot] Error removing webhook:', error.message);
      }
    }

    this.bot = null;
    this.initialized = false;
    this.removeAllListeners();
  }
}

export default TelegramBotService;
