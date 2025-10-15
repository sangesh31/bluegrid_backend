import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the fix script
const fixPath = path.join(__dirname, 'fix-database.sql');
const fixScript = fs.readFileSync(fixPath, 'utf8');

// Create a connection pool
const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_GLsYC61DhqOm@ep-curly-rain-adwexyl1-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: {
    rejectUnauthorized: false
  }
});

async function runFix() {
  const client = await pool.connect();
  
  try {
    console.log('Connected to Neon database...');
    console.log('Applying database fixes...');
    
    // Execute the fix script
    await client.query(fixScript);
    console.log('✅ Database fixes applied successfully!');
    
    // Test the tables
    const testQuery = `
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name IN ('users', 'profiles', 'pipe_reports', 'water_schedules')
      ORDER BY table_name, ordinal_position;
    `;
    
    const result = await client.query(testQuery);
    console.log('\n📋 Current table structure:');
    
    let currentTable = '';
    result.rows.forEach(row => {
      if (row.table_name !== currentTable) {
        currentTable = row.table_name;
        console.log(`\n${currentTable.toUpperCase()}:`);
      }
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
  } catch (error) {
    console.error('❌ Error applying fixes:', error.message);
    console.error('Full error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

runFix();
