async function searchProducts(searchTerm) {
    if (!window.supabaseClient) return;
    const { data, error } = await window.supabaseClient
        .from("producten")
        .select("*")
        .or(`naam.ilike.%${searchTerm}%,ean.eq.${searchTerm}`);
    
    if (error) {
        console.error(error);
        return;
    }
    
    const isEan = /^\d{8,}$/.test(searchTerm);
    if (isEan && data && data.length === 1) {
        window.lastSearchResults = [];
        showProductDetails(data[0]);
    } else {
        window.lastSearchResults = data;
        displayResults(data);
    }
}

function displayResults(products) {
    const container = document.getElementById("product-results");
    container.innerHTML = "";
    if (!products || products.length === 0) {
        container.innerHTML = '<div class="no-results">Geen producten gevonden</div>';
        return;
    }
    products.forEach(product => {
        const item = document.createElement("div");
        item.className = "product-list-item";
        const price = product.prijs !== null ? `€${parseFloat(product.prijs).toFixed(2).replace(".", ",")}` : "-";
        
        item.innerHTML = `
            <div class="product-item-info">
                <span class="product-item-title">${product.naam || "Onbekend product"}</span>
                <span class="product-item-sub">${product.merk || ""} - ${product.inhoud || ""}</span>
            </div>
            <div class="product-item-price">${price}</div>
        `;
        
        item.addEventListener("click", () => {
            showProductDetails(product);
        });
        container.appendChild(item);
    });
}

function showProductDetails(product) {
    document.getElementById("search-section").style.display = "none";
    const container = document.getElementById("product-results");
    container.innerHTML = "";
    
    const card = document.createElement("div");
    card.className = "product-details-view";
    const price = product.prijs !== null ? `€${parseFloat(product.prijs).toFixed(2).replace(".", ",")}` : "-";
    const tht = product.tht_datum ? new Date(product.tht_datum).toLocaleDateString("nl-NL") : "-";
    
    card.innerHTML = `
        <button id="back-btn" class="back-btn">← Terug naar lijst</button>
        <div class="product-brand-badge">${product.merk || "Merkloos"}</div>
        <h2 class="product-title-large">${product.naam || "Onbekend product"}</h2>
        
        <div class="product-info-grid">
            <div class="info-card">
                <span class="info-title">Prijs</span>
                <span class="info-value price-highlight">${price}</span>
            </div>
            <div class="info-card">
                <span class="info-title">Voorraad</span>
                <span class="info-value">${product.aantal} stuks</span>
            </div>
            <div class="info-card">
                <span class="info-title">Schaplocatie</span>
                <span class="info-value">${product.schaplocatie || "-"}</span>
            </div>
            <div class="info-card">
                <span class="info-title">THT-Datum</span>
                <span class="info-value">${tht}</span>
            </div>
        </div>

        <div class="product-footer-meta">
            <div class="meta-badge">EAN: ${product.ean || "-"}</div>
            <div class="meta-badge">Inhoud: ${product.inhoud || "-"}</div>
        </div>
    `;
    
    card.querySelector("#back-btn").addEventListener("click", () => {
        document.getElementById("search-section").style.display = "flex";
        if (window.lastSearchResults && window.lastSearchResults.length > 0) {
            displayResults(window.lastSearchResults);
        } else {
            container.innerHTML = "";
            document.getElementById("product-input").value = "";
            document.getElementById("product-input").focus();
        }
    });
    
    container.appendChild(card);
}

document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("product-input");
    const button = document.getElementById("check-btn");
    input.focus();
    
    const triggerSearch = () => {
        const query = input.value.trim();
        if (query.length >= 3) {
            searchProducts(query);
        } else {
            document.getElementById("product-results").innerHTML = "";
        }
    };

    button.addEventListener("click", triggerSearch);

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            triggerSearch();
        }
    });

    input.addEventListener("paste", (e) => {
        const pastedData = (e.clipboardData || window.clipboardData).getData("text").trim();
        if (/^\d{8,}$/.test(pastedData)) {
            setTimeout(() => {
                searchProducts(pastedData);
            }, 0);
        }
    });
});

