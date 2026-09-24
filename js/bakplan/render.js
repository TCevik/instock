import { getBakplanData, getCurrentDay } from "./state.js";
import { getDayValue, calculatePlaten } from "./utils.js";

export function updateSummaryStats() {
  let totalItems = 0;
  let totalOpleggen = 0;
  let totalPlaten = 0;
  let totalDerving = 0;

  const bakplanData = getBakplanData();

  bakplanData.forEach((cat) => {
    let catItems = 0;
    let catPlaten = 0;
    cat.items.forEach((item) => {
      if (item.omschrijving && item.omschrijving.trim() !== "") {
        totalItems++;
        catItems++;
      }
      const opl = parseFloat(getDayValue(item, "opleggen")) || 0;
      const der = parseFloat(getDayValue(item, "derving")) || 0;
      const pl = calculatePlaten(getDayValue(item, "opleggen"), item.perPlaat);

      totalOpleggen += opl;
      totalDerving += der;
      catPlaten += pl;
      totalPlaten += pl;
    });

    const badgeEl = document.getElementById(`cat-badge-${cat.id}`);
    if (badgeEl) {
      badgeEl.textContent = `${catItems} artikelen · ${catPlaten} platen`;
    }
  });

  const elItems = document.getElementById("statTotalItems");
  const elOpleggen = document.getElementById("statTotalOpleggen");
  const elPlaten = document.getElementById("statTotalPlaten");
  const elDerving = document.getElementById("statTotalDerving");

  if (elItems) elItems.textContent = totalItems;
  if (elOpleggen) elOpleggen.textContent = totalOpleggen;
  if (elPlaten) elPlaten.textContent = totalPlaten;
  if (elDerving) elDerving.textContent = totalDerving;
}

export function updateToggleAllButton() {
  const iconToggle = document.getElementById("iconToggleAll");
  const textToggle = document.getElementById("textToggleAll");
  if (!iconToggle || !textToggle) return;

  const bakplanData = getBakplanData();
  const anyCollapsed = bakplanData.some((c) => c.collapsed);
  if (anyCollapsed) {
    iconToggle.textContent = "unfold_more";
    textToggle.textContent = "Alles uitklappen";
  } else {
    iconToggle.textContent = "unfold_less";
    textToggle.textContent = "Alles inklappen";
  }
}

