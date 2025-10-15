import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the trigger fix script
const fixPath = path.join(__dirname, 'fix-trigger.sql');
const fixScript = fs.readFileSync(fixPath, 'utf8');

// Create a connection pool
const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_GLsYC61DhqOm@ep-curly-rain-adwexyl1-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: {
    rejectUnauthorized: false
  }
});

async function applyTriggerFix() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing trigger function...');
    
    // Apply the trigger fix
    await client.query(fixScript);
    console.log('✅ Trigger function fixed!');
    
    console.log('🎉 The staff creation should now work correctly!');
    console.log('📋 Try creating a maintenance technician or water flow controller again.');
    
  } catch (error) {
    console.error('❌ Error fixing trigger:', error.message);
    console.error('Full error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

applyTriggerFix();
