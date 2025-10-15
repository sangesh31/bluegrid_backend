import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_GLsYC61DhqOm@ep-curly-rain-adwexyl1-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: {
    rejectUnauthorized: false
  }
});

const testResidents = [
  {
    email: 'resident1@bluegrid.com',
    password: 'resident123',
    full_name: 'Rajesh Kumar',
    phone: '9876543210',
    address: 'House No. 123, Main Street, Ward 1'
  },
  {
    email: 'resident2@bluegrid.com',
    password: 'resident123',
    full_name: 'Priya Sharma',
    phone: '9876543211',
    address: 'House No. 456, Gandhi Road, Ward 2'
  },
  {
    email: 'resident3@bluegrid.com',
    password: 'resident123',
    full_name: 'Arun Patel',
    phone: '9876543212',
    address: 'House No. 789, Temple Street, Ward 3'
  },
  {
    email: 'resident4@bluegrid.com',
    password: 'resident123',
    full_name: 'Lakshmi Iyer',
    phone: '9876543213',
    address: 'House No. 321, Market Road, Ward 1'
  },
  {
    email: 'resident5@bluegrid.com',
    password: 'resident123',
    full_name: 'Suresh Reddy',
    phone: '9876543214',
    address: 'House No. 654, School Lane, Ward 2'
  }
];

async function createTestResidents() {
  console.log('🚀 Creating test resident users...\n');

  try {
    for (const resident of testResidents) {
      // Check if user already exists
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [resident.email]
      );

      if (existingUser.rows.length > 0) {
        console.log(`⏭️  User ${resident.email} already exists, skipping...`);
        continue;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(resident.password, 10);

      // Create user
      const userResult = await pool.query(
        'INSERT INTO users (email, password_hash, email_verified) VALUES ($1, $2, $3) RETURNING id',
        [resident.email, passwordHash, true]
      );

      const userId = userResult.rows[0].id;

      // Create profile
      await pool.query(
        `INSERT INTO profiles (id, full_name, phone, address, role) 
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, resident.full_name, resident.phone, resident.address, 'resident']
      );

      console.log(`✅ Created resident: ${resident.full_name} (${resident.email})`);
    }

    console.log('\n✅ All test residents created successfully!');
    console.log('\n📋 Login credentials:');
    console.log('Email: resident1@bluegrid.com to resident5@bluegrid.com');
    console.log('Password: resident123');

  } catch (error) {
    console.error('❌ Error creating test residents:', error);
  } finally {
    await pool.end();
  }
}

createTestResidents();
