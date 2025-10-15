import { Pool } from 'pg';

// Create a connection pool
const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_GLsYC61DhqOm@ep-curly-rain-adwexyl1-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: {
    rejectUnauthorized: false
  }
});

async function checkAdminUser() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking admin user...');
    
    // Check if admin user exists
    const userResult = await client.query(
      'SELECT id, email, email_verified FROM users WHERE email = $1',
      ['admin@bluegrid.com']
    );
    
    if (userResult.rows.length === 0) {
      console.log('❌ Admin user does not exist');
      
      // Create admin user
      console.log('Creating admin user...');
      const hashedPassword = '$2a$10$rKZqxQxGxvK5yJ5YxJ5YxOeKqxQxGxvK5yJ5YxJ5YxOeKqxQxGxvK';
      
      const newUserResult = await client.query(
        'INSERT INTO users (email, password_hash, email_verified) VALUES ($1, $2, $3) RETURNING id',
        ['admin@bluegrid.com', hashedPassword, true]
      );
      
      const userId = newUserResult.rows[0].id;
      console.log('✅ Admin user created with ID:', userId);
      
      // Create profile
      await client.query(
        'INSERT INTO profiles (id, full_name, role, phone, address) VALUES ($1, $2, $3, $4, $5)',
        [userId, 'System Administrator', 'panchayat_officer', '+91-9876543210', 'Panchayat Office']
      );
      
      console.log('✅ Admin profile created');
      
    } else {
      const user = userResult.rows[0];
      console.log('✅ Admin user exists:', user);
      
      // Check profile
      const profileResult = await client.query(
        'SELECT * FROM profiles WHERE id = $1',
        [user.id]
      );
      
      if (profileResult.rows.length === 0) {
        console.log('❌ Admin profile does not exist, creating...');
        
        await client.query(
          'INSERT INTO profiles (id, full_name, role, phone, address) VALUES ($1, $2, $3, $4, $5)',
          [user.id, 'System Administrator', 'panchayat_officer', '+91-9876543210', 'Panchayat Office']
        );
        
        console.log('✅ Admin profile created');
      } else {
        const profile = profileResult.rows[0];
        console.log('✅ Admin profile exists:', profile);
        
        if (profile.role !== 'panchayat_officer') {
          console.log('❌ Admin role is incorrect, updating...');
          
          await client.query(
            'UPDATE profiles SET role = $1 WHERE id = $2',
            ['panchayat_officer', user.id]
          );
          
          console.log('✅ Admin role updated to panchayat_officer');
        }
      }
    }
    
    // Final verification
    console.log('\n🔍 Final verification...');
    const finalCheck = await client.query(`
      SELECT u.id, u.email, p.full_name, p.role 
      FROM users u 
      JOIN profiles p ON u.id = p.id 
      WHERE u.email = 'admin@bluegrid.com'
    `);
    
    if (finalCheck.rows.length > 0) {
      console.log('✅ Admin user ready:', finalCheck.rows[0]);
    } else {
      console.log('❌ Admin user verification failed');
    }
    
  } catch (error) {
    console.error('❌ Error checking admin user:', error.message);
    console.error('Full error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkAdminUser();
