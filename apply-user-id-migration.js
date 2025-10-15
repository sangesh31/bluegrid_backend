import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the migration script
const migrationPath = path.join(__dirname, 'add-user-id-to-schedules.sql');
const migrationScript = fs.readFileSync(migrationPath, 'utf8');

// Create a connection pool
const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_GLsYC61DhqOm@ep-curly-rain-adwexyl1-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: {
    rejectUnauthorized: false
  }
});

async function applyMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting migration to add user_id column to water_schedules...');
    
    // Execute the migration
    await client.query(migrationScript);
    
    console.log('✅ Migration completed successfully!');
    console.log('✅ user_id column added to water_schedules table');
    console.log('✅ Index created on user_id column');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration();
