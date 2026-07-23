import { getSupabase, showMessage } from './main.js';
import { loadHeader } from './header.js';
import { formatPrice, formatDate, calculateStockStatus } from './product_checker-logic.js';

document.addEventListener('DOMContentLoaded', async () => {
    const searchInput = document.getElementById('search-input');
    const resultsList = document.getElementById('results-list');
    const detailCard = document.getElementById('detail-card');
    const messageBox = document.getElementById('message-box');
    const messageIcon = document.getElementById('message-icon');
    const messageText = document.getElementById('message-text');
    const searchContainer = document.querySelector('.checker-search-container');
    const backBtn = document.getElementById('back-to-search-btn');
    const pageHeader = document.querySelector('.page-header');

    const detailBrand = document.getElementById('detail-brand');
    const detailName = document.getElementById('detail-name');
    const detailEan = document.getElementById('detail-ean');
    const detailVoorraad = document.getElementById('detail-voorraad');
    const detailMinVoorraad = document.getElementById('detail-min-voorraad');
    const detailPrijs = document.getElementById('detail-prijs');
    const detailInkoopprijs = document.getElementById('detail-inkoopprijs');
    const detailAfdeling = document.getElementById('detail-afdeling');
    const detailLocatie = document.getElementById('detail-locatie');
    const detailTht = document.getElementById('detail-tht');
    const productImageBox = document.getElementById('product-image-box');

    loadHeader();

    const supabase = await getSupabase();
    let debounceTimer;

    const showMsg = (text, type) => {
        showMessage(messageBox, messageText, messageIcon, text, type);
        detailCard.style.display = 'none';
        resultsList.style.display = 'none';
        searchContainer.style.display = 'block';
        if (pageHeader) pageHeader.style.display = '';
    };

    const hideMessage = () => {
        messageBox.style.display = 'none';
    };

    const showProductDetails = (product) => {
        hideMessage();
        resultsList.style.display = 'none';
        searchContainer.style.display = 'none';

        detailBrand.textContent = product.merk || 'ONBEKEND MERK';
        detailName.textContent = product.naam;
        detailEan.textContent = product.ean;

        const minVoorraad = product.minimale_voorraad || 0;
        const voorraad = product.voorraad || 0;

        detailVoorraad.textContent = voorraad;
        document.getElementById('detail-min-voorraad-label').textContent = `Min: ${minVoorraad}`;

        const status = calculateStockStatus(voorraad, minVoorraad);

        const progressBar = document.getElementById('stock-progress-bar');
        progressBar.style.width = `${status.progressWidth}%`;
        progressBar.className = status.progressClass;

        const stockStatusBadge = document.getElementById('stock-status-badge');
        stockStatusBadge.textContent = status.statusText;
        stockStatusBadge.className = status.badgeClass;

        const stockTitle = document.getElementById('stock-title');
        stockTitle.className = status.titleClass;
        detailVoorraad.className = status.valueClass;

        const thtStatusBadge = document.getElementById('tht-status-badge');
        const thtDaysLeft = document.getElementById('tht-days-left');
        detailTht.textContent = formatDate(product.tht);

        if (product.tht) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const thtDate = new Date(product.tht);
            thtDate.setHours(0, 0, 0, 0);

            const diffTime = thtDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 0) {
                thtStatusBadge.textContent = diffDays === 0 ? 'Vandaag' : 'Verlopen';
                thtStatusBadge.className = 'widget-badge danger';
                const absoluteDays = Math.abs(diffDays);
                thtDaysLeft.textContent = diffDays === 0 ? 'Verloopt vandaag!' : `${absoluteDays} ${absoluteDays === 1 ? 'dag' : 'dagen'} geleden verlopen`;
                thtDaysLeft.style.color = 'var(--danger-color)';
            } else if (diffDays <= 2) {
                thtStatusBadge.textContent = 'Waarschuwing';
                thtStatusBadge.className = 'widget-badge warning';
                thtDaysLeft.textContent = `Verloopt over ${diffDays} ${diffDays === 1 ? 'dag' : 'dagen'}!`;
                thtDaysLeft.style.color = 'var(--warning-color)';
            } else {
                thtStatusBadge.textContent = 'Veilig';
                thtStatusBadge.className = 'widget-badge success';
                thtDaysLeft.textContent = `Nog ${diffDays} dagen`;
                thtDaysLeft.style.color = 'var(--text-color-muted)';
            }
        } else {
            thtStatusBadge.textContent = 'Geen';
            thtStatusBadge.className = 'widget-badge';
            thtDaysLeft.textContent = 'Geen verloopdatum ingevoerd';
            thtDaysLeft.style.color = 'var(--text-color-muted)';
        }

        detailPrijs.textContent = formatPrice(product.prijs);
        detailInkoopprijs.textContent = formatPrice(product.inkoopprijs);

        const marginBadge = document.getElementById('profit-margin-badge');
        if (product.prijs && product.inkoopprijs && product.prijs > 0) {
            const margin = ((product.prijs - product.inkoopprijs) / product.prijs) * 100;
            marginBadge.textContent = `${margin.toFixed(0)}% Marge`;
            if (margin > 0) {
                marginBadge.className = 'widget-badge success';
            } else {
                marginBadge.className = 'widget-badge danger';
            }
        } else {
            marginBadge.textContent = 'Geen Marge';
            marginBadge.className = 'widget-badge';
        }

        detailAfdeling.textContent = product.afdeling || '-';
        detailLocatie.textContent = product.locatiecode || '-';

        if (product.afbeelding) {
            productImageBox.innerHTML = `<img src="${product.afbeelding}" alt="${product.naam}">`;
        } else {
            productImageBox.innerHTML = `<i class="material-icons">image</i>`;
        }

        const newUrl = `${window.location.pathname}?ean=${product.ean}`;
        window.history.pushState({ ean: product.ean }, '', newUrl);

        const editBtn = document.getElementById('edit-product-btn');
        if (editBtn) {
            editBtn.onclick = () => {
                window.location.href = `product_toevoegen.html?edit=${product.ean}`;
            };
        }

        if (pageHeader) pageHeader.style.display = 'none';
        detailCard.style.display = 'block';
    };

    backBtn.addEventListener('click', () => {
        detailCard.style.display = 'none';
        searchContainer.style.display = 'block';
        if (pageHeader) pageHeader.style.display = '';
        searchInput.value = '';
        const newUrl = window.location.pathname;
        window.history.pushState({}, '', newUrl);
        searchInput.focus();
    });

    const handleSearch = async () => {
        const query = searchInput.value.trim();
        if (!query) {
            resultsList.style.display = 'none';
            detailCard.style.display = 'none';
            hideMessage();
            return;
        }

        const isEan = /^\d+$/.test(query) && query.length >= 8;

        try {
            let req = supabase.from('producten').select('*');
            if (isEan) {
                req = req.eq('ean', query);
            } else {
                req = req.ilike('naam', `%${query}%`);
            }

            const { data, error } = await req;

            if (error) {
                showMsg('Er is een fout opgetreden bij het zoeken.', 'error');
                return;
            }

            if (!data || data.length === 0) {
                showMsg('Geen product gevonden.', 'error');
                return;
            }

            if (isEan && data.length === 1) {
                showProductDetails(data[0]);
            } else {
                detailCard.style.display = 'none';
                hideMessage();
                resultsList.innerHTML = '';
                data.forEach(product => {
                    const item = document.createElement('div');
                    item.className = 'search-result-item';

                    const imgHtml = product.afbeelding
                        ? `<img src="${product.afbeelding}" alt="${product.naam}">`
                        : `<i class="material-icons">image</i>`;

                    const priceHtml = formatPrice(product.prijs);

                    item.innerHTML = `
                        <div class="search-result-img">
                            ${imgHtml}
                        </div>
                        <div class="search-result-info">
                            <span class="search-result-name">${product.naam}</span>
                            <span class="search-result-sub">${product.merk || 'Geen merk'} - EAN: ${product.ean}</span>
                        </div>
                        <div class="search-result-price">
                            ${priceHtml}
                        </div>
                    `;
                    item.addEventListener('click', () => {
                        showProductDetails(product);
                        searchInput.value = product.ean;
                    });
                    resultsList.appendChild(item);
                });
                resultsList.style.display = 'block';
            }
        } catch (err) {
            showMsg('Er is een onverwachte fout opgetreden.', 'error');
        }
    };

    const isValidBarcode = (code) => {
        if (/^\d{13}$/.test(code)) return true; // EAN-13
        if (/^\d{8}$/.test(code)) return true;  // EAN-8
        if (/^\d{12}$/.test(code)) return true; // UPC-A
        return false;
    };

    let firstInputTime = null;

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        const now = Date.now();

        if (!query) {
            firstInputTime = null;
            clearTimeout(debounceTimer);
            resultsList.style.display = 'none';
            detailCard.style.display = 'none';
            hideMessage();
            return;
        }

        if (!firstInputTime) {
            firstInputTime = now;
        }

        clearTimeout(debounceTimer);

        if (isValidBarcode(query)) {
            const timeElapsed = now - firstInputTime;
            if (timeElapsed <= 500) {
                firstInputTime = null;
                handleSearch();
                return;
            }
        }

        debounceTimer = setTimeout(() => {
            firstInputTime = null;
            handleSearch();
        }, 1000);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            firstInputTime = null;
            clearTimeout(debounceTimer);
            handleSearch();
        }
    });

    const urlParams = new URLSearchParams(window.location.search);
    const initialEan = urlParams.get('ean');
    if (initialEan) {
        searchInput.value = initialEan;
        handleSearch();
    }
});
