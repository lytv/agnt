/**
 * Discord Webhook Messenger
 * Tool để gửi tin nhắn đến Discord thông qua webhook
 * 
 * Cách sử dụng:
 * 1. Tạo webhook trong Discord: Settings → Integrations → Webhooks
 * 2. Copy webhook URL
 * 3. Sử dụng hàm sendMessage() hoặc sendEmbed()
 */

const discordMessenger = {
  /**
   * Gửi tin nhắn đến Discord webhook
   * @param {string} webhookUrl - URL webhook Discord
   * @param {string} message - Nội dung tin nhắn
   * @param {string} [username] - Tên người gửi (tùy chọn)
   * @param {string} [avatarUrl] - URL avatar (tùy chọn)
   * @returns {Promise<object>} - Kết quả từ Discord API
   */
  async sendMessage(webhookUrl, message, username, avatarUrl) {
    try {
      const payload = {
        content: message
      };
      
      if (username) {
        payload.username = username;
      }
      
      if (avatarUrl) {
        payload.avatar_url = avatarUrl;
      }
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Discord API error: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      return {
        success: true,
        messageId: result.id,
        timestamp: result.timestamp,
        message: 'Tin nhắn đã được gửi thành công!'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Gửi tin nhắn thất bại'
      };
    }
  },
  
  /**
   * Gửi tin nhắn có embed (phong phú hơn)
   * @param {string} webhookUrl - URL webhook Discord
   * @param {object} embedData - Dữ liệu embed
   * @returns {Promise<object>} - Kết quả từ Discord API
   */
  async sendEmbed(webhookUrl, embedData) {
    try {
      const payload = {
        embeds: [embedData]
      };
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Discord API error: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      return {
        success: true,
        messageId: result.id,
        timestamp: result.timestamp,
        message: 'Embed đã được gửi thành công!'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Gửi embed thất bại'
      };
    }
  },
  
  /**
   * Tạo embed mẫu
   * @param {string} title - Tiêu đề embed
   * @param {string} description - Mô tả
   * @param {string} color - Màu sắc (hex)
   * @param {Array} fields - Các trường thông tin
   * @returns {object} - Embed object
   */
  createEmbed(title, description, color = '0099ff', fields = []) {
    return {
      title: title,
      description: description,
      color: parseInt(color.replace('#', ''), 16),
      fields: fields,
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Sent via Discord Webhook'
      }
    };
  }
};

// Export module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = discordMessenger;
}

// Ví dụ sử dụng (chạy khi gọi trực tiếp)
if (typeof require !== 'undefined' && require.main === module) {
  (async () => {
    console.log("=== Discord Webhook Messenger Demo ===");
    console.log("Để sử dụng, hãy thay thế YOUR_WEBHOOK_URL bằng webhook Discord thực tế của bạn");
    console.log("\nCác hàm có sẵn:");
    console.log("1. discordMessenger.sendMessage(webhookUrl, message, username, avatarUrl)");
    console.log("2. discordMessenger.sendEmbed(webhookUrl, embedData)");
    console.log("3. discordMessenger.createEmbed(title, description, color, fields)");
    
    // Tạo ví dụ embed
    const exampleEmbed = discordMessenger.createEmbed(
      'Demo Embed',
      'Đây là một embed demo từ Discord Webhook Messenger',
      '00ff00',
      [
        { name: 'Tác giả', value: 'Discord Messenger Tool', inline: true },
        { name: 'Phiên bản', value: '1.0.0', inline: true },
        { name: 'Mô tả', value: 'Công cụ gửi tin nhắn Discord tự động' }
      ]
    );
    
    console.log("\n=== Ví dụ Embed ===");
    console.log(JSON.stringify(exampleEmbed, null, 2));
  })();
}