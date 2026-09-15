import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'http://127.0.0.1:55321';
const supabaseKey = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

export const supabase = createClient(supabaseUrl, supabaseKey);

supabase.auth.onAuthStateChange((event, session) => {
    if ((event === 'SIGNED_OUT' || !session) && !window.location.pathname.endsWith('login.html')) {
        window.location.replace('login.html');
    }
});