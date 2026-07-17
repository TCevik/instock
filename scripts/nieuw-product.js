document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("product-form");
    const pageTitle = document.getElementById("page-title");
    const cancelBtn = document.getElementById("cancel-btn");
    
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get("id");
    const fromPage = urlParams.get("from") || (productId ? "product-checker.html" : "index.html");
    let loadedNaam = "";
    let loadedEan = "";
 
    const deleteBtn = document.getElementById("delete-btn");

    cancelBtn.addEventListener("click", () => {
        window.location.href = fromPage;
    });

    window.getSupabase().then(() => {
        if (productId) {
            loadProduct(productId);
            if (deleteBtn) {
                deleteBtn.style.display = "block";
            }
        }
    });

    const deleteModal = document.getElementById("delete-modal");
    const modalCancelBtn = document.getElementById("modal-cancel-btn");
    const modalConfirmBtn = document.getElementById("modal-confirm-btn");
    const confirmNaamInput = document.getElementById("confirm-naam-input");
    const confirmEanInput = document.getElementById("confirm-ean-input");

    function validateConfirmation() {
        const matchesNaam = (confirmNaamInput ? confirmNaamInput.value.trim() : "") === loadedNaam.trim();
        const matchesEan = (confirmEanInput ? confirmEanInput.value.trim() : "") === loadedEan.trim();

        if (matchesNaam && matchesEan) {
            modalConfirmBtn.disabled = false;
            modalConfirmBtn.style.opacity = "1";
            modalConfirmBtn.style.cursor = "pointer";
        } else {
            modalConfirmBtn.disabled = true;
            modalConfirmBtn.style.opacity = "0.5";
            modalConfirmBtn.style.cursor = "not-allowed";
        }
    }

    if (confirmNaamInput) {
        confirmNaamInput.addEventListener("input", validateConfirmation);
    }
    if (confirmEanInput) {
        confirmEanInput.addEventListener("input", validateConfirmation);
    }

    if (deleteBtn && deleteModal) {
        deleteBtn.addEventListener("click", () => {
            const confirmNameLabel = document.getElementById("delete-confirm-name");
            const confirmEanLabel = document.getElementById("delete-confirm-ean");
            if (confirmNameLabel) confirmNameLabel.textContent = loadedNaam;
            if (confirmEanLabel) confirmEanLabel.textContent = loadedEan;

            if (confirmNaamInput) confirmNaamInput.value = "";
            if (confirmEanInput) confirmEanInput.value = "";
            validateConfirmation();
            deleteModal.style.display = "flex";
        });
    }

    if (modalCancelBtn && deleteModal) {
        modalCancelBtn.addEventListener("click", () => {
            deleteModal.style.display = "none";
        });
    }

    const deleteConfirmModal = document.getElementById("delete-confirm-modal");
    const modalFinalCancelBtn = document.getElementById("modal-final-cancel-btn");
    const modalFinalConfirmBtn = document.getElementById("modal-final-confirm-btn");

    if (modalConfirmBtn && deleteConfirmModal && deleteModal) {
        modalConfirmBtn.addEventListener("click", () => {
            deleteModal.style.display = "none";
            deleteConfirmModal.style.display = "flex";
        });
    }

    if (modalFinalCancelBtn && deleteConfirmModal) {
        modalFinalCancelBtn.addEventListener("click", () => {
            deleteConfirmModal.style.display = "none";
        });
    }

    if (modalFinalConfirmBtn) {
        modalFinalConfirmBtn.addEventListener("click", async () => {
            const { error } = await window.supabaseClient
                .from("producten")
                .delete()
                .eq("id", productId);

            if (error) {
                console.error(error);
                alert("Er is een fout opgetreden bij het verwijderen van het product.");
            } else {
                window.location.href = fromPage;
            }
        });
    }

    async function loadProduct(id) {
        pageTitle.textContent = "Product Bewerken";
        const { data, error } = await window.supabaseClient
            .from("producten")
            .select("*")
            .eq("id", id)
            .single();

        if (error) {
            console.error(error);
            return;
        }

        if (data) {
            loadedNaam = data.naam || "";
            loadedEan = data.ean || "";
            document.getElementById("naam").value = data.naam || "";
            document.getElementById("merk").value = data.merk || "";
            document.getElementById("ean").value = data.ean || "";
            document.getElementById("afdeling").value = data.afdeling || "";
            document.getElementById("schaplocatie").value = data.schaplocatie || "";
            document.getElementById("prijs").value = data.prijs !== null ? data.prijs : "";
            document.getElementById("aantal").value = data.aantal !== null ? data.aantal : "";
            document.getElementById("inhoud").value = data.inhoud || "";
            document.getElementById("tht_datum").value = data.tht_datum || "";
        }
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const payload = {
            naam: document.getElementById("naam").value.trim(),
            merk: document.getElementById("merk").value.trim(),
            ean: document.getElementById("ean").value.trim(),
            afdeling: document.getElementById("afdeling").value.trim(),
            schaplocatie: document.getElementById("schaplocatie").value.trim(),
            prijs: parseFloat(document.getElementById("prijs").value),
            aantal: parseInt(document.getElementById("aantal").value, 10),
            inhoud: document.getElementById("inhoud").value.trim(),
            tht_datum: document.getElementById("tht_datum").value || null
        };

        let result;
        if (productId) {
            result = await window.supabaseClient
                .from("producten")
                .update(payload)
                .eq("id", productId);
        } else {
            const { data: { user } } = await window.supabaseClient.auth.getUser();
            const { data: profile } = await window.supabaseClient
                .from("profielen")
                .select("winkel_id")
                .eq("id", user.id)
                .single();

            const insertPayload = {
                ...payload,
                winkel_id: profile.winkel_id
            };

            result = await window.supabaseClient
                .from("producten")
                .insert([insertPayload]);
        }

        if (result.error) {
            console.error(result.error);
            alert("Er is een fout opgetreden bij het opslaan van het product.");
        } else {
            window.location.href = fromPage;
        }
    });
});
