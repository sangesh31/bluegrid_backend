import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import TwilioWhatsAppService from './twilio-whatsapp-service.js';
import EmailService from './email-service.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'report-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 40 * 1024 * 1024 }, // 40MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://localhost:8081',
    'http://localhost:8082',
    'https://web-production-d3e72.up.railway.app',
    /\.netlify\.app$/  // Allow all Netlify domains
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
// Parse JSON for most routes
app.use(express.json());
// Parse URL-encoded bodies (for form data)
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Database connection with optimized pooling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GLsYC61DhqOm@ep-curly-rain-adwexyl1-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: {
    rejectUnauthorized: false
  },
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection not available
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// Initialize Twilio WhatsApp service
const whatsappService = new TwilioWhatsAppService();
// Log essential Twilio WhatsApp config presence (without secrets)
console.log('Twilio WhatsApp config:', {
  accountSid: process.env.TWILIO_ACCOUNT_SID ? 'set' : 'missing',
  authToken: process.env.TWILIO_AUTH_TOKEN ? 'set' : 'missing',
  whatsappFrom: process.env.TWILIO_WHATSAPP_FROM ? 'set' : 'missing'
});

// Initialize Email service
const emailService = new EmailService();
console.log('Email config:', {
  host: process.env.SMTP_HOST ? 'set' : 'missing',
  port: process.env.SMTP_PORT ? 'set' : 'missing',
  user: process.env.SMTP_USER ? 'set' : 'missing',
  from: process.env.SMTP_FROM_EMAIL ? 'set' : 'missing'
});

// Middleware to verify JWT token
const authenticateToken = async (req: any, res: any, next: any) => {
  console.log('🔐 Authentication middleware called for:', req.path);
  
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  console.log('Auth header:', authHeader ? 'Present' : 'Missing');
  console.log('Token:', token ? 'Present' : 'Missing');

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    console.log('✅ Token decoded:', { userId: decoded.userId, email: decoded.email });
    
    // Check if session exists
    const sessionResult = await pool.query(
      'SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()',
      [token]
    );
    
    console.log('Session check result:', sessionResult.rows.length > 0 ? 'Valid session' : 'No valid session');

    if (sessionResult.rows.length === 0) {
      console.log('❌ Invalid or expired session');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = decoded;
    req.token = token;
    console.log('✅ Authentication successful, proceeding...');
    next();
  } catch (error) {
    console.error('❌ Token verification error:', error.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Root route
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'BlueGrid Backend API is running',
    version: '1.0.0',
    uptime: process.uptime(),
    endpoints: {
      health: '/api/health',
      auth: '/api/auth/*',
      reports: '/api/reports',
      schedules: '/api/schedules',
      profile: '/api/profile'
    }
  });
});

// Health check with DB ping
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      message: 'Server is running',
      database: 'connected',
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      message: 'Database connection failed',
      database: 'disconnected'
    });
  }
});

// Keep-alive endpoint to prevent cold starts
app.get('/api/ping', (req, res) => {
  res.json({ pong: true, timestamp: Date.now() });
});

// Auth endpoints
// Store OTPs temporarily (in production, use Redis)
const otpStore = new Map<string, { otp: string; expires: number; userData: any }>();

