import { Pool } from 'pg';

// Create a connection pool
const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_GLsYC61DhqOm@ep-curly-rain-adwexyl1-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: {
    rejectUnauthorized: false
  }
});

async function checkDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Connected to Neon database...');
    console.log('Checking current database structure...\n');
    
    // Check what tables exist
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    
    const tablesResult = await client.query(tablesQuery);
    console.log('📋 Existing tables:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
    // Check columns for each table
    const columnsQuery = `
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `;
    
    const columnsResult = await client.query(columnsQuery);
    console.log('\n📋 Table structures:');
    
    let currentTable = '';
    columnsResult.rows.forEach(row => {
      if (row.table_name !== currentTable) {
        currentTable = row.table_name;
        console.log(`\n${currentTable.toUpperCase()}:`);
      }
      console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? '(NOT NULL)' : '(NULL)'}`);
    });
    
    // Check enum types
    const enumsQuery = `
      SELECT t.typname, e.enumlabel 
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid 
      WHERE t.typname LIKE '%role%' OR t.typname LIKE '%status%'
      ORDER BY t.typname, e.enumsortorder;
    `;
    
    const enumsResult = await client.query(enumsQuery);
    console.log('\n📋 Enum types:');
    
    let currentEnum = '';
    enumsResult.rows.forEach(row => {
      if (row.typname !== currentEnum) {
        currentEnum = row.typname;
        console.log(`\n${currentEnum}:`);
      }
      console.log(`  - ${row.enumlabel}`);
    });
    
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkDatabase();
