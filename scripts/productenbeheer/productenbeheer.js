import { getSupabase, checkAuth, showMessage, handleFormSubmit } from '../main.js';
import { loadHeader } from '../header.js';
import { showToast } from '../toast.js';
import { validateBarcode, resizeAndCompressImage } from './image-utils.js';
import { renderProductTableRows } from './table-renderer.js';
import { fetchProductsPage, saveProduct } from './product-service.js';

document.addEventListener('DOMContentLoaded', async () => {
    const auth = await checkAuth(['beheerder']);
    if (!auth) return;

    loadHeader();

    const { userData } = auth;
    const storeId = userData?.winkel;
    const supabase = await getSupabase();

    const form = document.getElementById('add-product-form');
    const eanInput = document.getElementById('ean');
    const naamInput = document.getElementById('naam');
    const merkInput = document.getElementById('merk');
    const afdelingInput = document.getElementById('afdeling');
    const voorraadInput = document.getElementById('voorraad');
    const minimaleVoorraadInput = document.getElementById('minimale_voorraad');
    const prijsInput = document.getElementById('prijs');
    const inkoopprijsInput = document.getElementById('inkoopprijs');
    const thtInput = document.getElementById('tht');
    const locatiecodeInput = document.getElementById('locatiecode');
    const barcodeTypeSelect = document.getElementById('barcode_type');

    const btnUploadFile = document.getElementById('btn-upload-file');
    const btnTakePhoto = document.getElementById('btn-take-photo');
    const afbeeldingFile = document.getElementById('afbeelding-file');
    const afbeeldingCamera = document.getElementById('afbeelding-camera');
    const imagePreviewBox = document.getElementById('image-preview-box');
    const imagePreview = document.getElementById('image-preview');
    const placeholderIcon = imagePreviewBox.querySelector('.placeholder-icon');
    const removeImgBtn = document.getElementById('remove-img-btn');

    const productModal = document.getElementById('productModal');
    const openProductModalBtn = document.getElementById('openProductModalBtn');
    const closeProductModalBtn = document.getElementById('closeProductModalBtn');
    const productModalTitle = document.getElementById('product-modal-title');

    const searchInput = document.getElementById('product-search-input');
    const tableBody = document.getElementById('products-table-body');
    const prevPageBtn = document.getElementById('prev-page-btn');
    const nextPageBtn = document.getElementById('next-page-btn');
    const paginationInfo = document.getElementById('pagination-info');

    const messageBox = document.getElementById('message-box');
    const messageIcon = document.getElementById('message-icon');
    const messageText = document.getElementById('message-text');
    const submitBtn = document.getElementById('submitBtn');

    let currentImageData = null;
    let isEditMode = false;
    let editingEan = null;

    let currentPage = 0;
    const PAGE_SIZE = 50;
    let searchQuery = '';
    let totalCount = 0;
    let debounceTimer = null;

    const setImageData = (dataUrl) => {
        currentImageData = dataUrl;
        if (dataUrl) {
            imagePreview.src = dataUrl;
            imagePreview.style.display = 'block';
            placeholderIcon.style.display = 'none';
            removeImgBtn.style.display = 'flex';
        } else {
            imagePreview.src = '';
            imagePreview.style.display = 'none';
            placeholderIcon.style.display = 'block';
            removeImgBtn.style.display = 'none';
            afbeeldingFile.value = '';
            afbeeldingCamera.value = '';
        }
    };

    btnUploadFile.addEventListener('click', () => afbeeldingFile.click());
    btnTakePhoto.addEventListener('click', () => afbeeldingCamera.click());

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const compressedUrl = await resizeAndCompressImage(file);
        setImageData(compressedUrl);
    };

    afbeeldingFile.addEventListener('change', handleFileSelect);
    afbeeldingCamera.addEventListener('change', handleFileSelect);
    removeImgBtn.addEventListener('click', () => setImageData(null));

    const resetForm = () => {
        form.reset();
        setImageData(null);
        isEditMode = false;
        editingEan = null;
        if (productModalTitle) productModalTitle.textContent = 'Nieuw Product Toevoegen';
        if (submitBtn) {
            const submitBtnSpan = submitBtn.querySelector('span');
            const submitBtnIcon = submitBtn.querySelector('.material-icons');
            if (submitBtnSpan) submitBtnSpan.textContent = 'Product Opslaan';
            if (submitBtnIcon) submitBtnIcon.textContent = 'add_box';
        }
        if (messageBox) messageBox.style.display = 'none';
    };

    const openModalForCreate = () => {
        resetForm();
        productModal.classList.add('open');
        requestAnimationFrame(() => eanInput.focus());
    };

    const openModalForEdit = (product) => {
        resetForm();
        isEditMode = true;
        editingEan = product.ean;
        if (productModalTitle) productModalTitle.textContent = `Product Bewerken: ${product.naam || ''}`;
        if (submitBtn) {
            const submitBtnSpan = submitBtn.querySelector('span');
            const submitBtnIcon = submitBtn.querySelector('.material-icons');
            if (submitBtnSpan) submitBtnSpan.textContent = 'Wijzigingen Opslaan';
            if (submitBtnIcon) submitBtnIcon.textContent = 'save';
        }

        if (barcodeTypeSelect && product.barcode_type) barcodeTypeSelect.value = product.barcode_type;
        eanInput.value = product.ean || '';
        naamInput.value = product.naam || '';
        merkInput.value = product.merk || '';
        afdelingInput.value = product.afdeling || '';
        voorraadInput.value = product.voorraad !== null ? product.voorraad : '';
        minimaleVoorraadInput.value = product.minimale_voorraad !== null ? product.minimale_voorraad : '';
        prijsInput.value = product.prijs !== null && product.prijs !== undefined ? Number(product.prijs).toFixed(2) : '';
        inkoopprijsInput.value = product.inkoopprijs !== null && product.inkoopprijs !== undefined ? Number(product.inkoopprijs).toFixed(2) : '';
        thtInput.value = product.tht || '';
        locatiecodeInput.value = product.locatiecode || '';
        if (product.afbeelding) {
            setImageData(product.afbeelding);
        }

        productModal.classList.add('open');
        requestAnimationFrame(() => naamInput.focus());
    };

    const closeModal = () => {
        productModal.classList.remove('open');
        resetForm();
    };

    if (openProductModalBtn) openProductModalBtn.addEventListener('click', openModalForCreate);
    if (closeProductModalBtn) closeProductModalBtn.addEventListener('click', closeModal);
    if (productModal) {
        productModal.addEventListener('click', (e) => {
            if (e.target === productModal) closeModal();
        });
    }

    const firstPageBtn = document.getElementById('first-page-btn');
    const prev10PageBtn = document.getElementById('prev10-page-btn');
    const next10PageBtn = document.getElementById('next10-page-btn');
    const lastPageBtn = document.getElementById('last-page-btn');
    const pageJumpInput = document.getElementById('page-jump-input');
    const pageTotalLabel = document.getElementById('page-total-label');

    const updatePaginationControls = (totalPages) => {
        if (pageJumpInput) {
            pageJumpInput.value = currentPage + 1;
            pageJumpInput.max = totalPages;
        }
        if (pageTotalLabel) {
            pageTotalLabel.textContent = `van ${totalPages}`;
        }
        if (firstPageBtn) firstPageBtn.disabled = currentPage === 0;
        if (prev10PageBtn) prev10PageBtn.disabled = currentPage < 10;
        if (prevPageBtn) prevPageBtn.disabled = currentPage === 0;
        if (nextPageBtn) nextPageBtn.disabled = (currentPage + 1) >= totalPages;
        if (next10PageBtn) next10PageBtn.disabled = (currentPage + 10) >= totalPages;
        if (lastPageBtn) lastPageBtn.disabled = (currentPage + 1) >= totalPages;
    };

    const goToPage = (pageIndex, totalPages) => {
        const target = Math.max(0, Math.min(pageIndex, totalPages - 1));
        if (target !== currentPage) {
            currentPage = target;
            loadProductsTable();
        }
    };

    const loadProductsTable = async () => {
        tableBody.innerHTML = `<tr><td colspan="8" class="loading-cell">Bezig met laden...</td></tr>`;

        const { data, count, error } = await fetchProductsPage(supabase, storeId, searchQuery, currentPage, PAGE_SIZE);

        if (error) {
            tableBody.innerHTML = `<tr><td colspan="8" class="loading-cell">Er is een fout opgetreden bij het laden van de producten.</td></tr>`;
            return;
        }

        totalCount = count || 0;
        const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;

        updatePaginationControls(totalPages);
        renderProductTableRows(data, tableBody, openModalForEdit);
    };

    if (firstPageBtn) firstPageBtn.addEventListener('click', () => goToPage(0, Math.ceil(totalCount / PAGE_SIZE) || 1));
    if (prev10PageBtn) prev10PageBtn.addEventListener('click', () => goToPage(currentPage - 10, Math.ceil(totalCount / PAGE_SIZE) || 1));
    if (prevPageBtn) prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1, Math.ceil(totalCount / PAGE_SIZE) || 1));
    if (nextPageBtn) nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1, Math.ceil(totalCount / PAGE_SIZE) || 1));
    if (next10PageBtn) next10PageBtn.addEventListener('click', () => goToPage(currentPage + 10, Math.ceil(totalCount / PAGE_SIZE) || 1));
    if (lastPageBtn) lastPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
        goToPage(totalPages - 1, totalPages);
    });

    if (pageJumpInput) {
        const handlePageJump = () => {
            const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
            const val = parseInt(pageJumpInput.value, 10);
            if (isNaN(val) || val < 1 || val > totalPages) {
                showToast(`Pagina ${pageJumpInput.value} bestaat niet. Kies een pagina tussen 1 en ${totalPages}.`, 'error');
                pageJumpInput.value = currentPage + 1;
                return;
            }
            goToPage(val - 1, totalPages);
        };
        pageJumpInput.addEventListener('change', handlePageJump);
        pageJumpInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handlePageJump();
                pageJumpInput.blur();
            }
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                searchQuery = searchInput.value;
                currentPage = 0;
                loadProductsTable();
            }, 300);
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const ean = eanInput.value.trim();
        const naam = naamInput.value.trim();
        const barcodeType = barcodeTypeSelect ? barcodeTypeSelect.value : 'EAN-13';

        if (!ean || !naam) {
            showMessage(messageBox, messageText, messageIcon, 'EAN en Naam zijn verplichte velden.', 'error');
            return;
        }

        const barcodeValidation = validateBarcode(ean, barcodeType);
        if (!barcodeValidation.valid) {
            showMessage(messageBox, messageText, messageIcon, barcodeValidation.error, 'error');
            return;
        }

        const productData = {
            ean: ean,
            barcode_type: barcodeType,
            naam: naam,
            merk: merkInput.value.trim() || null,
            afdeling: afdelingInput.value.trim() || null,
            voorraad: voorraadInput.value === '' ? null : parseInt(voorraadInput.value, 10),
            minimale_voorraad: minimaleVoorraadInput.value === '' ? null : parseInt(minimaleVoorraadInput.value, 10),
            prijs: prijsInput.value === '' ? null : parseFloat(prijsInput.value),
            inkoopprijs: inkoopprijsInput.value === '' ? null : parseFloat(inkoopprijsInput.value),
            tht: thtInput.value || null,
            locatiecode: locatiecodeInput.value.trim() || null,
            afbeelding: currentImageData || null
        };

        if (storeId) {
            productData.winkel_id = storeId;
        }

        await handleFormSubmit(submitBtn, 'Bezig met opslaan...', messageBox, async () => {
            const { error } = await saveProduct(supabase, isEditMode, editingEan, productData);

            if (error) {
                showMessage(messageBox, messageText, messageIcon, error.message || 'Er is een fout opgetreden bij het opslaan van het product.', 'error');
            } else {
                const status = isEditMode ? 'updated' : 'created';
                window.location.href = `product_checker.html?ean=${productData.ean}&status=${status}`;
            }
        });
    });

    const urlParams = new URLSearchParams(window.location.search);
    const editEanParam = urlParams.get('edit');

    if (editEanParam) {
        const { data: existingProduct } = await supabase.from('producten').select('*').eq('ean', editEanParam).maybeSingle();
        if (existingProduct) {
            openModalForEdit(existingProduct);
        }
    }

    await loadProductsTable();
});
