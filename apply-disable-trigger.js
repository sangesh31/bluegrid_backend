import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the disable trigger script
const fixPath = path.join(__dirname, 'disable-trigger.sql');
const fixScript = fs.readFileSync(fixPath, 'utf8');

// Create a connection pool
const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_GLsYC61DhqOm@ep-curly-rain-adwexyl1-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: {
    rejectUnauthorized: false
  }
});

async function disableTrigger() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Disabling auto-profile creation trigger...');
    
    // Apply the trigger disable
    await client.query(fixScript);
    console.log('✅ Trigger disabled!');
    
    console.log('🎉 Staff creation should now work without conflicts!');
    
  } catch (error) {
    console.error('❌ Error disabling trigger:', error.message);
    console.error('Full error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

disableTrigger();
