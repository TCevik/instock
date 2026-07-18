let currentProducts = [];
let currentControleIndex = -1;

async function fetchTHTProducts() {
    const client = await window.getSupabase();
    const { data: { session } } = await client.auth.getSession();
    if (!session) return;

    const dateInput = document.getElementById("tht-target-date");
    let dateString = "";
    if (dateInput) {
        if (!dateInput.value) {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + 1);
            dateInput.value = window.formatISODate(targetDate);
        }
        dateString = dateInput.value;
    } else {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 1);
        dateString = window.formatISODate(targetDate);
    }

    const title = document.getElementById("tht-title");
    if (title) title.classList.remove("hidden");
    const datepickerContainer = document.getElementById("tht-datepicker-container");
    if (datepickerContainer) datepickerContainer.classList.remove("hidden");
    const afdelingContainer = document.getElementById("tht-afdeling-container");
    if (afdelingContainer) afdelingContainer.classList.remove("hidden");

    const afdelingSelect = document.getElementById("tht-afdeling-select");
    const selectedAfdeling = afdelingSelect ? afdelingSelect.value : "";

    let queryBuilder = client
        .from("producten")
        .select("*")
        .lte("tht_datum", dateString);

    if (selectedAfdeling) {
        queryBuilder = queryBuilder.eq("afdeling", selectedAfdeling);
    }

    const { data, error } = await queryBuilder.order("tht_datum", { ascending: true });

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
        container.innerHTML = '<div class="no-results">Geen producten die tot en met deze datum verlopen</div>';
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
    if (title) title.classList.add("hidden");
    const datepickerContainer = document.getElementById("tht-datepicker-container");
    if (datepickerContainer) datepickerContainer.classList.add("hidden");
    const afdelingContainer = document.getElementById("tht-afdeling-container");
    if (afdelingContainer) afdelingContainer.classList.add("hidden");


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
    const thtClass = isExpired ? "expired" : "";

    const stepCard = document.createElement("div");
    stepCard.className = "product-details-view";

    stepCard.innerHTML = `
        <div class="controle-header">
            <button id="stop-controle-btn" class="back-btn controle-stop-btn">&larr; Stoppen</button>
            <span class="controle-progress">Product ${currentControleIndex + 1} / ${currentProducts.length}</span>
        </div>
        
        <div class="product-details-header controle-details-header">
            <span class="product-brand-text">${product.merk || "Merkloos"}</span>
            <h2 class="product-title-flat controle-title">${product.naam || "Onbekend product"}</h2>
            <span class="controle-meta">Inhoud: ${product.inhoud || "-"} | EAN: ${product.ean || "-"}</span>
        </div>
        
        <div class="product-details-list-flat controle-details-list">
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
                <span class="detail-value-flat tht-date-val ${thtClass}">${tht}</span>
            </div>
        </div>

        <div class="controle-input-group">
            <label class="controle-input-label">Nieuwe THT-datum:</label>
            <input type="date" id="new-tht-input" class="checker-input controle-date-input" value="${product.tht_datum || ''}">
        </div>

        <div class="controle-save-container">
            <button id="save-btn" class="checker-btn controle-save-btn">${currentControleIndex === currentProducts.length - 1 ? "Opslaan & Voltooien" : "Opslaan & Volgende"}</button>
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
            window.showToast("Voer een geldige datum in.", "error");
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const enteredDate = new Date(newDate);
        enteredDate.setHours(0, 0, 0, 0);

        if (enteredDate < today) {
            window.showToast("De nieuwe THT-datum moet vandaag of in de toekomst liggen.", "error");
            return;
        }

        const client = await window.getSupabase();
        const { error } = await client
            .from("producten")
            .update({ tht_datum: newDate })
            .eq("id", product.id);

        if (error) {
            console.error(error);
            window.showToast("Fout bij opslaan.", "error");
            return;
        }

        window.showToast("THT-datum succesvol opgeslagen!", "success");
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

function updateURLParams(productId = "") {
    const urlParams = new URLSearchParams(window.location.search);
    const dateInput = document.getElementById("tht-target-date");
    const afdelingSelect = document.getElementById("tht-afdeling-select");
    
    if (dateInput && dateInput.value) {
        urlParams.set("date", dateInput.value);
    }
    if (afdelingSelect && afdelingSelect.value) {
        urlParams.set("afdeling", afdelingSelect.value);
    } else {
        urlParams.delete("afdeling");
    }
    if (productId) {
        urlParams.set("id", productId);
    } else {
        urlParams.delete("id");
    }
    
    const newURL = `${window.location.pathname}?${urlParams.toString()}`;
    window.history.replaceState({}, '', newURL);
}

function showProductDetails(product) {
    updateURLParams(product.id);
    const actionContainer = document.getElementById("controle-action-container");
    actionContainer.innerHTML = "";
    const title = document.getElementById("tht-title");
    if (title) title.classList.add("hidden");
    const datepickerContainer = document.getElementById("tht-datepicker-container");
    if (datepickerContainer) datepickerContainer.classList.add("hidden");
    const afdelingContainer = document.getElementById("tht-afdeling-container");
    if (afdelingContainer) afdelingContainer.classList.add("hidden");

    const container = document.getElementById("product-results");
    container.innerHTML = "";
    
    const card = window.renderProductDetailsCard(product, () => {
        updateURLParams("");
        fetchTHTProducts();
    });
    
    container.appendChild(card);
}

async function populateAfdelingen() {
    const client = await window.getSupabase();
    const { data, error } = await client
        .from("producten")
        .select("afdeling");
    if (error || !data) return;
    
    const select = document.getElementById("tht-afdeling-select");
    if (!select) return;
    
    const uniqueAfdelingen = [...new Set(data.map(p => p.afdeling).filter(Boolean))].sort();
    select.innerHTML = '<option value="">Alle afdelingen</option>';
    uniqueAfdelingen.forEach(afdeling => {
        const opt = document.createElement("option");
        opt.value = afdeling;
        opt.textContent = afdeling;
        select.appendChild(opt);
    });
}

function displaySearchResults(products) {
    const container = document.getElementById("product-results");
    container.innerHTML = "";
    if (!products || products.length === 0) {
        container.innerHTML = '<div class="no-results">Geen producten gevonden</div>';
        return;
    }
    products.forEach(product => {
        const item = window.renderProductListItem(product, product.tht_datum ? ` - THT: ${window.formatDate(product.tht_datum)}` : " - Geen THT datum", () => {
            showRegistrationForm(product);
        });
        container.appendChild(item);
    });
}

function showRegistrationForm(product) {
    const container = document.getElementById("product-results");
    container.innerHTML = "";
    document.getElementById("search-section").style.display = "none";

    const card = document.createElement("div");
    card.className = "count-card";

    const thtDate = product.tht_datum ? window.formatISODate(product.tht_datum) : "";

    card.innerHTML = `
        <div class="card-header-actions">
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

        <div class="count-form-section" style="margin-top: 20px;">
            <span class="count-form-label">THT-Datum</span>
            <input type="date" id="new-tht-input" class="checker-input" value="${thtDate}" style="margin-top: 8px;">
        </div>

        <div class="submit-btn-wrapper" style="margin-top: 20px;">
            <button id="submit-tht" class="checker-btn">THT Opslaan</button>
        </div>
    `;

    card.querySelector("#back-btn").addEventListener("click", () => {
        document.getElementById("search-section").style.display = "flex";
        if (window.lastSearchResults && window.lastSearchResults.length > 0) {
            displaySearchResults(window.lastSearchResults);
        } else {
            container.innerHTML = "";
        }
    });

    card.querySelector("#submit-tht").addEventListener("click", async () => {
        const input = card.querySelector("#new-tht-input");
        const newDate = input.value;
        if (!newDate) {
            window.showToast("Voer een geldige datum in.", "error");
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const enteredDate = new Date(newDate);
        enteredDate.setHours(0, 0, 0, 0);

        if (enteredDate < today) {
            window.showToast("De nieuwe THT-datum moet vandaag of in de toekomst liggen.", "error");
            return;
        }

        const client = await window.getSupabase();
        const { error } = await client
            .from("producten")
            .update({ tht_datum: newDate })
            .eq("id", product.id);

        if (error) {
            console.error(error);
            window.showToast("Fout bij opslaan.", "error");
            return;
        }

        window.showToast("THT-datum succesvol opgeslagen!", "success");
        
        document.getElementById("search-section").style.display = "flex";
        container.innerHTML = "";
        document.getElementById("product-input").value = "";
        document.getElementById("product-input").focus();
    });

    card.querySelector("#new-tht-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            card.querySelector("#submit-tht").click();
        }
    });

    container.appendChild(card);
    const dateInput = card.querySelector("#new-tht-input");
    if (dateInput) {
        dateInput.focus();
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const dateParam = urlParams.get("date");
    const afdelingParam = urlParams.get("afdeling");
    const idParam = urlParams.get("id");

    const dateInput = document.getElementById("tht-target-date");
    if (dateInput) {
        if (dateParam) {
            dateInput.value = dateParam;
        } else {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + 1);
            dateInput.value = window.formatISODate(targetDate);
        }
        dateInput.addEventListener("change", () => {
            updateURLParams();
            fetchTHTProducts();
        });
    }

    const afdelingSelect = document.getElementById("tht-afdeling-select");
    await populateAfdelingen();
    if (afdelingSelect) {
        if (afdelingParam) {
            afdelingSelect.value = afdelingParam;
        }
        afdelingSelect.addEventListener("change", () => {
            updateURLParams();
            fetchTHTProducts();
        });
    }

    await fetchTHTProducts();

    if (idParam) {
        const found = currentProducts.find(p => String(p.id) === String(idParam));
        if (found) {
            showProductDetails(found);
        }
    }

    const regBtn = document.getElementById("tht-registration-btn");
    const cancelRegBtn = document.getElementById("cancel-registration-btn");
    const searchSection = document.getElementById("search-section");
    const dateContainer = document.getElementById("tht-datepicker-container");
    const afdelingContainer = document.getElementById("tht-afdeling-container");
    const actionContainer = document.getElementById("controle-action-container");

    if (regBtn) {
        regBtn.addEventListener("click", () => {
            regBtn.style.display = "none";
            dateContainer.style.display = "none";
            afdelingContainer.style.display = "none";
            actionContainer.style.display = "none";
            searchSection.style.display = "flex";
            document.getElementById("product-results").innerHTML = "";
            document.getElementById("product-input").value = "";
            document.getElementById("product-input").focus();

            window.initProductSearch(
                (product) => {
                    window.lastSearchResults = [];
                    showRegistrationForm(product);
                },
                (products) => {
                    window.lastSearchResults = products;
                    displaySearchResults(products);
                },
                () => {
                    document.getElementById("product-results").innerHTML = "";
                }
            );
        });
    }

    if (cancelRegBtn) {
        cancelRegBtn.addEventListener("click", () => {
            regBtn.style.display = "block";
            dateContainer.style.display = "block";
            afdelingContainer.style.display = "block";
            actionContainer.style.display = "flex";
            searchSection.style.display = "none";
            fetchTHTProducts();
        });
    }
});
