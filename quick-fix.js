import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

// Create a connection pool
const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_GLsYC61DhqOm@ep-curly-rain-adwexyl1-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: {
    rejectUnauthorized: false
  }
});

async function quickFix() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Quick fix for admin user...');
    
    // Check if admin user exists
    const userResult = await client.query(
      'SELECT id, email FROM users WHERE email = $1',
      ['admin@bluegrid.com']
    );
    
    let userId;
    
    if (userResult.rows.length === 0) {
      console.log('Creating admin user...');
      // Create admin user with correct password hash
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      const newUserResult = await client.query(
        'INSERT INTO users (email, password_hash, email_verified) VALUES ($1, $2, $3) RETURNING id',
        ['admin@bluegrid.com', hashedPassword, true]
      );
      
      userId = newUserResult.rows[0].id;
      console.log('✅ Admin user created');
    } else {
      userId = userResult.rows[0].id;
      console.log('✅ Admin user exists');
    }
    
    // Check/create profile
    const profileResult = await client.query(
      'SELECT * FROM profiles WHERE id = $1',
      [userId]
    );
    
    if (profileResult.rows.length === 0) {
      console.log('Creating admin profile...');
      await client.query(
        'INSERT INTO profiles (id, full_name, role, phone, address) VALUES ($1, $2, $3, $4, $5)',
        [userId, 'System Administrator', 'panchayat_officer', '+91-9876543210', 'Panchayat Office']
      );
      console.log('✅ Admin profile created');
    } else {
      const profile = profileResult.rows[0];
      if (profile.role !== 'panchayat_officer') {
        console.log('Updating admin role...');
        await client.query(
          'UPDATE profiles SET role = $1 WHERE id = $2',
          ['panchayat_officer', userId]
        );
        console.log('✅ Admin role updated');
      } else {
        console.log('✅ Admin profile correct');
      }
    }
    
    // Test creating a technician directly
    console.log('\n🧪 Testing technician creation...');
    
    const testEmail = 'test-tech@example.com';
    
    // Check if test user already exists
    const existingTest = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [testEmail]
    );
    
    if (existingTest.rows.length > 0) {
      console.log('Deleting existing test user...');
      await client.query('DELETE FROM profiles WHERE id = $1', [existingTest.rows[0].id]);
      await client.query('DELETE FROM users WHERE id = $1', [existingTest.rows[0].id]);
    }
    
    // Create test technician
    const testPassword = await bcrypt.hash('test123', 10);
    
    const testUserResult = await client.query(
      'INSERT INTO users (email, password_hash, email_verified) VALUES ($1, $2, $3) RETURNING id',
      [testEmail, testPassword, true]
    );
    
    const testUserId = testUserResult.rows[0].id;
    
    await client.query(
      'INSERT INTO profiles (id, full_name, role, phone, address) VALUES ($1, $2, $3, $4, $5)',
      [testUserId, 'Test Technician', 'maintenance_technician', '1234567890', 'Test Address']
    );
    
    console.log('✅ Test technician created successfully!');
    
    // Verify the creation
    const verifyResult = await client.query(`
      SELECT u.email, p.full_name, p.role 
      FROM users u 
      JOIN profiles p ON u.id = p.id 
      WHERE u.email = $1
    `, [testEmail]);
    
    if (verifyResult.rows.length > 0) {
      console.log('✅ Verification successful:', verifyResult.rows[0]);
    }
    
    console.log('\n🎉 Database is working correctly!');
    console.log('📋 Admin credentials: admin@bluegrid.com / admin123');
    console.log('📋 Test technician: test-tech@example.com / test123');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

quickFix();
