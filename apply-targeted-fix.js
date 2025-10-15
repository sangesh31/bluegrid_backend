import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the targeted fix script
const fixPath = path.join(__dirname, 'targeted-fix.sql');
const fixScript = fs.readFileSync(fixPath, 'utf8');

// Create a connection pool
const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_GLsYC61DhqOm@ep-curly-rain-adwexyl1-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: {
    rejectUnauthorized: false
  }
});

async function applyTargetedFix() {
  const client = await pool.connect();
  
  try {
    console.log('Connected to Neon database...');
    console.log('Applying targeted database fixes...');
    
    // Execute the fix script
    await client.query(fixScript);
    console.log('✅ Targeted fixes applied successfully!');
    
    // Verify the changes
    console.log('\n🔍 Verifying changes...');
    
    // Check pipe_reports columns
    const pipeReportsColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'pipe_reports' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);
    
    console.log('\nPIPE_REPORTS columns:');
    pipeReportsColumns.rows.forEach(row => {
      console.log(`  - ${row.column_name}`);
    });
    
    // Check water_schedules columns
    const waterSchedulesColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'water_schedules' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);
    
    console.log('\nWATER_SCHEDULES columns:');
    waterSchedulesColumns.rows.forEach(row => {
      console.log(`  - ${row.column_name}`);
    });
    
    // Check report_status enum values
    const reportStatusValues = await client.query(`
      SELECT enumlabel 
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'report_status'
      ORDER BY e.enumsortorder;
    `);
    
    console.log('\nREPORT_STATUS enum values:');
    reportStatusValues.rows.forEach(row => {
      console.log(`  - ${row.enumlabel}`);
    });
    
    // Check if views were created
    const views = await client.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    console.log('\nVIEWS created:');
    views.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
    console.log('\n✅ Database is now ready for staff creation!');
    console.log('✅ You can now create maintenance technicians and water flow controllers');
    console.log('✅ Default admin: admin@bluegrid.com / admin123');
    
  } catch (error) {
    console.error('❌ Error applying targeted fixes:', error.message);
    console.error('Full error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

applyTargetedFix();
