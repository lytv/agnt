import { EventEmitter } from 'events';
import TelegramBotService from './telegram/TelegramBotService.js';
import ResponseBuffer from '../utils/ResponseBuffer.js';
import { handleExternalChatMessage } from './OrchestratorService.js';

/**
 * ExternalChatService - Manages external chat integrations (Telegram, Discord)
 *
 * Features:
 * - Pairing code generation and validation
 * - Account linking with security constraints
 * - Message routing to OrchestratorService
 * - Response buffering for Telegram
 * - Automatic cleanup of expired codes and stale buffers
 */
class ExternalChatService extends EventEmitter {
  constructor(db, io, orchestratorService) {
    super();
    this.db = db;
    this.io = io;
    this.orchestratorService = orchestratorService;
    this.telegramService = new TelegramBotService();
    this.activeBuffers = new Map(); // chatId -> ResponseBuffer
    this.initialized = false;

    // Rate limiting: userId -> { count, resetTime }
    this.pairingRateLimits = new Map();

    // Cleanup intervals
    this.cleanupInterval = null;
    this.bufferCleanupInterval = null;
  }

  /**
   * Initialize the service
   */
  async initialize() {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;

    if (!botToken) {
      console.log('[ExternalChat] No Telegram bot token configured, external chat disabled');
      return false;
    }

    // Build webhook URL from tunnel or environment
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL ||
      (process.env.TUNNEL_URL ? `${process.env.TUNNEL_URL}/api/external-chat/telegram/webhook` : null);

    if (!webhookUrl) {
      console.log('[ExternalChat] No webhook URL configured, Telegram bot will not receive messages');
    }

    // Initialize Telegram bot
    const success = await this.telegramService.initialize(botToken, webhookUrl, webhookSecret);

    if (success) {
      this.setupTelegramHandlers();
      this.startCleanupJobs();
      this.initialized = true;
      console.log('[ExternalChat] Service initialized successfully');
    }

    return success;
  }

  /**
   * Setup Telegram event handlers
   */
  setupTelegramHandlers() {
    // Handle pairing requests
    this.telegramService.on('pair', async ({ chatId, externalId, username, code }) => {
      try {
        const result = await this.linkAccount(code, 'telegram', externalId, username);
        if (result.success) {
          await this.telegramService.sendMessage(chatId,
            '✅ Successfully paired with AGNT!\n\n' +
            'You can now send messages here and I\'ll respond using AGNT\'s AI capabilities.'
          );
          // Notify AGNT UI
          this.notifyUser(result.userId, 'external-chat:account-linked', {
            id: result.accountId,
            platform: 'telegram',
            externalId,
            externalUsername: username,
            pairedAt: new Date().toISOString()
          });
        } else {
          await this.telegramService.sendMessage(chatId, `❌ ${result.error}`);
        }
      } catch (error) {
        console.error('[ExternalChat] Pairing error:', error);
        await this.telegramService.sendMessage(chatId,
          '❌ An error occurred during pairing. Please try again.'
        );
      }
    });

    // Handle status requests
    this.telegramService.on('status', async ({ chatId, externalId, username }) => {
      try {
        const account = await this.getAccountByExternalId('telegram', externalId);
        if (account) {
          await this.telegramService.sendMessage(chatId,
            `✅ Connected to AGNT\n\n` +
            `Username: @${username}\n` +
            `Paired: ${new Date(account.paired_at).toLocaleString()}\n\n` +
            `Send any message to chat with AGNT!`
          );
        } else {
          await this.telegramService.sendMessage(chatId,
            `❌ Not connected to AGNT\n\n` +
            `To connect:\n` +
            `1. Open AGNT Settings → External Chat\n` +
            `2. Generate a pairing code\n` +
            `3. Send /pair YOUR_CODE here`
          );
        }
      } catch (error) {
        console.error('[ExternalChat] Status error:', error);
      }
    });

    // Handle regular messages
    this.telegramService.on('message', async ({ chatId, externalId, username, text }) => {
      try {
        await this.routeMessage('telegram', externalId, text, chatId);
      } catch (error) {
        console.error('[ExternalChat] Message routing error:', error);
        await this.telegramService.sendMessage(chatId,
          '❌ Sorry, AGNT is unavailable. Please try again later.'
        );
      }
    });

    // Handle blocked users
    this.telegramService.on('blocked', async ({ chatId }) => {
      // User blocked the bot, remove their account
      try {
        const account = await this.getAccountByChatId('telegram', chatId);
        if (account) {
          await this.unlinkAccount(account.id, account.user_id);
          console.log(`[ExternalChat] Auto-unlinked blocked user: ${chatId}`);
        }
      } catch (error) {
        console.error('[ExternalChat] Error handling blocked user:', error);
      }
    });
  }

