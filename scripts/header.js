function init() {
    fetch("header.html")
        .then(response => response.text())
        .then(html => {
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

            const logoutBtn = document.getElementById("logoutBtn");
            if (logoutBtn) {
                logoutBtn.addEventListener("click", async () => {
                    if (window.supabase) {
                        await window.supabase.auth.signOut();
                        window.location.href = 'login.html';
                    }
                });
            }

            const updateLogo = () => {
                if (window.supabase) {
                    window.supabase.auth.onAuthStateChange((event, session) => {
                        if (event === 'SIGNED_OUT' || !session) {
                            window.location.href = 'login.html';
                        }
                    });

                    window.supabase.from('stores').select('name')
                        .then(({ data }) => {
                            if (data && data[0] && data[0].name) {
                                document.querySelectorAll(".logo").forEach(el => {
                                    el.textContent = data[0].name;
                                });
                            }
                        });

                    window.supabase.auth.getSession().then(({ data: { session } }) => {
                        if (session && session.user) {
                            window.supabase.from('user_data').select('role').eq('id', session.user.id)
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
                } else {
                    setTimeout(updateLogo, 50);
                }
            };
            updateLogo();
        });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
