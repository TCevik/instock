import { getSupabase, checkAuth, showConfirmModal } from '../main.js';
import { loadHeader } from '../header.js';
import { showToast } from '../toast.js';
import { renderProductTableRows } from './table-renderer.js';
import { fetchProductsPage, fetchDepartments, fetchSingleProduct, deleteProduct } from './product-service.js';
import { initProductModal } from '../product-modal.js';

document.addEventListener('DOMContentLoaded', async () => {
    const auth = await checkAuth(['beheerder']);
    if (!auth) return;

    loadHeader();

    const { userData } = auth;
    const storeId = userData?.winkel;
    const supabase = await getSupabase();

    const productModal = document.getElementById('productModal');
    const openProductModalBtn = document.getElementById('openProductModalBtn');

    const searchInput = document.getElementById('product-search-input');
    const departmentFilter = document.getElementById('department-filter');
    const thtFilter = document.getElementById('tht-filter');
    const sortSelect = document.getElementById('sort-select');

    const tableBody = document.getElementById('products-table-body');
    const prevPageBtn = document.getElementById('prev-page-btn');
    const nextPageBtn = document.getElementById('next-page-btn');

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

    const modalManager = initProductModal({
        supabase,
        storeId,
        modalElement: productModal,
        onSuccess: async ({ isEditMode, productData }) => {
            const currentParams = new URLSearchParams(window.location.search);
            const source = currentParams.get('source');
            if (source === 'checker') {
                const status = isEditMode ? 'updated' : 'created';
                window.location.href = `product_checker.html?ean=${productData.ean}&status=${status}`;
            } else {
                showToast(isEditMode ? 'Product succesvol bijgewerkt!' : 'Product succesvol aangemaakt!', 'success');
                await loadProductsTable();
            }
        }
    });

    if (openProductModalBtn && modalManager) {
        openProductModalBtn.addEventListener('click', () => modalManager.openForCreate());
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
        tableBody.innerHTML = `<tr><td colspan="8" class="loading-cell">Bezig met laden...</td></tr>`;

        const { data, count, error } = await fetchProductsPage(
            supabase, storeId, searchQuery, currentPage, PAGE_SIZE,
            { department: selectedDepartment, thtFilter: selectedThtFilter, sortBy: currentSortBy, sortOrder: currentSortOrder }
        );

        if (error) {
            tableBody.innerHTML = `<tr><td colspan="8" class="loading-cell">Er is een fout opgetreden bij het laden van de producten.</td></tr>`;
            return;
        }

        totalCount = count || 0;
        const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;

        updatePaginationControls(totalPages);
        renderProductTableRows(data, tableBody, (prod) => modalManager && modalManager.openForEdit(prod), openDeleteConfirm);
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

    const editEanParam = urlParams.get('edit');
    if (editEanParam) {
        const { data: existingProduct } = await fetchSingleProduct(supabase, editEanParam);
        if (existingProduct && modalManager) {
            modalManager.openForEdit(existingProduct);
        }
    }

    await initDepartments();
    await loadProductsTable();
});
