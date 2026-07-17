document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("product-form");
    const pageTitle = document.getElementById("page-title");
    const cancelBtn = document.getElementById("cancel-btn");
    
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get("id");

    cancelBtn.addEventListener("click", () => {
        if (productId) {
            window.location.href = "product-checker.html";
        } else {
            window.location.href = "index.html";
        }
    });

    const checkSupabase = setInterval(() => {
        if (window.supabaseClient) {
            clearInterval(checkSupabase);
            if (productId) {
                loadProduct(productId);
            }
        }
    }, 100);

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
            result = await window.supabaseClient
                .from("producten")
                .insert([payload]);
        }

        if (result.error) {
            console.error(result.error);
            alert("Er is een fout opgetreden bij het opslaan van het product.");
        } else {
            window.location.href = "product-checker.html";
        }
    });
});
