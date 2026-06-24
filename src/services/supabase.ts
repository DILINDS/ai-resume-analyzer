import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ofvlclnoewnbbjuelfjg.supabase.co";

const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mdmxjbG5vZXduYmJqdWVsZmpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMzU5NjgsImV4cCI6MjA5NzgxMTk2OH0.qXB7Gz0nNQFYMpmaNSM92IBvakL_CX_tSjNzlOPOmRs";

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
);