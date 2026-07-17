const meta = document.createElement("meta");
meta.name = "viewport";
meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
document.head.appendChild(meta);

const supabaseScript = document.createElement("script");
supabaseScript.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
document.head.appendChild(supabaseScript);

window.formatPrice = (prijs) => prijs !== null ? `€${parseFloat(prijs).toFixed(2).replace(".", ",")}` : "-";
window.formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString("nl-NL") : "-";

const materialIcons = document.createElement("link");
materialIcons.rel = "stylesheet";
materialIcons.href = "https://fonts.googleapis.com/icon?family=Material+Icons";
document.head.appendChild(materialIcons);

window.renderProductDetailsCard = (product, onBack) => {
    const card = document.createElement("div");
    card.className = "product-details-view";
    const price = window.formatPrice(product.prijs);
    const tht = window.formatDate(product.tht_datum);
    
    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <button id="back-btn" class="back-btn">
                <span class="material-icons">arrow_back</span>
                <span>Terug</span>
            </button>
            <button id="edit-btn" class="back-btn">
                <span class="material-icons">edit</span>
                <span>Aanpassen</span>
            </button>
        </div>
        
        <div class="product-details-flat">
            <div class="product-details-header">
                <span class="product-brand-text">${product.merk || "Merkloos"}</span>
                <h2 class="product-title-flat">${product.naam || "Onbekend product"}</h2>
            </div>
            
            <div class="product-details-list-flat">
                <div class="detail-item-flat">
                    <div class="detail-header-flat">
                        <span class="material-icons detail-icon-flat">payments</span>
                        <span class="detail-label-flat">Prijs</span>
                    </div>
                    <span class="detail-value-flat price-val">${price}</span>
                </div>
                <div class="detail-item-flat">
                    <div class="detail-header-flat">
                        <span class="material-icons detail-icon-flat">inventory_2</span>
                        <span class="detail-label-flat">Voorraad</span>
                    </div>
                    <span class="detail-value-flat">${product.aantal} stuks</span>
                </div>
                <div class="detail-item-flat">
                    <div class="detail-header-flat">
                        <span class="material-icons detail-icon-flat">place</span>
                        <span class="detail-label-flat">Schaplocatie</span>
                    </div>
                    <span class="detail-value-flat">${product.schaplocatie || "-"}</span>
                </div>
                <div class="detail-item-flat">
                    <div class="detail-header-flat">
                        <span class="material-icons detail-icon-flat">calendar_today</span>
                        <span class="detail-label-flat">THT-Datum</span>
                    </div>
                    <span class="detail-value-flat">${tht}</span>
                </div>
                <div class="detail-item-flat">
                    <div class="detail-header-flat">
                        <span class="material-icons detail-icon-flat">inventory</span>
                        <span class="detail-label-flat">Inhoud</span>
                    </div>
                    <span class="detail-value-flat">${product.inhoud || "-"}</span>
                </div>
                <div class="detail-item-flat">
                    <div class="detail-header-flat">
                        <span class="material-icons detail-icon-flat">category</span>
                        <span class="detail-label-flat">Afdeling</span>
                    </div>
                    <span class="detail-value-flat">${product.afdeling || "-"}</span>
                </div>
                <div class="detail-item-flat" style="grid-column: span 2;">
                    <div class="detail-header-flat">
                        <span class="material-icons detail-icon-flat">qr_code</span>
                        <span class="detail-label-flat">EAN</span>
                    </div>
                    <span class="detail-value-flat highlight-ean">${product.ean || "-"}</span>
                </div>
            </div>
        </div>
    `;
    
    card.querySelector("#back-btn").addEventListener("click", onBack);
    card.querySelector("#edit-btn").addEventListener("click", () => {
        window.location.href = `beheer.html?id=${product.id}`;
    });
    return card;
};

window.renderProductListItem = (product, subTextSuffix, onClick) => {
    const item = document.createElement("div");
    item.className = "product-list-item";
    const price = window.formatPrice(product.prijs);
    const subText = `${product.merk || ""} - ${product.inhoud || ""}${subTextSuffix}`;
    
    item.innerHTML = `
        <div class="product-item-info">
            <span class="product-item-title">${product.naam || "Onbekend product"}</span>
            <span class="product-item-sub">${subText}</span>
        </div>
        <div class="product-item-price">${price}</div>
    `;
    
    item.addEventListener("click", onClick);
    return item;
};

supabaseScript.onload = async () => {
    window.supabaseClient = supabase.createClient(
        "https://geabdfhcbzfgmetuaocl.supabase.co",
        "sb_publishable_BFeKHHjqJmwvlU_GZ2CKZA_sidiX_Ov"
    );

    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const isLoginPage = window.location.pathname.endsWith("login.html");

    if (isLoginPage && session) {
        window.location.href = "index.html";
    } else if (!isLoginPage && !session) {
        window.location.href = "login.html";
    }

    window.supabaseClient.auth.onAuthStateChange((event, currentSession) => {
        const onLogin = window.location.pathname.endsWith("login.html");
        if (onLogin && currentSession) {
            window.location.href = "index.html";
        } else if (!onLogin && !currentSession) {
            window.location.href = "login.html";
        }
    });
};
