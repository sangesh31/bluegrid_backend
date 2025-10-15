import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_GLsYC61DhqOm@ep-curly-rain-adwexyl1-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: {
    rejectUnauthorized: false
  }
});

async function updateDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Updating database schema...');
    
    const schema = fs.readFileSync(path.join(__dirname, 'update-schema.sql'), 'utf8');
    await client.query(schema);
    
    console.log('✅ Database schema updated successfully!');
    console.log('✅ Roles updated: resident, panchayat_officer, maintenance_technician, water_flow_controller');
    
  } catch (error) {
    console.error('❌ Error updating database:', error.message);
    console.error('Full error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

updateDatabase();
