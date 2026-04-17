import 'server-only';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Client for browser (limited access)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for server-side (full access)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export default supabase;
