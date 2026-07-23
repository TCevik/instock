import { getSupabase } from './main.js';

export function applyStoreTheme(hex) {
    if (!hex) return;
    document.documentElement.style.setProperty('--accent-color', hex);
    const r = parseInt(hex.slice(1, 3), 16) || 101;
    const g = parseInt(hex.slice(3, 5), 16) || 141;
    const b = parseInt(hex.slice(5, 7), 16) || 36;
    document.documentElement.style.setProperty('--vullen-bg', `rgba(${r}, ${g}, ${b}, 0.15)`);
    document.documentElement.style.setProperty('--vullen-card-bg', `rgba(${r}, ${g}, ${b}, 0.05)`);
    document.documentElement.style.setProperty('--vullen-border', `rgba(${r}, ${g}, ${b}, 0.3)`);
    document.documentElement.style.setProperty('--pdf-new-bg', `rgba(${r}, ${g}, ${b}, 0.15)`);
    document.documentElement.style.setProperty('--pdf-new-border', `rgba(${r}, ${g}, ${b}, 0.5)`);
    document.documentElement.style.setProperty('--status-new-bg', `rgba(${r}, ${g}, ${b}, 0.2)`);
    document.documentElement.style.setProperty('--gem-verk-bg', `rgba(${r}, ${g}, ${b}, 0.15)`);
}

export async function updateHeaderMenu() {
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) return;

    const { data } = await supabase.from('user_data').select('role, winkel').eq('id', session.user.id);
    if (!data || !data[0]) return;

    const userRole = data[0].role;
    const storeId = data[0].winkel;

    const { data: storeInfo } = await supabase.from('stores_info').select('modules, color').eq('store_id', storeId).maybeSingle();
    const modules = storeInfo?.modules || {};

    let hex = localStorage.getItem('store_primary_color');
    if (storeInfo?.color && storeInfo.color.primary) {
        hex = storeInfo.color.primary;
        localStorage.setItem('store_primary_color', hex);
    }

    if (hex) {
        applyStoreTheme(hex);
    }

    const moduleMap = {
        "product checker": "product_checker",
        "voorraadmutaties": "voorraadmutaties",
        "tht module": "tht_module",
        "tht registratie": "tht_registratie",
        "tellen": "tellen",
        "acties": "acties",
        "rapportages": "rapportages",
        "bakplan": "bakplan",
        "vulplanning maker": "vulplanning",
        "product toevoegen": "product_toevoegen",
        "gebruikersbeheer": "gebruikersbeheer",
        "instellingen winkel": "instellingen_winkel"
    };

    const fixedHiddenForMedewerker = ["gebruikersbeheer", "instellingen_winkel", "bakplan", "vulplanning"];
    const productRelatedKeys = ["product_checker", "voorraadmutaties", "tht_module", "tht_registratie", "tellen", "acties"];
    const allProductRelatedOff = productRelatedKeys.every(k => modules[k] === false);

    document.querySelectorAll(".drawer-item").forEach(item => {
        const span = item.querySelector("span");
        if (!span) return;
        const text = span.textContent.trim().toLowerCase();
        if (text === 'dashboard') return;

        const key = moduleMap[text];

        if (key === 'product_toevoegen' && allProductRelatedOff) {
            item.style.display = "none";
            return;
        }

        if (userRole === 'medewerker' && fixedHiddenForMedewerker.includes(key)) {
            item.style.display = "none";
            return;
        }

        if (key && modules[key] === false) {
            item.style.display = "none";
        } else {
            item.style.display = "";
        }
    });
}

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

            const fullscreenBtn = document.getElementById("fullscreenBtn");
            if (fullscreenBtn) {
                fullscreenBtn.addEventListener("click", () => {
                    if (!document.fullscreenElement) {
                        document.documentElement.requestFullscreen().catch(() => {});
                    } else {
                        if (document.exitFullscreen) {
                            document.exitFullscreen().catch(() => {});
                        }
                    }
                });

                document.addEventListener("fullscreenchange", () => {
                    const icon = fullscreenBtn.querySelector("i");
                    if (icon) {
                        icon.textContent = document.fullscreenElement ? "fullscreen_exit" : "fullscreen";
                    }
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

            await updateHeaderMenu();
            window.dispatchEvent(new CustomEvent("menuReady"));
        });
}
