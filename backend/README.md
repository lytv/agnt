# Discord Webhook Messenger

Công cụ gửi tin nhắn đến Discord thông qua Webhook API.

## 📋 Tính năng

- ✅ Gửi tin nhắn văn bản đơn giản
- ✅ Gửi tin nhắn có embed (phong phú)
- ✅ Tùy chỉnh tên người gửi và avatar
- ✅ Hỗ trợ màu sắc và fields trong embed
- ✅ Xử lý lỗi chi tiết
- ✅ Dễ dàng tích hợp

## 🚀 Cài đặt

### 1. Tạo Discord Webhook

1. Vào server Discord của bạn
2. Chọn kênh muốn nhận tin nhắn
3. Vào **Settings** → **Integrations** → **Webhooks**
4. Nhấn **New Webhook**
5. Đặt tên và chọn kênh
6. Copy **Webhook URL**

### 2. Sử dụng trong JavaScript

```javascript
// Import module
const discordMessenger = require('./discord_messenger.js');

// Hoặc nếu dùng ES6 modules
// import discordMessenger from './discord_messenger.js';
```

## 📝 Cách sử dụng

### Gửi tin nhắn đơn giản

```javascript
const result = await discordMessenger.sendMessage(
  'https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN',
  'Xin chào từ Discord Webhook!',
  'Bot Assistant', // Tên tùy chọn
  'https://example.com/avatar.png' // Avatar tùy chọn
);

console.log(result);
// Kết quả: { success: true, messageId: '...', timestamp: '...', message: '...' }
```

### Gửi tin nhắn có Embed

```javascript
// Tạo embed
const embed = discordMessenger.createEmbed(
  'Thông báo quan trọng',
  'Đây là một thông báo từ hệ thống',
  'ff0000', // Màu đỏ (hex)
  [
    { name: 'Trạng thái', value: '✅ Hoạt động', inline: true },
    { name: 'Thời gian', value: new Date().toLocaleString(), inline: true },
    { name: 'Mô tả', value: 'Hệ thống đang chạy ổn định' }
  ]
);

// Gửi embed
const result = await discordMessenger.sendEmbed(
  'https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN',
  embed
);
```

### Tích hợp vào ứng dụng Node.js

```javascript
const discordMessenger = require('./discord_messenger.js');

class NotificationSystem {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
  }

  async sendAlert(message, level = 'info') {
    const colors = {
      info: '0099ff',
      warning: 'ff9900',
      error: 'ff0000',
      success: '00ff00'
    };

    const embed = discordMessenger.createEmbed(
      `Alert: ${level.toUpperCase()}`,
      message,
      colors[level] || '0099ff'
    );

    return await discordMessenger.sendEmbed(this.webhookUrl, embed);
  }

  async sendSimpleNotification(message) {
    return await discordMessenger.sendMessage(
      this.webhookUrl,
      message,
      'System Notifier'
    );
  }
}

// Sử dụng
const notifier = new NotificationSystem('YOUR_WEBHOOK_URL');
notifier.sendAlert('Server đang quá tải!', 'warning');
```

## 🔧 API Reference

### `sendMessage(webhookUrl, message, username, avatarUrl)`

- `webhookUrl` (string): URL webhook Discord
- `message` (string): Nội dung tin nhắn (tối đa 2000 ký tự)
- `username` (string, optional): Tên hiển thị
- `avatarUrl` (string, optional): URL avatar

### `sendEmbed(webhookUrl, embedData)`

- `webhookUrl` (string): URL webhook Discord
- `embedData` (object): Dữ liệu embed Discord

### `createEmbed(title, description, color, fields)`

- `title` (string): Tiêu đề embed
- `description` (string): Mô tả
- `color` (string): Màu sắc (hex, ví dụ: 'ff0000')
- `fields` (array): Mảng các field object

## 🎯 Ví dụ thực tế

### 1. Thông báo deploy thành công

```javascript
async function sendDeployNotification(version, environment, status) {
  const embed = discordMessenger.createEmbed(
    `🚀 Deploy ${status}`,
    `Phiên bản ${version} đã được deploy lên ${environment}`,
    status === 'success' ? '00ff00' : 'ff0000',
    [
      { name: 'Phiên bản', value: version, inline: true },
      { name: 'Môi trường', value: environment, inline: true },
      { name: 'Thời gian', value: new Date().toLocaleString(), inline: true },
      { name: 'Trạng thái', value: status === 'success' ? '✅ Thành công' : '❌ Thất bại' }
    ]
  );

  return await discordMessenger.sendEmbed('YOUR_WEBHOOK_URL', embed);
}
```

### 2. Thông báo lỗi hệ thống

```javascript
async function sendErrorAlert(error, context) {
  const embed = discordMessenger.createEmbed(
    '🚨 Lỗi hệ thống',
    `Đã xảy ra lỗi trong ${context}`,
    'ff0000',
    [
      { name: 'Lỗi', value: error.message },
      { name: 'Stack Trace', value: '```' + error.stack.substring(0, 1000) + '```' },
      { name: 'Thời gian', value: new Date().toISOString() }
    ]
  );

  return await discordMessenger.sendEmbed('YOUR_WEBHOOK_URL', embed);
}
```

## ⚠️ Lưu ý

1. **Giới hạn rate**: Discord có giới hạn 30 requests/60 giây cho mỗi webhook
2. **Kích thước tin nhắn**: Tối đa 2000 ký tự cho tin nhắn thường
3. **Bảo mật**: Không chia sẻ webhook URL công khai
4. **Embed limits**: Tối đa 10 fields, mỗi field 256 ký tự

## 🐛 Xử lý lỗi

```javascript
try {
  const result = await discordMessenger.sendMessage(webhookUrl, message);
  if (!result.success) {
    console.error('Lỗi gửi tin nhắn:', result.error);
  }
} catch (error) {
  console.error('Lỗi không xác định:', error);
}
```

## 📄 License

MIT License - Tự do sử dụng và chỉnh sửa