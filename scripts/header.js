function init() {
    fetch("header.html")
        .then(response => response.text())
        .then(html => {
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = html;
            
            while (tempDiv.firstChild) {
                document.body.insertBefore(tempDiv.firstChild, document.body.firstChild);
            }

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
        });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
