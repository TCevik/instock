import { getSupabase } from './main.js';

export function loadHeader() {
    fetch("header.html")
        .then(response => response.text())
        .then(async html => {
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = html;
            
            while (tempDiv.firstChild) {
                document.body.insertBefore(tempDiv.firstChild, document.body.firstChild);
            }

            const path = window.location.pathname;
            document.querySelectorAll(".drawer-item").forEach(item => {
                const href = item.getAttribute("href");
                if (href && (path.endsWith(href) || (href === 'index.html' && (path.endsWith('/') || path.endsWith('index.html') || path === '')))) {
                    item.classList.add("active");
                } else {
                    item.classList.remove("active");
                }
            });

            const menuToggleBtn = document.getElementById("menuToggleBtn");
            const menuCloseBtn = document.getElementById("menuCloseBtn");
            const navDrawer = document.getElementById("navDrawer");
            const drawerOverlay = document.getElementById("drawerOverlay");

            const toggleDrawer = () => {
                navDrawer.classList.toggle("open");
                drawerOverlay.classList.toggle("open");
            };

            menuToggleBtn.addEventListener("click", toggleDrawer);
            menuCloseBtn.addEventListener("click", toggleDrawer);
            drawerOverlay.addEventListener("click", toggleDrawer);

            const supabase = await getSupabase();

            const logoutBtn = document.getElementById("logoutBtn");
            if (logoutBtn) {
                logoutBtn.addEventListener("click", async () => {
                    await supabase.auth.signOut();
                    window.location.href = 'login.html';
                });
            }

            supabase.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_OUT' || !session) {
                    window.location.href = 'login.html';
                }
            });

            supabase.from('stores').select('name')
                .then(({ data }) => {
                    if (data && data[0] && data[0].name) {
                        document.querySelectorAll(".logo").forEach(el => {
                            el.textContent = data[0].name;
                        });
                    }
                });

            supabase.auth.getSession().then(({ data: { session } }) => {
                if (session && session.user) {
                    supabase.from('user_data').select('role').eq('id', session.user.id)
                        .then(({ data }) => {
                            if (data && data[0] && data[0].role === 'medewerker') {
                                const allowed = ["dashboard", "product checker", "voorraadmutaties", "tht module", "tht registratie", "tellen"];
                                document.querySelectorAll(".drawer-item").forEach(item => {
                                    const text = item.querySelector("span").textContent.trim().toLowerCase();
                                    if (!allowed.includes(text)) {
                                        item.style.display = "none";
                                    }
                                });
                            }
                            window.dispatchEvent(new CustomEvent("menuReady"));
                        });
                } else {
                    window.location.href = 'login.html';
                }
            });
        });
}
