import axios from 'axios';

class WhatsAppService {
  constructor() {
    // WhatsApp Business API configuration
    this.baseURL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    this.templateName = process.env.WHATSAPP_TEMPLATE_NAME; // optional
    this.templateLanguage = process.env.WHATSAPP_TEMPLATE_LANG || 'en_US';
    
    // For development/testing, we can use a third-party service like Twilio or a free WhatsApp API
    this.useThirdPartyAPI = process.env.USE_THIRD_PARTY_WHATSAPP === 'true';
    this.thirdPartyURL = process.env.THIRD_PARTY_WHATSAPP_URL;
    this.thirdPartyToken = process.env.THIRD_PARTY_WHATSAPP_TOKEN;
  }

  // Format phone number to international format
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
    
    return cleaned;
  }

  // Send WhatsApp message using official WhatsApp Business API
  async sendOfficialWhatsAppMessage(to, message) {
    try {
      console.log('[WhatsApp API] Formatting phone number:', to);
      const formattedNumber = this.formatPhoneNumber(to);
      console.log('[WhatsApp API] Formatted number:', formattedNumber);
      
      const payload = {
        messaging_product: 'whatsapp',
        to: formattedNumber,
        type: 'text',
        text: {
          body: message
        }
      };

      const apiUrl = `${this.baseURL}/${this.phoneNumberId}/messages`;
      console.log('[WhatsApp API] Sending to URL:', apiUrl);
      console.log('[WhatsApp API] Payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post(
        apiUrl,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken.substring(0, 20)}...`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('[WhatsApp API] ✅ SUCCESS - Message sent!');
      console.log('[WhatsApp API] Response:', response.data);
      return {
        success: true,
        messageId: response.data.messages[0].id,
        data: response.data
      };
    } catch (error) {
      console.error('[WhatsApp API] ❌ ERROR - Failed to send message');
      console.error('[WhatsApp API] Error details:', error.response?.data || error.message);
      if (error.response) {
        console.error('[WhatsApp API] Status:', error.response.status);
        console.error('[WhatsApp API] Headers:', error.response.headers);
      }
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  // Send WhatsApp message using third-party service (for development)
  async sendThirdPartyWhatsAppMessage(to, message) {
    try {
      const formattedNumber = this.formatPhoneNumber(to);
      
      // Example using a generic third-party WhatsApp API
      const payload = {
        phone: formattedNumber,
        message: message,
        apikey: this.thirdPartyToken
      };

      const response = await axios.post(this.thirdPartyURL, payload);

      console.log('Third-party WhatsApp message sent:', response.data);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Error sending third-party WhatsApp message:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  // Main method to send WhatsApp notification
  async sendNotification(phoneNumber, message) {
    console.log('[WhatsApp] sendNotification called');
    console.log('[WhatsApp] Phone:', phoneNumber);
    console.log('[WhatsApp] Message length:', message?.length);
    
    if (!phoneNumber || !message) {
      console.log('[WhatsApp] ERROR: Missing phone number or message');
      return {
        success: false,
        error: 'Phone number and message are required'
      };
    }

    // For development, we can simulate sending or use third-party service
    if (process.env.NODE_ENV === 'development' && !this.accessToken) {
      console.log('DEVELOPMENT MODE - WhatsApp notification would be sent:');
      console.log(`To: ${phoneNumber}`);
      console.log(`Message: ${message}`);
      return {
        success: true,
        simulated: true,
        message: 'WhatsApp notification simulated in development mode'
      };
    }

    // Use third-party service if configured
    if (this.useThirdPartyAPI && this.thirdPartyURL) {
      console.log('[WhatsApp] Using third-party API');
      return await this.sendThirdPartyWhatsAppMessage(phoneNumber, message);
    }

    // Use official WhatsApp Business API
    if (this.accessToken && this.phoneNumberId) {
      console.log('[WhatsApp] Using official WhatsApp Business API');
      console.log('[WhatsApp] Phone Number ID:', this.phoneNumberId);
      return await this.sendOfficialWhatsAppMessage(phoneNumber, message);
    }

    console.log('[WhatsApp] ERROR: WhatsApp API not configured');
    return {
      success: false,
      error: 'WhatsApp API not configured. Please set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID'
    };
  }

  // Send WhatsApp Template message using Cloud API
  async sendTemplateMessage(to, templateName, bodyParameters = []) {
    const formattedNumber = this.formatPhoneNumber(to);

    const payload = {
      messaging_product: 'whatsapp',
      to: formattedNumber,
      type: 'template',
      template: {
        name: templateName,
        language: { code: this.templateLanguage },
        components: bodyParameters.length > 0 ? [
          {
            type: 'body',
            parameters: bodyParameters
          }
        ] : []
      }
    };

    const response = await axios.post(
      `${this.baseURL}/${this.phoneNumberId}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      data: response.data
    };
  }

  // Helper to send a report-submission template with structured params
  async sendReportSubmissionTemplate(to, data) {
    if (!this.templateName) {
      return { success: false, error: 'Template not configured' };
    }

    const { reportId, fullName, locationName, status } = data;
    const params = [
      { type: 'text', text: String(reportId) },
      { type: 'text', text: fullName || '' },
      { type: 'text', text: locationName || 'Location not specified' },
      { type: 'text', text: (status || '').toString() }
    ];

    return await this.sendTemplateMessage(to, this.templateName, params);
  }

  // Helper to send a status update template with structured params
  async sendStatusUpdateTemplate(to, data) {
    if (!this.templateName) {
      return { success: false, error: 'Template not configured' };
    }

    const { reportId, fullName, status, technicianName, locationName } = data;
    const params = [
      { type: 'text', text: String(reportId) },
      { type: 'text', text: fullName || '' },
      { type: 'text', text: status || '' },
      { type: 'text', text: technicianName || 'Our team' },
      { type: 'text', text: locationName || 'Location not specified' }
    ];

    return await this.sendTemplateMessage(to, this.templateName, params);
  }

  // Helper to send a technician assignment template with structured params
  async sendTechnicianAssignmentTemplate(to, data) {
    if (!this.templateName) {
      return { success: false, error: 'Template not configured' };
    }

    const { reportId, technicianName, locationName, reporterName } = data;
    const params = [
      { type: 'text', text: String(reportId) },
      { type: 'text', text: technicianName || '' },
      { type: 'text', text: locationName || 'Location not specified' },
      { type: 'text', text: reporterName || 'User' }
    ];

    return await this.sendTemplateMessage(to, this.templateName, params);
  }

  // Generate message templates for different scenarios
  generateReportSubmissionMessage(reportData) {
    const { reportId, fullName, locationName, status } = reportData;
    
    return `🔧 *BlueGrid Water Management*

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
    const { reportId, technicianName, technicianPhone, locationName, reporterName } = reportData;
    
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
}

export default WhatsAppService;
