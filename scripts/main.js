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

window.closeSearchView = (displayResultsCallback) => {
    document.getElementById("search-section").style.display = "flex";
    if (window.lastSearchResults && window.lastSearchResults.length > 0) {
        displayResultsCallback(window.lastSearchResults);
    } else {
        document.getElementById("product-results").innerHTML = "";
        document.getElementById("product-input").value = "";
        document.getElementById("product-input").focus();
    }
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
        <div class="card-header-actions">
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
                <div class="detail-item-flat grid-span-2">
                    <div class="detail-header-flat">
                        <span class="material-icons detail-icon-flat">qr_code</span>
                        <span class="detail-label-flat">EAN</span>
                    </div>
                    <span class="detail-value-flat highlight-ean">${product.ean || "-"}</span>
                </div>
            </div>

            <div id="history-section" class="history-section">
                <h3 class="history-title">
                    <span class="material-icons history-title-icon">history</span>
                    <span>Productgeschiedenis</span>
                </h3>
                <div id="history-list" class="history-list"></div>
            </div>
        </div>
    `;
    
    card.querySelector("#back-btn").addEventListener("click", onBack);
    card.querySelector("#edit-btn").addEventListener("click", () => {
        const fromPage = window.location.pathname.split("/").pop() || "index.html";
        window.location.href = `nieuw-product.html?id=${product.id}&from=${encodeURIComponent(fromPage)}`;
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
            historyItem.className = "history-item";
            
            const header = document.createElement("div");
            header.className = "history-item-header";
            header.innerHTML = `<span class="history-user">${userDisplay}</span><span class="history-date">${date}</span>`;
            
            const actionText = document.createElement("div");
            actionText.className = "history-action";
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
                        changes.push(`<div><span class="change-label">${friendlyFields[key]}:</span> <span class="change-old">${formatVal(key, oldVal)}</span> <span class="change-arrow">→</span> <span class="change-new">${formatVal(key, newVal)}</span></div>`);
                    }
                }
                if (changes.length > 0) {
                    const changesContainer = document.createElement("div");
                    changesContainer.className = "history-changes";
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

    const isLoginPage = window.location.pathname.endsWith("login.html");

    const checkUserStatus = async (currentSession) => {
        if (!currentSession) return false;
        try {
            const { data: profile, error } = await window.supabaseClient
                .from("profielen")
                .select("id")
                .eq("id", currentSession.user.id)
                .maybeSingle();
            if (error || !profile) {
                await window.supabaseClient.auth.signOut();
                const msgEl = document.getElementById("login-msg");
                if (msgEl) {
                    msgEl.textContent = "Uw profiel kon niet geladen worden.";
                    msgEl.className = "message-box error";
                }
                if (!window.location.href.includes("login.html")) {
                    window.location.href = "login.html";
                }
                return true;
            }
        } catch (e) {
            console.error(e);
        }
        return false;
    };

    const { data: { session } } = await window.supabaseClient.auth.getSession();

    if (session) {
        const isPending = await checkUserStatus(session);
        if (!isPending && isLoginPage) {
            window.location.href = "index.html";
        }
    } else if (!isLoginPage && !window.location.href.includes("login.html")) {
        window.location.href = "login.html";
    }

    window.supabaseClient.auth.onAuthStateChange(async (event, currentSession) => {
        const onLogin = window.location.pathname.endsWith("login.html") || window.location.href.includes("login.html");
        if (currentSession) {
            const isPending = await checkUserStatus(currentSession);
            if (isPending) return;
            if (onLogin) {
                window.location.href = "index.html";
            }
        } else if (!onLogin && !window.location.href.includes("login.html")) {
            window.location.href = "login.html";
        }
    });
};
