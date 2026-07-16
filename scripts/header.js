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
        });
});
