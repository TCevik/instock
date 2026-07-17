const meta = document.createElement("meta");
meta.name = "viewport";
meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
document.head.appendChild(meta);

const supabaseScript = document.createElement("script");
supabaseScript.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
document.head.appendChild(supabaseScript);

window.formatPrice = (prijs) => prijs !== null ? `€${parseFloat(prijs).toFixed(2).replace(".", ",")}` : "-";
window.formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString("nl-NL") : "-";

window.renderProductDetailsCard = (product, onBack) => {
    const card = document.createElement("div");
    card.className = "product-details-view";
    const price = window.formatPrice(product.prijs);
    const tht = window.formatDate(product.tht_datum);
    
    card.innerHTML = `
        <button id="back-btn" class="back-btn">
            <span class="material-icons">arrow_back</span>
            <span>Terug</span>
        </button>
        
        <div class="product-details-hero">
            <div class="hero-header">
                <span class="product-brand-badge">${product.merk || "Merkloos"}</span>
            </div>
            <h2 class="product-title-large">${product.naam || "Onbekend product"}</h2>
            
            <div class="hero-stats">
                <div class="hero-stat-item">
                    <div class="stat-icon-wrapper">
                        <span class="material-icons">payments</span>
                    </div>
                    <div class="stat-info">
                        <span class="stat-label">Prijs</span>
                        <span class="stat-val price-val">${price}</span>
                    </div>
                </div>
                <div class="hero-stat-item">
                    <div class="stat-icon-wrapper">
                        <span class="material-icons">inventory_2</span>
                    </div>
                    <div class="stat-info">
                        <span class="stat-label">Voorraad</span>
                        <span class="stat-val stock-val">${product.aantal} stuks</span>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="product-details-list">
            <div class="detail-row">
                <div class="detail-left">
                    <span class="material-icons detail-icon">place</span>
                    <span class="detail-label">Schaplocatie</span>
                </div>
                <span class="detail-value">${product.schaplocatie || "-"}</span>
            </div>
            <div class="detail-row">
                <div class="detail-left">
                    <span class="material-icons detail-icon">calendar_today</span>
                    <span class="detail-label">THT-Datum</span>
                </div>
                <span class="detail-value">${tht}</span>
            </div>
            <div class="detail-row">
                <div class="detail-left">
                    <span class="material-icons detail-icon">inventory</span>
                    <span class="detail-label">Inhoud</span>
                </div>
                <span class="detail-value">${product.inhoud || "-"}</span>
            </div>
            <div class="detail-row">
                <div class="detail-left">
                    <span class="material-icons detail-icon">category</span>
                    <span class="detail-label">Afdeling</span>
                </div>
                <span class="detail-value">${product.afdeling || "-"}</span>
            </div>
            <div class="detail-row">
                <div class="detail-left">
                    <span class="material-icons detail-icon">qr_code</span>
                    <span class="detail-label">EAN</span>
                </div>
                <span class="detail-value highlight-ean">${product.ean || "-"}</span>
            </div>
        </div>
    `;
    
    card.querySelector("#back-btn").addEventListener("click", onBack);
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
