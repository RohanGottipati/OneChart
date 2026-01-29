
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tyisejampxuaorprspcu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5aXNlamFtcHh1YW9ycHJzcGN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTY4MTksImV4cCI6MjA4NTE5MjgxOX0.DaoCBjryHUGlom11NEcx0BTew8UHbQBVCmDb4mUwDgk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
