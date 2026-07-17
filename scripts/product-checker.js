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
});

