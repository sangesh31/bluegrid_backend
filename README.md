# BlueGrid Backend API

Backend server for BlueGrid Water Management System.

## Tech Stack
- Node.js + Express
- PostgreSQL (Neon)
- JWT Authentication
- TypeScript

## Environment Variables

Required environment variables for Railway:

```env
PORT=3001
DATABASE_URL=your_neon_database_url
JWT_SECRET=your_jwt_secret_key

# Email Configuration (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM_EMAIL=your_email@gmail.com
SMTP_FROM_NAME=Blue Tap Connect

# WhatsApp API Configuration (Optional)
WHATSAPP_API_URL=https://graph.facebook.com/v21.0
WHATSAPP_ACCESS_TOKEN=your_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_account_id
```

## Local Development

```bash
npm install
npm run dev
```

## Production Deployment

This backend is configured for Railway deployment.

### Deploy to Railway:

1. Push this repository to GitHub
2. Connect Railway to your GitHub repository
3. Add environment variables in Railway dashboard
4. Deploy automatically

## API Endpoints

- `POST /api/auth/signup` - Register user
- `POST /api/auth/signin` - Login
- `GET /api/auth/user` - Get current user
- `GET /api/reports` - Get reports
- `POST /api/reports` - Create report
- `GET /api/schedules` - Get water schedules

## Database Setup

Run the database schema from `neon-schema.sql` in your Neon PostgreSQL database.

Create admin user:
```bash
node create-admin.js
```
