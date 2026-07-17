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
            showMutationForm(product);
        });
        container.appendChild(item);
    });
}

function showMutationForm(product) {
    document.getElementById("search-section").style.display = "none";
    const container = document.getElementById("product-results");
    container.innerHTML = "";

    const card = document.createElement("div");
    card.className = "mutation-card";

    let mutationType = "sub";
    let selectedReason = "Correctie";

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <button id="back-btn" class="back-btn">
                <span class="material-icons">arrow_back</span>
                <span>Terug</span>
            </button>
        </div>
        
        <div class="mutation-header">
            <span class="product-brand-text">${product.merk || "Merkloos"}</span>
            <h2 class="mutation-product-name">${product.naam || "Onbekend product"}</h2>
            <span class="mutation-product-info">EAN: ${product.ean || "-"} | Locatie: ${product.schaplocatie || "-"}</span>
        </div>

        <div class="mutation-stock-badge">
            <span>Huidige voorraad</span>
            <span class="mutation-stock-value" id="current-stock">${product.aantal} stuks</span>
        </div>

        <div class="mutation-form-section">
            <span class="mutation-form-label">Type mutatie</span>
            <div class="mutation-type-buttons">
                <button type="button" id="type-sub" class="type-btn active-sub">
                    <span class="material-icons">remove_circle_outline</span>
                    <span>Afschrijven</span>
                </button>
                <button type="button" id="type-add" class="type-btn">
                    <span class="material-icons">add_circle_outline</span>
                    <span>Toevoegen</span>
                </button>
            </div>
        </div>

        <div class="mutation-form-section">
            <span class="mutation-form-label">Aantal</span>
            <div class="quantity-control-wrapper">
                <button type="button" class="qty-adjust-btn" id="qty-minus">-</button>
                <input type="number" id="mutation-qty" class="mutation-qty-input" value="1" min="1">
                <button type="button" class="qty-adjust-btn" id="qty-plus">+</button>
            </div>
        </div>

        <div class="mutation-form-section">
            <span class="mutation-form-label">Reden</span>
            <div class="reason-grid" id="reason-container">
                <button type="button" class="reason-btn active" data-reason="Correctie">Correctie</button>
                <button type="button" class="reason-btn" data-reason="Breuk">Breuk</button>
                <button type="button" class="reason-btn" data-reason="Diefstal">Diefstal</button>
                <button type="button" class="reason-btn" data-reason="Levering">Levering</button>
                <button type="button" class="reason-btn" data-reason="Overig">Overig</button>
            </div>
        </div>

        <div style="margin-top: 10px;">
            <button id="submit-mutation" class="checker-btn" style="width: 100%;">Mutatie verwerken</button>
        </div>
        <div id="feedback-message" style="display: none;"></div>
    `;

    const qtyInput = card.querySelector("#mutation-qty");
    const subBtn = card.querySelector("#type-sub");
    const addBtn = card.querySelector("#type-add");
    const minusBtn = card.querySelector("#qty-minus");
    const plusBtn = card.querySelector("#qty-plus");
    const submitBtn = card.querySelector("#submit-mutation");
    const feedback = card.querySelector("#feedback-message");
    const reasonButtons = card.querySelectorAll(".reason-btn");

    subBtn.addEventListener("click", () => {
        mutationType = "sub";
        subBtn.classList.add("active-sub");
        addBtn.classList.remove("active-add");
    });

    addBtn.addEventListener("click", () => {
        mutationType = "add";
        addBtn.classList.add("active-add");
        subBtn.classList.remove("active-sub");
    });

    minusBtn.addEventListener("click", () => {
        let val = parseInt(qtyInput.value, 10) || 1;
        if (val > 1) qtyInput.value = val - 1;
    });

    plusBtn.addEventListener("click", () => {
        let val = parseInt(qtyInput.value, 10) || 0;
        qtyInput.value = val + 1;
    });

    reasonButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            reasonButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            selectedReason = btn.getAttribute("data-reason");
        });
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
        if (isNaN(qty) || qty <= 0) {
            alert("Voer een geldig aantal in.");
            return;
        }

        let newStock = product.aantal;
        if (mutationType === "add") {
            newStock += qty;
        } else {
            newStock -= qty;
        }

        if (newStock < 0) {
            if (!confirm("De voorraad wordt negatief. Weet u zeker dat u dit wilt doorvoeren?")) {
                return;
            }
        }

        const client = await window.getSupabase();
        const { error } = await client
            .from("producten")
            .update({ aantal: newStock })
            .eq("id", product.id);

        if (error) {
            console.error(error);
            alert("Fout bij het verwerken van de mutatie.");
            return;
        }

        product.aantal = newStock;
        card.querySelector("#current-stock").textContent = `${newStock} stuks`;
        qtyInput.value = "1";

        feedback.className = "success-message";
        feedback.textContent = `Succesvol gemuteerd (${mutationType === "add" ? "+" : "-"}${qty}). Reden: ${selectedReason}.`;
        feedback.style.display = "block";

        setTimeout(() => {
            feedback.style.display = "none";
        }, 4000);
    });

    container.appendChild(card);
}

document.addEventListener("DOMContentLoaded", () => {
    window.initProductSearch(
        (product) => {
            window.lastSearchResults = [];
            showMutationForm(product);
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
