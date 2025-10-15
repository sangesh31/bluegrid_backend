import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

class EmailService {
  private transporter: Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      console.log('✅ Email transporter initialized successfully');
      console.log('📧 Email config:', {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER ? '***' + process.env.SMTP_USER.slice(-10) : 'not set',
        from: process.env.SMTP_FROM_EMAIL
      });
    } catch (error) {
      console.error('❌ Failed to initialize email transporter:', error);
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.transporter) {
      console.error('❌ Email transporter not initialized');
      console.error('❌ Check your SMTP environment variables in .env file');
      return false;
    }

    try {
      const mailOptions = {
        from: `"${process.env.SMTP_FROM_NAME || 'Blue Tap Connect'}" <${process.env.SMTP_FROM_EMAIL}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html || options.text,
      };

      console.log('📤 Attempting to send email...');
      console.log('   To:', options.to);
      console.log('   Subject:', options.subject);
      console.log('   From:', mailOptions.from);
      
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully!');
      console.log('   Message ID:', info.messageId);
      console.log('   Response:', info.response);
      return true;
    } catch (error: any) {
      console.error('❌ Failed to send email');
      console.error('   Error message:', error.message);
      console.error('   Error code:', error.code);
      console.error('   Error details:', error);
      
      // Provide helpful error messages
      if (error.code === 'EAUTH') {
        console.error('   ⚠️  Authentication failed. Check SMTP_USER and SMTP_PASSWORD in .env');
      } else if (error.code === 'ECONNECTION') {
        console.error('   ⚠️  Connection failed. Check SMTP_HOST and SMTP_PORT in .env');
      } else if (error.code === 'ETIMEDOUT') {
        console.error('   ⚠️  Connection timeout. Check your internet connection and firewall');
      }
      
      return false;
    }
  }

  async sendWelcomeEmail(to: string, userName: string): Promise<boolean> {
    const subject = 'Welcome to Blue Tap Connect!';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0ea5e9;">Welcome to Blue Tap Connect!</h2>
        <p>Hi ${userName},</p>
        <p>Thank you for signing up with Blue Tap Connect. We're excited to have you on board!</p>
        <p>Our platform helps you manage water resources efficiently and stay connected with your community.</p>
        <p>If you have any questions, feel free to reach out to our support team.</p>
        <br>
        <p>Best regards,</p>
        <p><strong>Blue Tap Connect Team</strong></p>
      </div>
    `;
    return this.sendEmail({ to, subject, html });
  }

  async sendReportStatusEmail(to: string, reportId: string, status: string): Promise<boolean> {
    const subject = `Report ${reportId} Status Updated`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0ea5e9;">Report Status Update</h2>
        <p>Your report (ID: ${reportId}) status has been updated to: <strong>${status}</strong></p>
        <p>You can view more details by logging into your account.</p>
        <br>
        <p>Best regards,</p>
        <p><strong>Blue Tap Connect Team</strong></p>
      </div>
    `;
    return this.sendEmail({ to, subject, html });
  }

  async sendTestEmail(to: string): Promise<boolean> {
    const subject = 'Test Email from Blue Tap Connect';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0ea5e9;">Test Email</h2>
        <p>This is a test email from Blue Tap Connect.</p>
        <p>If you received this, your email configuration is working correctly! ✅</p>
        <p>Timestamp: ${new Date().toLocaleString()}</p>
      </div>
    `;
    return this.sendEmail({ to, subject, html });
  }

  async sendWaterSupplyOpenEmail(to: string, userName: string, area: string, scheduleId: string): Promise<boolean> {
    const subject = `Water Supply Opened - ${area}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
        <div style="background-color: #10b981; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">💧 Water Supply Opened</h1>
        </div>
        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #10b981; margin-top: 0;">Water Supply is Now Active! 🚰</h2>
          <p>Dear <strong>${userName}</strong>,</p>
          <p>The water supply for your area has been opened.</p>
          
          <div style="background-color: #dcfce7; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #166534; margin-top: 0;">Supply Details:</h3>
            <p style="margin: 8px 0;"><strong>Area:</strong> ${area}</p>
            <p style="margin: 8px 0;"><strong>Schedule ID:</strong> ${scheduleId}</p>
            <p style="margin: 8px 0;"><strong>Status:</strong> <span style="color: #10b981; font-weight: bold;">OPEN</span></p>
            <p style="margin: 8px 0;"><strong>Time:</strong> ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}</p>
          </div>
          
          <div style="background-color: #dbeafe; padding: 15px; border-left: 4px solid #0ea5e9; margin: 20px 0;">
            <p style="margin: 0; color: #1e40af;"><strong>💡 Reminder:</strong></p>
            <p style="margin: 10px 0 0 0; color: #1e40af;">Please use water responsibly and store adequate water for your needs.</p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
          
          <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
            Thank you for using Blue Tap Connect<br>
            For any issues, please contact our support team
          </p>
        </div>
      </div>
    `;
    return this.sendEmail({ to, subject, html });
  }

  async sendWaterSupplyCloseEmail(to: string, userName: string, area: string, scheduleId: string): Promise<boolean> {
    const subject = `Water Supply Closed - ${area}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
        <div style="background-color: #ef4444; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">💧 Water Supply Closed</h1>
        </div>
        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #dc2626; margin-top: 0;">Water Supply Has Been Closed 🚫</h2>
          <p>Dear <strong>${userName}</strong>,</p>
          <p>The water supply for your area has been closed.</p>
          
          <div style="background-color: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #991b1b; margin-top: 0;">Supply Details:</h3>
            <p style="margin: 8px 0;"><strong>Area:</strong> ${area}</p>
            <p style="margin: 8px 0;"><strong>Schedule ID:</strong> ${scheduleId}</p>
            <p style="margin: 8px 0;"><strong>Status:</strong> <span style="color: #dc2626; font-weight: bold;">CLOSED</span></p>
            <p style="margin: 8px 0;"><strong>Time:</strong> ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}</p>
          </div>
          
          <div style="background-color: #dbeafe; padding: 15px; border-left: 4px solid #0ea5e9; margin: 20px 0;">
            <p style="margin: 0; color: #1e40af;"><strong>ℹ️ Note:</strong></p>
            <p style="margin: 10px 0 0 0; color: #1e40af;">The next water supply schedule will be notified to you in advance.</p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
          
          <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
            Thank you for using Blue Tap Connect<br>
            For any issues, please contact our support team
          </p>
        </div>
      </div>
    `;
    return this.sendEmail({ to, subject, html });
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      console.error('❌ Email transporter not initialized');
      return false;
    }

    try {
      await this.transporter.verify();
      console.log('✅ Email server connection verified');
      return true;
    } catch (error) {
      console.error('❌ Email server connection failed:', error);
      return false;
    }
  }
}

export default EmailService;