  /**
   * Start cleanup jobs
   */
  startCleanupJobs() {
    // Cleanup expired pairing codes every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredCodes();
    }, 60 * 60 * 1000);

    // Cleanup stale response buffers every 5 minutes
    this.bufferCleanupInterval = setInterval(() => {
      this.cleanupStaleBuffers();
    }, 5 * 60 * 1000);
  }

  /**
   * Generate a pairing code for a user
   */
  async generatePairingCode(userId, authToken) {
    // Check rate limit (3 codes per hour)
    const rateLimit = this.pairingRateLimits.get(userId);
    const now = Date.now();

    // Extract actual token if it has "Bearer " prefix
    const token = authToken && authToken.startsWith('Bearer ')
      ? authToken.slice(7)
      : authToken;

    console.log(`[ExternalChat Debug] generatePairingCode called for user ${userId}. Token present: ${!!token}, Length: ${token ? token.length : 0}`);

    if (rateLimit) {
      if (now < rateLimit.resetTime) {
        if (rateLimit.count >= 3) {
          const waitMinutes = Math.ceil((rateLimit.resetTime - now) / 60000);
          throw new Error(`Rate limit exceeded. Please wait ${waitMinutes} minutes.`);
        }
        rateLimit.count++;
      } else {
        // Reset rate limit
        this.pairingRateLimits.set(userId, { count: 1, resetTime: now + 60 * 60 * 1000 });
      }
    } else {
      this.pairingRateLimits.set(userId, { count: 1, resetTime: now + 60 * 60 * 1000 });
    }

    // Invalidate any existing codes for this user
    await this.invalidateUserCodes(userId);

    // Generate 8-char alphanumeric code (2.8 trillion combinations)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars (0, O, I, 1, L)
    const code = Array.from({ length: 8 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');

    // Store with 5-minute expiry
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO pairing_codes (code, user_id, auth_token, expires_at) VALUES (?, ?, ?, ?)`,
        [code, userId, token, expiresAt.toISOString()],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve({
              code,
              expiresAt: expiresAt.toISOString(),
              expiresIn: 300 // 5 minutes in seconds
            });
          }
        }
      );
    });
  }

  /**
   * Invalidate existing codes for a user
   */
  async invalidateUserCodes(userId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE pairing_codes SET used = 1 WHERE user_id = ? AND used = 0`,
        [userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Link an external account using a pairing code
   * Uses transaction to prevent race conditions
   */
  async linkAccount(code, platform, externalId, username) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN IMMEDIATE TRANSACTION');

        // 1. Validate pairing code
        this.db.get(
          `SELECT * FROM pairing_codes
           WHERE code = ? AND used = 0 AND expires_at > datetime('now')`,
          [code.toUpperCase()],
          (err, codeRecord) => {
            if (err) {
              this.db.run('ROLLBACK');
              return reject(err);
            }

            if (!codeRecord) {
              // Increment attempt count for tracking
              this.db.run(
                `UPDATE pairing_codes SET attempt_count = attempt_count + 1 WHERE code = ?`,
                [code.toUpperCase()]
              );
              this.db.run('ROLLBACK');
              return resolve({
                success: false,
                error: 'Invalid or expired code. Please generate a new code in AGNT Settings.'
              });
            }

            // Check attempt limit (5 attempts max)
            if (codeRecord.attempt_count >= 5) {
              this.db.run('ROLLBACK');
              return resolve({
                success: false,
                error: 'Too many attempts. Please generate a new code.'
              });
            }

            // 2. Platform Check: Check if this external account is already linked
            this.db.get(
              `SELECT * FROM external_accounts WHERE platform = ? AND external_id = ?`,
              [platform, externalId],
              (err, existingAccount) => {
                if (err) {
                  this.db.run('ROLLBACK');
                  return reject(err);
                }

                let isUpdate = false;
                let accountIdToUpdate = null;

                if (existingAccount) {
                  if (existingAccount.user_id === codeRecord.user_id) {
                    isUpdate = true;
                    accountIdToUpdate = existingAccount.id;
                  } else {
                    this.db.run('ROLLBACK');
                    return resolve({
                      success: false,
                      error: 'This Telegram account is linked to a DIFFERENT user.'
                    });
                  }
                }

                // 3. User Check: Check if user already has a linked account for this platform
                this.db.get(
                  `SELECT * FROM external_accounts WHERE user_id = ? AND platform = ?`,
                  [codeRecord.user_id, platform],
                  (err, userAccount) => {
                    if (err) {
                      this.db.run('ROLLBACK');
                      return reject(err);
                    }

                    if (userAccount) {
                      if (userAccount.external_id === externalId) {
                        isUpdate = true;
                        accountIdToUpdate = userAccount.id;
                      } else {
                        this.db.run('ROLLBACK');
                        return resolve({
                          success: false,
                          error: 'You already have a DIFFERENT Telegram account linked.'
                        });
                      }
                    }

                    // 4. Mark code as used
                    this.db.run(
                      `UPDATE pairing_codes SET used = 1 WHERE id = ?`,
                      [codeRecord.id],
                      (err) => {
                        if (err) {
                          this.db.run('ROLLBACK');
                          return reject(err);
                        }

                        // 5. Perform Update or Insert
                        const self = this;
                        if (isUpdate) {
                          console.log(`[ExternalChat Debug] Updating account ${accountIdToUpdate} with new auth token`);
                          this.db.run(
                            `UPDATE external_accounts SET auth_token = ?, external_username = ?, last_message_at = CURRENT_TIMESTAMP WHERE id = ?`,
                            [codeRecord.auth_token, username, accountIdToUpdate],
                            function (err) {
                              if (err) {
                                self.db.run('ROLLBACK');
                                return reject(err);
                              }

                              const accountId = accountIdToUpdate;

                              // 6. Commit transaction
                              self.db.run('COMMIT', (err) => {
                                if (err) {
                                  self.db.run('ROLLBACK');
                                  return reject(err);
                                }

                                resolve({
                                  success: true,
                                  accountId,
                                  userId: codeRecord.user_id
                                });
                              });
                            }
                          );
                        } else {
                          this.db.run(
                            `INSERT INTO external_accounts (user_id, platform, external_id, external_username, auth_token)
                             VALUES (?, ?, ?, ?, ?)`,
                            [codeRecord.user_id, platform, externalId, username, codeRecord.auth_token],
                            function (err) {
                              if (err) {
                                self.db.run('ROLLBACK');
                                return reject(err);
                              }

                              const accountId = this.lastID;

                              // 6. Commit transaction
                              self.db.run('COMMIT', (err) => {
                                if (err) {
                                  self.db.run('ROLLBACK');
                                  return reject(err);
                                }

                                resolve({
                                  success: true,
                                  accountId,
                                  userId: codeRecord.user_id
                                });
                              });
                            }
                          );
                        }
                      }
                    );
                  }
                );
              }
            );
          }
        );
      });
    });
  }

  /**
   * Unlink an external account
   */
  async unlinkAccount(accountId, userId) {
    return new Promise((resolve, reject) => {
      // SECURITY: Verify ownership before deletion
      this.db.run(
        `DELETE FROM external_accounts WHERE id = ? AND user_id = ?`,
        [accountId, userId],
        function (err) {
          if (err) {
            reject(err);
          } else if (this.changes === 0) {
            reject(new Error('Account not found or unauthorized'));
          } else {
            resolve({ success: true });
          }
        }
      );
    });
  }

  /**
   * Get all linked accounts for a user
   */
  async getAccountsByUser(userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM external_accounts WHERE user_id = ? ORDER BY paired_at DESC`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Get account by external ID
   */
  async getAccountByExternalId(platform, externalId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM external_accounts WHERE platform = ? AND external_id = ?`,
        [platform, externalId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  /**
   * Get account by chat ID (for Telegram, chatId === externalId)
   */
  async getAccountByChatId(platform, chatId) {
    return this.getAccountByExternalId(platform, String(chatId));
  }

  /**
   * Route a message from external chat to AGNT
   */
  async routeMessage(platform, externalId, messageText, chatId) {
    // Get account
    const account = await this.getAccountByExternalId(platform, externalId);

    if (!account) {
      if (platform === 'telegram') {
        await this.telegramService.sendMessage(chatId,
          '❌ Your account is not linked to AGNT.\n\n' +
          'To connect:\n' +
          '1. Open AGNT Settings → External Chat\n' +
          '2. Generate a pairing code\n' +
          '3. Send /pair YOUR_CODE here'
        );
      }
      return;
    }

    // Update last_message_at
    this.db.run(
      `UPDATE external_accounts SET last_message_at = datetime('now') WHERE id = ?`,
      [account.id]
    );

    // Start typing indicator
    if (platform === 'telegram') {
      this.telegramService.startTyping(chatId);
    }

    try {
      // Get or create response buffer
      const bufferKey = `${platform}:${externalId}`;
      let buffer = this.activeBuffers.get(bufferKey);

      if (!buffer) {
        buffer = new ResponseBuffer(
          async (text) => {
            if (platform === 'telegram') {
              await this.telegramService.sendMessage(chatId, text);
            }
          },
          500, // 500ms delay
          4096 // max buffer size
        );
        this.activeBuffers.set(bufferKey, buffer);
      }

      // Route to OrchestratorService
      console.log(`[ExternalChat Debug] Routing message for user ${account.user_id}. AuthToken present: ${!!account.auth_token}`);

      const result = await handleExternalChatMessage({
        userId: account.user_id,
        authToken: account.auth_token,
        message: messageText,
        platform,
        externalId,
        onChunk: (chunk) => {
          buffer.add(chunk);
        }
      });

      // Flush any remaining content
      await buffer.flush();

      return result;
    } finally {
      // Stop typing indicator
      if (platform === 'telegram') {
        this.telegramService.stopTyping(chatId);
      }
    }
  }

  /**
   * Notify user via Socket.IO
   */
  notifyUser(userId, event, data) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }

  /**
   * Cleanup expired pairing codes
   */
  cleanupExpiredCodes() {
    this.db.run(
      `DELETE FROM pairing_codes WHERE expires_at < datetime('now')`,
      function (err) {
        if (err) {
          console.error('[ExternalChat] Error cleaning up expired codes:', err);
        } else if (this.changes > 0) {
          console.log(`[ExternalChat] Cleaned up ${this.changes} expired pairing codes`);
        }
      }
    );
  }

  /**
   * Cleanup stale response buffers (inactive for 15 minutes)
   */
  cleanupStaleBuffers() {
    const now = Date.now();
    const staleThreshold = 15 * 60 * 1000; // 15 minutes

    for (const [key, buffer] of this.activeBuffers.entries()) {
      if (now - buffer.lastActivity > staleThreshold) {
        buffer.destroy();
        this.activeBuffers.delete(key);
        console.log(`[ExternalChat] Cleaned up stale buffer: ${key}`);
      }
    }
  }

  /**
   * Get Telegram bot service
   */
  getTelegramService() {
    return this.telegramService;
  }

  /**
   * Check if service is initialized
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Shutdown the service
   */
  async shutdown() {
    // Clear cleanup intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.bufferCleanupInterval) {
      clearInterval(this.bufferCleanupInterval);
    }

    // Cleanup all buffers
    for (const [key, buffer] of this.activeBuffers.entries()) {
      buffer.destroy();
    }
    this.activeBuffers.clear();

    // Shutdown Telegram service
    await this.telegramService.shutdown();

    this.initialized = false;
    this.removeAllListeners();
    console.log('[ExternalChat] Service shutdown complete');
  }
}

export default ExternalChatService;
