let allHistoryItems = [];
let currentUserId = null;
let currentUserEmail = null;

async function checkAdminAndInit() {
    const errorMsg = document.getElementById("historie-error-msg");
    try {
        const client = await window.getSupabase();
        const { data: { session } } = await client.auth.getSession();
        if (!session) {
            window.location.href = "login.html";
            return;
        }

        currentUserId = session.user.id;
        currentUserEmail = session.user.email;

        const { data: profile, error: profileError } = await client
            .from("profielen")
            .select("rol")
            .eq("id", currentUserId)
            .maybeSingle();

        if (profileError) throw profileError;

        if (!profile || profile.rol !== "beheerder") {
            window.location.href = "index.html";
            return;
        }

        await loadEmployeesFilter();
        await fetchHistory();

        const userFilter = document.getElementById("user-filter");
        if (userFilter) {
            userFilter.addEventListener("change", () => {
                fetchHistory();
            });
        }
    } catch (err) {
        if (errorMsg) {
            errorMsg.textContent = err.message || "Toegang geweigerd of fout bij laden gegevens.";
            errorMsg.className = "message-box error";
        }
    }
}

async function loadEmployeesFilter() {
    const errorMsg = document.getElementById("historie-error-msg");
    try {
        const client = await window.getSupabase();
        const { data: employees, error } = await client
            .from("profielen")
            .select("id, volledige_naam")
            .order("volledige_naam");

        if (error) throw error;

        const select = document.getElementById("user-filter");
        if (select) {
            select.innerHTML = '<option value="">Alle medewerkers</option>';
            employees.forEach(emp => {
                const opt = document.createElement("option");
                opt.value = emp.id;
                opt.textContent = emp.volledige_naam || "Naamloze medewerker";
                select.appendChild(opt);
            });
        }
    } catch (err) {
        if (errorMsg) {
            errorMsg.textContent = "Fout bij laden medewerkers: " + err.message;
            errorMsg.className = "message-box error";
        }
    }
}

async function fetchHistory() {
    const errorMsg = document.getElementById("historie-error-msg");
    if (errorMsg) {
        errorMsg.className = "message-box";
    }

    try {
        const client = await window.getSupabase();
        const userFilter = document.getElementById("user-filter");
        const selectedId = userFilter ? userFilter.value : "";

        let query = client
            .from("product_historie")
            .select("*, profielen(volledige_naam)")
            .order("uitgevoerd_at", { ascending: false })
            .limit(10000);

        if (selectedId) {
            query = query.eq("gebruiker_id", selectedId);
        }

        const { data, error } = await query;

        if (error) throw error;

        allHistoryItems = data || [];
        const searchInput = document.getElementById("historie-search");
        if (searchInput && searchInput.value.trim() !== "") {
            searchInput.dispatchEvent(new Event("input"));
        } else {
            renderHistoryList(allHistoryItems);
        }
    } catch (err) {
        if (errorMsg) {
            errorMsg.textContent = "Fout bij laden historie: " + err.message;
            errorMsg.className = "message-box error";
        }
    }
}

function renderHistoryList(items) {
    const container = document.getElementById("history-results");
    container.innerHTML = "";

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="no-results" style="color: #666666; text-align: center; padding: 20px;">Geen historie gevonden</div>';
        return;
    }

    items.forEach(item => {
        const date = new Date(item.uitgevoerd_at).toLocaleString("nl-NL");
        const productName = (item.nieuwe_waarde && item.nieuwe_waarde.naam) || (item.oude_waarde && item.oude_waarde.naam) || "Onbekend product";
        const brand = (item.nieuwe_waarde && item.nieuwe_waarde.merk) || (item.oude_waarde && item.oude_waarde.merk) || "";
        const ean = (item.nieuwe_waarde && item.nieuwe_waarde.ean) || (item.oude_waarde && item.oude_waarde.ean) || "";
        const isCurrentUser = currentUserId && currentUserId === item.gebruiker_id;
        const profileName = item.profielen?.volledige_naam;
        const userDisplay = profileName || (isCurrentUser ? (currentUserEmail || "Jij") : `Gebruiker (${item.gebruiker_id ? item.gebruiker_id.substring(0, 8) : "Onbekend"})`);

        const historyItem = document.createElement("div");
        historyItem.className = "history-item";

        const header = document.createElement("div");
        header.className = "history-item-header";
        header.innerHTML = `<span class="history-user">${brand ? brand + " - " : ""}${productName}</span><span class="history-date">${date}</span>`;

        const actionText = document.createElement("div");
        actionText.className = "history-action";
        actionText.innerHTML = `<span>${item.actie} ${ean ? `(EAN: ${ean})` : ""}</span><span style="font-size: 0.8rem; color: #888888; font-weight: 500; display: block; margin-top: 2px;">Door: ${userDisplay}</span>`;

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

        container.appendChild(historyItem);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    checkAdminAndInit();
    setInterval(fetchHistory, 3000);

    const searchInput = document.getElementById("historie-search");
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            const query = searchInput.value.trim().toLowerCase();
            if (!query) {
                renderHistoryList(allHistoryItems);
                return;
            }

            const filtered = allHistoryItems.filter(item => {
                const name = ((item.nieuwe_waarde && item.nieuwe_waarde.naam) || (item.oude_waarde && item.oude_waarde.naam) || "").toLowerCase();
                const ean = ((item.nieuwe_waarde && item.nieuwe_waarde.ean) || (item.oude_waarde && item.oude_waarde.ean) || "").toLowerCase();
                const brand = ((item.nieuwe_waarde && item.nieuwe_waarde.merk) || (item.oude_waarde && item.oude_waarde.merk) || "").toLowerCase();
                return name.includes(query) || ean.includes(query) || brand.includes(query);
            });
            renderHistoryList(filtered);
        });
    }
});
