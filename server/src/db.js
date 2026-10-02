const { createClient } = require("@supabase/supabase-js");

function createSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY in server/.env");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

module.exports = { createSupabase };
