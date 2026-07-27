import { getSupabase, checkAuth, showMessage, handleFormSubmit, showConfirmModal } from '../main.js';
import { loadHeader } from '../header.js';
import { showToast } from '../toast.js';
import { validateBarcode, resizeAndCompressImage } from './image-utils.js';
import { renderProductTableRows } from './table-renderer.js';
import { fetchProductsPage, fetchDepartments, fetchSingleProduct, saveProduct, deleteProduct } from './product-service.js';

import { formatDateInputValue, parseDateInputToIso, formatDate } from '../product_checker-logic.js';

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
    const inhoudInput = document.getElementById('inhoud');
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
    const departmentFilter = document.getElementById('department-filter');
    const thtFilter = document.getElementById('tht-filter');
    const sortSelect = document.getElementById('sort-select');

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

    const urlParams = new URLSearchParams(window.location.search);

    let currentPage = parseInt(urlParams.get('page') || '1', 10) - 1;
    if (isNaN(currentPage) || currentPage < 0) currentPage = 0;

    const PAGE_SIZE = 50;
    let searchQuery = urlParams.get('q') || '';
    let selectedDepartment = urlParams.get('dept') || '';
    let selectedThtFilter = urlParams.get('tht') || '';
    let currentSortBy = urlParams.get('sort') || 'naam';
    let currentSortOrder = urlParams.get('order') || 'asc';
    let totalCount = 0;
    let debounceTimer = null;

    if (searchInput && searchQuery) searchInput.value = searchQuery;
    if (departmentFilter && selectedDepartment) departmentFilter.value = selectedDepartment;
    if (thtFilter && selectedThtFilter) thtFilter.value = selectedThtFilter;
    if (sortSelect) sortSelect.value = `${currentSortBy}-${currentSortOrder}`;

    const updateUrlParams = () => {
        const params = new URLSearchParams();
        if (currentPage > 0) params.set('page', currentPage + 1);
        if (searchQuery) params.set('q', searchQuery);
        if (selectedDepartment) params.set('dept', selectedDepartment);
        if (selectedThtFilter) params.set('tht', selectedThtFilter);
        if (currentSortBy !== 'naam') params.set('sort', currentSortBy);
        if (currentSortOrder !== 'asc') params.set('order', currentSortOrder);
        const queryStr = params.toString();
        const newUrl = queryStr ? `${window.location.pathname}?${queryStr}` : window.location.pathname;
        window.history.replaceState({}, '', newUrl);
    };

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
    if (thtInput) {
        thtInput.addEventListener('input', (e) => {
            e.target.value = formatDateInputValue(e.target.value);
        });
    }

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

    const openModalForEdit = async (product) => {
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

        const { data: fullProduct } = await fetchSingleProduct(supabase, product.ean);
        const p = fullProduct || product;

        if (barcodeTypeSelect && p.barcode_type) barcodeTypeSelect.value = p.barcode_type;
        eanInput.value = p.ean || '';
        naamInput.value = p.naam || '';
        merkInput.value = p.merk || '';
        if (inhoudInput) inhoudInput.value = p.inhoud || '';
        afdelingInput.value = p.afdeling || '';
        voorraadInput.value = p.voorraad !== null ? p.voorraad : '';
        minimaleVoorraadInput.value = p.minimale_voorraad !== null ? p.minimale_voorraad : '';
        prijsInput.value = p.prijs !== null && p.prijs !== undefined ? Number(p.prijs).toFixed(2) : '';
        inkoopprijsInput.value = p.inkoopprijs !== null && p.inkoopprijs !== undefined ? Number(p.inkoopprijs).toFixed(2) : '';

        if (p.tht) {
            const d = new Date(p.tht);
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yyyy = d.getFullYear();
            thtInput.value = `${dd}-${mm}-${yyyy}`;
        } else {
            thtInput.value = '';
        }
        locatiecodeInput.value = p.locatiecode || '';
        if (p.afbeelding) {
            setImageData(p.afbeelding);
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

    const initDepartments = async () => {
        if (!departmentFilter) return;
        const departments = await fetchDepartments(supabase, storeId);
        departments.forEach(dept => {
            const opt = document.createElement('option');
            opt.value = dept;
            opt.textContent = dept;
            departmentFilter.appendChild(opt);
        });
    };

    const openDeleteConfirm = (product) => {
        showConfirmModal(
            'Product Verwijderen',
            `Weet je zeker dat je "${product.naam}" (EAN: ${product.ean}) wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`,
            'Verwijderen',
            async () => {
                const { error } = await deleteProduct(supabase, product.ean);
                if (error) {
                    showToast(error.message || 'Er is een fout opgetreden bij het verwijderen van het product.', 'error');
                } else {
                    showToast('Product succesvol verwijderd!', 'success');
                    await loadProductsTable();
                }
            }
        );
    };

    const loadProductsTable = async () => {
        tableBody.innerHTML = `<tr><td colspan="7" class="loading-cell">Bezig met laden...</td></tr>`;

        const { data, count, error } = await fetchProductsPage(
            supabase, storeId, searchQuery, currentPage, PAGE_SIZE,
            { department: selectedDepartment, thtFilter: selectedThtFilter, sortBy: currentSortBy, sortOrder: currentSortOrder }
        );

        if (error) {
            tableBody.innerHTML = `<tr><td colspan="7" class="loading-cell">Er is een fout opgetreden bij het laden van de producten.</td></tr>`;
            return;
        }

        totalCount = count || 0;
        const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;

        updatePaginationControls(totalPages);
        renderProductTableRows(data, tableBody, openModalForEdit, openDeleteConfirm);
        updateSortIcons();
        updateUrlParams();
    };

    const updateSortIcons = () => {
        document.querySelectorAll('th.sortable').forEach(th => {
            const sortField = th.getAttribute('data-sort');
            const icon = th.querySelector('.sort-icon');
            if (!icon) return;
            if (sortField === currentSortBy) {
                icon.textContent = currentSortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward';
            } else {
                icon.textContent = 'unfold_more';
            }
        });
    };

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                searchQuery = searchInput.value.trim();
                currentPage = 0;
                loadProductsTable();
            }, 300);
        });
    }

    if (departmentFilter) {
        departmentFilter.addEventListener('change', () => {
            selectedDepartment = departmentFilter.value;
            currentPage = 0;
            loadProductsTable();
        });
    }

    if (thtFilter) {
        thtFilter.addEventListener('change', () => {
            selectedThtFilter = thtFilter.value;
            currentPage = 0;
            loadProductsTable();
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            const [field, order] = sortSelect.value.split('-');
            currentSortBy = field;
            currentSortOrder = order;
            currentPage = 0;
            loadProductsTable();
        });
    }

    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const sortField = th.getAttribute('data-sort');
            if (currentSortBy === sortField) {
                currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortBy = sortField;
                currentSortOrder = 'asc';
            }
            if (sortSelect) sortSelect.value = `${currentSortBy}-${currentSortOrder}`;
            currentPage = 0;
            loadProductsTable();
        });
    });

    if (prevPageBtn) prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1, Math.ceil(totalCount / PAGE_SIZE) || 1));
    if (nextPageBtn) nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1, Math.ceil(totalCount / PAGE_SIZE) || 1));
    if (firstPageBtn) firstPageBtn.addEventListener('click', () => goToPage(0, Math.ceil(totalCount / PAGE_SIZE) || 1));
    if (prev10PageBtn) prev10PageBtn.addEventListener('click', () => goToPage(currentPage - 10, Math.ceil(totalCount / PAGE_SIZE) || 1));
    if (next10PageBtn) next10PageBtn.addEventListener('click', () => goToPage(currentPage + 10, Math.ceil(totalCount / PAGE_SIZE) || 1));
    if (lastPageBtn) lastPageBtn.addEventListener('click', () => goToPage(Math.ceil(totalCount / PAGE_SIZE) - 1, Math.ceil(totalCount / PAGE_SIZE) || 1));

    if (pageJumpInput) {
        pageJumpInput.addEventListener('change', () => {
            const val = parseInt(pageJumpInput.value, 10);
            if (!isNaN(val)) {
                goToPage(val - 1, Math.ceil(totalCount / PAGE_SIZE) || 1);
            }
        });
        pageJumpInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = parseInt(pageJumpInput.value, 10);
                if (!isNaN(val)) {
                    goToPage(val - 1, Math.ceil(totalCount / PAGE_SIZE) || 1);
                }
            }
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
            inhoud: inhoudInput ? (inhoudInput.value.trim() || null) : null,
            afdeling: afdelingInput.value.trim() || null,
            voorraad: voorraadInput.value === '' ? null : parseInt(voorraadInput.value, 10),
            minimale_voorraad: minimaleVoorraadInput.value === '' ? null : parseInt(minimaleVoorraadInput.value, 10),
            prijs: prijsInput.value === '' ? null : parseFloat(prijsInput.value),
            inkoopprijs: inkoopprijsInput.value === '' ? null : parseFloat(inkoopprijsInput.value),
            tht: parseDateInputToIso(thtInput.value),
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
                const urlParams = new URLSearchParams(window.location.search);
                const source = urlParams.get('source');
                if (source === 'checker') {
                    const status = isEditMode ? 'updated' : 'created';
                    window.location.href = `product_checker.html?ean=${productData.ean}&status=${status}`;
                } else {
                    showToast(isEditMode ? 'Product succesvol bijgewerkt!' : 'Product succesvol aangemaakt!', 'success');
                    closeModal();
                    await loadProductsTable();
                }
            }
        });
    });

    const editEanParam = urlParams.get('edit');
    if (editEanParam) {
        const { data: existingProduct } = await fetchSingleProduct(supabase, editEanParam);
        if (existingProduct) {
            openModalForEdit(existingProduct);
        }
    }

    await initDepartments();
    await loadProductsTable();
});
