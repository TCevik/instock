const initDashboard = () => {
    if (window.supabase) {
        window.supabase.auth.getSession().then(({ data: { session } }) => {
            if (session && session.user) {
                window.supabase
                    .from('user_data')
                    .select('full_name')
                    .eq('id', session.user.id)
                    .then(({ data }) => {
                        const welcomeEl = document.getElementById("welcome-message");
                        if (welcomeEl) {
                            if (data && data[0] && data[0].full_name) {
                                welcomeEl.textContent = `Welkom, ${data[0].full_name}!`;
                            } else {
                                welcomeEl.textContent = "Welkom terug!";
                            }
                        }
                    });
            }
        });
    } else {
        setTimeout(initDashboard, 50);
    }
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDashboard);
} else {
    initDashboard();
}
