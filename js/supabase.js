import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://rccfnnagfgqxjstktnqf.supabase.co';
const supabaseKey = 'sb_publishable_cQWpzRPJckb61jL0M83K6A_rVwf4Lum';

export const supabase = createClient(supabaseUrl, supabaseKey);