function showToast(message, type = "error") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        document.body.appendChild(container);
    }

    const activeToasts = Array.from(container.getElementsByClassName("toast")).filter(t => !t.classList.contains("dismissing"));
    if (activeToasts.length >= 4) {
        const oldest = activeToasts[0];
        oldest.classList.add("dismissing");
        setTimeout(() => {
            oldest.classList.remove("show");
            setTimeout(() => {
                oldest.remove();
            }, 300);
        }, 300);
    }

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("show");
    }, 10);

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}
