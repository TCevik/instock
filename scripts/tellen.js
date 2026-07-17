window.lastSearchResults = [];

function displayResults(products) {
    const container = document.getElementById("product-results");
    container.innerHTML = "";
    if (!products || products.length === 0) {
        container.innerHTML = '<div class="no-results">Geen producten gevonden</div>';
        return;
    }
    products.forEach(product => {
        const item = window.renderProductListItem(product, ` - Voorraad: ${product.aantal}`, () => {
            showCountForm(product);
        });
        container.appendChild(item);
    });
}

function showCountForm(product) {
    document.getElementById("search-section").style.display = "none";
    const container = document.getElementById("product-results");
    container.innerHTML = "";

    const card = document.createElement("div");
    card.className = "count-card";

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <button id="back-btn" class="back-btn">
                <span class="material-icons">arrow_back</span>
                <span>Terug</span>
            </button>
        </div>
        
        <div class="count-header">
            <span class="product-brand-text">${product.merk || "Merkloos"}</span>
            <h2 class="count-product-name">${product.naam || "Onbekend product"}</h2>
            <span class="count-product-info">EAN: ${product.ean || "-"} | Locatie: ${product.schaplocatie || "-"}</span>
        </div>

        <div class="count-form-section">
            <span class="count-form-label">Nieuw Aantal (Huidig: ${product.aantal})</span>
            <div class="count-control-wrapper">
                <button type="button" class="count-adjust-btn" id="count-minus">-</button>
                <input type="number" id="count-qty" class="count-qty-input" value="${product.aantal}" min="0">
                <button type="button" class="count-adjust-btn" id="count-plus">+</button>
            </div>
        </div>

        <div style="margin-top: 10px;">
            <button id="submit-count" class="checker-btn" style="width: 100%;">Telling opslaan</button>
        </div>
        <div id="feedback-message" style="display: none;"></div>
    `;

    const qtyInput = card.querySelector("#count-qty");
    const minusBtn = card.querySelector("#count-minus");
    const plusBtn = card.querySelector("#count-plus");
    const submitBtn = card.querySelector("#submit-count");
    const feedback = card.querySelector("#feedback-message");

    minusBtn.addEventListener("click", () => {
        let val = parseInt(qtyInput.value, 10) || 0;
        if (val > 0) qtyInput.value = val - 1;
    });

    plusBtn.addEventListener("click", () => {
        let val = parseInt(qtyInput.value, 10) || 0;
        qtyInput.value = val + 1;
    });

    card.querySelector("#back-btn").addEventListener("click", () => {
        document.getElementById("search-section").style.display = "flex";
        if (window.lastSearchResults.length > 0) {
            displayResults(window.lastSearchResults);
        } else {
            container.innerHTML = "";
            document.getElementById("product-input").value = "";
            document.getElementById("product-input").focus();
        }
    });

    submitBtn.addEventListener("click", async () => {
        const qty = parseInt(qtyInput.value, 10);
        if (isNaN(qty) || qty < 0) {
            alert("Voer een geldig aantal in.");
            return;
        }

        const client = await window.getSupabase();
        const { error } = await client
            .from("producten")
            .update({ aantal: qty })
            .eq("id", product.id);

        if (error) {
            console.error(error);
            alert("Fout bij het opslaan van de telling.");
            return;
        }

        product.aantal = qty;

        feedback.className = "success-message";
        feedback.textContent = `Succesvol opgeslagen! Nieuw aantal: ${qty}.`;
        feedback.style.display = "block";

        setTimeout(() => {
            feedback.style.display = "none";
        }, 4000);
    });

    container.appendChild(card);
    qtyInput.focus();
    qtyInput.select();
}

document.addEventListener("DOMContentLoaded", () => {
    window.initProductSearch(
        (product) => {
            window.lastSearchResults = [];
            showCountForm(product);
        },
        (products) => {
            window.lastSearchResults = products;
            displayResults(products);
        },
        () => {
            document.getElementById("product-results").innerHTML = "";
        }
    );
});
