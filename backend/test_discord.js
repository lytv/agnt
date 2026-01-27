/**
 * Test Discord Webhook Messenger
 * File này giúp bạn test công cụ gửi tin nhắn Discord
 */

const discordMessenger = require('./discord_messenger.js');

async function testDiscordWebhook() {
  console.log('=== Bắt đầu test Discord Webhook ===\n');
  
  // Thay thế bằng webhook URL thực tế của bạn
  const WEBHOOK_URL = 'YOUR_DISCORD_WEBHOOK_URL_HERE';
  
  if (WEBHOOK_URL === 'YOUR_DISCORD_WEBHOOK_URL_HERE') {
    console.log('⚠️  VUI LÒNG THAY THẾ WEBHOOK_URL TRONG FILE NÀY!');
    console.log('1. Vào Discord server của bạn');
    console.log('2. Settings → Integrations → Webhooks');
    console.log('3. Tạo webhook mới và copy URL');
    console.log('4. Thay thế YOUR_DISCORD_WEBHOOK_URL_HERE bằng URL thực tế\n');
    return;
  }
  
  try {
    // Test 1: Gửi tin nhắn đơn giản
    console.log('📤 Test 1: Gửi tin nhắn đơn giản...');
    const simpleMessage = await discordMessenger.sendMessage(
      WEBHOOK_URL,
      '🎉 Xin chào! Đây là tin nhắn test từ Discord Webhook Messenger!',
      'Test Bot',
      'https://cdn-icons-png.flaticon.com/512/5968/5968756.png'
    );
    
    console.log('Kết quả:', simpleMessage);
    
    // Đợi 2 giây
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 2: Gửi tin nhắn có embed
    console.log('\n📤 Test 2: Gửi tin nhắn có embed...');
    
    const embed = discordMessenger.createEmbed(
      '✅ Test Thành Công!',
      'Công cụ Discord Webhook Messenger đã hoạt động chính xác!',
      '00ff00', // Màu xanh lá
      [
        { name: '🕐 Thời gian', value: new Date().toLocaleString('vi-VN'), inline: true },
        { name: '📊 Trạng thái', value: 'Hoạt động ổn định', inline: true },
        { name: '⚙️ Phiên bản', value: '1.0.0', inline: true },
        { name: '📝 Mô tả', value: 'Đây là tin nhắn test tự động từ hệ thống' }
      ]
    );
    
    const embedMessage = await discordMessenger.sendEmbed(WEBHOOK_URL, embed);
    console.log('Kết quả:', embedMessage);
    
    // Test 3: Gửi thông báo lỗi (demo)
    console.log('\n📤 Test 3: Gửi thông báo cảnh báo...');
    
    const warningEmbed = discordMessenger.createEmbed(
      '⚠️ Cảnh báo hệ thống',
      'Đây là thông báo cảnh báo demo từ hệ thống',
      'ff9900', // Màu cam
      [
        { name: 'Mức độ', value: 'CẢNH BÁO', inline: true },
        { name: 'Mã lỗi', value: 'TEST-001', inline: true },
        { name: 'Chi tiết', value: 'Đây chỉ là tin nhắn test, không có lỗi thực tế' }
      ]
    );
    
    const warningResult = await discordMessenger.sendEmbed(WEBHOOK_URL, warningEmbed);
    console.log('Kết quả:', warningResult);
    
    console.log('\n🎉 Tất cả test đã hoàn thành!');
    console.log('Kiểm tra kênh Discord của bạn để xem kết quả.');
    
  } catch (error) {
    console.error('❌ Lỗi khi test:', error);
    console.log('\n🔧 Khắc phục sự cố:');
    console.log('1. Kiểm tra webhook URL có đúng không');
    console.log('2. Kiểm tra kết nối internet');
    console.log('3. Đảm bảo webhook chưa bị xóa trong Discord');
  }
}

// Chạy test
testDiscordWebhook();