import 'dotenv/config';
import nodemailer from 'nodemailer';

console.log('🧪 Testing Email Configuration...\n');

// Display configuration (without showing password)
console.log('📧 Email Configuration:');
console.log('   SMTP_HOST:', process.env.SMTP_HOST);
console.log('   SMTP_PORT:', process.env.SMTP_PORT);
console.log('   SMTP_USER:', process.env.SMTP_USER);
console.log('   SMTP_PASSWORD:', process.env.SMTP_PASSWORD ? '***' + process.env.SMTP_PASSWORD.slice(-4) : 'NOT SET');
console.log('   SMTP_FROM_EMAIL:', process.env.SMTP_FROM_EMAIL);
console.log('   SMTP_FROM_NAME:', process.env.SMTP_FROM_NAME);
console.log('');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false
  }
});

console.log('🔍 Step 1: Verifying SMTP connection...');

try {
  await transporter.verify();
  console.log('✅ SMTP connection verified successfully!\n');
  
  console.log('📤 Step 2: Sending test email...');
  
  const info = await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
    to: process.env.SMTP_USER, // Send to yourself
    subject: 'Test Email from Blue Tap Connect',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0ea5e9;">✅ Email Configuration Test</h2>
        <p>This is a test email from Blue Tap Connect backend.</p>
        <p><strong>If you received this email, your email configuration is working correctly!</strong></p>
        <p>Timestamp: ${new Date().toLocaleString()}</p>
      </div>
    `
  });
  
  console.log('✅ Test email sent successfully!');
  console.log('   Message ID:', info.messageId);
  console.log('   Response:', info.response);
  console.log('\n🎉 Email configuration is working perfectly!');
  
} catch (error) {
  console.error('❌ Email test failed!');
  console.error('   Error:', error.message);
  console.error('   Code:', error.code);
  
  if (error.code === 'EAUTH') {
    console.error('\n⚠️  Authentication Error:');
    console.error('   - Check if SMTP_USER and SMTP_PASSWORD are correct');
    console.error('   - For Gmail, make sure you are using an App Password, not your regular password');
    console.error('   - Enable 2-factor authentication and generate an App Password at:');
    console.error('     https://myaccount.google.com/apppasswords');
  } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
    console.error('\n⚠️  Connection Error:');
    console.error('   - Check your internet connection');
    console.error('   - Verify SMTP_HOST and SMTP_PORT are correct');
    console.error('   - Check if firewall is blocking port 587');
  }
  
  process.exit(1);
}

process.exit(0);
