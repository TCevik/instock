const supabaseUrl = 'https://nzlhsebjqgwlkbkmnicj.supabase.co';
const supabaseKey = 'sb_publishable_XNqImiBLIZGqYC1lYwrnFQ_Fnu2sAuy';

import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm')
  .then(({ createClient }) => {
    const supabase = createClient(supabaseUrl, supabaseKey);
    window.supabase = supabase;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && !window.location.pathname.includes('login')) {
        window.location.href = 'login.html';
      }
    });

    supabase.auth.onAuthStateChange((event, session) => {
      if (!session && !window.location.pathname.includes('login')) {
        window.location.href = 'login.html';
      }
    });
  });
