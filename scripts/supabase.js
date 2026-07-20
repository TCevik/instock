const supabaseUrl = 'https://nzlhsebjqgwlkbkmnicj.supabase.co';
const supabaseKey = 'sb_publishable_XNqImiBLIZGqYC1lYwrnFQ_Fnu2sAuy';

export const supabasePromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm')
  .then(({ createClient }) => {
    const supabase = createClient(supabaseUrl, supabaseKey);
    window.supabase = supabase;
    return supabase;
  });
