const meta = document.createElement("meta");
meta.name = "viewport";
meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
document.head.appendChild(meta);

const supabaseScript = document.createElement("script");
supabaseScript.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
document.head.appendChild(supabaseScript);

window.formatPrice = (prijs) => prijs !== null ? `€${parseFloat(prijs).toFixed(2).replace(".", ",")}` : "-";
window.formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString("nl-NL") : "-";
window.formatISODate = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

window.getSupabase = () => {
    return new Promise((resolve) => {
        if (window.supabaseClient) {
            resolve(window.supabaseClient);
            return;
        }
        const interval = setInterval(() => {
            if (window.supabaseClient) {
                clearInterval(interval);
                resolve(window.supabaseClient);
            }
        }, 100);
    });
};

window.isEanCode = (str) => /^\d{8,}$/.test(str);

window.initProductSearch = (onSingleEan, onResults, onEmptyQuery) => {
    const input = document.getElementById("product-input");
    const button = document.getElementById("check-btn");
    if (!input) return;

    input.focus();

    const triggerSearch = async () => {
        const query = input.value.trim();
        if (query.length >= 3) {
            const client = await window.getSupabase();
            const { data, error } = await client
                .from("producten")
                .select("*")
                .or(`naam.ilike.%${query}%,ean.eq.${query}`);

            if (error) {
                console.error(error);
                return;
            }

            if (window.isEanCode(query) && data && data.length === 1) {
                onSingleEan(data[0]);
            } else {
                onResults(data || []);
            }
        } else {
            onEmptyQuery();
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
        if (window.isEanCode(pastedData)) {
            setTimeout(() => {
                triggerSearch();
            }, 0);
        }
    });
};

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

            <div id="history-section" style="display: none; margin-top: 24px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 24px;">
                <h3 style="font-size: 1.15rem; font-weight: 700; color: #ffffff; margin: 0 0 16px 0; display: flex; align-items: center; gap: 8px;">
                    <span class="material-icons" style="color: #8cc427; font-size: 1.3rem;">history</span>
                    <span>Productgeschiedenis</span>
                </h3>
                <div id="history-list" style="display: flex; flex-direction: column; gap: 12px; width: 100%;"></div>
            </div>
        </div>
    `;
    
    card.querySelector("#back-btn").addEventListener("click", onBack);
    card.querySelector("#edit-btn").addEventListener("click", () => {
        const fromPage = window.location.pathname.split("/").pop() || "index.html";
        window.location.href = `beheer.html?id=${product.id}&from=${encodeURIComponent(fromPage)}`;
    });

    (async () => {
        const client = await window.getSupabase();
        const { data: historyData, error: historyError } = await client
            .from("product_historie")
            .select("*")
            .eq("product_id", product.id)
            .order("uitgevoerd_at", { ascending: false });

        if (historyError || !historyData || historyData.length === 0) return;

        const { data: { session } } = await client.auth.getSession();
        const currentUserId = session?.user?.id;
        const currentUserEmail = session?.user?.email;

        const historySection = card.querySelector("#history-section");
        const historyList = card.querySelector("#history-list");

        historyData.forEach(item => {
            const date = new Date(item.uitgevoerd_at).toLocaleString("nl-NL");
            const isCurrentUser = currentUserId && currentUserId === item.gebruiker_id;
            const userDisplay = isCurrentUser ? (currentUserEmail || "Jij") : `Gebruiker (${item.gebruiker_id.substring(0, 8)})`;
            
            const historyItem = document.createElement("div");
            historyItem.style.cssText = "background-color: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06); padding: 12px 16px; border-radius: 10px; display: flex; flex-direction: column; gap: 6px;";
            
            const header = document.createElement("div");
            header.style.cssText = "display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;";
            header.innerHTML = `<span style="font-weight: 700; color: #8cc427;">${userDisplay}</span><span style="color: #888888;">${date}</span>`;
            
            const actionText = document.createElement("div");
            actionText.style.cssText = "font-size: 0.95rem; color: #ffffff; font-weight: 600;";
            actionText.textContent = item.actie;

            historyItem.appendChild(header);
            historyItem.appendChild(actionText);

            const friendlyFields = {
                naam: "Naam",
                merk: "Merk",
                ean: "EAN",
                afdeling: "Afdeling",
                schaplocatie: "Schaplocatie",
                prijs: "Prijs",
                aantal: "Aantal",
                inhoud: "Inhoud",
                tht_datum: "THT-Datum"
            };

            const formatVal = (f, v) => {
                if (v === null || v === undefined) return "-";
                if (f === 'prijs') return window.formatPrice(v);
                if (f === 'tht_datum') return window.formatDate(v);
                return v;
            };

            if (item.oude_waarde && item.nieuwe_waarde) {
                const changes = [];
                for (const key in friendlyFields) {
                    const oldVal = item.oude_waarde[key];
                    const newVal = item.nieuwe_waarde[key];
                    if (oldVal !== newVal) {
                        changes.push(`<div><span style="color: #888888;">${friendlyFields[key]}:</span> <span style="color: #ff5252; text-decoration: line-through;">${formatVal(key, oldVal)}</span> <span style="color: #8cc427;">→</span> <span style="color: #8cc427;">${formatVal(key, newVal)}</span></div>`);
                    }
                }
                if (changes.length > 0) {
                    const changesContainer = document.createElement("div");
                    changesContainer.style.cssText = "font-size: 0.85rem; display: flex; flex-direction: column; gap: 4px; padding-top: 4px; border-top: 1px dashed rgba(255, 255, 255, 0.08); margin-top: 4px;";
                    changesContainer.innerHTML = changes.join("");
                    historyItem.appendChild(changesContainer);
                }
            }

            historyList.appendChild(historyItem);
        });

        historySection.style.display = "block";
    })();

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
