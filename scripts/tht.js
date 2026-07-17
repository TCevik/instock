let currentProducts = [];
let currentControleIndex = -1;

async function fetchTHTProducts() {
    if (!window.supabaseClient) {
        setTimeout(fetchTHTProducts, 100);
        return;
    }
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) {
        setTimeout(fetchTHTProducts, 100);
        return;
    }
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 2);
    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const dateString = `${yyyy}-${mm}-${dd}`;

    const title = document.getElementById("tht-title");
    if (title) title.style.display = "block";
    const dateLabel = document.getElementById("tht-date-label");
    if (dateLabel) {
        dateLabel.style.display = "block";
        dateLabel.textContent = `Producten die verlopen tot en met: ${targetDate.toLocaleDateString("nl-NL")}`;
    }

    const { data, error } = await window.supabaseClient
        .from("producten")
        .select("*")
        .lte("tht_datum", dateString)
        .order("tht_datum", { ascending: true });

    if (error) {
        console.error(error);
        return;
    }

    currentProducts = data || [];
    displayResults(currentProducts);
}

function displayResults(products) {
    const actionContainer = document.getElementById("controle-action-container");
    actionContainer.innerHTML = "";
    
    const container = document.getElementById("product-results");
    container.innerHTML = "";
    
    if (!products || products.length === 0) {
        container.innerHTML = '<div class="no-results">Geen producten die binnen 2 dagen verlopen</div>';
        return;
    }

    const startBtn = document.createElement("button");
    startBtn.className = "checker-btn";
    startBtn.textContent = `Start THT Controle (${products.length} producten)`;
    startBtn.addEventListener("click", () => {
        currentControleIndex = 0;
        showControleStep();
    });
    actionContainer.appendChild(startBtn);

    products.forEach(product => {
        const item = window.renderProductListItem(product, ` - THT: ${window.formatDate(product.tht_datum)}`, () => {
            showProductDetails(product);
        });
        container.appendChild(item);
    });
}

function showControleStep() {
    const title = document.getElementById("tht-title");
    if (title) title.style.display = "none";
    const dateLabel = document.getElementById("tht-date-label");
    if (dateLabel) dateLabel.style.display = "none";

    const actionContainer = document.getElementById("controle-action-container");
    actionContainer.innerHTML = "";
    
    const container = document.getElementById("product-results");
    container.innerHTML = "";

    if (currentControleIndex < 0 || currentControleIndex >= currentProducts.length) {
        fetchTHTProducts();
        return;
    }

    const product = currentProducts[currentControleIndex];
    const tht = window.formatDate(product.tht_datum);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thtDate = product.tht_datum ? new Date(product.tht_datum) : null;
    if (thtDate) thtDate.setHours(0, 0, 0, 0);
    const isExpired = thtDate && thtDate < today;
    const thtColor = isExpired ? "#ff5252" : "#ffffff";

    const stepCard = document.createElement("div");
    stepCard.className = "product-details-view";

    stepCard.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 12px;">
            <button id="stop-controle-btn" class="back-btn" style="padding: 6px 12px; font-size: 0.85rem; border-radius: 8px;">&larr; Stoppen</button>
            <span style="font-weight: 600; font-size: 0.9rem; color: #666666;">Product ${currentControleIndex + 1} / ${currentProducts.length}</span>
        </div>
        
        <div class="product-details-header" style="margin-top: 8px;">
            <span class="product-brand-text">${product.merk || "Merkloos"}</span>
            <h2 class="product-title-flat" style="margin: 4px 0 8px 0;">${product.naam || "Onbekend product"}</h2>
            <span style="font-size: 0.9rem; color: #888888; display: block; margin-bottom: 16px;">Inhoud: ${product.inhoud || "-"} | EAN: ${product.ean || "-"}</span>
        </div>
        
        <div class="product-details-list-flat" style="margin-bottom: 16px;">
            <div class="detail-item-flat">
                <div class="detail-header-flat">
                    <span class="material-icons detail-icon-flat">place</span>
                    <span class="detail-label-flat">Schaplocatie</span>
                </div>
                <span class="detail-value-flat">${product.schaplocatie || "-"}</span>
            </div>
            <div class="detail-item-flat">
                <div class="detail-header-flat">
                    <span class="material-icons detail-icon-flat">category</span>
                    <span class="detail-label-flat">Afdeling</span>
                </div>
                <span class="detail-value-flat">${product.afdeling || "-"}</span>
            </div>
            <div class="detail-item-flat">
                <div class="detail-header-flat">
                    <span class="material-icons detail-icon-flat">inventory_2</span>
                    <span class="detail-label-flat">Huidige voorraad</span>
                </div>
                <span class="detail-value-flat">${product.aantal} stuks</span>
            </div>
            <div class="detail-item-flat">
                <div class="detail-header-flat">
                    <span class="material-icons detail-icon-flat">calendar_today</span>
                    <span class="detail-label-flat">Huidige THT-datum</span>
                </div>
                <span class="detail-value-flat" style="color: ${thtColor};">${tht}</span>
            </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; width: 100%; margin-top: 8px;">
            <label style="font-weight: 600; font-size: 0.9rem; color: #888888;">Nieuwe THT-datum:</label>
            <input type="date" id="new-tht-input" class="checker-input" value="${product.tht_datum || ''}" style="padding: 12px 16px; border-radius: 10px;">
        </div>

        <div style="display: flex; width: 100%; margin-top: 16px;">
            <button id="save-btn" class="checker-btn" style="width: 100%; font-size: 1rem; padding: 14px; border-radius: 10px;">${currentControleIndex === currentProducts.length - 1 ? "Opslaan & Voltooien" : "Opslaan & Volgende"}</button>
        </div>
    `;

    stepCard.querySelector("#stop-controle-btn").addEventListener("click", () => {
        currentControleIndex = -1;
        fetchTHTProducts();
    });

    stepCard.querySelector("#save-btn").addEventListener("click", async () => {
        const input = document.getElementById("new-tht-input");
        const newDate = input.value;
        if (!newDate) {
            alert("Voer een geldige datum in.");
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const enteredDate = new Date(newDate);
        enteredDate.setHours(0, 0, 0, 0);

        if (enteredDate < today) {
            alert("De nieuwe THT-datum moet vandaag of in de toekomst liggen.");
            return;
        }

        const { error } = await window.supabaseClient
            .from("producten")
            .update({ tht_datum: newDate })
            .eq("id", product.id);

        if (error) {
            console.error(error);
            alert("Fout bij opslaan.");
            return;
        }

        currentControleIndex++;
        showControleStep();
    });

    stepCard.querySelector("#new-tht-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            stepCard.querySelector("#save-btn").click();
        }
    });

    container.appendChild(stepCard);
    const inputEl = document.getElementById("new-tht-input");
    if (inputEl) inputEl.focus();
}

function showProductDetails(product) {
    const actionContainer = document.getElementById("controle-action-container");
    actionContainer.innerHTML = "";
    const title = document.getElementById("tht-title");
    if (title) title.style.display = "none";
    const dateLabel = document.getElementById("tht-date-label");
    if (dateLabel) dateLabel.style.display = "none";
    
    const container = document.getElementById("product-results");
    container.innerHTML = "";
    
    const card = window.renderProductDetailsCard(product, () => {
        fetchTHTProducts();
    });
    
    container.appendChild(card);
}

document.addEventListener("DOMContentLoaded", () => {
    fetchTHTProducts();
});
