import { checkAuth, getSupabase, showMessage } from './main.js';
import { loadHeader } from './header.js';
import { showToast } from './toast.js';
import { formatPrice, formatDate, calculateStockStatus } from './product-checker-logic.js';
import { fetchSingleProduct } from './productenbeheer/product-service.js';
import { initProductModal } from './product-modal.js';

document.addEventListener('DOMContentLoaded', async () => {
    const auth = await checkAuth();
    if (!auth) return;

    loadHeader();

    const { userData } = auth;
    const storeId = userData?.winkel;
    const isMedewerker = userData?.role === 'medewerker';
    const isTeamleider = userData?.role === 'teamleider';

    const supabase = await getSupabase();
    const searchInput = document.getElementById('search-input');
    const resultsList = document.getElementById('results-list');
    const detailCard = document.getElementById('detail-card');
    const messageBox = document.getElementById('message-box');
    const messageIcon = document.getElementById('message-icon');
    const messageText = document.getElementById('message-text');
    const searchContainer = document.querySelector('.checker-search-container');
    const backBtn = document.getElementById('back-to-search-btn');
    const pageHeader = document.querySelector('.page-header');
    const checkerHeaderActions = document.getElementById('checker-header-actions');
    const openProductModalBtn = document.getElementById('openProductModalBtn');

    const detailBrand = document.getElementById('detail-brand');
    const detailName = document.getElementById('detail-name');
    const detailEan = document.getElementById('detail-ean');
    const detailVoorraad = document.getElementById('detail-voorraad');
    const detailMinVoorraad = document.getElementById('detail-min-voorraad-label');
    const detailPrijs = document.getElementById('detail-prijs');
    const detailInkoopprijs = document.getElementById('detail-inkoopprijs');
    const detailAfdeling = document.getElementById('detail-afdeling');
    const detailLocatie = document.getElementById('detail-locatie');
    const detailTht = document.getElementById('detail-tht');
    const productImageBox = document.getElementById('product-image-box');
    const editBtn = document.getElementById('edit-product-btn');

    if (!isMedewerker && !isTeamleider && checkerHeaderActions) {
        checkerHeaderActions.style.display = 'flex';
    }

    const productModal = document.getElementById('productModal');

    let currentProductData = null;
    let debounceTimer = null;

    const modalManager = initProductModal({
        supabase,
        storeId,
        modalElement: productModal,
        onSuccess: async ({ isEditMode, productData }) => {
            showToast(isEditMode ? 'Product succesvol bijgewerkt!' : 'Product succesvol aangemaakt!', 'success');
            const { data: updatedProduct } = await fetchSingleProduct(supabase, productData.ean);
            if (updatedProduct) {
                showProductDetails(updatedProduct);
            }
        }
    });

    if (openProductModalBtn && modalManager) {
        openProductModalBtn.addEventListener('click', () => modalManager.openForCreate());
    }

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
        currentProductData = product;
        hideMessage();
        resultsList.style.display = 'none';
        searchContainer.style.display = 'none';

        detailBrand.textContent = product.merk || 'ONBEKEND MERK';
        detailName.textContent = product.naam;
        detailEan.textContent = product.ean;

        const inhoudBadge = document.getElementById('detail-inhoud-badge');
        const detailInhoud = document.getElementById('detail-inhoud');
        if (inhoudBadge && detailInhoud) {
            if (product.inhoud) {
                detailInhoud.textContent = product.inhoud;
                inhoudBadge.style.display = 'inline-flex';
            } else {
                inhoudBadge.style.display = 'none';
            }
        }

        const minVoorraad = product.minimale_voorraad || 0;
        const voorraad = product.voorraad || 0;

        detailVoorraad.textContent = voorraad;
        detailMinVoorraad.textContent = `Min: ${minVoorraad}`;

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

        productImageBox.innerHTML = '';
        if (product.afbeelding) {
            const img = document.createElement('img');
            img.src = product.afbeelding;
            img.alt = product.naam || '';
            productImageBox.appendChild(img);
        } else {
            productImageBox.innerHTML = `<i class="material-icons">image</i>`;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const returnUrlParam = urlParams.get('return_url');
        const fromParam = urlParams.get('from');
        let newUrl = `${window.location.pathname}?ean=${product.ean}`;
        if (returnUrlParam) {
            newUrl += `&return_url=${encodeURIComponent(returnUrlParam)}`;
        } else if (fromParam) {
            newUrl += `&from=${fromParam}`;
        }
        window.history.pushState({ ean: product.ean }, '', newUrl);

        if (editBtn) {
            if (isMedewerker || isTeamleider) {
                editBtn.style.display = 'none';
            } else {
                editBtn.style.display = '';
                editBtn.onclick = () => {
                    if (modalManager && currentProductData) {
                        modalManager.openForEdit(currentProductData);
                    }
                };
            }
        }

        if (pageHeader) pageHeader.style.display = 'none';
        detailCard.style.display = 'block';
    };

    backBtn.addEventListener('click', () => {
        const urlParams = new URLSearchParams(window.location.search);
        const returnUrl = urlParams.get('return_url');
        if (returnUrl) {
            window.location.href = returnUrl;
            return;
        }
        if (urlParams.get('from') === 'beheer') {
            window.location.href = 'productenbeheer.html';
            return;
        }
        detailCard.style.display = 'none';
        searchContainer.style.display = 'block';
        if (pageHeader) pageHeader.style.display = '';
        if (resultsList.children.length > 0) {
            resultsList.style.display = 'block';
        }
        const newUrl = window.location.pathname;
        window.history.pushState({}, '', newUrl);
        searchInput.focus();
    });

    const PAGE_SIZE = 50;
    let currentPage = 0;
    let currentQuery = '';
    let currentIsEan = false;

    const renderProducts = (products, append = false) => {
        if (!append) {
            resultsList.innerHTML = '';
        }
        
        const oldBtn = document.getElementById('load-more-btn');
        if (oldBtn) oldBtn.remove();

        products.forEach(product => {
            const item = document.createElement('div');
            item.className = 'search-result-item';

            const imgDiv = document.createElement('div');
            imgDiv.className = 'search-result-img';
            if (product.afbeelding) {
                const img = document.createElement('img');
                img.src = product.afbeelding;
                img.alt = product.naam || '';
                imgDiv.appendChild(img);
            } else {
                imgDiv.innerHTML = `<i class="material-icons">image</i>`;
            }

            const infoDiv = document.createElement('div');
            infoDiv.className = 'search-result-info';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'search-result-name';
            nameSpan.textContent = product.naam;

            const subSpan = document.createElement('span');
            subSpan.className = 'search-result-sub';
            const subDetails = [product.merk || '-', product.inhoud].filter(Boolean).join(' • ');
            subSpan.textContent = `${subDetails} - EAN: ${product.ean}`;

            infoDiv.appendChild(nameSpan);
            infoDiv.appendChild(subSpan);

            const priceDiv = document.createElement('div');
            priceDiv.className = 'search-result-price';
            priceDiv.textContent = formatPrice(product.prijs);

            item.appendChild(imgDiv);
            item.appendChild(infoDiv);
            item.appendChild(priceDiv);
            item.addEventListener('click', () => {
                showProductDetails(product);
            });
            resultsList.appendChild(item);
        });

        if (products.length === PAGE_SIZE && !currentIsEan) {
            const loadMoreBtn = document.createElement('button');
            loadMoreBtn.id = 'load-more-btn';
            loadMoreBtn.className = 'submit-btn';
            loadMoreBtn.style.marginTop = '16px';
            loadMoreBtn.innerHTML = '<span>Meer resultaten laden...</span><i class="material-icons">expand_more</i>';
            loadMoreBtn.addEventListener('click', () => loadNextPage());
            resultsList.appendChild(loadMoreBtn);
        }

        resultsList.style.display = 'block';
    };

    const loadNextPage = async () => {
        currentPage++;
        const from = currentPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        try {
            const { data, error } = await supabase
                .from('producten')
                .select('*')
                .ilike('naam', `%${currentQuery}%`)
                .range(from, to);

            if (!error && data && data.length > 0) {
                renderProducts(data, true);
            } else {
                const oldBtn = document.getElementById('load-more-btn');
                if (oldBtn) oldBtn.remove();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSearch = async () => {
        const query = searchInput.value.trim();
        if (!query) {
            resultsList.style.display = 'none';
            detailCard.style.display = 'none';
            hideMessage();
            return;
        }

        currentQuery = query;
        currentPage = 0;
        currentIsEan = /^\d+$/.test(query) && query.length >= 8;

        try {
            let req = supabase.from('producten').select('*');
            if (currentIsEan) {
                req = req.eq('ean', query);
            } else {
                req = req.ilike('naam', `%${query}%`).range(0, PAGE_SIZE - 1);
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

            if (currentIsEan && data.length === 1) {
                showProductDetails(data[0]);
            } else {
                detailCard.style.display = 'none';
                hideMessage();
                renderProducts(data, false);
            }
        } catch (err) {
            showMsg('Er is een onverwachte fout opgetreden.', 'error');
        }
    };

    const isValidBarcode = (code) => {
        if (/^\d{13}$/.test(code)) return true;
        if (/^\d{8}$/.test(code)) return true;
        if (/^\d{12}$/.test(code)) return true;
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
    const statusParam = urlParams.get('status');

    if (statusParam === 'created') {
        showToast('Product succesvol aangemaakt!', 'success');
    } else if (statusParam === 'updated') {
        showToast('Product succesvol bijgewerkt!', 'success');
    }

    if (initialEan) {
        searchInput.value = initialEan;
        handleSearch();
    } else {
        searchInput.focus();
    }
});
