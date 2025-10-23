import 'dotenv/config';
import TwilioWhatsAppService from './server/twilio-whatsapp-service.js';

console.log('🧪 Testing Twilio WhatsApp Configuration...\n');

// Display configuration (without showing full token)
console.log('📱 Twilio Configuration:');
console.log('   TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID);
console.log('   TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? '***' + process.env.TWILIO_AUTH_TOKEN.slice(-4) : 'NOT SET');
console.log('   TWILIO_WHATSAPP_FROM:', process.env.TWILIO_WHATSAPP_FROM);
console.log('');

// Create service instance
const whatsappService = new TwilioWhatsAppService();

// Test phone number (replace with your phone number for testing)
const testPhoneNumber = '9876543210'; // Replace with your actual phone number

console.log('📤 Sending test WhatsApp message...');
console.log('   To:', testPhoneNumber);
console.log('');

const testMessage = `🧪 *Test Message from Blue Tap Connect*

This is a test WhatsApp message sent via Twilio.

If you received this message, your WhatsApp integration is working correctly! ✅

Timestamp: ${new Date().toLocaleString()}

*Blue Tap Connect Team*`;

try {
  const result = await whatsappService.sendNotification(testPhoneNumber, testMessage);
  
  if (result.success) {
    console.log('✅ WhatsApp message sent successfully!');
    console.log('   Message SID:', result.messageId);
    console.log('   Status:', result.status);
    console.log('\n🎉 Twilio WhatsApp integration is working!');
    console.log('\n⚠️  IMPORTANT:');
    console.log('   If using Twilio Sandbox, make sure the recipient has:');
    console.log('   1. Sent "join <sandbox-code>" to your Twilio WhatsApp number');
    console.log('   2. Received the confirmation message');
    console.log('   3. Only then can they receive messages from your app');
  } else {
    console.error('❌ Failed to send WhatsApp message');
    console.error('   Error:', result.error);
    console.error('\n⚠️  Troubleshooting:');
    console.error('   1. Check if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are correct');
    console.error('   2. Verify your Twilio account has credits');
    console.error('   3. For Sandbox: Recipient must join sandbox first');
    console.error('   4. Check Twilio Console > Messaging > Logs for details');
  }
} catch (error) {
  console.error('❌ Test failed with exception!');
  console.error('   Error:', error.message);
  console.error('   Stack:', error.stack);
}

console.log('\n📝 Next Steps:');
console.log('   1. If using Sandbox: Have users join by sending WhatsApp to +14155238886');
console.log('   2. Message to send: "join <your-sandbox-code>"');
console.log('   3. Get sandbox code from: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn');
console.log('   4. For production: Apply for WhatsApp Business API approval');
