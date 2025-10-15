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

      console.log('📤 Sending email to:', options.to);
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully:', info.messageId);
      return true;
    } catch (error) {
      console.error('❌ Failed to send email:', error);
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
