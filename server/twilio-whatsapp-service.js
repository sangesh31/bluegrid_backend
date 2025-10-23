import axios from 'axios';

class TwilioWhatsAppService {
  constructor() {
    // Twilio configuration
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.whatsappFrom = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
    
    // Twilio API URL
    this.apiUrl = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    
    // Create basic auth header
    this.authHeader = 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    
    console.log('✅ Twilio WhatsApp Service initialized');
    console.log('   Account SID:', this.accountSid ? this.accountSid.substring(0, 10) + '...' : 'NOT SET');
    console.log('   From Number:', this.whatsappFrom);
  }

  // Format phone number to WhatsApp format
  formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Add country code if not present (assuming India +91)
    if (cleaned.length === 10) {
      cleaned = '91' + cleaned;
    } else if (cleaned.startsWith('0')) {
      cleaned = '91' + cleaned.substring(1);
    } else if (cleaned.startsWith('+91')) {
      cleaned = cleaned.substring(3);
    } else if (cleaned.startsWith('91')) {
      // Already has country code
    }
    
    // Return in WhatsApp format
    return `whatsapp:+${cleaned}`;
  }

  // Send WhatsApp message using Twilio
  async sendWhatsAppMessage(to, message) {
    try {
      if (!this.accountSid || !this.authToken) {
        console.error('[Twilio WhatsApp] ERROR: Twilio credentials not configured');
        return {
          success: false,
          error: 'Twilio credentials not configured'
        };
      }

      console.log('[Twilio WhatsApp] Formatting phone number:', to);
      const formattedTo = this.formatPhoneNumber(to);
      console.log('[Twilio WhatsApp] Formatted to:', formattedTo);
      console.log('[Twilio WhatsApp] From:', this.whatsappFrom);
      console.log('[Twilio WhatsApp] Message length:', message.length);

      // Twilio expects form data, not JSON
      const params = new URLSearchParams();
      params.append('From', this.whatsappFrom);
      params.append('To', formattedTo);
      params.append('Body', message);

      console.log('[Twilio WhatsApp] Sending message...');
      const response = await axios.post(
        this.apiUrl,
        params.toString(),
        {
          headers: {
            'Authorization': this.authHeader,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log('[Twilio WhatsApp] ✅ SUCCESS - Message sent!');
      console.log('[Twilio WhatsApp] Message SID:', response.data.sid);
      console.log('[Twilio WhatsApp] Status:', response.data.status);
      
      return {
        success: true,
        messageId: response.data.sid,
        status: response.data.status,
        data: response.data
      };
    } catch (error) {
      console.error('[Twilio WhatsApp] ❌ ERROR - Failed to send message');
      console.error('[Twilio WhatsApp] Error:', error.response?.data || error.message);
      if (error.response) {
        console.error('[Twilio WhatsApp] Status:', error.response.status);
        console.error('[Twilio WhatsApp] Error details:', error.response.data);
      }
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  // Main method to send WhatsApp notification
  async sendNotification(phoneNumber, message) {
    console.log('[Twilio WhatsApp] sendNotification called');
    console.log('[Twilio WhatsApp] Phone:', phoneNumber);
    console.log('[Twilio WhatsApp] Message preview:', message.substring(0, 100) + '...');
    
    if (!phoneNumber || !message) {
      console.log('[Twilio WhatsApp] ERROR: Missing phone number or message');
      return {
        success: false,
        error: 'Phone number and message are required'
      };
    }

    return await this.sendWhatsAppMessage(phoneNumber, message);
  }

  // Generate message templates for different scenarios
  generateReportSubmissionMessage(reportData) {
    const { reportId, fullName, locationName, status } = reportData;
    
    return `🔧 *BlueGrid*

Hello ${fullName}!

Your pipe damage report has been submitted successfully.

📋 *Report Details:*
• Report ID: ${reportId}
• Location: ${locationName || 'Location not specified'}
• Status: ${status.toUpperCase()}
• Submitted: ${new Date().toLocaleString('en-IN')}

We will assign a maintenance technician soon and keep you updated on the progress.

Thank you for helping us maintain our water infrastructure! 💧

*BlueGrid Team*`;
  }

  generateStatusUpdateMessage(reportData) {
    const { reportId, fullName, status, technicianName, locationName } = reportData;
    
    let statusMessage = '';
    switch (status) {
      case 'assigned':
        statusMessage = `Your report has been assigned to technician ${technicianName}. They will contact you soon.`;
        break;
      case 'in_progress':
        statusMessage = `Work is in progress. Technician ${technicianName} is working on the repair.`;
        break;
      case 'completed':
        statusMessage = `Great news! The repair work has been completed by ${technicianName}.`;
        break;
      case 'approved':
        statusMessage = `Your report has been resolved and approved. Thank you for your patience!`;
        break;
      default:
        statusMessage = `Your report status has been updated to: ${status.toUpperCase()}`;
    }

    return `🔧 *BlueGrid - Status Update*

Hello ${fullName}!

📋 *Report ID:* ${reportId}
📍 *Location:* ${locationName || 'Location not specified'}
🔄 *Status Update:* ${statusMessage}

${status === 'completed' || status === 'approved' ? 
  'If you notice any issues, please submit a new report.' : 
  'We will keep you updated on further progress.'}

*BlueGrid Team* 💧`;
  }

  generateTechnicianAssignmentMessage(reportData) {
    const { reportId, technicianName, locationName, reporterName } = reportData;
    
    return `🔧 *BlueGrid - New Assignment*

Hello ${technicianName}!

You have been assigned a new pipe damage report.

📋 *Report Details:*
• Report ID: ${reportId}
• Location: ${locationName || 'Location not specified'}
• Reporter: ${reporterName}
• Assigned: ${new Date().toLocaleString('en-IN')}

Please accept the assignment in your dashboard and contact the reporter if needed.

*BlueGrid Team* 💧`;
  }

  generateWaterSupplyMessage(data) {
    const { userName, area, status, scheduleId, time } = data;
    
    if (status === 'open') {
      return `💧 *BlueGrid - Water Supply*

Hello ${userName}!

🚰 *Water Supply is NOW OPEN*

📍 Area: ${area}
🆔 Schedule ID: ${scheduleId}
⏰ Opened at: ${time}

Please collect water as needed. Use water responsibly!

*BlueGrid Team*`;
    } else {
      return `💧 *BlueGrid - Water Supply*

Hello ${userName}!

🚫 *Water Supply is NOW CLOSED*

📍 Area: ${area}
🆔 Schedule ID: ${scheduleId}
⏰ Closed at: ${time}

The next schedule will be notified to you in advance.

*BlueGrid Team*`;
    }
  }
}

export default TwilioWhatsAppService;
