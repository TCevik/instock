const meta = document.createElement("meta");
meta.name = "viewport";
meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
document.head.appendChild(meta);

const supabaseScript = document.createElement("script");
supabaseScript.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
document.head.appendChild(supabaseScript);

supabaseScript.onload = async () => {
    window.supabaseClient = supabase.createClient(
        "https://geabdfhcbzfgmetuaocl.supabase.co",
        "sb_publishable_BFeKHHjqJmwvlU_GZ2CKZA_sidiX_Ov"
    );

    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const isLoginPage = window.location.pathname.endsWith("login.html");

    if (isLoginPage && session) {
        window.location.href = "index.html";
    } else if (!isLoginPage && !session) {
        window.location.href = "login.html";
    }

    window.supabaseClient.auth.onAuthStateChange((event, currentSession) => {
        const onLogin = window.location.pathname.endsWith("login.html");
        if (onLogin && currentSession) {
            window.location.href = "index.html";
        } else if (!onLogin && !currentSession) {
            window.location.href = "login.html";
        }
    });
};
