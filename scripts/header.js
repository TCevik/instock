document.addEventListener("DOMContentLoaded", () => {
    fetch("header.html")
        .then(response => response.text())
        .then(data => {
            const cleanData = data.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
            document.body.insertAdjacentHTML("afterbegin", cleanData);

            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = "css/header.css";
            document.head.appendChild(link);

            const initialize = () => {
                lucide.createIcons();

                const menuBtn = document.getElementById("menuBtn");
                const closeBtn = document.getElementById("closeBtn");
                const sidebar = document.getElementById("sidebar");
                const overlay = document.getElementById("overlay");

                if (menuBtn && closeBtn && sidebar && overlay) {
                    const openMenu = () => {
                        sidebar.classList.add("open");
                        overlay.classList.add("visible");
                        document.body.style.overflow = "hidden";
                    };

                    const closeMenu = () => {
                        sidebar.classList.remove("open");
                        overlay.classList.remove("visible");
                        document.body.style.overflow = "";
                    };

                    menuBtn.addEventListener("click", openMenu);
                    closeBtn.addEventListener("click", closeMenu);
                    overlay.addEventListener("click", closeMenu);
                }
            };

            if (typeof lucide === "undefined") {
                const script = document.createElement("script");
                script.src = "https://unpkg.com/lucide@latest";
                script.onload = initialize;
                document.head.appendChild(script);
            } else {
                initialize();
            }
        });
});