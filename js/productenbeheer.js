import {
  supabase,
  getCurrentUser,
  showModal,
  closeModal,
  showConfirmModal,
  showToast,
  renderTableSkeletons,
  invokeFn,
} from "./main.js";
import { createDatePicker } from "./datepicker.js";
import { createCustomSelect } from "./select.js";
import {
  calculatePagination,
  updatePaginationControls,
} from "./pagination-utils.js";

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatPrice(val) {
  if (val === null || val === undefined || val === "") return "-";
  const num = Number(val);
  if (isNaN(num)) return "-";
  return `€ ${num.toFixed(2).replace(".", ",")}`;
}

const PAGE_SIZE = 30;
const BARCODE_TYPE_OPTIONS = [
  { value: "EAN-13", label: "EAN-13" },
  { value: "EAN-8", label: "EAN-8" },
  { value: "UPC-A", label: "UPC-A" },
  { value: "Modified Plessy", label: "Modified Plessy" },
];
let currentProducts = [];
let totalCount = 0;
let currentPage = 1;
let currentDeptFilter = "all";
let searchQuery = "";
let currentSortKey = "name";
let currentSortDirection = "asc";
let searchDebounceTimer = null;

async function initDepartmentFilter() {
  const filterContainer = document.getElementById("departmentFilterContainer");
  if (!filterContainer) return;

  const { data } = await supabase
    .from("products")
    .select("department")
    .not("department", "is", null);

  const depts = Array.from(
    new Set(
      (data || [])
        .map((p) => p.department && p.department.trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const options = [
    { value: "all", label: "Alle afdelingen" },
    ...depts.map((d) => ({ value: d, label: d })),
  ];

  filterContainer.innerHTML = "";
  createCustomSelect(
    filterContainer,
    options,
    currentDeptFilter,
    "Filter op afdeling",
    (val) => {
      currentDeptFilter = val;
      currentPage = 1;
      fetchProductsPage();
    },
  );
}

async function invokeProductManagement(action, payload) {
  return await invokeFn("manage-product", {
    body: { action, ...payload },
  });
}

async function fetchProductsPage() {
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("products")
    .select(
      "id, ean, barcode_type, name, brand, department, content, price, promo_price, shelf_position, stock_quantity, best_before_date, image_url",
      { count: "exact" },
    );

  if (currentDeptFilter && currentDeptFilter !== "all") {
    query = query.eq("department", currentDeptFilter);
  }

  const q = searchQuery.trim();
  if (q) {
    query = query.or(`name.ilike.%${q}%,ean.ilike.%${q}%,brand.ilike.%${q}%`);
  }

  query = query
    .order(currentSortKey, { ascending: currentSortDirection === "asc" })
    .range(from, to);

  const { data, count, error } = await query;

  if (!error && data) {
    currentProducts = data;
    totalCount = count ?? 0;
  } else {
    currentProducts = [];
    totalCount = 0;
  }

  updateSortIcons();
  renderTable();
}

function updateSortIcons() {
  const sortKeys = [
    "name",
    "ean",
    "brand",
    "department",
    "price",
    "stock_quantity",
  ];
  sortKeys.forEach((key) => {
    const icon = document.getElementById(`sortIcon_${key}`);
    if (!icon) return;

    if (currentSortKey === key) {
      icon.textContent =
        currentSortDirection === "asc" ? "arrow_upward" : "arrow_downward";
      icon.style.opacity = "1";
    } else {
      icon.textContent = "unfold_more";
      icon.style.opacity = "0.35";
    }
  });
}

function renderTable() {
  const tbody = document.getElementById("productsTableBody");
  const cardsContainer = document.getElementById("productsCardsContainer");
  const paginationInfo = document.getElementById("paginationInfo");
  const paginationCurrent = document.getElementById("paginationCurrent");
  const prevBtn = document.getElementById("prevPageBtn");
  const nextBtn = document.getElementById("nextPageBtn");

  if (!tbody) return;

  const pagination = calculatePagination(
    totalCount,
    PAGE_SIZE,
    currentPage,
    currentProducts.length
  );
  currentPage = pagination.currentPage;
  const { totalPages, startIndex, endIndex } = pagination;

  if (currentProducts.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">Geen producten gevonden</td>
            </tr>
        `;
    if (cardsContainer) {
      cardsContainer.innerHTML = `<div class="empty-state">Geen producten gevonden</div>`;
    }
  } else {
    tbody.innerHTML = currentProducts
      .map((product) => {
        const name = escapeHtml(product.name || "-");
        const ean = escapeHtml(product.ean || "-");
        const brand = escapeHtml(product.brand || "-");
        const department = product.department
          ? `<span class="department-badge">${escapeHtml(product.department)}</span>`
          : "-";
        const price = escapeHtml(formatPrice(product.price));
        const stock =
          product.stock_quantity !== null &&
          product.stock_quantity !== undefined
            ? escapeHtml(String(product.stock_quantity))
            : "0";

        const imageHtml = product.image_url
          ? `<div class="product-image-sm"><img src="${escapeHtml(product.image_url)}" alt="" loading="lazy"></div>`
          : `<div class="product-image-sm"><span class="material-icons">inventory_2</span></div>`;

        return `
                <tr>
                    <td>
                        <div class="product-cell">
                            ${imageHtml}
                            <span class="product-name">${name}</span>
                        </div>
                    </td>
                    <td>${ean}</td>
                    <td>${brand}</td>
                    <td>${department}</td>
                    <td>${price}</td>
                    <td>${stock}</td>
                    <td class="td-actions">
                        <button type="button" class="action-btn edit-btn" data-ean="${escapeHtml(product.ean)}" title="Product Bewerken - Gegevens en voorraad aanpassen">
                            <span class="material-icons">edit</span>
                        </button>
                    </td>
                </tr>
            `;
      })
      .join("");

    if (cardsContainer) {
      cardsContainer.innerHTML = currentProducts
        .map((product) => {
          const name = escapeHtml(product.name || "Product");
          const ean = escapeHtml(product.ean || "");
          const brand = escapeHtml(product.brand || "");
          const department = product.department
            ? `<span class="department-badge">${escapeHtml(product.department)}</span>`
            : "";
          const price = escapeHtml(formatPrice(product.price));
          const stock =
            product.stock_quantity !== null &&
            product.stock_quantity !== undefined
              ? `${product.stock_quantity} op voorraad`
              : "0 op voorraad";

          const imageHtml = product.image_url
            ? `<div class="product-image-sm"><img src="${escapeHtml(product.image_url)}" alt="" loading="lazy"></div>`
            : `<div class="product-image-sm"><span class="material-icons">inventory_2</span></div>`;

          return `
                    <div class="product-list-item edit-btn" data-ean="${escapeHtml(product.ean)}">
                        ${imageHtml}
                        <div class="product-list-content">
                            <div class="product-list-top">
                                <span class="product-name">${name}</span>
                                <span class="product-price-badge">${price}</span>
                            </div>
                            <div class="product-list-sub">
                                ${ean ? `<span class="product-meta-item"><span class="material-icons meta-icon">qr_code</span>${ean}</span>` : ""}
                                ${brand ? `<span class="product-meta-dot">•</span><span>${brand}</span>` : ""}
                                <span class="product-meta-dot">•</span>
                                <span>${stock}</span>
                            </div>
                            ${department ? `<div style="margin-top: 2px;">${department}</div>` : ""}
                        </div>
                        <span class="material-icons product-list-chevron">chevron_right</span>
                    </div>
                `;
        })
        .join("");
    }
  }

  updatePaginationControls({
    prevBtn,
    nextBtn,
    currentPage,
    totalPages,
    currentEl: paginationCurrent,
    infoEl: paginationInfo,
    totalItems: totalCount,
    startIndex,
    endIndex,
    itemLabel: "producten",
  });
}

async function openCreateModal() {
  if (currentUserRole !== 3) {
    showToast("error", "Je hebt geen rechten om producten toe te voegen");
    return;
  }
  await showModal(`
        <div class="modal-header">
            <h2 class="modal-title">Nieuw product</h2>
            <p class="modal-subtitle">Voeg een nieuw product toe aan het assortiment</p>
        </div>
        <form class="modal-form" id="createProductForm">
            <div class="modal-form-row">
                <div class="form-group">
                    <label for="createEan">EAN *</label>
                    <input type="text" id="createEan" class="modal-input" placeholder="Bijv. 8710400000000" required>
                </div>
                <div class="form-group">
                    <label>Barcode type</label>
                    <div id="createBarcodeTypeSelect"></div>
                </div>
            </div>
            <div class="form-group">
                <label for="createName">Naam *</label>
                <input type="text" id="createName" class="modal-input" placeholder="Productnaam" required>
            </div>
            <div class="modal-form-row">
                <div class="form-group">
                    <label for="createBrand">Merk</label>
                    <input type="text" id="createBrand" class="modal-input" placeholder="Merknaam">
                </div>
                <div class="form-group">
                    <label for="createDepartment">Afdeling</label>
                    <input type="text" id="createDepartment" class="modal-input" placeholder="Bijv. Bakkerij">
                </div>
            </div>
            <div class="modal-form-row">
                <div class="form-group">
                    <label for="createPrice">Prijs (€) *</label>
                    <input type="number" step="0.01" min="0" id="createPrice" class="modal-input" placeholder="0.00" required>
                </div>
                <div class="form-group">
                    <label for="createPromoPrice">Promotieprijs (€)</label>
                    <input type="number" step="0.01" min="0" id="createPromoPrice" class="modal-input" placeholder="Optioneel">
                </div>
            </div>
            <div class="modal-form-row">
                <div class="form-group">
                    <label for="createStockQuantity">Voorraad *</label>
                    <input type="number" min="0" id="createStockQuantity" class="modal-input" value="0" required>
                </div>
                <div class="form-group">
                    <label for="createContent">Inhoud</label>
                    <input type="text" id="createContent" class="modal-input" placeholder="Bijv. 500g, 1L">
                </div>
            </div>
            <div class="modal-form-row">
                <div class="form-group">
                    <label for="createShelfPosition">Schappositie</label>
                    <input type="text" id="createShelfPosition" class="modal-input" placeholder="Bijv. A01-03">
                </div>
                <div class="form-group">
                    <label>Houdbaarheidsdatum</label>
                    <div id="createBestBeforePicker"></div>
                </div>
            </div>
            <div class="form-group">
                <label for="createImageUrl">Afbeelding URL</label>
                <input type="url" id="createImageUrl" class="modal-input" placeholder="https://...">
            </div>
            <div class="modal-footer">
                <button type="button" class="modal-btn-secondary" id="cancelCreateModalBtn">Annuleren</button>
                <button type="submit" class="btn" id="saveCreateBtn">Aanmaken</button>
            </div>
        </form>
    `);

  const barcodeTypeContainer = document.getElementById(
    "createBarcodeTypeSelect",
  );
  let barcodeTypeSelect = null;
  if (barcodeTypeContainer) {
    barcodeTypeSelect = createCustomSelect(
      barcodeTypeContainer,
      BARCODE_TYPE_OPTIONS,
      "EAN-13",
      "Selecteer type...",
    );
  }

  const datePickerContainer = document.getElementById("createBestBeforePicker");
  let datePicker = null;
  if (datePickerContainer) {
    datePicker = createDatePicker(datePickerContainer, "");
  }

  const cancelBtn = document.getElementById("cancelCreateModalBtn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", closeModal);
  }

  const form = document.getElementById("createProductForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById("saveCreateBtn");
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Aanmaken...";
      }

      const ean = document.getElementById("createEan")?.value.trim();
      const barcodeType = barcodeTypeSelect
        ? barcodeTypeSelect.getValue()
        : null;
      const name = document.getElementById("createName")?.value.trim();
      const brand =
        document.getElementById("createBrand")?.value.trim() || null;
      const department =
        document.getElementById("createDepartment")?.value.trim() || null;
      const priceVal = document.getElementById("createPrice")?.value;
      const promoPriceVal = document.getElementById("createPromoPrice")?.value;
      const stockVal = document.getElementById("createStockQuantity")?.value;
      const content =
        document.getElementById("createContent")?.value.trim() || null;
      const shelfPosition =
        document.getElementById("createShelfPosition")?.value.trim() || null;
      const bestBefore = datePicker ? datePicker.getValue() : null;
      const imageUrl =
        document.getElementById("createImageUrl")?.value.trim() || null;

      try {
        await invokeProductManagement("create", {
          ean,
          barcode_type: barcodeType,
          name,
          brand,
          department,
          price: parseFloat(priceVal),
          promo_price: promoPriceVal ? parseFloat(promoPriceVal) : null,
          stock_quantity: parseInt(stockVal, 10) || 0,
          content,
          shelf_position: shelfPosition,
          best_before_date: bestBefore || null,
          image_url: imageUrl,
        });
        closeModal();
        showToast("notification", "Product succesvol aangemaakt");
        await initDepartmentFilter();
        await fetchProductsPage();
      } catch (err) {
        showToast("error", err.message || "Fout bij aanmaken van product");
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = "Aanmaken";
        }
      }
    });
  }
}

let currentUserRole = 1;

async function checkUserRole() {
  try {
    const user = await getCurrentUser();
    if (user?.role) {
      currentUserRole = Number(user.role) || 1;
    }
  } catch (_) {}

  const createProductBtn = document.getElementById("createProductBtn");
  if (createProductBtn) {
    createProductBtn.style.display =
      currentUserRole === 3 ? "inline-flex" : "none";
  }
}

async function openEditModal(ean) {
  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("ean", ean)
    .maybeSingle();

  if (error || !product) {
    showToast("error", "Kon productgegevens niet laden");
    return;
  }

  const canEditAll = currentUserRole === 3;
  const canEditPromo = currentUserRole === 2 || currentUserRole === 3;

  let formFieldsHtml = "";

  if (canEditAll) {
    formFieldsHtml = `
            <div class="modal-form-row">
                <div class="form-group">
                    <label for="editEan">EAN *</label>
                    <input type="text" id="editEan" class="modal-input" value="${escapeHtml(product.ean)}" required>
                </div>
                <div class="form-group">
                    <label>Barcode type</label>
                    <div id="editBarcodeTypeSelect"></div>
                </div>
            </div>
            <div class="form-group">
                <label for="editName">Naam *</label>
                <input type="text" id="editName" class="modal-input" value="${escapeHtml(product.name || "")}" required>
            </div>
            <div class="modal-form-row">
                <div class="form-group">
                    <label for="editBrand">Merk</label>
                    <input type="text" id="editBrand" class="modal-input" value="${escapeHtml(product.brand || "")}">
                </div>
                <div class="form-group">
                    <label for="editDepartment">Afdeling</label>
                    <input type="text" id="editDepartment" class="modal-input" value="${escapeHtml(product.department || "")}">
                </div>
            </div>
            <div class="modal-form-row">
                <div class="form-group">
                    <label for="editPrice">Prijs (€) *</label>
                    <input type="number" step="0.01" min="0" id="editPrice" class="modal-input" value="${product.price !== null && product.price !== undefined ? product.price : ""}" required>
                </div>
                <div class="form-group">
                    <label for="editPromoPrice">Promotieprijs (€)</label>
                    <input type="number" step="0.01" min="0" id="editPromoPrice" class="modal-input" value="${product.promo_price !== null && product.promo_price !== undefined ? product.promo_price : ""}">
                </div>
            </div>
            <div class="modal-form-row">
                <div class="form-group">
                    <label for="editStockQuantity">Voorraad *</label>
                    <input type="number" min="0" id="editStockQuantity" class="modal-input" value="${product.stock_quantity ?? 0}" required>
                </div>
                <div class="form-group">
                    <label for="editContent">Inhoud</label>
                    <input type="text" id="editContent" class="modal-input" value="${escapeHtml(product.content || "")}">
                </div>
            </div>
            <div class="modal-form-row">
                <div class="form-group">
                    <label for="editShelfPosition">Schappositie</label>
                    <input type="text" id="editShelfPosition" class="modal-input" value="${escapeHtml(product.shelf_position || "")}">
                </div>
                <div class="form-group">
                    <label>Houdbaarheidsdatum</label>
                    <div id="editBestBeforePicker"></div>
                </div>
            </div>
            <div class="form-group">
                <label for="editImageUrl">Afbeelding URL</label>
                <input type="url" id="editImageUrl" class="modal-input" value="${escapeHtml(product.image_url || "")}">
            </div>
        `;
  } else {
    const imageDisplayHtml = product.image_url
      ? `<div class="product-image-sm" style="width: 48px; height: 48px; border-radius: 8px;"><img src="${escapeHtml(product.image_url)}" alt="" loading="lazy"></div>`
      : `<div class="product-image-sm" style="width: 48px; height: 48px; border-radius: 8px;"><span class="material-icons">inventory_2</span></div>`;

    const promoPriceFieldHtml = canEditPromo
      ? `<input type="number" step="0.01" min="0" id="editPromoPrice" class="modal-input" value="${product.promo_price !== null && product.promo_price !== undefined ? product.promo_price : ""}" placeholder="Optioneel">`
      : `<div style="font-size: 14px; font-weight: 500; color: var(--text-color); padding: 8px 0;">${escapeHtml(formatPrice(product.promo_price))}</div>`;

    formFieldsHtml = `
            <div style="display: flex; align-items: center; gap: 14px; padding: 12px; background-color: var(--card-background-hover); border: 1px solid var(--card-border); border-radius: 10px; margin-bottom: 16px;">
                ${imageDisplayHtml}
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <span style="font-weight: 600; font-size: 15px; color: var(--text-color);">${escapeHtml(product.name || "Product")}</span>
                    <span style="font-size: 12px; color: var(--text-color-muted);">EAN: ${escapeHtml(product.ean || "-")} ${product.brand ? `• ${escapeHtml(product.brand)}` : ""} ${product.department ? `• ${escapeHtml(product.department)}` : ""}</span>
                </div>
            </div>
            <div class="modal-form-row">
                <div class="form-group">
                    <label style="color: var(--text-color-muted); font-size: 12px;">Prijs (€)</label>
                    <div style="font-size: 14px; font-weight: 500; color: var(--text-color); padding: 8px 0;">${escapeHtml(formatPrice(product.price))}</div>
                </div>
                <div class="form-group">
                    <label for="editPromoPrice" style="${canEditPromo ? "" : "color: var(--text-color-muted); font-size: 12px;"}">Promotieprijs (€)</label>
                    ${promoPriceFieldHtml}
                </div>
            </div>
            <div class="modal-form-row">
                <div class="form-group">
                    <label for="editStockQuantity">Voorraad *</label>
                    <input type="number" min="0" id="editStockQuantity" class="modal-input" value="${product.stock_quantity ?? 0}" required>
                </div>
                <div class="form-group">
                    <label>Houdbaarheidsdatum</label>
                    <div id="editBestBeforePicker"></div>
                </div>
            </div>
            <div class="modal-form-row">
                <div class="form-group">
                    <label style="color: var(--text-color-muted); font-size: 12px;">Inhoud</label>
                    <div style="font-size: 14px; font-weight: 500; color: var(--text-color); padding: 8px 0;">${escapeHtml(product.content || "-")}</div>
                </div>
                <div class="form-group">
                    <label style="color: var(--text-color-muted); font-size: 12px;">Schappositie</label>
                    <div style="font-size: 14px; font-weight: 500; color: var(--text-color); padding: 8px 0;">${escapeHtml(product.shelf_position || "-")}</div>
                </div>
            </div>
        `;
  }

  await showModal(`
        <div class="modal-header">
            <h2 class="modal-title">Product bewerken</h2>
            <p class="modal-subtitle">${canEditAll ? "Pas de gegevens van dit product aan" : "Pas voorraad, tht en/of promotieprijs aan"}</p>
        </div>
        <form class="modal-form" id="editProductForm">
            ${formFieldsHtml}
            <div class="modal-footer">
                ${canEditAll ? '<button type="button" class="modal-btn-danger" id="deleteProductBtn">Verwijderen</button>' : ""}
                <button type="button" class="modal-btn-secondary" id="cancelEditModalBtn">Annuleren</button>
                <button type="submit" class="btn" id="saveEditBtn">Opslaan</button>
            </div>
        </form>
    `);

  const barcodeTypeContainer = document.getElementById("editBarcodeTypeSelect");
  let barcodeTypeSelect = null;
  if (barcodeTypeContainer) {
    barcodeTypeSelect = createCustomSelect(
      barcodeTypeContainer,
      BARCODE_TYPE_OPTIONS,
      product.barcode_type || "EAN-13",
      "Selecteer type...",
    );
  }

  const datePickerContainer = document.getElementById("editBestBeforePicker");
  let datePicker = null;
  if (datePickerContainer) {
    datePicker = createDatePicker(
      datePickerContainer,
      product.best_before_date || "",
    );
  }

  const cancelBtn = document.getElementById("cancelEditModalBtn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", closeModal);
  }

  const deleteBtn = document.getElementById("deleteProductBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const prodName = product.name || product.ean;
      const confirmed = await showConfirmModal({
        title: "Product verwijderen",
        message: `Weet je zeker dat je "${escapeHtml(prodName)}" wilt verwijderen?`,
        confirmText: "Verwijderen",
        cancelText: "Annuleren",
        isDanger: true,
      });

      if (!confirmed) return;

      try {
        await invokeProductManagement("delete", { ean: product.ean });
        closeModal();
        showToast("notification", "Product succesvol verwijderd");
        await initDepartmentFilter();
        await fetchProductsPage();
      } catch (err) {
        showToast("error", err.message || "Fout bij verwijderen van product");
      }
    });
  }

  const form = document.getElementById("editProductForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById("saveEditBtn");
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Opslaan...";
      }

      const newEan = canEditAll
        ? document.getElementById("editEan")?.value.trim() || product.ean
        : product.ean;
      const barcodeType = canEditAll
        ? barcodeTypeSelect
          ? barcodeTypeSelect.getValue()
          : product.barcode_type
        : product.barcode_type;
      const name = canEditAll
        ? document.getElementById("editName")?.value.trim() || product.name
        : product.name;
      const brand = canEditAll
        ? document.getElementById("editBrand")?.value.trim() || null
        : product.brand;
      const department = canEditAll
        ? document.getElementById("editDepartment")?.value.trim() || null
        : product.department;
      const priceVal = canEditAll
        ? document.getElementById("editPrice")?.value
        : product.price;
      const promoPriceInput = document.getElementById("editPromoPrice");
      const promoPriceVal = canEditPromo
        ? promoPriceInput
          ? promoPriceInput.value
          : null
        : product.promo_price;
      const stockVal = document.getElementById("editStockQuantity")?.value;
      const content = canEditAll
        ? document.getElementById("editContent")?.value.trim() || null
        : product.content;
      const shelfPosition = canEditAll
        ? document.getElementById("editShelfPosition")?.value.trim() || null
        : product.shelf_position;
      const bestBefore = datePicker
        ? datePicker.getValue()
        : product.best_before_date;
      const imageUrl = canEditAll
        ? document.getElementById("createImageUrl")?.value.trim() || null
        : product.image_url;

      try {
        await invokeProductManagement("update", {
          target_ean: product.ean,
          ean: newEan,
          barcode_type: barcodeType,
          name,
          brand,
          department,
          price:
            priceVal !== null && priceVal !== undefined && priceVal !== ""
              ? parseFloat(priceVal)
              : product.price,
          promo_price:
            promoPriceVal !== null &&
            promoPriceVal !== undefined &&
            promoPriceVal !== ""
              ? parseFloat(promoPriceVal)
              : null,
          stock_quantity:
            stockVal !== undefined && stockVal !== ""
              ? parseInt(stockVal, 10) || 0
              : (product.stock_quantity ?? 0),
          content,
          shelf_position: shelfPosition,
          best_before_date: bestBefore || null,
          image_url: imageUrl,
        });
        closeModal();
        showToast("notification", "Product succesvol bijgewerkt");
        await initDepartmentFilter();
        await fetchProductsPage();
      } catch (err) {
        showToast("error", err.message || "Fout bij bijwerken van product");
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = "Opslaan";
        }
      }
    });
  }
}

const searchInput = document.getElementById("searchInput");
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      currentPage = 1;
      fetchProductsPage();
    }, 300);
  });
}

document.querySelectorAll(".th-sortable").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.getAttribute("data-sort-key");
    if (!key) return;

    if (currentSortKey === key) {
      currentSortDirection = currentSortDirection === "asc" ? "desc" : "asc";
    } else {
      currentSortKey = key;
      currentSortDirection = "asc";
    }
    currentPage = 1;
    fetchProductsPage();
  });
});

const createProductBtn = document.getElementById("createProductBtn");
if (createProductBtn) {
  createProductBtn.addEventListener("click", () => {
    openCreateModal();
  });
}

const prevPageBtn = document.getElementById("prevPageBtn");
if (prevPageBtn) {
  prevPageBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      fetchProductsPage();
    }
  });
}

const nextPageBtn = document.getElementById("nextPageBtn");
if (nextPageBtn) {
  nextPageBtn.addEventListener("click", () => {
    const { hasNextPage } = calculatePagination(totalCount, PAGE_SIZE, currentPage);
    if (hasNextPage) {
      currentPage++;
      fetchProductsPage();
    }
  });
}

const productsTableBody = document.getElementById("productsTableBody");
if (productsTableBody) {
  productsTableBody.addEventListener("click", (e) => {
    const editBtn = e.target.closest(".edit-btn");
    if (editBtn) {
      const ean = editBtn.getAttribute("data-ean");
      if (ean) {
        openEditModal(ean);
      }
    }
  });
}

const productsCardsContainer = document.getElementById(
  "productsCardsContainer",
);
if (productsCardsContainer) {
  productsCardsContainer.addEventListener("click", (e) => {
    const editBtn = e.target.closest(".edit-btn");
    if (editBtn) {
      const ean = editBtn.getAttribute("data-ean");
      if (ean) {
        openEditModal(ean);
      }
    }
  });
}

(async () => {
  await checkUserRole();
  await initDepartmentFilter();
  await fetchProductsPage();
})();
