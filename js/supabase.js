import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let supabaseUrl = 'https://rccfnnagfgqxjstktnqf.supabase.co';
let supabaseKey = 'sb_publishable_cQWpzRPJckb61jL0M83K6A_rVwf4Lum';

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
if (isLocal) {
  supabaseUrl = 'http://127.0.0.1:54321';
  supabaseKey = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    experimental: {
      passkey: true,
    },
  },
});