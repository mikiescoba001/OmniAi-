/* ============================================
   OmniAI — Database Migration Runner
   Usage: npm run migrate
   ============================================ */
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runMigrations() {
  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    console.log(`Running migration: ${file}...`);

    try {
      // Execute raw SQL via Supabase's rpc or rest endpoint
      const { error } = await supabase.rpc('exec_sql', { sql_text: sql });

      if (error) {
        // If exec_sql isn't available, try splitting and running statements
        console.warn(`⚠️  Could not run via RPC (${error.message}).`);
        console.warn('   Please run the SQL manually in Supabase SQL Editor:');
        console.warn(`   File: ${filePath}`);
        console.log('');
      } else {
        console.log(`✅ ${file} applied successfully.`);
      }
    } catch (err) {
      console.error(`❌ Error running ${file}:`, err.message);
    }
  }

  console.log('\nMigration complete. For production, use Supabase CLI:');
  console.log('  npx supabase db push');
}

runMigrations().catch(console.error);