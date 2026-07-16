document.addEventListener("DOMContentLoaded", () => {
    fetch("./header.html")
        .then(r => r.text())
        .then(html => {
            document.body.insertAdjacentHTML("afterbegin", html);
        });
});