export function renderCategories(filterText = "") {
  const container = document.getElementById("categoriesContainer");
  if (!container) return;

  const bakplanData = getBakplanData();
  const currentDay = getCurrentDay();

  if (bakplanData.length === 0) {
    container.innerHTML = `<p class="bakplan-empty-state">Geen categorieën aanwezig. Klik op "+ Categorie toevoegen" om te beginnen.</p>`;
    updateSummaryStats();
    updateToggleAllButton();
    return;
  }

  const query = filterText.toLowerCase().trim();
  let html = "";

  bakplanData.forEach((cat) => {
    const matchingItems = cat.items.filter(
      (item) => !query || item.omschrijving.toLowerCase().includes(query),
    );

    if (query && matchingItems.length === 0) return;

    let catItemsCount = 0;
    let catPlatenCount = 0;
    cat.items.forEach((item) => {
      if (item.omschrijving && item.omschrijving.trim() !== "") catItemsCount++;
      catPlatenCount += calculatePlaten(
        getDayValue(item, "opleggen"),
        item.perPlaat,
      );
    });

    const isCollapsed = cat.collapsed ? "collapsed" : "";
    const enterClass = cat.isNew ? " category-card-enter" : "";
    delete cat.isNew;

    const isOntdooi = cat.cartType === "ontdooi";
    const cartBtnClass = isOntdooi
      ? "btn-cart-type-toggle is-ontdooi"
      : "btn-cart-type-toggle";
    const cartIcon = isOntdooi ? "ac_unit" : "shopping_cart";
    const cartText = isOntdooi ? "Ontdooikar" : "Normale kar";

    html += `
            <div class="category-card ${isCollapsed}${enterClass}" data-cat-id="${cat.id}">
                <div class="category-card-header" data-cat-id="${cat.id}">
                    <div class="cat-header-left">
                        <button type="button" class="btn-toggle-cat" data-cat-id="${cat.id}" title="Inklappen / Uitklappen">
                            <span class="material-icons chevron-icon">expand_less</span>
                        </button>
                        <span class="material-icons cat-icon">folder</span>
                        <input type="text" class="category-title-input" value="${cat.name}" data-cat-id="${cat.id}" placeholder="Categorie naam...">
                        <span class="cat-subtotal-badge" id="cat-badge-${cat.id}">${catItemsCount} artikelen · ${catPlatenCount} platen</span>
                    </div>
                    <div class="cat-header-right">
                        <button type="button" class="${cartBtnClass}" data-cat-id="${cat.id}" title="Wissel type kar">
                            <span class="material-icons">${cartIcon}</span> ${cartText}
                        </button>
                        <button type="button" class="btn-delete-cat" data-cat-id="${cat.id}" title="Categorie verwijderen">
                            <span class="material-icons">delete_outline</span>
                        </button>
                    </div>
                </div>
                
                <div class="category-card-body">
                    <div class="category-card-body-inner">
                        <div class="table-responsive">
                            <table class="bakplan-table">
                                <thead>
                                    <tr>
                                        <th class="th-desc">Productomschrijving</th>
                                        <th class="th-num">Aantal / plaat</th>
                                        <th class="th-num">Prijs</th>
                                        <th class="th-num th-day">Promo <span class="header-day-tag">${currentDay.slice(0, 2)}</span></th>
                                        <th class="th-num th-day">Opleggen <span class="header-day-tag">${currentDay.slice(0, 2)}</span></th>
                                        <th class="th-num th-day">Platen <span class="header-day-tag">${currentDay.slice(0, 2)}</span></th>
                                        <th class="th-num th-day">Derving <span class="header-day-tag">${currentDay.slice(0, 2)}</span></th>
                                        <th class="th-actions"></th>
                                    </tr>
                                </thead>
                                <tbody>
        `;

    matchingItems.forEach((item) => {
      const currentOpleggen = getDayValue(item, "opleggen");
      const currentPromo = getDayValue(item, "promo");
      const currentDerving = getDayValue(item, "derving");

      const platen = calculatePlaten(currentOpleggen, item.perPlaat);
      const perPlaatVal =
        item.perPlaat !== null &&
        item.perPlaat !== undefined &&
        item.perPlaat !== ""
          ? item.perPlaat
          : "";
      const prijsVal =
        item.prijs !== null && item.prijs !== undefined && item.prijs !== ""
          ? parseFloat(item.prijs).toFixed(2)
          : "";
      const promoVal =
        currentPromo !== null &&
        currentPromo !== undefined &&
        currentPromo !== ""
          ? parseFloat(currentPromo).toFixed(2)
          : "";
      const opleggenVal =
        currentOpleggen !== null &&
        currentOpleggen !== undefined &&
        currentOpleggen !== ""
          ? currentOpleggen
          : "";
      const dervingVal =
        currentDerving !== null &&
        currentDerving !== undefined &&
        currentDerving !== ""
          ? currentDerving
          : "";
      delete item.isNew;

      const isOnlyRow = cat.items.length <= 1;
      const deleteAttr = isOnlyRow
        ? ' disabled style="opacity:0.25; cursor:not-allowed;"'
        : "";
      const deleteTitle = isOnlyRow
        ? "Minimaal 1 artikel verplicht per categorie"
        : "Rij verwijderen";

      html += `
                <tr data-id="${item.id}" data-cat-id="${cat.id}">
                    <td class="td-desc">
                        <input type="text" class="bakplan-input" value="${item.omschrijving}" placeholder="Productomschrijving..." data-field="omschrijving">
                    </td>
                    <td class="td-num">
                        <input type="number" min="0" max="999999" step="1" class="bakplan-input input-num" value="${perPlaatVal}" placeholder="0" data-field="perPlaat">
                    </td>
                    <td class="td-num">
                        <input type="number" min="0" max="999999" step="0.01" class="bakplan-input input-num" value="${prijsVal}" placeholder="0.00" data-field="prijs">
                    </td>
                    <td class="td-num">
                        <input type="number" min="0" max="999999" step="0.01" class="bakplan-input input-num input-day" value="${promoVal}" placeholder="-" data-field="promo" title="Rechtermuisknop om te synchroniseren naar andere dagen">
                    </td>
                    <td class="td-num">
                        <input type="number" min="0" max="999999" step="1" class="bakplan-input input-num input-day" value="${opleggenVal}" placeholder="0" data-field="opleggen" title="Rechtermuisknop om te synchroniseren naar andere dagen">
                    </td>
                    <td class="td-num">
                        <span class="read-only-badge platen-val">${platen}</span>
                    </td>
                    <td class="td-num">
                        <input type="number" min="0" max="999999" step="1" class="bakplan-input input-num input-day" value="${dervingVal}" placeholder="0" data-field="derving" title="Rechtermuisknop om te synchroniseren naar andere dagen">
                    </td>
                    <td class="td-actions">
                        <button type="button" class="btn-delete-row" data-id="${item.id}" title="${deleteTitle}"${deleteAttr}>
                            <span class="material-icons">close</span>
                        </button>
                    </td>
                </tr>
            `;
    });

    html += `
                                </tbody>
                            </table>
                        </div>
                        <div class="category-card-footer">
                            <button type="button" class="btn-add-row-in-cat" data-cat-id="${cat.id}">
                                <span class="material-icons">add</span> Artikel toevoegen
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
  });

  container.innerHTML = html;
  updateSummaryStats();
  updateToggleAllButton();
}
