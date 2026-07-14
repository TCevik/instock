document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("scan-form");
    const input = document.getElementById("ean-input");

    if (form && input) {
        input.focus();

        input.addEventListener("input", () => {
            const value = input.value.trim();
            if (value.length === 13 && /^\d+$/.test(value)) {
                form.requestSubmit();
            }
        });

        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const value = input.value.trim();

            if (!value) {
                showToast("EAN-code is verplicht");
                return;
            }

            if (!/^\d+$/.test(value)) {
                showToast("EAN-code mag alleen cijfers bevatten");
                return;
            }

            if (value.length !== 13) {
                showToast("EAN-code moet 13 cijfers zijn");
                return;
            }
        });
    }
});
