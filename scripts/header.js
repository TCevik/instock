document.addEventListener("DOMContentLoaded", () => {
    fetch("./header.html")
        .then(r => r.text())
        .then(html => {
            document.body.insertAdjacentHTML("afterbegin", html);
            
            const menuBtn = document.getElementById("menu-btn");
            const closeBtn = document.getElementById("close-btn");
            const sideMenu = document.getElementById("side-menu");
            const overlay = document.getElementById("menu-overlay");

            const toggleMenu = () => {
                sideMenu.classList.toggle("open");
                overlay.classList.toggle("open");
            };

            menuBtn.addEventListener("click", toggleMenu);
            closeBtn.addEventListener("click", toggleMenu);
            overlay.addEventListener("click", toggleMenu);

            const currentPath = window.location.pathname;
            const links = sideMenu.querySelectorAll(".side-menu-nav a");
            links.forEach(link => {
                const href = link.getAttribute("href");
                if (href && (currentPath.endsWith("/" + href) || (href === "index.html" && currentPath.endsWith("/")))) {
                    link.classList.add("active");
                }
            });

            const logoutBtn = document.getElementById("logout-btn");
            if (logoutBtn) {
                logoutBtn.addEventListener("click", async () => {
                    if (window.supabaseClient) {
                        await window.supabaseClient.auth.signOut();
                    }
                });
            }

            (async () => {
                const client = await window.getSupabase();
                const { data: { session } } = await client.auth.getSession();
                const beheerLink = document.getElementById("menu-beheer");
                if (beheerLink) {
                    if (session) {
                        const { data: profile } = await client
                            .from("profielen")
                            .select("rol")
                            .eq("id", session.user.id)
                            .maybeSingle();
                        if (profile && profile.rol === "beheerder") {
                            beheerLink.classList.remove("hidden");
                        } else {
                            beheerLink.classList.add("hidden");
                        }
                    } else {
                        beheerLink.classList.add("hidden");
                    }
                }
            })();
        });
});