// Send OTP endpoint
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email, fullName } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if email already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP (expires in 10 minutes)
    otpStore.set(email, {
      otp,
      expires: Date.now() + 10 * 60 * 1000,
      userData: req.body
    });

    console.log(`OTP for ${email}: ${otp}`); // For development - remove in production

    // Send OTP email
    const emailSent = await emailService.sendEmail({
      to: email,
      subject: 'BlueGrid - Email Verification OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1e40af; text-align: center;">BlueGrid Water Management</h2>
          <p>Hello ${fullName || 'User'},</p>
          <p>Your OTP for email verification is:</p>
          <div style="background: #f3f4f6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 8px;">
            ${otp}
          </div>
          <p style="color: #6b7280;">This OTP will expire in 10 minutes.</p>
          <p style="color: #6b7280;">If you didn't request this, please ignore this email.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">BlueGrid Water Management System</p>
        </div>
      `
    });

    res.json({ 
      success: true, 
      message: 'OTP sent to your email',
      expiresIn: 600
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP and create account
app.post('/api/auth/verify-otp-signup', async (req, res) => {
  try {
    const { email, otp, password, fullName, phone, address } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    // Check OTP
    const storedData = otpStore.get(email);
    
    if (!storedData) {
      return res.status(400).json({ error: 'OTP expired or not found' });
    }

    if (Date.now() > storedData.expires) {
      otpStore.delete(email);
      return res.status(400).json({ error: 'OTP expired' });
    }

    if (storedData.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // OTP verified, delete it
    otpStore.delete(email);

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    const userResult = await pool.query(
      'INSERT INTO users (email, password_hash, email_verified) VALUES ($1, $2, $3) RETURNING id, email, created_at, email_verified',
      [email, passwordHash, true]
    );

    const user = userResult.rows[0];

    // Create profile
    await pool.query(
      'INSERT INTO profiles (id, full_name, phone, address, role) VALUES ($1, $2, $3, $4, $5)',
      [user.id, fullName, phone || null, address || null, 'resident']
    );

    // Create JWT token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '7d',
    });

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Store session
    await pool.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt.toISOString()]
    );

    res.json({ user, token, expiresAt: expiresAt.toISOString() });
  } catch (error: any) {
    console.error('Verify OTP signup error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, fullName, phone, address } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Email, password, and full name are required' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    const userResult = await pool.query(
      'INSERT INTO users (email, password_hash, email_verified) VALUES ($1, $2, $3) RETURNING id, email, created_at, email_verified',
      [email, passwordHash, false]
    );

    const user = userResult.rows[0];

    // Create profile with full name, phone, and address
    await pool.query(
      'INSERT INTO profiles (id, full_name, phone, address, role) VALUES ($1, $2, $3, $4, $5)',
      [user.id, fullName, phone || null, address || null, 'resident']
    );

    // Create JWT token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '7d',
    });

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Store session
    await pool.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt.toISOString()]
    );

    res.json({ user, token, expiresAt: expiresAt.toISOString() });
  } catch (error: any) {
    console.error('Signup error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Get user
    const userResult = await pool.query(
      'SELECT id, email, password_hash, created_at, email_verified FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userResult.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last sign in
    await pool.query(
      'UPDATE users SET last_sign_in_at = NOW() WHERE id = $1',
      [user.id]
    );

    // Create JWT token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '7d',
    });

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Store session
    await pool.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt.toISOString()]
    );

    const { password_hash, ...userWithoutPassword } = user;

    res.json({ user: userWithoutPassword, token, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/signout', authenticateToken, async (req: any, res) => {
  try {
    await pool.query('DELETE FROM sessions WHERE token = $1', [req.token]);
    res.json({ message: 'Signed out successfully' });
  } catch (error) {
    console.error('Signout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/user', authenticateToken, async (req: any, res) => {
  try {
    const userResult = await pool.query(
      'SELECT id, email, created_at, email_verified FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: userResult.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Profile endpoints
app.get('/api/profile', authenticateToken, async (req: any, res) => {
  try {
    let result = await pool.query(
      'SELECT * FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    // If profile doesn't exist, create a default one for existing users
    if (result.rows.length === 0) {
      console.log('Profile not found for user:', req.user.userId, 'Creating default profile...');
      
      // Get user email for the profile
      const userResult = await pool.query(
        'SELECT email FROM users WHERE id = $1',
        [req.user.userId]
      );
      
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Create default profile for existing user
      const createResult = await pool.query(
        'INSERT INTO profiles (id, full_name, phone, address, role) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [req.user.userId, userResult.rows[0].email.split('@')[0], null, null, 'resident']
      );
      
      result = createResult;
      console.log('Default profile created for user:', req.user.userId);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/profile', authenticateToken, async (req: any, res) => {
  try {
    const { full_name, phone, address } = req.body;
    
    const result = await pool.query(
      'UPDATE profiles SET full_name = COALESCE($1, full_name), phone = COALESCE($2, phone), address = COALESCE($3, address) WHERE id = $4 RETURNING *',
      [full_name, phone, address, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Pipe reports endpoints
app.post('/api/reports', authenticateToken, upload.single('photo'), async (req: any, res) => {
  try {
    console.log('=== Report Submission Request ===');
    console.log('User ID:', req.user?.userId);
    console.log('Request body:', req.body);
    console.log('File:', req.file ? 'Present' : 'Not provided');
    
    const { full_name, mobile_number, location_lat, location_lng, location_name, notes } = req.body;
    const photo_url = req.file ? `/uploads/${req.file.filename}` : null;

    console.log('Parsed fields:', { full_name, mobile_number, location_lat, location_lng, location_name, notes });

    // Validate required fields
    if (!full_name || !mobile_number) {
      console.log('Validation failed: missing required fields');
      return res.status(400).json({ 
        error: 'Full name and mobile number are required',
        received: { full_name: !!full_name, mobile_number: !!mobile_number }
      });
    }

    // First, try to add the columns if they don't exist and modify address column
    try {
      console.log('Adding missing columns if needed...');
      await pool.query('ALTER TABLE pipe_reports ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20)');
      await pool.query('ALTER TABLE pipe_reports ADD COLUMN IF NOT EXISTS location_name TEXT');
      
      // Make address column nullable if it exists
      await pool.query('ALTER TABLE pipe_reports ALTER COLUMN address DROP NOT NULL');
      console.log('Columns check completed successfully');
    } catch (alterError) {
      console.log('Schema modification info:', alterError.message);
    }

    // Use location_name as address fallback for backward compatibility
    const address_fallback = location_name || 'Location not specified';
    console.log('Using address fallback:', address_fallback);

    console.log('Inserting report into database...');
    const result = await pool.query(
      'INSERT INTO pipe_reports (user_id, full_name, address, mobile_number, location_lat, location_lng, location_name, photo_url, notes, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [req.user.userId, full_name, address_fallback, mobile_number, location_lat || null, location_lng || null, location_name || null, photo_url, notes || null, 'pending']
    );

    const createdReport = result.rows[0];
    console.log('Report created successfully:', createdReport.id);

    // Send response immediately
    res.json(createdReport);

    // Send notifications asynchronously (non-blocking)
    setImmediate(async () => {
      // Send WhatsApp notification
      try {
        if (mobile_number) {
          console.log('Sending WhatsApp notification...');
          const reportData = {
            reportId: createdReport.id,
            fullName: full_name,
            locationName: location_name || 'Location not specified',
            status: 'pending'
          };

          const message = whatsappService.generateReportSubmissionMessage(reportData);
          const whatsappResult = await whatsappService.sendNotification(mobile_number, message);
          
          if (whatsappResult.success) {
            console.log('WhatsApp notification sent successfully for report:', createdReport.id);
          } else {
            console.error('Failed to send WhatsApp notification:', whatsappResult.error);
          }
        }
      } catch (whatsappError) {
        console.error('WhatsApp notification error:', whatsappError);
      }

      // Send email notification
      try {
        const userResult = await pool.query(
          'SELECT email FROM users WHERE id = $1',
          [req.user.userId]
        );
        
        if (userResult.rows.length > 0) {
          const userEmail = userResult.rows[0].email;
          console.log('Sending email to:', userEmail);
          
          const subject = `Report Submitted Successfully - ID: ${createdReport.id}`;
          const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
              <div style="background-color: #0ea5e9; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0;">BlueGrid</h1>
              </div>
              <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
                <h2 style="color: #0ea5e9; margin-top: 0;">Report Submitted Successfully! ✅</h2>
                <p>Dear <strong>${full_name}</strong>,</p>
                <p>Your water pipe issue report has been successfully submitted and received. Our team will review it shortly.</p>
                
                <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #334155; margin-top: 0;">Report Details:</h3>
                  <p style="margin: 8px 0;"><strong>Report ID:</strong> ${createdReport.id}</p>
                  <p style="margin: 8px 0;"><strong>Status:</strong> <span style="color: #f59e0b; font-weight: bold;">Pending</span></p>
                  <p style="margin: 8px 0;"><strong>Submitted By:</strong> ${full_name}</p>
                  <p style="margin: 8px 0;"><strong>Mobile Number:</strong> ${mobile_number}</p>
                  <p style="margin: 8px 0;"><strong>Location:</strong> ${location_name || 'Not specified'}</p>
                  ${notes ? `<p style="margin: 8px 0;"><strong>Notes:</strong> ${notes}</p>` : ''}
                  <p style="margin: 8px 0;"><strong>Submitted On:</strong> ${new Date().toLocaleString()}</p>
                </div>
                
                <div style="background-color: #dbeafe; padding: 15px; border-left: 4px solid #0ea5e9; margin: 20px 0;">
                  <p style="margin: 0; color: #1e40af;"><strong>What happens next?</strong></p>
                  <ul style="color: #1e40af; margin: 10px 0;">
                    <li>Our team will review your report</li>
                    <li>A maintenance technician will be assigned</li>
                    <li>You'll receive updates via email and WhatsApp</li>
                    <li>You can track your report status in the app</li>
                  </ul>
                </div>
                
                <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
                  You will receive email notifications when:
                </p>
                <ul style="color: #64748b; font-size: 14px;">
                  <li>A technician is assigned to your report</li>
                  <li>Work begins on your issue</li>
                  <li>Your issue is resolved</li>
                </ul>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
                
                <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
                  Thank you for using BlueGrid<br>
                  For any questions, please contact our support team
                </p>
              </div>
            </div>
          `;
          
          const emailSuccess = await emailService.sendEmail({
            to: userEmail,
            subject: subject,
            html: html
          });
          
          if (emailSuccess) {
            console.log('✅ Email notification sent successfully to:', userEmail);
          } else {
            console.error('❌ Failed to send email notification to:', userEmail);
          }
        }

        // Send email to all Panchayat Officers
        const officersResult = await pool.query(
          'SELECT u.email, p.full_name FROM users u JOIN profiles p ON u.id = p.id WHERE p.role = $1',
          ['panchayat_officer']
        );

        if (officersResult.rows.length > 0) {
          for (const officer of officersResult.rows) {
            const officerSubject = `New Report Submitted - ID: ${createdReport.id}`;
            const officerHtml = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
                <div style="background-color: #0ea5e9; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0;">BlueGrid</h1>
                </div>
                <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
                  <h2 style="color: #f59e0b; margin-top: 0;">New Report Submitted 📋</h2>
                  <p>Dear <strong>${officer.full_name}</strong>,</p>
                  <p>A new water pipe issue report has been submitted and requires your attention.</p>
                  
                  <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #334155; margin-top: 0;">Report Details:</h3>
                    <p style="margin: 8px 0;"><strong>Report ID:</strong> ${createdReport.id}</p>
                    <p style="margin: 8px 0;"><strong>Status:</strong> <span style="color: #f59e0b; font-weight: bold;">Pending</span></p>
                    <p style="margin: 8px 0;"><strong>Submitted By:</strong> ${full_name}</p>
                    <p style="margin: 8px 0;"><strong>Contact:</strong> ${mobile_number}</p>
                    <p style="margin: 8px 0;"><strong>Location:</strong> ${location_name || 'Not specified'}</p>
                    ${notes ? `<p style="margin: 8px 0;"><strong>Notes:</strong> ${notes}</p>` : ''}
                    <p style="margin: 8px 0;"><strong>Submitted On:</strong> ${new Date().toLocaleString()}</p>
                  </div>
                  
                  <div style="background-color: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0;">
                    <p style="margin: 0; color: #92400e;"><strong>Action Required:</strong></p>
                    <ul style="color: #92400e; margin: 10px 0;">
                      <li>Review the report details</li>
                      <li>Assign a maintenance technician</li>
                      <li>Monitor the progress until completion</li>
                    </ul>
                  </div>
                  
                  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
                  
                  <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
                    BlueGrid - Panchayat Officer Dashboard<br>
                    Please log in to assign a technician
                  </p>
                </div>
              </div>
            `;

            const officerEmailSuccess = await emailService.sendEmail({
              to: officer.email,
              subject: officerSubject,
              html: officerHtml
            });

            if (officerEmailSuccess) {
              console.log('✅ Report notification sent to Panchayat Officer:', officer.email);
            } else {
              console.error('❌ Failed to send notification to Panchayat Officer:', officer.email);
            }
          }
        }
      } catch (emailError) {
        console.error('Email notification error:', emailError);
      }
    });
  } catch (error) {
    console.error('=== CREATE REPORT ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Send more detailed error information in development
    if (process.env.NODE_ENV === 'development') {
      return res.status(500).json({ 
        error: 'Internal server error', 
        details: error.message,
        stack: error.stack
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to submit report. Please try again.',
      details: 'An unexpected error occurred while processing your request.'
    });
  }
});

app.get('/api/reports', authenticateToken, async (req: any, res) => {
  try {
    // Query the base table directly to ensure we get all columns
    const result = await pool.query(
      'SELECT * FROM pipe_reports WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/reports/all', authenticateToken, async (req: any, res) => {
  try {
    // Check if user is panchayat officer
    const profileResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (profileResult.rows.length === 0 || profileResult.rows[0].role !== 'panchayat_officer') {
      return res.status(403).json({ error: 'Access denied. Panchayat Officer role required.' });
    }

    // Query with JOIN to get technician name
    const result = await pool.query(
      `SELECT 
        r.*,
        t.full_name as technician_name,
        a.full_name as approved_by_name
      FROM pipe_reports r
      LEFT JOIN profiles t ON r.assigned_technician_id = t.id
      LEFT JOIN profiles a ON r.approved_by = a.id
      ORDER BY r.created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get all reports error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Water schedules endpoints
app.get('/api/schedules', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM schedules_with_details WHERE is_active = true ORDER BY scheduled_open_time DESC LIMIT 20'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get schedules error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all schedules with detailed information (Panchayat Officer only)
app.get('/api/schedules/all', authenticateToken, async (req: any, res) => {
  try {
    // Check if user is panchayat officer
    const profileResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (profileResult.rows.length === 0 || profileResult.rows[0].role !== 'panchayat_officer') {
      return res.status(403).json({ error: 'Access denied. Panchayat Officer role required.' });
    }

    // Use the view for easier querying
    const result = await pool.query(
      'SELECT * FROM schedules_with_details ORDER BY created_at DESC'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get all schedules error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/schedules/today', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const result = await pool.query(
      'SELECT * FROM water_schedules WHERE scheduled_open_time >= $1 AND scheduled_open_time < $2 ORDER BY scheduled_open_time ASC',
      [today.toISOString(), tomorrow.toISOString()]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get today schedules error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create water schedule (Panchayat Officer only)
app.post('/api/schedules', authenticateToken, async (req: any, res) => {
  try {
    // Check if user is panchayat officer
    const profileResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (profileResult.rows.length === 0 || profileResult.rows[0].role !== 'panchayat_officer') {
      return res.status(403).json({ error: 'Access denied. Panchayat Officer role required.' });
    }

    const { area, scheduled_open_time, scheduled_close_time } = req.body;

    if (!area || !scheduled_open_time || !scheduled_close_time) {
      return res.status(400).json({ error: 'Area, open time, and close time are required' });
    }

    const result = await pool.query(
      'INSERT INTO water_schedules (area, scheduled_open_time, scheduled_close_time, is_active, interrupted) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [area, scheduled_open_time, scheduled_close_time, false, false]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Create schedule error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign technician to report (Panchayat Officer only)
app.put('/api/reports/:reportId/assign', authenticateToken, async (req: any, res) => {
  try {
    // Check if user is panchayat officer
    const profileResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (profileResult.rows.length === 0 || profileResult.rows[0].role !== 'panchayat_officer') {
      return res.status(403).json({ error: 'Access denied. Panchayat Officer role required.' });
    }

    const { reportId } = req.params;
    const { assigned_technician_id, status } = req.body;

    if (!assigned_technician_id) {
      return res.status(400).json({ error: 'Technician ID is required' });
    }

    const result = await pool.query(
      'UPDATE pipe_reports SET assigned_technician_id = $1, status = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [assigned_technician_id, status || 'assigned', reportId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const updatedReport = result.rows[0];

    // Send response immediately
    res.json(updatedReport);

    // Send notifications asynchronously (non-blocking)
    setImmediate(async () => {
      // Send WhatsApp notifications
      try {
        const technicianResult = await pool.query(
          'SELECT p.full_name, p.phone FROM profiles p WHERE p.id = $1',
          [assigned_technician_id]
        );

        if (technicianResult.rows.length > 0 && updatedReport.mobile_number) {
          const technician = technicianResult.rows[0];
          
          // Send notification to the reporter
          const reporterData = {
            reportId: updatedReport.id,
            fullName: updatedReport.full_name,
            status: 'assigned',
            technicianName: technician.full_name,
            locationName: updatedReport.location_name || updatedReport.address
          };

          const reporterMessage = whatsappService.generateStatusUpdateMessage(reporterData);
          const reporterNotification = await whatsappService.sendNotification(
            updatedReport.mobile_number, 
            reporterMessage
          );
          
          if (reporterNotification.success) {
            console.log('WhatsApp notification sent to reporter for assignment:', updatedReport.id);
          }

          // Send notification to the technician
          if (technician.phone) {
            const technicianData = {
              reportId: updatedReport.id,
              technicianName: technician.full_name,
              locationName: updatedReport.location_name || updatedReport.address,
              reporterName: updatedReport.full_name
            };

            const technicianMessage = whatsappService.generateTechnicianAssignmentMessage(technicianData);
            const technicianNotification = await whatsappService.sendNotification(
              technician.phone, 
              technicianMessage
            );
            
            if (technicianNotification.success) {
              console.log('WhatsApp notification sent to technician for assignment:', updatedReport.id);
            }
          }
        }
      } catch (whatsappError) {
        console.error('WhatsApp notification error during assignment:', whatsappError);
      }

      // Send email notification
      try {
        const reporterResult = await pool.query(
          'SELECT u.email FROM users u JOIN pipe_reports r ON u.id = r.user_id WHERE r.id = $1',
          [reportId]
        );
        
        const technicianResult = await pool.query(
          'SELECT u.email, p.full_name, p.phone FROM users u JOIN profiles p ON u.id = p.id WHERE p.id = $1',
          [assigned_technician_id]
        );
        
        if (reporterResult.rows.length > 0 && technicianResult.rows.length > 0) {
          const reporterEmail = reporterResult.rows[0].email;
          const technicianEmail = technicianResult.rows[0].email;
          const technicianName = technicianResult.rows[0].full_name;
          const technicianPhone = technicianResult.rows[0].phone || 'Not provided';
          
          console.log('Sending assignment email to reporter:', reporterEmail);
          
          const subject = `Technician Assigned - Report ID: ${updatedReport.id}`;
          const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
              <div style="background-color: #0ea5e9; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0;">BlueGrid</h1>
              </div>
              <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
                <h2 style="color: #10b981; margin-top: 0;">Technician Assigned to Your Report! 👨‍🔧</h2>
                <p>Dear <strong>${updatedReport.full_name}</strong>,</p>
                <p>Good news! A maintenance technician has been assigned to your water pipe issue report.</p>
                
                <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #334155; margin-top: 0;">Report Details:</h3>
                  <p style="margin: 8px 0;"><strong>Report ID:</strong> ${updatedReport.id}</p>
                  <p style="margin: 8px 0;"><strong>Status:</strong> <span style="color: #10b981; font-weight: bold;">Assigned</span></p>
                  <p style="margin: 8px 0;"><strong>Location:</strong> ${updatedReport.location_name || updatedReport.address}</p>
                </div>
                
                <div style="background-color: #dcfce7; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #166534; margin-top: 0;">Assigned Technician:</h3>
                  <p style="margin: 8px 0;"><strong>Name:</strong> ${technicianName}</p>
                  <p style="margin: 8px 0;"><strong>Contact:</strong> ${technicianPhone}</p>
                </div>
                
                <div style="background-color: #dbeafe; padding: 15px; border-left: 4px solid #0ea5e9; margin: 20px 0;">
                  <p style="margin: 0; color: #1e40af;"><strong>What happens next?</strong></p>
                  <ul style="color: #1e40af; margin: 10px 0;">
                    <li>The technician will accept the assignment</li>
                    <li>They will visit the location to fix the issue</li>
                    <li>You'll receive updates when work begins and completes</li>
                  </ul>
                </div>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
                
                <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
                  Thank you for using BlueGrid<br>
                  For any questions, please contact our support team
                </p>
              </div>
            </div>
          `;
          
          const emailSuccess = await emailService.sendEmail({
            to: reporterEmail,
            subject: subject,
            html: html
          });
          
          if (emailSuccess) {
            console.log('✅ Assignment email sent successfully to reporter:', reporterEmail);
          } else {
            console.error('❌ Failed to send assignment email to reporter:', reporterEmail);
          }

          // Send email to technician
          console.log('Sending assignment email to technician:', technicianEmail);
          const techSubject = `New Report Assigned to You - Report ID: ${updatedReport.id}`;
          const techHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
              <div style="background-color: #0ea5e9; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0;">BlueGrid</h1>
              </div>
              <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
                <h2 style="color: #0ea5e9; margin-top: 0;">New Report Assigned to You! 🔧</h2>
                <p>Dear <strong>${technicianName}</strong>,</p>
                <p>A new water pipe repair report has been assigned to you by the Panchayat Officer.</p>
                
                <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #334155; margin-top: 0;">Report Details:</h3>
                  <p style="margin: 8px 0;"><strong>Report ID:</strong> ${updatedReport.id}</p>
                  <p style="margin: 8px 0;"><strong>Status:</strong> <span style="color: #f59e0b; font-weight: bold;">Assigned</span></p>
                  <p style="margin: 8px 0;"><strong>Reporter:</strong> ${updatedReport.full_name}</p>
                  <p style="margin: 8px 0;"><strong>Contact:</strong> ${updatedReport.mobile_number}</p>
                  <p style="margin: 8px 0;"><strong>Location:</strong> ${updatedReport.location_name || updatedReport.address}</p>
                  ${updatedReport.notes ? `<p style="margin: 8px 0;"><strong>Notes:</strong> ${updatedReport.notes}</p>` : ''}
                </div>
                
                <div style="background-color: #dbeafe; padding: 15px; border-left: 4px solid #0ea5e9; margin: 20px 0;">
                  <p style="margin: 0; color: #1e40af;"><strong>Action Required:</strong></p>
                  <ul style="color: #1e40af; margin: 10px 0;">
                    <li>Please log in to the app to accept this assignment</li>
                    <li>Review the report details and location</li>
                    <li>Visit the site and complete the repair work</li>
                    <li>Update the status when work is completed</li>
                  </ul>
                </div>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
                
                <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
                  Thank you for your service<br>
                  BlueGrid Team
                </p>
              </div>
            </div>
          `;
          
          const techEmailSuccess = await emailService.sendEmail({
            to: technicianEmail,
            subject: techSubject,
            html: techHtml
          });
          
          if (techEmailSuccess) {
            console.log('✅ Assignment email sent successfully to technician:', technicianEmail);
          } else {
            console.error('❌ Failed to send assignment email to technician:', technicianEmail);
          }
        }
      } catch (emailError) {
        console.error('Email notification error during assignment:', emailError);
      }
    });
  } catch (error) {
    console.error('Assign technician error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update report status (Panchayat Officer only)
app.put('/api/reports/:reportId/status', authenticateToken, async (req: any, res) => {
  try {
    // Check if user is panchayat officer
    const profileResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (profileResult.rows.length === 0 || profileResult.rows[0].role !== 'panchayat_officer') {
      return res.status(403).json({ error: 'Access denied. Panchayat Officer role required.' });
    }

    const { reportId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const validStatuses = ['pending', 'assigned', 'in_progress', 'completed', 'awaiting_approval', 'approved', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query(
      'UPDATE pipe_reports SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, reportId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const updatedReport = result.rows[0];

    // Send WhatsApp notification on status update
    try {
      if (updatedReport.mobile_number) {
        // Get technician name if assigned
        let technicianName = 'Our team';
        if (updatedReport.assigned_technician_id) {
          const techResult = await pool.query(
            'SELECT full_name FROM profiles WHERE id = $1',
            [updatedReport.assigned_technician_id]
          );
          if (techResult.rows.length > 0) {
            technicianName = techResult.rows[0].full_name;
          }
        }

        const reporterData = {
          reportId: updatedReport.id,
          fullName: updatedReport.full_name,
          status: status,
          technicianName: technicianName,
          locationName: updatedReport.location_name || updatedReport.address
        };

        const statusMessage = whatsappService.generateStatusUpdateMessage(reporterData);
        const whatsappResult = await whatsappService.sendNotification(
          updatedReport.mobile_number, 
          statusMessage
        );
        
        if (whatsappResult.success) {
          console.log('WhatsApp status update notification sent for report:', updatedReport.id);
        }
      }
    } catch (whatsappError) {
      console.error('WhatsApp notification error during status update:', whatsappError);
      // Don't fail the status update if WhatsApp fails
    }

    res.json(updatedReport);
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users/profiles (Panchayat Officer only)
app.get('/api/users', authenticateToken, async (req: any, res) => {
  try {
    // Check if user is panchayat officer
    const profileResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (profileResult.rows.length === 0 || profileResult.rows[0].role !== 'panchayat_officer') {
      return res.status(403).json({ error: 'Access denied. Panchayat Officer role required.' });
    }

    const result = await pool.query(
      `SELECT p.id, p.full_name, p.phone, p.address, p.role, p.created_at, p.updated_at, u.email
       FROM profiles p 
       LEFT JOIN users u ON p.id = u.id
       ORDER BY p.created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve/Reject completed report (Panchayat Officer only)
app.put('/api/reports/:reportId/approve', authenticateToken, async (req: any, res) => {
  try {
    // Check if user is panchayat officer
    const profileResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (profileResult.rows.length === 0 || profileResult.rows[0].role !== 'panchayat_officer') {
      return res.status(403).json({ error: 'Access denied. Panchayat Officer role required.' });
    }

    const { reportId } = req.params;
    const { action, rejection_reason } = req.body; // action: 'approve' or 'reject'

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Valid action (approve/reject) is required' });
    }

    if (action === 'reject' && !rejection_reason) {
      return res.status(400).json({ error: 'Rejection reason is required when rejecting' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const updateFields = action === 'reject' 
      ? 'status = $1, rejection_reason = $2, approved_by = $3, approved_at = NOW(), updated_at = NOW()'
      : 'status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()';
    
    const values = action === 'reject' 
      ? [newStatus, rejection_reason, req.user.userId, reportId]
      : [newStatus, req.user.userId, reportId];

    const result = await pool.query(
      `UPDATE pipe_reports SET ${updateFields} WHERE id = $${values.length} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const approvedReport = result.rows[0];

    // Send email notification to the reporter
    try {
      console.log(`Sending email notification for ${action}...`);
      
      // Get reporter's email and officer details
      const reporterResult = await pool.query(
        'SELECT u.email, r.full_name, r.address FROM users u JOIN pipe_reports r ON u.id = r.user_id WHERE r.id = $1',
        [reportId]
      );
      
      const officerResult = await pool.query(
        'SELECT full_name FROM profiles WHERE id = $1',
        [req.user.userId]
      );
      
      if (reporterResult.rows.length > 0) {
        const reporterEmail = reporterResult.rows[0].email;
        const reporterName = reporterResult.rows[0].full_name;
        const locationName = reporterResult.rows[0].address;
        const officerName = officerResult.rows.length > 0 ? officerResult.rows[0].full_name : 'Panchayat Officer';
        
        console.log(`Sending ${action} email to:`, reporterEmail);
        
        if (action === 'approve') {
          const subject = `Report Approved ✅ - Report ID: ${approvedReport.id}`;
          const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
              <div style="background-color: #10b981; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0;">BlueGrid</h1>
              </div>
              <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
                <h2 style="color: #10b981; margin-top: 0;">Report Approved! ✅</h2>
                <p>Dear <strong>${reporterName}</strong>,</p>
                <p>Great news! Your water pipe repair report has been reviewed and approved by our Panchayat Officer.</p>
                
                <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #334155; margin-top: 0;">Report Details:</h3>
                  <p style="margin: 8px 0;"><strong>Report ID:</strong> ${approvedReport.id}</p>
                  <p style="margin: 8px 0;"><strong>Status:</strong> <span style="color: #10b981; font-weight: bold;">Approved</span></p>
                  <p style="margin: 8px 0;"><strong>Location:</strong> ${locationName}</p>
                  <p style="margin: 8px 0;"><strong>Approved By:</strong> ${officerName}</p>
                  <p style="margin: 8px 0;"><strong>Approval Date:</strong> ${new Date().toLocaleString()}</p>
                </div>
                
                <div style="background-color: #dcfce7; padding: 15px; border-left: 4px solid #10b981; margin: 20px 0;">
                  <p style="margin: 0; color: #166534;"><strong>✓ Work Completed Successfully</strong></p>
                  <p style="margin: 10px 0 0 0; color: #166534;">The repair work has been verified and approved. Your report is now closed.</p>
                </div>
                
                <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
                  Thank you for using BlueGrid. We're here to serve you!
                </p>
              </div>
            </div>
          `;
          
          const emailSuccess = await emailService.sendEmail({
            to: reporterEmail,
            subject: subject,
            html: html
          });
          
          if (emailSuccess) {
            console.log('✅ Approval email sent successfully to:', reporterEmail);
          } else {
            console.error('❌ Failed to send approval email to:', reporterEmail);
          }
        } else {
          // Rejection email
          const subject = `Report Needs Attention - Report ID: ${approvedReport.id}`;
          const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
              <div style="background-color: #ef4444; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0;">BlueGrid</h1>
              </div>
              <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
                <h2 style="color: #ef4444; margin-top: 0;">Report Requires Additional Work</h2>
                <p>Dear <strong>${reporterName}</strong>,</p>
                <p>After reviewing your water pipe repair report, our Panchayat Officer has identified that additional work is needed.</p>
                
                <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #334155; margin-top: 0;">Report Details:</h3>
                  <p style="margin: 8px 0;"><strong>Report ID:</strong> ${approvedReport.id}</p>
                  <p style="margin: 8px 0;"><strong>Status:</strong> <span style="color: #ef4444; font-weight: bold;">Requires Attention</span></p>
                  <p style="margin: 8px 0;"><strong>Location:</strong> ${locationName}</p>
                  <p style="margin: 8px 0;"><strong>Reviewed By:</strong> ${officerName}</p>
                </div>
                
                <div style="background-color: #fee2e2; padding: 15px; border-left: 4px solid #ef4444; margin: 20px 0;">
                  <p style="margin: 0; color: #991b1b;"><strong>Reason:</strong></p>
                  <p style="margin: 10px 0 0 0; color: #991b1b;">${rejection_reason}</p>
                </div>
                
                <div style="background-color: #dbeafe; padding: 15px; border-left: 4px solid #0ea5e9; margin: 20px 0;">
                  <p style="margin: 0; color: #1e40af;"><strong>What happens next?</strong></p>
                  <ul style="color: #1e40af; margin: 10px 0;">
                    <li>The technician will be notified to address the issues</li>
                    <li>Additional work will be performed</li>
                    <li>You'll receive an update once the work is completed</li>
                  </ul>
                </div>
                
                <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
                  We apologize for any inconvenience. Thank you for your patience!
                </p>
              </div>
            </div>
          `;
          
          const emailSuccess = await emailService.sendEmail({
            to: reporterEmail,
            subject: subject,
            html: html
          });
          
          if (emailSuccess) {
            console.log('✅ Rejection email sent successfully to:', reporterEmail);
          } else {
            console.error('❌ Failed to send rejection email to:', reporterEmail);
          }
        }
      }
    } catch (emailError) {
      console.error(`Email notification error during ${action}:`, emailError);
      // Don't fail the approval/rejection if email fails
    }

    res.json(approvedReport);
  } catch (error) {
    console.error('Approve/Reject report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update report status by maintenance technician
app.put('/api/reports/:reportId/technician-update', authenticateToken, async (req: any, res) => {
  try {
    // Check if user is maintenance technician
    const profileResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (profileResult.rows.length === 0 || profileResult.rows[0].role !== 'maintenance_technician') {
      return res.status(403).json({ error: 'Access denied. Maintenance Technician role required.' });
    }

    const { reportId } = req.params;
    const { status, completion_notes } = req.body;

    // Verify the report is assigned to this technician
    const reportCheck = await pool.query(
      'SELECT * FROM pipe_reports WHERE id = $1 AND assigned_technician_id = $2',
      [reportId, req.user.userId]
    );

    if (reportCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Report not assigned to you or not found' });
    }

    const validStatuses = ['in_progress', 'awaiting_approval'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status for technician update' });
    }

    const updateFields = status === 'awaiting_approval'
      ? 'status = $1, completion_notes = $2, completed_at = NOW(), updated_at = NOW()'
      : 'status = $1, updated_at = NOW()';
    
    const values = status === 'awaiting_approval'
      ? [status, completion_notes || null, reportId]
      : [status, reportId];

    const result = await pool.query(
      `UPDATE pipe_reports SET ${updateFields} WHERE id = $${values.length} RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Technician update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get reports for maintenance technician
app.get('/api/reports/assigned', authenticateToken, async (req: any, res) => {
  try {
    // Check if user is maintenance technician
    const profileResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (profileResult.rows.length === 0 || profileResult.rows[0].role !== 'maintenance_technician') {
      return res.status(403).json({ error: 'Access denied. Maintenance Technician role required.' });
    }

    const result = await pool.query(
      'SELECT * FROM pipe_reports WHERE assigned_technician_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get assigned reports error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create maintenance technician or water flow controller (Panchayat Officer only)
app.post('/api/users/create-staff', authenticateToken, async (req: any, res) => {
  try {
    console.log('=== CREATE STAFF REQUEST ===');
    console.log('User ID:', req.user.userId);
    console.log('Request body:', req.body);
    
    // Check if user is panchayat officer
    const userProfile = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );
    
    console.log('User profile:', userProfile.rows);

    if (userProfile.rows.length === 0 || userProfile.rows[0].role !== 'panchayat_officer') {
      console.log('Access denied - not panchayat officer');
      return res.status(403).json({ error: 'Access denied. Panchayat Officer role required.' });
    }

    const { email, password, full_name, phone, address, role } = req.body;
    console.log('Extracted fields:', { email, password: '***', full_name, phone, address, role });

    if (!email || !password || !full_name || !role) {
      return res.status(400).json({ error: 'Email, password, full name, and role are required' });
    }

    if (!['maintenance_technician', 'water_flow_controller'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be maintenance_technician or water_flow_controller' });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userResult = await pool.query(
      'INSERT INTO users (email, password_hash, email_verified) VALUES ($1, $2, $3) RETURNING id',
      [email, hashedPassword, true]
    );

    const userId = userResult.rows[0].id;

    // Create profile
    const newProfile = await pool.query(
      'INSERT INTO profiles (id, full_name, phone, address, role) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, full_name, phone || null, address || null, role]
    );

    res.json({
      message: `${role.replace('_', ' ')} created successfully`,
      user: {
        id: userId,
        email,
        profile: newProfile.rows[0]
      }
    });
  } catch (error) {
    console.error('Create staff error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete user (Panchayat Officer only)
app.delete('/api/users/:userId', authenticateToken, async (req: any, res) => {
  try {
    // Check if user is panchayat officer
    const userProfile = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (userProfile.rows.length === 0 || userProfile.rows[0].role !== 'panchayat_officer') {
      return res.status(403).json({ error: 'Access denied. Panchayat Officer role required.' });
    }

    const { userId } = req.params;

    // Check if the user exists and get their role
    const targetUser = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [userId]
    );

    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetRole = targetUser.rows[0].role;

    // Prevent deletion of panchayat officers and residents
    if (targetRole === 'panchayat_officer') {
      return res.status(403).json({ error: 'Cannot delete panchayat officers' });
    }

    if (targetRole === 'resident') {
      return res.status(403).json({ error: 'Cannot delete residents. Residents can only delete their own accounts.' });
    }

    // Only allow deletion of maintenance_technician and water_flow_controller
    if (!['maintenance_technician', 'water_flow_controller'].includes(targetRole)) {
      return res.status(403).json({ error: 'Invalid user role for deletion' });
    }

    // Check for active assignments (for technicians)
    if (targetRole === 'maintenance_technician') {
      const activeReports = await pool.query(
        'SELECT COUNT(*) FROM pipe_reports WHERE assigned_technician_id = $1 AND status NOT IN ($2, $3, $4)',
        [userId, 'approved', 'rejected', 'completed']
      );
      
      if (parseInt(activeReports.rows[0].count) > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete technician with active assignments. Please reassign or complete all tasks first.' 
        });
      }
    }

    // Check for active schedules (for water controllers)
    if (targetRole === 'water_flow_controller') {
      const activeSchedules = await pool.query(
        'SELECT COUNT(*) FROM water_schedules WHERE controller_id = $1 AND is_active = true',
        [userId]
      );
      
      if (parseInt(activeSchedules.rows[0].count) > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete controller with active schedules. Please close all schedules first.' 
        });
      }
    }

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Unassign from any completed/approved reports (set to NULL instead of deleting reports)
      await pool.query(
        'UPDATE pipe_reports SET assigned_technician_id = NULL WHERE assigned_technician_id = $1',
        [userId]
      );

      // Update water schedules to remove controller reference
      await pool.query(
        'UPDATE water_schedules SET controller_id = NULL WHERE controller_id = $1',
        [userId]
      );

      // Delete from profiles first (due to foreign key constraint)
      await pool.query('DELETE FROM profiles WHERE id = $1', [userId]);
      
      // Delete from users
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);

      // Commit transaction
      await pool.query('COMMIT');

      res.json({ 
        message: 'User deleted successfully',
        deletedUserId: userId 
      });
    } catch (deleteError) {
      // Rollback on error
      await pool.query('ROLLBACK');
      throw deleteError;
    }
  } catch (error: any) {
    console.error('Delete user error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all residents (for water flow controller to create schedules)
app.get('/api/users/residents', authenticateToken, async (req: any, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.full_name, p.address, p.phone 
       FROM profiles p 
       JOIN users u ON p.id = u.id 
       WHERE p.role = 'resident' AND p.address IS NOT NULL 
       ORDER BY p.full_name ASC`
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get residents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Accept assignment (Maintenance Technician)
app.put('/api/reports/:reportId/accept', authenticateToken, async (req: any, res) => {
  try {
    // Check if user is maintenance technician
    const profileResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (profileResult.rows.length === 0 || profileResult.rows[0].role !== 'maintenance_technician') {
      return res.status(403).json({ error: 'Access denied. Maintenance Technician role required.' });
    }

    const { reportId } = req.params;

    // Verify the report is assigned to this technician
    const reportCheck = await pool.query(
      'SELECT * FROM pipe_reports WHERE id = $1 AND assigned_technician_id = $2 AND status = $3',
      [reportId, req.user.userId, 'assigned']
    );

    if (reportCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Report not assigned to you or already accepted' });
    }

    // Update status to in_progress
    const result = await pool.query(
      'UPDATE pipe_reports SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      ['in_progress', reportId]
    );

    const acceptedReport = result.rows[0];

    // Send email notification to the reporter
    try {
      console.log('Sending email notification for task acceptance...');
      
      // Get reporter's email and technician details
      const reporterResult = await pool.query(
        'SELECT u.email, r.full_name, r.address FROM users u JOIN pipe_reports r ON u.id = r.user_id WHERE r.id = $1',
        [reportId]
      );
      
      const technicianResult = await pool.query(
        'SELECT full_name, phone FROM profiles WHERE id = $1',
        [req.user.userId]
      );
      
      if (reporterResult.rows.length > 0 && technicianResult.rows.length > 0) {
        const reporterEmail = reporterResult.rows[0].email;
        const reporterName = reporterResult.rows[0].full_name;
        const locationName = reporterResult.rows[0].address;
        const technicianName = technicianResult.rows[0].full_name;
        const technicianPhone = technicianResult.rows[0].phone || 'Not provided';
        
        console.log('Sending acceptance email to:', reporterEmail);
        
        const subject = `Work Started - Report ID: ${acceptedReport.id}`;
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
            <div style="background-color: #0ea5e9; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0;">BlueGrid</h1>
            </div>
            <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
              <h2 style="color: #0ea5e9; margin-top: 0;">Technician Started Working! 🔧</h2>
              <p>Dear <strong>${reporterName}</strong>,</p>
              <p>Good news! Our maintenance technician has accepted your report and started working on the issue.</p>
              
              <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #334155; margin-top: 0;">Report Details:</h3>
                <p style="margin: 8px 0;"><strong>Report ID:</strong> ${acceptedReport.id}</p>
                <p style="margin: 8px 0;"><strong>Status:</strong> <span style="color: #0ea5e9; font-weight: bold;">In Progress</span></p>
                <p style="margin: 8px 0;"><strong>Location:</strong> ${locationName}</p>
                <p style="margin: 8px 0;"><strong>Technician:</strong> ${technicianName}</p>
                <p style="margin: 8px 0;"><strong>Contact:</strong> ${technicianPhone}</p>
              </div>
              
              <div style="background-color: #dbeafe; padding: 15px; border-left: 4px solid #0ea5e9; margin: 20px 0;">
                <p style="margin: 0; color: #1e40af;"><strong>What's happening now?</strong></p>
                <ul style="color: #1e40af; margin: 10px 0;">
                  <li>The technician is actively working on your report</li>
                  <li>You'll receive an update when the work is completed</li>
                  <li>Feel free to contact the technician if needed</li>
                </ul>
              </div>
              
              <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
                Thank you for your patience!
              </p>
            </div>
          </div>
        `;
        
        const emailSuccess = await emailService.sendEmail({
          to: reporterEmail,
          subject: subject,
          html: html
        });
        
        if (emailSuccess) {
          console.log('✅ Acceptance email sent successfully to:', reporterEmail);
        } else {
          console.error('❌ Failed to send acceptance email to:', reporterEmail);
        }
      }
    } catch (emailError) {
      console.error('Email notification error during acceptance:', emailError);
      // Don't fail the acceptance if email fails
    }

    res.json(acceptedReport);
  } catch (error) {
    console.error('Accept assignment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test database connection
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'Database connected successfully', 
      timestamp: result.rows[0].now 
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ 
      error: 'Database connection failed',
      details: error.message 
    });
  }
});

// Test WhatsApp sending (secured) - development helper
app.post('/api/test-whatsapp', authenticateToken, async (req: any, res) => {
  try {
    const { phone, message } = req.body || {};
    if (!phone) {
      return res.status(400).json({ error: 'phone is required' });
    }
    const msg = message || 'Test message from BlueGrid server';
    const result = await whatsappService.sendNotification(phone, msg);
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }
    res.json({ success: true, data: result.data || result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Water Flow Controller endpoints

// Get controller's schedules
app.get('/api/schedules/my-schedules', authenticateToken, async (req: any, res) => {
  try {
    // Check if user is water flow controller
    const profileResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (profileResult.rows.length === 0 || profileResult.rows[0].role !== 'water_flow_controller') {
      return res.status(403).json({ error: 'Access denied. Water Flow Controller role required.' });
    }

    const result = await pool.query(
      'SELECT * FROM water_schedules WHERE controller_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get my schedules error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create schedule (Water Flow Controller)
app.post('/api/schedules/create', authenticateToken, async (req: any, res) => {
  try {
    // Check if user is water flow controller
    const profileResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (profileResult.rows.length === 0 || profileResult.rows[0].role !== 'water_flow_controller') {
      return res.status(403).json({ error: 'Access denied. Water Flow Controller role required.' });
    }

    const { area, user_id, scheduled_open_time, scheduled_close_time } = req.body;

    if (!area || !scheduled_open_time || !scheduled_close_time) {
      return res.status(400).json({ error: 'Area, open time, and close time are required' });
    }

    // Try to insert with user_id, fall back to without if column doesn't exist
    let createdSchedule;
    try {
      const result = await pool.query(
        'INSERT INTO water_schedules (controller_id, area, user_id, scheduled_open_time, scheduled_close_time, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [req.user.userId, area, user_id || null, scheduled_open_time, scheduled_close_time, true]
      );
      createdSchedule = result.rows[0];
    } catch (insertError: any) {
      // If user_id column doesn't exist, try without it
      if (insertError.code === '42703') { // undefined_column error
        console.log('user_id column not found, inserting without it');
        const result = await pool.query(
          'INSERT INTO water_schedules (controller_id, area, scheduled_open_time, scheduled_close_time, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [req.user.userId, area, scheduled_open_time, scheduled_close_time, true]
        );
        createdSchedule = result.rows[0];
      } else {
        throw insertError;
      }
    }

    // Send response immediately
    res.json(createdSchedule);

    // Send email notification asynchronously to all residents in the area
    setImmediate(async () => {
      try {
        // Get all residents in the area (or all residents if no specific area filter)
        const residentsQuery = user_id 
          ? 'SELECT u.email, p.full_name, p.address, p.phone FROM users u JOIN profiles p ON u.id = p.id WHERE u.id = $1 AND p.role = $2'
          : 'SELECT u.email, p.full_name, p.address, p.phone FROM users u JOIN profiles p ON u.id = p.id WHERE p.role = $1';
        
        const residentsParams = user_id ? [user_id, 'resident'] : ['resident'];
        const residentsResult = await pool.query(residentsQuery, residentsParams);

        if (residentsResult.rows.length > 0) {
          console.log(`Sending schedule notification to ${residentsResult.rows.length} resident(s)`);
          
          for (const resident of residentsResult.rows) {
            
            // Format times for display
            const openTime = new Date(scheduled_open_time).toLocaleString('en-IN', {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'Asia/Kolkata'
            });
            const closeTime = new Date(scheduled_close_time).toLocaleString('en-IN', {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'Asia/Kolkata'
            });

            const subject = `Water Supply Schedule - ${area}`;
            const html = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
                <div style="background-color: #0ea5e9; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0;">💧 BlueGrid</h1>
                </div>
                <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
                  <h2 style="color: #0ea5e9; margin-top: 0;">Water Supply Schedule Created</h2>
                  <p>Dear <strong>${resident.full_name}</strong>,</p>
                  <p>A new water supply schedule has been created for your area.</p>
                  
                  <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #334155; margin-top: 0;">Schedule Details:</h3>
                    <p style="margin: 8px 0;"><strong>Area:</strong> ${area}</p>
                    <p style="margin: 8px 0;"><strong>Address:</strong> ${resident.address || 'Your registered address'}</p>
                    <p style="margin: 8px 0; color: #10b981; font-size: 18px;"><strong>⏰ Water Supply Timing:</strong></p>
                    <p style="margin: 8px 0; padding-left: 20px;"><strong>Opens:</strong> ${openTime}</p>
                    <p style="margin: 8px 0; padding-left: 20px;"><strong>Closes:</strong> ${closeTime}</p>
                  </div>
                  
                  <div style="background-color: #dbeafe; padding: 15px; border-left: 4px solid #0ea5e9; margin: 20px 0;">
                    <p style="margin: 0; color: #1e40af;"><strong>📌 Important:</strong></p>
                    <ul style="color: #1e40af; margin: 10px 0;">
                      <li>Please ensure your taps are ready during the scheduled time</li>
                      <li>Store sufficient water for your needs</li>
                      <li>Report any issues immediately through the app</li>
                    </ul>
                  </div>
                  
                  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
                  
                  <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
                    Thank you for using BlueGrid<br>
                    For any questions, please contact our support team
                  </p>
                </div>
              </div>
            `;

            const emailSuccess = await emailService.sendEmail({
              to: resident.email,
              subject: subject,
              html: html
            });

            if (emailSuccess) {
              console.log('✅ Schedule notification email sent to:', resident.email);
            } else {
              console.error('❌ Failed to send schedule notification email to:', resident.email);
            }

            // Send WhatsApp notification
            if (resident.phone) {
              const whatsappMessage = `💧 *BlueGrid - Water Supply Schedule*

Hello ${resident.full_name}!

A new water supply schedule has been created for your area.

📋 *Schedule Details:*
• Area: ${area}
• Opens: ${openTime}
• Closes: ${closeTime}

📌 *Important:*
• Please ensure your taps are ready during the scheduled time
• Store sufficient water for your needs
• Report any issues immediately through the app

*BlueGrid Team*`;

              const whatsappResult = await whatsappService.sendNotification(
                resident.phone,
                whatsappMessage
              );

              if (whatsappResult.success) {
                console.log('✅ Schedule notification WhatsApp sent to:', resident.phone);
              } else {
                console.error('❌ Failed to send schedule notification WhatsApp to:', resident.phone);
              }
            }
          }
        } else {
          console.log('No residents found to notify');
        }
      } catch (emailError) {
        console.error('Email notification error for schedule:', emailError);
      }
    });
  } catch (error) {
    console.error('Create schedule error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Open water supply
app.put('/api/schedules/:scheduleId/open', authenticateToken, async (req: any, res) => {
  try {
    // Check if user is water flow controller
    const profileResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (profileResult.rows.length === 0 || profileResult.rows[0].role !== 'water_flow_controller') {
      return res.status(403).json({ error: 'Access denied. Water Flow Controller role required.' });
    }

    const { scheduleId } = req.params;

    // Verify the schedule belongs to this controller
    const scheduleCheck = await pool.query(
      'SELECT * FROM water_schedules WHERE id = $1 AND controller_id = $2',
      [scheduleId, req.user.userId]
    );

    if (scheduleCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Schedule not found or access denied' });
    }

    // Update with actual open time
    const result = await pool.query(
      'UPDATE water_schedules SET actual_open_time = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *',
      [scheduleId]
    );

    const openedSchedule = result.rows[0];

    // Send response immediately
    res.json(openedSchedule);

    // Send email and WhatsApp notifications asynchronously
    setImmediate(async () => {
      try {
        // Get resident details if user_id is set
        if (openedSchedule.user_id) {
          const residentResult = await pool.query(
            'SELECT u.email, p.full_name, p.phone FROM users u JOIN profiles p ON u.id = p.id WHERE u.id = $1',
            [openedSchedule.user_id]
          );

          if (residentResult.rows.length > 0) {
            const resident = residentResult.rows[0];
            
            // Send email notification
            const emailSuccess = await emailService.sendWaterSupplyOpenEmail(
              resident.email,
              resident.full_name,
              openedSchedule.area,
              scheduleId
            );

            if (emailSuccess) {
              console.log('✅ Water supply open email sent to:', resident.email);
            } else {
              console.error('❌ Failed to send water supply open email to:', resident.email);
            }

            // Send WhatsApp notification
            if (resident.phone) {
              const whatsappMessage = whatsappService.generateWaterSupplyMessage({
                userName: resident.full_name,
                area: openedSchedule.area,
                status: 'open',
                scheduleId: scheduleId,
                time: new Date().toLocaleString('en-IN')
              });

              const whatsappResult = await whatsappService.sendNotification(
                resident.phone,
                whatsappMessage
              );

              if (whatsappResult.success) {
                console.log('✅ Water supply open WhatsApp sent to:', resident.phone);
              } else {
                console.error('❌ Failed to send water supply open WhatsApp to:', resident.phone);
              }
            }
          }
        }
      } catch (error) {
        console.error('Notification error for water supply open:', error);
      }
    });
  } catch (error) {
    console.error('Open water error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Close water supply
app.put('/api/schedules/:scheduleId/close', authenticateToken, async (req: any, res) => {
  try {
    // Check if user is water flow controller
    const profileResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (profileResult.rows.length === 0 || profileResult.rows[0].role !== 'water_flow_controller') {
      return res.status(403).json({ error: 'Access denied. Water Flow Controller role required.' });
    }

    const { scheduleId } = req.params;

    // Verify the schedule belongs to this controller
    const scheduleCheck = await pool.query(
      'SELECT * FROM water_schedules WHERE id = $1 AND controller_id = $2',
      [scheduleId, req.user.userId]
    );

    if (scheduleCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Schedule not found or access denied' });
    }

    // Update with actual close time and mark as inactive
    const result = await pool.query(
      'UPDATE water_schedules SET actual_close_time = NOW(), is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [scheduleId]
    );

    const closedSchedule = result.rows[0];

    // Send response immediately
    res.json(closedSchedule);

    // Send email and WhatsApp notifications asynchronously
    setImmediate(async () => {
      try {
        // Get resident details if user_id is set
        if (closedSchedule.user_id) {
          const residentResult = await pool.query(
            'SELECT u.email, p.full_name, p.phone FROM users u JOIN profiles p ON u.id = p.id WHERE u.id = $1',
            [closedSchedule.user_id]
          );

          if (residentResult.rows.length > 0) {
            const resident = residentResult.rows[0];
            
            // Send email notification
            const emailSuccess = await emailService.sendWaterSupplyCloseEmail(
              resident.email,
              resident.full_name,
              closedSchedule.area,
              scheduleId
            );

            if (emailSuccess) {
              console.log('✅ Water supply close email sent to:', resident.email);
            } else {
              console.error('❌ Failed to send water supply close email to:', resident.email);
            }

            // Send WhatsApp notification
            if (resident.phone) {
              const whatsappMessage = whatsappService.generateWaterSupplyMessage({
                userName: resident.full_name,
                area: closedSchedule.area,
                status: 'close',
                scheduleId: scheduleId,
                time: new Date().toLocaleString('en-IN')
              });

              const whatsappResult = await whatsappService.sendNotification(
                resident.phone,
                whatsappMessage
              );

              if (whatsappResult.success) {
                console.log('✅ Water supply close WhatsApp sent to:', resident.phone);
              } else {
                console.error('❌ Failed to send water supply close WhatsApp to:', resident.phone);
              }
            }
          }
        }
      } catch (error) {
        console.error('Notification error for water supply close:', error);
      }
    });
  } catch (error) {
    console.error('Close water error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Interrupt water supply
app.put('/api/schedules/:scheduleId/interrupt', authenticateToken, async (req: any, res) => {
  try {
    // Check if user is water flow controller
    const profileResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (profileResult.rows.length === 0 || profileResult.rows[0].role !== 'water_flow_controller') {
      return res.status(403).json({ error: 'Access denied. Water Flow Controller role required.' });
    }

    const { scheduleId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Interruption reason is required' });
    }

    // Verify the schedule belongs to this controller
    const scheduleCheck = await pool.query(
      'SELECT * FROM water_schedules WHERE id = $1 AND controller_id = $2',
      [scheduleId, req.user.userId]
    );

    if (scheduleCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Schedule not found or access denied' });
    }

    // Update with interruption
    const result = await pool.query(
      'UPDATE water_schedules SET interrupted = true, interruption_reason = $1, actual_close_time = NOW(), is_active = false, updated_at = NOW() WHERE id = $2 RETURNING *',
      [reason, scheduleId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Interrupt water error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Maintenance Technician endpoints

// Complete task with image upload
app.put('/api/reports/:reportId/complete', authenticateToken, upload.single('completion_image'), async (req: any, res) => {
  try {
    // Check if user is maintenance technician
    const profileResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (profileResult.rows.length === 0 || profileResult.rows[0].role !== 'maintenance_technician') {
      return res.status(403).json({ error: 'Access denied. Maintenance Technician role required.' });
    }

    const { reportId } = req.params;
    const { completion_notes } = req.body;

    if (!completion_notes) {
      return res.status(400).json({ error: 'Completion notes are required' });
    }

    // Verify the report is assigned to this technician and in progress
    const reportCheck = await pool.query(
      'SELECT * FROM pipe_reports WHERE id = $1 AND assigned_technician_id = $2 AND status = $3',
      [reportId, req.user.userId, 'in_progress']
    );

    if (reportCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Report not assigned to you or not in progress' });
    }

    // Handle completion image if uploaded
    let completionImageUrl: string | null = null;
    if (req.file) {
      completionImageUrl = `/uploads/${req.file.filename}`;
    }

    // Update status to awaiting_approval with completion details
    const result = await pool.query(
      'UPDATE pipe_reports SET status = $1, completion_notes = $2, completed_at = NOW(), updated_at = NOW(), photo_url = COALESCE($3, photo_url) WHERE id = $4 RETURNING *',
      ['awaiting_approval', completion_notes, completionImageUrl, reportId]
    );

    const completedReport = result.rows[0];

    // Send email notification to the reporter
    try {
      console.log('Sending completion email notification...');
      
      // Get reporter's email and technician details
      const reporterResult = await pool.query(
        'SELECT u.email, r.full_name, r.location_name, r.address FROM users u JOIN pipe_reports r ON u.id = r.user_id WHERE r.id = $1',
        [reportId]
      );
      
      const technicianResult = await pool.query(
        'SELECT full_name FROM profiles WHERE id = $1',
        [req.user.userId]
      );
      
      if (reporterResult.rows.length > 0) {
        const reporterEmail = reporterResult.rows[0].email;
        const reporterName = reporterResult.rows[0].full_name;
        const locationName = reporterResult.rows[0].location_name || reporterResult.rows[0].address;
        const technicianName = technicianResult.rows.length > 0 ? technicianResult.rows[0].full_name : 'Our team';
        
        console.log('Sending completion email to:', reporterEmail);
        
        const subject = `Work Completed - Report ID: ${completedReport.id}`;
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
            <div style="background-color: #0ea5e9; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0;">BlueGrid</h1>
            </div>
            <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
              <h2 style="color: #10b981; margin-top: 0;">Work Completed on Your Report! ✅</h2>
              <p>Dear <strong>${reporterName}</strong>,</p>
              <p>Great news! The maintenance work on your water pipe issue has been completed by our technician.</p>
              
              <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #334155; margin-top: 0;">Report Details:</h3>
                <p style="margin: 8px 0;"><strong>Report ID:</strong> ${completedReport.id}</p>
                <p style="margin: 8px 0;"><strong>Status:</strong> <span style="color: #f59e0b; font-weight: bold;">Awaiting Approval</span></p>
                <p style="margin: 8px 0;"><strong>Location:</strong> ${locationName}</p>
                <p style="margin: 8px 0;"><strong>Completed By:</strong> ${technicianName}</p>
                <p style="margin: 8px 0;"><strong>Completion Date:</strong> ${new Date().toLocaleString()}</p>
              </div>
              
              <div style="background-color: #dcfce7; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #166534; margin-top: 0;">Completion Notes:</h3>
                <p style="margin: 0; color: #166534;">${completion_notes}</p>
              </div>
              
              <div style="background-color: #dbeafe; padding: 15px; border-left: 4px solid #0ea5e9; margin: 20px 0;">
                <p style="margin: 0; color: #1e40af;"><strong>What happens next?</strong></p>
                <ul style="color: #1e40af; margin: 10px 0;">
                  <li>Our team will review the completion</li>
                  <li>Once approved, the report will be closed</li>
                  <li>Please verify the work has been done to your satisfaction</li>
                </ul>
              </div>
              
              <div style="background-color: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0;">
                <p style="margin: 0; color: #92400e;">
                  <strong>Note:</strong> If you notice any issues with the completed work, please contact our support team immediately.
                </p>
              </div>
              
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
              
              <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
                Thank you for using BlueGrid<br>
                For any questions, please contact our support team
              </p>
            </div>
          </div>
        `;
        
        const emailSuccess = await emailService.sendEmail({
          to: reporterEmail,
          subject: subject,
          html: html
        });
        
        if (emailSuccess) {
          console.log('✅ Completion email sent successfully to reporter:', reporterEmail);
        } else {
          console.error('❌ Failed to send completion email to reporter:', reporterEmail);
        }
      }

      // Send email to all Panchayat Officers
      const officersResult = await pool.query(
        'SELECT u.email, p.full_name FROM users u JOIN profiles p ON u.id = p.id WHERE p.role = $1',
        ['panchayat_officer']
      );

      if (officersResult.rows.length > 0) {
        const technicianName = technicianResult.rows.length > 0 ? technicianResult.rows[0].full_name : 'Technician';
        const reporterName = reporterResult.rows.length > 0 ? reporterResult.rows[0].full_name : 'Resident';
        const locationName = reporterResult.rows.length > 0 ? (reporterResult.rows[0].location_name || reporterResult.rows[0].address) : 'Location';

        for (const officer of officersResult.rows) {
          const officerSubject = `Work Completed - Report ID: ${completedReport.id} Awaiting Approval`;
          const officerHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
              <div style="background-color: #0ea5e9; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0;">BlueGrid</h1>
              </div>
              <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
                <h2 style="color: #10b981; margin-top: 0;">Work Completed - Approval Required ✅</h2>
                <p>Dear <strong>${officer.full_name}</strong>,</p>
                <p>A maintenance technician has completed work on a report and it is now awaiting your approval.</p>
                
                <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #334155; margin-top: 0;">Report Details:</h3>
                  <p style="margin: 8px 0;"><strong>Report ID:</strong> ${completedReport.id}</p>
                  <p style="margin: 8px 0;"><strong>Status:</strong> <span style="color: #f59e0b; font-weight: bold;">Awaiting Approval</span></p>
                  <p style="margin: 8px 0;"><strong>Reporter:</strong> ${reporterName}</p>
                  <p style="margin: 8px 0;"><strong>Location:</strong> ${locationName}</p>
                  <p style="margin: 8px 0;"><strong>Completed By:</strong> ${technicianName}</p>
                  <p style="margin: 8px 0;"><strong>Completion Date:</strong> ${new Date().toLocaleString()}</p>
                </div>
                
                <div style="background-color: #dcfce7; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #166534; margin-top: 0;">Completion Notes:</h3>
                  <p style="margin: 0; color: #166534;">${completion_notes}</p>
                </div>
                
                <div style="background-color: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0;">
                  <p style="margin: 0; color: #92400e;"><strong>Action Required:</strong></p>
                  <ul style="color: #92400e; margin: 10px 0;">
                    <li>Review the completion notes</li>
                    <li>Verify the work has been completed satisfactorily</li>
                    <li>Approve or reject the completion</li>
                  </ul>
                </div>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
                
                <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
                  BlueGrid - Panchayat Officer Dashboard<br>
                  Please log in to approve or reject this completion
                </p>
              </div>
            </div>
          `;

          const officerEmailSuccess = await emailService.sendEmail({
            to: officer.email,
            subject: officerSubject,
            html: officerHtml
          });

          if (officerEmailSuccess) {
            console.log('✅ Completion notification sent to Panchayat Officer:', officer.email);
          } else {
            console.error('❌ Failed to send completion notification to Panchayat Officer:', officer.email);
          }
        }
      }
    } catch (emailError) {
      console.error('Email notification error during completion:', emailError);
      // Don't fail the completion if email fails
    }

    res.json(completedReport);
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Email endpoints

// Test email connection
app.get('/api/email/verify', authenticateToken, async (req: any, res) => {
  try {
    const isVerified = await emailService.verifyConnection();
    if (isVerified) {
      res.json({ 
        success: true, 
        message: 'Email server connection verified successfully' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to verify email server connection' 
      });
    }
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send test email
app.post('/api/email/test', authenticateToken, async (req: any, res) => {
  try {
    const { to } = req.body;
    
    if (!to) {
      return res.status(400).json({ error: 'Recipient email address is required' });
    }

    const success = await emailService.sendTestEmail(to);
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Test email sent successfully to ${to}` 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send test email' 
      });
    }
  } catch (error) {
    console.error('Send test email error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send custom email
app.post('/api/email/send', authenticateToken, async (req: any, res) => {
  try {
    const { to, subject, text, html } = req.body;
    
    if (!to || !subject || (!text && !html)) {
      return res.status(400).json({ 
        error: 'Recipient email, subject, and message content are required' 
      });
    }

    const success = await emailService.sendEmail({ to, subject, text, html });
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Email sent successfully to ${to}` 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send email' 
      });
    }
  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send welcome email
app.post('/api/email/welcome', authenticateToken, async (req: any, res) => {
  try {
    const { to, userName } = req.body;
    
    if (!to || !userName) {
      return res.status(400).json({ 
        error: 'Recipient email and user name are required' 
      });
    }

    const success = await emailService.sendWelcomeEmail(to, userName);
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Welcome email sent successfully to ${to}` 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send welcome email' 
      });
    }
  } catch (error) {
    console.error('Send welcome email error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send report status email
app.post('/api/email/report-status', authenticateToken, async (req: any, res) => {
  try {
    const { to, reportId, status } = req.body;
    
    if (!to || !reportId || !status) {
      return res.status(400).json({ 
        error: 'Recipient email, report ID, and status are required' 
      });
    }

    const success = await emailService.sendReportStatusEmail(to, reportId, status);
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Report status email sent successfully to ${to}` 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send report status email' 
      });
    }
  } catch (error) {
    console.error('Send report status email error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Analytics endpoint
app.get('/api/analytics', authenticateToken, async (req: any, res) => {
  try {
    const { startDate, endDate, role, userId } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    let whereClause = `created_at >= $1 AND created_at <= $2`;
    const params: any[] = [startDate, `${endDate} 23:59:59`];
    
    // Filter by user if resident or technician
    if (role === 'resident' && userId) {
      whereClause += ` AND user_id = $3`;
      params.push(userId);
    } else if (role === 'maintenance_technician' && userId) {
      whereClause += ` AND assigned_technician_id = $3`;
      params.push(userId);
    }

    // Get total complaints
    const totalResult = await pool.query(
      `SELECT COUNT(*) as count FROM pipe_reports WHERE ${whereClause}`,
      params
    );
    const totalComplaints = parseInt(totalResult.rows[0].count);

    // Get complaints by status
    const statusResult = await pool.query(
      `SELECT status, COUNT(*) as count FROM pipe_reports WHERE ${whereClause} GROUP BY status`,
      params
    );

    // Get complaints by month
    const monthlyResult = await pool.query(
      `SELECT 
        TO_CHAR(created_at, 'Mon YYYY') as month,
        COUNT(*) as count 
      FROM pipe_reports 
      WHERE ${whereClause}
      GROUP BY TO_CHAR(created_at, 'Mon YYYY'), DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at)`,
      params
    );

    // Calculate average resolution time
    const resolutionResult = await pool.query(
      `SELECT 
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600) as avg_hours
      FROM pipe_reports 
      WHERE ${whereClause} AND completed_at IS NOT NULL`,
      params
    );

    const complaintsByStatus = statusResult.rows.map(row => ({
      status: row.status,
      count: parseInt(row.count)
    }));

    const pendingComplaints = complaintsByStatus.find(s => s.status === 'pending')?.count || 0;
    const completedComplaints = complaintsByStatus.filter(s => 
      ['completed', 'approved'].includes(s.status)
    ).reduce((sum, s) => sum + s.count, 0);
    const approvedComplaints = complaintsByStatus.find(s => s.status === 'approved')?.count || 0;
    const rejectedComplaints = complaintsByStatus.find(s => s.status === 'rejected')?.count || 0;

    res.json({
      totalComplaints,
      pendingComplaints,
      completedComplaints,
      approvedComplaints,
      rejectedComplaints,
      averageResolutionTime: Math.round(parseFloat(resolutionResult.rows[0]?.avg_hours || '0')),
      complaintsByMonth: monthlyResult.rows.map(row => ({
        month: row.month,
        count: parseInt(row.count)
      })),
      complaintsByStatus
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 📧📱 NOTIFICATION ENDPOINT - Send Email & WhatsApp
app.post('/api/notify', async (req, res) => {
  try {
    console.log('📬 Notification request received:', req.body);
    
    const { email, phone, name, message, subject } = req.body;

    // Validation
    if (!email && !phone) {
      return res.status(400).json({ 
        success: false, 
        error: 'At least one of email or phone is required' 
      });
    }

    if (!message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message is required' 
      });
    }

    const results = {
      email: { sent: false, error: null },
      whatsapp: { sent: false, error: null }
    };

    // Send Email Notification
    if (email) {
      try {
        console.log(`📧 Sending email to: ${email}`);
        await emailService.sendEmail({
          to: email,
          subject: subject || 'Notification from BlueGrid',
          text: message,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2563eb;">BlueGrid Notification</h2>
              ${name ? `<p><strong>Hello ${name},</strong></p>` : ''}
              <p style="font-size: 16px; line-height: 1.6;">${message}</p>
              <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
              <p style="color: #6b7280; font-size: 14px;">
                This is an automated message from BlueGrid Water Management System.
              </p>
            </div>
          `
        });
        results.email.sent = true;
        console.log('✅ Email sent successfully');
      } catch (emailError: any) {
        console.error('❌ Email sending failed:', emailError.message);
        results.email.error = emailError.message;
      }
    }

    // Send WhatsApp Notification
    if (phone) {
      try {
        console.log(`📱 Sending WhatsApp to: ${phone}`);
        
        // Format phone number (ensure it has country code)
        let formattedPhone = phone.replace(/\D/g, ''); // Remove non-digits
        if (!formattedPhone.startsWith('91') && formattedPhone.length === 10) {
          formattedPhone = '91' + formattedPhone; // Add India country code
        }
        
        const whatsappMessage = name 
          ? `Hello ${name},\n\n${message}\n\n- BlueGrid Water Management`
          : `${message}\n\n- BlueGrid Water Management`;

        await whatsappService.sendWhatsAppMessage(formattedPhone, whatsappMessage);
        results.whatsapp.sent = true;
        console.log('✅ WhatsApp sent successfully');
      } catch (whatsappError: any) {
        console.error('❌ WhatsApp sending failed:', whatsappError.message);
        results.whatsapp.error = whatsappError.message;
      }
    }

    // Determine overall success
    const emailSuccess = !email || results.email.sent;
    const whatsappSuccess = !phone || results.whatsapp.sent;
    const overallSuccess = emailSuccess && whatsappSuccess;

    if (overallSuccess) {
      return res.json({
        success: true,
        message: 'Notifications sent successfully',
        results
      });
    } else {
      return res.status(207).json({ // 207 Multi-Status
        success: false,
        message: 'Some notifications failed',
        results
      });
    }

  } catch (error: any) {
    console.error('❌ Notification endpoint error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// 🧪 TEST ENDPOINT - Test Email Service
app.post('/api/test-email', async (req, res) => {
  try {
    const { email, subject, message } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    await emailService.sendEmail({
      to: email,
      subject: subject || 'Test Email from BlueGrid',
      text: message || 'This is a test email from BlueGrid.',
      html: `<p>${message || 'This is a test email from BlueGrid.'}</p>`
    });

    res.json({ success: true, message: 'Test email sent successfully' });
  } catch (error: any) {
    console.error('Test email error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🧪 TEST ENDPOINT - Test WhatsApp Service
app.post('/api/test-whatsapp', async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Format phone number
    let formattedPhone = phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('91') && formattedPhone.length === 10) {
      formattedPhone = '91' + formattedPhone;
    }

    await whatsappService.sendWhatsAppMessage(
      formattedPhone, 
      message || 'This is a test message from BlueGrid.'
    );

    res.json({ success: true, message: 'Test WhatsApp sent successfully' });
  } catch (error: any) {
    console.error('Test WhatsApp error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ⭐ FEEDBACK SYSTEM - Submit feedback for completed report
app.post('/api/reports/:id/feedback', authenticateToken, async (req, res) => {
  try {
    const reportId = req.params.id;
    const { rating, comment } = req.body;
    const userId = (req as any).user.userId;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5 stars' });
    }

    // Check if report exists and belongs to user
    const reportCheck = await pool.query(
      'SELECT id, user_id, status, has_feedback FROM pipe_reports WHERE id = $1',
      [reportId]
    );

    if (reportCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = reportCheck.rows[0];

    // Verify ownership
    if (report.user_id !== userId) {
      return res.status(403).json({ error: 'You can only provide feedback for your own reports' });
    }

    // Check if report is completed or approved
    if (report.status !== 'completed' && report.status !== 'approved') {
      return res.status(400).json({ error: 'Feedback can only be submitted for completed or approved reports' });
    }

    // Check if feedback already submitted
    if (report.has_feedback) {
      return res.status(400).json({ error: 'Feedback has already been submitted for this report' });
    }

    // Submit feedback
    await pool.query(
      `UPDATE pipe_reports 
       SET feedback_rating = $1, 
           feedback_comment = $2, 
           feedback_date = NOW(), 
           has_feedback = TRUE,
           updated_at = NOW()
       WHERE id = $3`,
      [rating, comment || null, reportId]
    );

    console.log(`⭐ Feedback submitted for report ${reportId}: ${rating} stars`);

    res.json({
      success: true,
      message: 'Thank you for your feedback!',
      feedback: {
        rating,
        comment,
        date: new Date()
      }
    });
  } catch (error) {
    console.error('Feedback submission error:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// ⭐ GET FEEDBACK - Get feedback for a specific report
app.get('/api/reports/:id/feedback', authenticateToken, async (req, res) => {
  try {
    const reportId = req.params.id;

    const result = await pool.query(
      `SELECT feedback_rating, feedback_comment, feedback_date, has_feedback
       FROM pipe_reports 
       WHERE id = $1`,
      [reportId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const feedback = result.rows[0];

    if (!feedback.has_feedback) {
      return res.json({ hasFeedback: false });
    }

    res.json({
      hasFeedback: true,
      rating: feedback.feedback_rating,
      comment: feedback.feedback_comment,
      date: feedback.feedback_date
    });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ error: 'Failed to retrieve feedback' });
  }
});

// ⭐ GET ALL FEEDBACK - Get feedback statistics (for officers)
app.get('/api/feedback/statistics', authenticateToken, async (req, res) => {
  try {
    // Get average rating
    const avgResult = await pool.query(
      `SELECT 
        AVG(feedback_rating) as average_rating,
        COUNT(*) as total_feedback,
        COUNT(CASE WHEN feedback_rating = 5 THEN 1 END) as five_star,
        COUNT(CASE WHEN feedback_rating = 4 THEN 1 END) as four_star,
        COUNT(CASE WHEN feedback_rating = 3 THEN 1 END) as three_star,
        COUNT(CASE WHEN feedback_rating = 2 THEN 1 END) as two_star,
        COUNT(CASE WHEN feedback_rating = 1 THEN 1 END) as one_star
       FROM pipe_reports 
       WHERE has_feedback = TRUE`
    );

    // Get recent feedback
    const recentResult = await pool.query(
      `SELECT 
        pr.id,
        pr.location,
        pr.feedback_rating,
        pr.feedback_comment,
        pr.feedback_date,
        p.full_name as resident_name
       FROM pipe_reports pr
       JOIN profiles p ON pr.user_id = p.user_id
       WHERE pr.has_feedback = TRUE
       ORDER BY pr.feedback_date DESC
       LIMIT 10`
    );

    const stats = avgResult.rows[0];

    res.json({
      averageRating: parseFloat(stats.average_rating || 0).toFixed(1),
      totalFeedback: parseInt(stats.total_feedback),
      distribution: {
        5: parseInt(stats.five_star),
        4: parseInt(stats.four_star),
        3: parseInt(stats.three_star),
        2: parseInt(stats.two_star),
        1: parseInt(stats.one_star)
      },
      recentFeedback: recentResult.rows
    });
  } catch (error) {
    console.error('Feedback statistics error:', error);
    res.status(500).json({ error: 'Failed to retrieve feedback statistics' });
  }
});

// Add timeout middleware for all requests
app.use((req, res, next) => {
  // Set timeout to 30 seconds
  req.setTimeout(30000);
  res.setTimeout(30000);
  next();
});

// Warm up database connection on startup
pool.query('SELECT 1').then(() => {
  console.log('✅ Database connection established');
}).catch(err => {
  console.error('❌ Database connection failed:', err);
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});
