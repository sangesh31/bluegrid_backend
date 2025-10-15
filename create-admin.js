import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_GLsYC61DhqOm@ep-curly-rain-adwexyl1-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: {
    rejectUnauthorized: false
  }
});

async function createAdmin() {
  const client = await pool.connect();
  
  try {
    console.log('Creating admin user...');
    
    // Hash the password 'admin123'
    const passwordHash = await bcrypt.hash('admin123', 10);
    
    // Delete existing admin if exists
    await client.query('DELETE FROM users WHERE email = $1', ['admin@bluegrid.com']);
    
    // Insert admin user
    const userResult = await client.query(
      'INSERT INTO users (email, password_hash, email_verified) VALUES ($1, $2, $3) RETURNING id, email',
      ['admin@bluegrid.com', passwordHash, true]
    );
    
    const adminUser = userResult.rows[0];
    console.log('✅ Admin user created:', adminUser.email);
    
    // Update profile to admin role
    await client.query(
      'UPDATE profiles SET full_name = $1, role = $2 WHERE id = $3',
      ['Admin User', 'admin', adminUser.id]
    );
    
    console.log('✅ Admin profile updated with admin role');
    console.log('\nLogin credentials:');
    console.log('Email: admin@bluegrid.com');
    console.log('Password: admin123');
    console.log('\n⚠️  IMPORTANT: Change this password in production!');
    
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    console.error('Full error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

createAdmin();
