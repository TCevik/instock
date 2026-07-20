import { getSupabase, showMessage } from './main.js';
import { loadHeader } from './header.js';

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

    const formatPrice = (price) => {
        if (price === null || price === undefined) return '-';
        return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(price);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
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

        let progressWidth = 100;
        if (minVoorraad > 0) {
            progressWidth = Math.min((voorraad / minVoorraad) * 100, 100);
        }

        const progressBar = document.getElementById('stock-progress-bar');
        progressBar.style.width = `${progressWidth}%`;

        const stockStatusBadge = document.getElementById('stock-status-badge');
        const stockTitle = document.getElementById('stock-title');

        if (voorraad < minVoorraad) {
            if (voorraad < 0.2 * minVoorraad) {
                stockStatusBadge.textContent = 'Kritiek';
                stockStatusBadge.className = 'widget-badge danger';
                progressBar.className = 'widget-progress-fill danger';
                stockTitle.className = 'widget-title danger';
                detailVoorraad.className = 'widget-value-large danger';
            } else {
                stockStatusBadge.textContent = 'Waarschuwing';
                stockStatusBadge.className = 'widget-badge warning';
                progressBar.className = 'widget-progress-fill warning';
                stockTitle.className = 'widget-title warning';
                detailVoorraad.className = 'widget-value-large warning';
            }
        } else {
            stockStatusBadge.textContent = 'Voldoende';
            stockStatusBadge.className = 'widget-badge success';
            progressBar.className = 'widget-progress-fill';
            stockTitle.className = 'widget-title';
            detailVoorraad.className = 'widget-value-large';
        }

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

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        const isEan = /^\d+$/.test(query);

        if (isEan && query.length >= 8) {
            clearTimeout(debounceTimer);
            handleSearch();
        } else {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                handleSearch();
            }, 300);
        }
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
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
