document.addEventListener("DOMContentLoaded", () => {
    const button = document.getElementById("check-btn");
    const input = document.getElementById("product-input");

    button.addEventListener("click", () => {
        const query = input.value.trim();
        if (query) {
            console.log("Checking product:", query);
        }
    });
});
