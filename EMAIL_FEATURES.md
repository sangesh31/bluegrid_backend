# 📧 Automatic Email Notification System

## Configuration

Your email system is **already configured** and ready to use with the following settings:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=sabareeshwarans3@gmail.com
SMTP_PASSWORD=ibqi qsrq marz phtq
SMTP_FROM_EMAIL=sabareeshwarans3@gmail.com
SMTP_FROM_NAME=Blue Tap Connect
```

## ✅ Automatic Email Features

The system automatically sends emails to users in the following scenarios:

### 1. **Report Submission** 📝
**When:** A user submits a new pipe report
**Recipient:** The user who submitted the report
**Content:**
- Report ID and status (Pending)
- Submitted details (name, mobile, location, notes)
- What happens next (review process, technician assignment)
- Timeline expectations

### 2. **Technician Assignment** 👨‍🔧
**When:** A Panchayat Officer assigns a technician to a report
**Recipient:** The user who submitted the report
**Content:**
- Report status update (Assigned)
- Assigned technician name and contact
- Next steps in the process

### 3. **Work Started** 🔧
**When:** A technician accepts the assignment and starts work
**Recipient:** The user who submitted the report
**Content:**
- Report status update (In Progress)
- Technician details and contact information
- Work progress notification

### 4. **Work Completed** ✅
**When:** A technician marks the work as complete
**Recipient:** The user who submitted the report
**Content:**
- Report status update (Awaiting Approval)
- Completion notes from technician
- Next steps (approval process)
- Note about verifying the work

### 5. **Report Approved** 🎉
**When:** A Panchayat Officer approves the completed work
**Recipient:** The user who submitted the report
**Content:**
- Report status update (Approved)
- Approval confirmation
- Officer name who approved
- Closure notification

### 6. **Report Rejected** ⚠️
**When:** A Panchayat Officer rejects the completed work
**Recipient:** The user who submitted the report
**Content:**
- Report status update (Requires Attention)
- Rejection reason
- What happens next (additional work needed)

### 7. **Water Supply Schedule Created** 💧
**When:** A Water Flow Controller creates a new water supply schedule
**Recipient:** Residents in the scheduled area
**Content:**
- Schedule details (area, timing)
- Scheduled open and close times
- Important reminders about water storage

### 8. **Water Supply Opened** 🚰
**When:** A Water Flow Controller opens the water supply
**Recipient:** Residents in the area
**Content:**
- Water supply status (OPEN)
- Area and schedule ID
- Current timestamp
- Reminder to use water responsibly

### 9. **Water Supply Closed** 🚫
**When:** A Water Flow Controller closes the water supply
**Recipient:** Residents in the area
**Content:**
- Water supply status (CLOSED)
- Area and schedule ID
- Current timestamp
- Information about next schedule

### 10. **Welcome Email** 👋
**When:** Can be triggered manually for new users
**Recipient:** New users
**Content:**
- Welcome message
- Platform introduction
- Support information

## 🔧 Testing Email Configuration

To test if your email configuration is working:

1. **Run the test script:**
   ```bash
   cd backend
   node test-email.js
   ```

2. **Or use the API endpoint:**
   ```bash
   POST /api/email/test
   {
     "to": "recipient@example.com"
   }
   ```

3. **Verify connection:**
   ```bash
   GET /api/email/verify
   ```

## 📊 Email Service API Endpoints

### Test Email
```http
POST /api/email/test
Authorization: Bearer <token>
Content-Type: application/json

{
  "to": "test@example.com"
}
```

### Send Custom Email
```http
POST /api/email/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "to": "user@example.com",
  "subject": "Your Subject",
  "html": "<h1>Your HTML content</h1>"
}
```

### Send Welcome Email
```http
POST /api/email/welcome
Authorization: Bearer <token>
Content-Type: application/json

{
  "to": "newuser@example.com",
  "userName": "John Doe"
}
```

### Verify Email Connection
```http
GET /api/email/verify
Authorization: Bearer <token>
```

## 🎨 Email Templates

All emails use professional HTML templates with:
- **Blue Tap Connect branding**
- **Responsive design** (works on mobile and desktop)
- **Color-coded status indicators**
- **Clear call-to-action sections**
- **Professional formatting**

### Color Scheme:
- 🔵 Blue (#0ea5e9) - Primary brand color
- 🟢 Green (#10b981) - Success/Approved
- 🟡 Yellow (#f59e0b) - Pending/Warning
- 🔴 Red (#ef4444) - Rejected/Closed

## 🔒 Security Notes

1. **App Password:** The password `ibqi qsrq marz phtq` is a Gmail App Password (not your regular Gmail password)
2. **TLS Encryption:** All emails are sent over secure TLS connection
3. **Authentication:** Email endpoints require JWT authentication
4. **Non-blocking:** Email sending is asynchronous and doesn't block API responses

## 🚀 How It Works

1. **User Action:** User performs an action (submits report, technician completes work, etc.)
2. **API Response:** Server immediately responds to the user
3. **Async Email:** Email is sent asynchronously in the background using `setImmediate()`
4. **Error Handling:** If email fails, it's logged but doesn't affect the main operation
5. **User Notification:** User receives a beautifully formatted email

## 📝 Email Service Code Location

- **Service Class:** `backend/server/email-service.ts`
- **Integration:** `backend/server/index.ts`
- **Test Script:** `backend/test-email.js`
- **Configuration:** `backend/.env`

## ✨ Features

- ✅ Automatic email notifications for all major events
- ✅ Beautiful HTML email templates
- ✅ Professional branding
- ✅ Mobile-responsive design
- ✅ Error handling and logging
- ✅ Non-blocking async sending
- ✅ Test endpoints for verification
- ✅ Custom email support

## 🎯 Next Steps

Your email system is **fully configured and operational**. Emails will be sent automatically when:
- Users submit reports
- Technicians are assigned
- Work is completed or approved
- Water supply schedules change

**No additional configuration needed!** The system is ready to send emails to all users automatically.
