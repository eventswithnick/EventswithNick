// Events with Nick v7 secure production database configuration.
// Keep this as local only when testing offline without Supabase.
// For the secure admin version, change provider to supabase after you run backend/supabase-schema.sql and create the Supabase Auth admin user.

// STEP 4: Add the Supabase values into the website.
// Change this:
// window.EWN_BACKEND = {
//   provider: 'local',
//   supabaseUrl: '',
//   supabaseAnonKey: ''
// };
//
// To this, using your real Supabase Project URL and anon/public key:
// window.EWN_BACKEND = {
//   provider: 'supabase',
//   supabaseUrl: 'https://your-project-id.supabase.co',
//   supabaseAnonKey: 'your-anon-public-key-here'
// };
//
// IMPORTANT: Never place the Supabase service_role key in website files.
// Only use the anon/public key here.
window.EWN_BACKEND = {
  provider: 'supabase',
  supabaseUrl: 'https://gadhippufzyncetckmop.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhZGhpcHB1Znp5bmNldGNrbW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NDI3MjMsImV4cCI6MjA5NTAxODcyM30.4e6WjowMhUbhdKjLMAk_OywPfhHctmzyBZKxcBIqCt4'
};
