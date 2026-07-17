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
                const historieLink = document.getElementById("menu-historie");
                const nieuwProductLink = document.getElementById("menu-nieuw-product");
                const dashHistorie = document.getElementById("dash-historie");
                const dashNieuwProduct = document.getElementById("dash-nieuw-product");
                const welcomeTitle = document.getElementById("welcome-title");
                if (session) {
                    const { data: profile } = await client
                        .from("profielen")
                        .select("rol, volledige_naam")
                        .eq("id", session.user.id)
                        .maybeSingle();
                    if (profile) {
                        if (welcomeTitle && profile.volledige_naam) {
                            welcomeTitle.textContent = `Welkom terug, ${profile.volledige_naam}`;
                        }
                        if (profile.rol === "beheerder") {
                            if (beheerLink) beheerLink.classList.remove("hidden");
                            if (historieLink) historieLink.classList.remove("hidden");
                            if (nieuwProductLink) nieuwProductLink.classList.remove("hidden");
                            if (dashHistorie) dashHistorie.classList.remove("hidden");
                            if (dashNieuwProduct) dashNieuwProduct.classList.remove("hidden");
                        } else {
                            if (beheerLink) beheerLink.classList.add("hidden");
                            if (historieLink) historieLink.classList.add("hidden");
                            if (nieuwProductLink) nieuwProductLink.classList.add("hidden");
                            if (dashHistorie) dashHistorie.classList.add("hidden");
                            if (dashNieuwProduct) dashNieuwProduct.classList.add("hidden");
                        }
                    }
                } else {
                    if (beheerLink) beheerLink.classList.add("hidden");
                    if (historieLink) historieLink.classList.add("hidden");
                    if (nieuwProductLink) nieuwProductLink.classList.add("hidden");
                    if (dashHistorie) dashHistorie.classList.add("hidden");
                    if (dashNieuwProduct) dashNieuwProduct.classList.add("hidden");
                }
            })();
        });
});
