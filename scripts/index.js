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

const generateDashboardCards = () => {
    const grid = document.getElementById("dashboardGrid");
    if (!grid) return;
    grid.innerHTML = "";
    const items = document.querySelectorAll(".drawer-item");
    items.forEach(item => {
        if (item.style.display === "none") return;
        const text = item.querySelector("span").textContent.trim();
        if (text.toLowerCase() === "dashboard") return;
        const icon = item.querySelector("i").textContent.trim();
        const href = item.getAttribute("href");

        const card = document.createElement("a");
        card.className = "dashboard-card";
        card.href = href;

        if (href === "#") {
            card.addEventListener("click", (e) => {
                e.preventDefault();
                item.click();
            });
        }

        const iconContainer = document.createElement("div");
        iconContainer.className = "dashboard-card-icon";
        const iconEl = document.createElement("i");
        iconEl.className = "material-icons";
        iconEl.textContent = icon;
        iconContainer.appendChild(iconEl);

        const title = document.createElement("div");
        title.className = "dashboard-card-title";
        title.textContent = text;

        const arrow = document.createElement("i");
        arrow.className = "material-icons dashboard-card-arrow";
        arrow.textContent = "arrow_forward";

        card.appendChild(iconContainer);
        card.appendChild(title);
        card.appendChild(arrow);
        grid.appendChild(card);
    });
};

window.addEventListener("menuReady", generateDashboardCards);

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDashboard);
} else {
    initDashboard();
}
