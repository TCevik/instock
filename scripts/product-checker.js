function updateURLParams(productId = "") {
    const urlParams = new URLSearchParams(window.location.search);
    if (productId) {
        urlParams.set("id", productId);
    } else {
        urlParams.delete("id");
    }
    const newURL = `${window.location.pathname}?${urlParams.toString()}`;
    window.history.replaceState({}, '', newURL);
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
    updateURLParams(product.id);
    document.getElementById("search-section").style.display = "none";
    const container = document.getElementById("product-results");
    container.innerHTML = "";
    
    const card = window.renderProductDetailsCard(product, () => {
        updateURLParams("");
        window.closeSearchView(displayResults);
    });
    
    container.appendChild(card);
}

document.addEventListener("DOMContentLoaded", async () => {
    window.initProductSearch(
        (product) => {
            window.lastSearchResults = [];
            showProductDetails(product);
        },
        (products) => {
            window.lastSearchResults = products;
            displayResults(products);
        },
        () => {
            document.getElementById("product-results").innerHTML = "";
        }
    );

    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get("id");
    if (idParam) {
        const client = await window.getSupabase();
        const { data, error } = await client
            .from("producten")
            .select("*")
            .eq("id", idParam)
            .single();
        if (data && !error) {
            showProductDetails(data);
        }
    }
});

