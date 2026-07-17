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
        const item = window.renderProductListItem(product, "", () => {
            showProductDetails(product);
        });
        container.appendChild(item);
    });
}

function showProductDetails(product) {
    document.getElementById("search-section").style.display = "none";
    const container = document.getElementById("product-results");
    container.innerHTML = "";
    
    const card = window.renderProductDetailsCard(product, () => {
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

