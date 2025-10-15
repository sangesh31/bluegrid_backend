import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the schema files
const schemaPath = path.join(__dirname, 'neon-schema.sql');
const fixPath = path.join(__dirname, 'fix-database.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');
const fixScript = fs.readFileSync(fixPath, 'utf8');

// Create a connection pool
const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_GLsYC61DhqOm@ep-curly-rain-adwexyl1-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: {
    rejectUnauthorized: false
  }
});

async function setupDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Connected to Neon database...');
    console.log('Executing initial schema...');
    
    // Execute the initial schema
    await client.query(schema);
    console.log('✅ Initial schema executed');
    
    console.log('Applying database fixes...');
    // Execute the fix script
    await client.query(fixScript);
    console.log('✅ Database fixes applied');
    
    console.log('✅ Database setup completed successfully!');
    console.log('✅ Tables created: users, profiles, pipe_reports, water_schedules, sessions, notifications');
    console.log('✅ Views created: reports_with_details, schedules_with_details');
    console.log('✅ Default admin user created: admin@bluegrid.com (password: admin123)');
    console.log('\n⚠️  IMPORTANT: Change the admin password in production!');
    
  } catch (error) {
    console.error('❌ Error setting up database:', error.message);
    console.error('Full error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase();
