import {
  supabase,
  showToast,
  showModal,
  closeModal,
  showConfirmModal,
  getStorePaths,
  invokeFn,
} from "./main.js";

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

let paths = [];
let originalPathsJson = "[]";
let selectedPathIndex = 0;
let mobileView = "list";

const pathsListContainer = document.getElementById("pathsListContainer");
const pathDetailPanel = document.getElementById("pathDetailPanel");
const addPathBtn = document.getElementById("addPathBtn");
const saveAllPathsBtn = document.getElementById("saveAllPathsBtn");

function setMobileView(view, pushHistory = true) {
  mobileView = view;
  const masterDetail = document.querySelector(".paths-master-detail");
  if (masterDetail) {
    masterDetail.setAttribute("data-mobile-view", view);
  }
  const card = document.querySelector(".settings-card");
  if (card) {
    card.setAttribute("data-mobile-view", view);
  }
  const pageContainer = document.querySelector(".page-container");
  if (pageContainer) {
    pageContainer.setAttribute("data-mobile-view", view);
  }
  const hero = document.querySelector(".dashboard-hero");
  if (hero) {
    hero.setAttribute("data-mobile-view", view);
  }
  if (pushHistory && view === "detail" && window.innerWidth <= 768) {
    if (
      !window.history.state ||
      window.history.state.instellingenView !== "detail"
    ) {
      window.history.pushState({ instellingenView: "detail" }, "");
    }
  }
}

window.addEventListener("popstate", () => {
  if (window.innerWidth <= 768 && mobileView === "detail") {
    syncActiveCardToMemory();
    setMobileView("list", false);
    renderSidebar();
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 768 && mobileView === "detail") {
    syncActiveCardToMemory();
    setMobileView("list", false);
    renderSidebar();
    renderDetailPanel();
  }
});

function syncActiveCardToMemory() {
  if (selectedPathIndex < 0 || selectedPathIndex >= paths.length) return;
  const currentPath = paths[selectedPathIndex];
  if (!currentPath) return;

  const nameInput = pathDetailPanel.querySelector("#detailPathName");
  if (!nameInput) return;

  const spiegelInput = pathDetailPanel.querySelector("#detailPathSpiegelnorm");
  const restantInput = pathDetailPanel.querySelector(
    "#detailPathRestantennorm",
  );

  currentPath.name = nameInput.value.trim();
  if (spiegelInput)
    currentPath.spiegelnorm =
      spiegelInput.value !== "" ? Number(spiegelInput.value) : "";
  if (restantInput)
    currentPath.restantennorm =
      restantInput.value !== "" ? Number(restantInput.value) : "";

  const catRows = pathDetailPanel.querySelectorAll(".category-table-row");
  const cats = [];
  catRows.forEach((row) => {
    const catName =
      row.querySelector(".category-row-name-input")?.value.trim() || "";
    const catNormVal = row.querySelector(".category-row-norm-input")?.value;
    const catNorm =
      catNormVal !== "" && !isNaN(Number(catNormVal)) ? Number(catNormVal) : "";
    if (catName || catNorm !== "") {
      const catObj = { name: catName, norm: catNorm };
      if (row.dataset.id) {
        catObj.id = row.dataset.id;
      }
      cats.push(catObj);
    }
  });
  currentPath.categories = cats;
}

function getPathsSnapshot() {
  syncActiveCardToMemory();
  return JSON.stringify(
    paths
      .map((p) => ({
        name: String(p.name || "").trim(),
        spiegelnorm:
          p.spiegelnorm !== "" && !isNaN(Number(p.spiegelnorm))
            ? Number(p.spiegelnorm)
            : 0,
        restantennorm:
          p.restantennorm !== "" && !isNaN(Number(p.restantennorm))
            ? Number(p.restantennorm)
            : 0,
        categories: Array.isArray(p.categories)
          ? p.categories
              .map((c) => ({
                name: String(c?.name || "").trim(),
                norm:
                  c?.norm !== "" &&
                  c?.norm !== null &&
                  c?.norm !== undefined &&
                  !isNaN(Number(c.norm))
                    ? Number(c.norm)
                    : 0,
              }))
              .filter((c) => c.name !== "" || c.norm !== 0)
          : [],
      }))
      .filter(
        (p) =>
          p.name !== "" ||
          p.categories.length > 0 ||
          p.spiegelnorm !== 0 ||
          p.restantennorm !== 0,
      ),
  );
}

function hasUnsavedChanges() {
  return getPathsSnapshot() !== originalPathsJson;
}

function renderSidebar() {
  if (!pathsListContainer) return;

  if (paths.length === 0) {
    pathsListContainer.innerHTML = `<div class="empty-state">Geen paden</div>`;
    return;
  }

  pathsListContainer.innerHTML = paths
    .map((p, idx) => {
      const isActive = idx === selectedPathIndex && window.innerWidth > 768;
      const name = escapeHtml(p.name || "Nieuw pad");
      const count = Array.isArray(p.categories) ? p.categories.length : 0;

      return `
            <div class="path-nav-item ${isActive ? "active" : ""}" data-index="${idx}">
                <div class="path-nav-icon-box">
                    <span class="material-icons">alt_route</span>
                </div>
                <div class="path-nav-info">
                    <span class="path-nav-name">${name}</span>
                    <span class="path-nav-count">${count} ${count === 1 ? "categorie" : "categorieën"}</span>
                </div>
                <span class="material-icons path-nav-chevron">chevron_right</span>
            </div>
        `;
    })
    .join("");

  pathsListContainer.querySelectorAll(".path-nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      const idx = Number(item.getAttribute("data-index"));
      syncActiveCardToMemory();
      selectedPathIndex = idx;
      renderSidebar();
      renderDetailPanel();
      setMobileView("detail");
      if (window.innerWidth <= 768) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });
}

function createCategoryTableRow(cat = { name: "", norm: "" }, index = 0) {
  const tr = document.createElement("tr");
  tr.className = "category-table-row";
  if (cat.id) {
    tr.dataset.id = cat.id;
  }
  tr.innerHTML = `
        <td class="cat-cell-name">
            <input type="text" class="category-row-name-input" placeholder="Categorienaam..." value="${escapeHtml(cat.name || "")}">
        </td>
        <td class="cat-cell-norm">
            <input type="number" inputmode="numeric" min="0" class="category-row-norm-input" placeholder="0" value="${cat.norm !== undefined && cat.norm !== null ? cat.norm : ""}">
        </td>
        <td class="cat-cell-action">
            <button type="button" class="category-row-delete-btn" title="Categorie verwijderen" aria-label="Categorie verwijderen">
                <span class="material-icons">delete</span>
            </button>
        </td>
    `;

  const nameInput = tr.querySelector(".category-row-name-input");
  const normInput = tr.querySelector(".category-row-norm-input");

  nameInput.addEventListener("input", () => {
    syncActiveCardToMemory();
  });

  normInput.addEventListener("input", () => {
    syncActiveCardToMemory();
  });

  tr.querySelector(".category-row-delete-btn").addEventListener("click", () => {
    tr.remove();
    syncActiveCardToMemory();
    renderSidebar();
    checkEmptyCategoriesTable();
  });

  return tr;
}

function checkEmptyCategoriesTable() {
  const tbody = pathDetailPanel.querySelector("#categoriesTableBody");
  if (tbody && tbody.children.length === 0) {
    tbody.innerHTML = `
            <tr id="emptyCategoriesRow">
                <td colspan="3" class="empty-state" style="padding: 24px;">Geen categorieën toegevoegd</td>
            </tr>
        `;
  }
}

function renderDetailPanel() {
  if (!pathDetailPanel) return;

  if (
    paths.length === 0 ||
    selectedPathIndex < 0 ||
    selectedPathIndex >= paths.length
  ) {
    pathDetailPanel.innerHTML = `
            <div class="mobile-detail-header">
                <button type="button" class="btn-mobile-back" id="mobileBackBtn">
                    <span class="material-icons">arrow_back</span>
                    <span>Paden</span>
                </button>
            </div>
            <div class="empty-state" style="padding: 80px 20px;">
                <span class="material-icons" style="font-size: 48px; color: var(--text-color-placeholder); margin-bottom: 12px; display: block;">alt_route</span>
                <p>Geen pad geselecteerd. Voeg een nieuw pad toe om te beginnen.</p>
            </div>
        `;
    const backBtn = pathDetailPanel.querySelector("#mobileBackBtn");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        setMobileView("list", false);
      });
    }
    return;
  }

  const currentPath = paths[selectedPathIndex];
  const pathName = escapeHtml(currentPath.name || "");
  const spiegelnorm =
    currentPath.spiegelnorm !== undefined && currentPath.spiegelnorm !== null
      ? currentPath.spiegelnorm
      : "";
  const restantennorm =
    currentPath.restantennorm !== undefined &&
    currentPath.restantennorm !== null
      ? currentPath.restantennorm
      : "";

  pathDetailPanel.innerHTML = `
        <div class="mobile-detail-header">
            <button type="button" class="btn-mobile-back" id="mobileBackBtn">
                <span class="material-icons">arrow_back</span>
                <span>Paden</span>
            </button>
            <div class="mobile-detail-title-wrap">
                <span class="mobile-detail-subtitle">Pad bewerken</span>
                <span class="mobile-detail-heading" id="mobileDetailHeading">${pathName || "Nieuw pad"}</span>
            </div>
            <button type="button" class="btn-mobile-save" id="mobileDetailSaveBtn">
                <span class="material-icons">save</span>
                <span>Opslaan</span>
            </button>
        </div>

        <div class="detail-header">
            <div class="detail-title-field">
                <label class="detail-title-label">Padnaam</label>
                <input type="text" id="detailPathName" class="detail-title-input" placeholder="Bijv. Frisdrank, Bier..." value="${pathName}">
            </div>
            <button type="button" class="detail-delete-btn desktop-only-delete" id="deleteCurrentPathBtn">
                <span class="material-icons">delete</span>
                <span>Pad verwijderen</span>
            </button>
        </div>

        <div class="detail-norms-grid">
            <div class="detail-norm-field">
                <label class="detail-norm-label">Spiegelnorm (colli/u)</label>
                <input type="number" inputmode="numeric" min="0" id="detailPathSpiegelnorm" class="detail-norm-input" placeholder="Spiegelnorm" value="${spiegelnorm}">
            </div>
            <div class="detail-norm-field">
                <label class="detail-norm-label">Restantennorm (colli/u)</label>
                <input type="number" inputmode="numeric" min="0" id="detailPathRestantennorm" class="detail-norm-input" placeholder="Restantennorm" value="${restantennorm}">
            </div>
        </div>

        <div class="detail-categories-section">
            <div class="detail-categories-header-row">
                <span class="detail-categories-title">Categorieën & Normen</span>
            </div>

            <div class="categories-table-container">
                <table class="categories-table">
                    <thead>
                        <tr>
                            <th>Categorie</th>
                            <th class="th-norm">
                                <span class="desktop-norm-label">Norm (colli/u)</span>
                                <span class="mobile-norm-label">Norm</span>
                            </th>
                            <th class="th-action"></th>
                        </tr>
                    </thead>
                    <tbody id="categoriesTableBody"></tbody>
                </table>
            </div>

            <button type="button" class="btn-add-category-large" id="addCategoryBtn">
                <span class="material-icons">add</span>
                <span>Categorie toevoegen</span>
            </button>
        </div>

        <div class="mobile-detail-footer">
            <button type="button" class="detail-delete-btn mobile-only-delete" id="deleteCurrentPathBtnMobile">
                <span class="material-icons">delete</span>
                <span>Pad verwijderen</span>
            </button>
        </div>
    `;

  const nameInput = pathDetailPanel.querySelector("#detailPathName");
  const spiegelInput = pathDetailPanel.querySelector("#detailPathSpiegelnorm");
  const restantInput = pathDetailPanel.querySelector(
    "#detailPathRestantennorm",
  );
  const addCatBtn = pathDetailPanel.querySelector("#addCategoryBtn");
  const tbody = pathDetailPanel.querySelector("#categoriesTableBody");
  const mobileHeading = pathDetailPanel.querySelector("#mobileDetailHeading");

  nameInput.addEventListener("input", () => {
    currentPath.name = nameInput.value.trim();
    const activeNavName = pathsListContainer.querySelector(
      ".path-nav-item.active .path-nav-name",
    );
    if (activeNavName) {
      activeNavName.textContent = currentPath.name || "Nieuw pad";
    }
    if (mobileHeading) {
      mobileHeading.textContent = currentPath.name || "Nieuw pad";
    }
  });

  spiegelInput.addEventListener("input", () => {
    currentPath.spiegelnorm =
      spiegelInput.value !== "" ? Number(spiegelInput.value) : "";
  });

  restantInput.addEventListener("input", () => {
    currentPath.restantennorm =
      restantInput.value !== "" ? Number(restantInput.value) : "";
  });

  if (
    Array.isArray(currentPath.categories) &&
    currentPath.categories.length > 0
  ) {
    currentPath.categories.forEach((cat, idx) => {
      tbody.appendChild(createCategoryTableRow(cat, idx));
    });
  } else {
    checkEmptyCategoriesTable();
  }

  addCatBtn.addEventListener("click", () => {
    const emptyRow = tbody.querySelector("#emptyCategoriesRow");
    if (emptyRow) emptyRow.remove();

    const newRow = createCategoryTableRow(
      { name: "", norm: "" },
      tbody.children.length,
    );
    tbody.appendChild(newRow);
    syncActiveCardToMemory();
    renderSidebar();

    const newNameInput = newRow.querySelector(".category-row-name-input");
    if (newNameInput) newNameInput.focus();
  });

  const backBtn = pathDetailPanel.querySelector("#mobileBackBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      syncActiveCardToMemory();
      if (
        window.history.state &&
        window.history.state.instellingenView === "detail"
      ) {
        window.history.back();
      } else {
        setMobileView("list", false);
        renderSidebar();
      }
      if (window.innerWidth <= 768) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  const mobileSaveBtn = pathDetailPanel.querySelector("#mobileDetailSaveBtn");
  if (mobileSaveBtn) {
    mobileSaveBtn.addEventListener("click", saveStorePaths);
  }

  const handleDelete = async () => {
    const pName = currentPath.name || "dit pad";
    const confirmed = await showConfirmModal({
      title: "Pad verwijderen",
      message: `Weet je zeker dat je "${escapeHtml(pName)}" wilt verwijderen?`,
      confirmText: "Verwijderen",
      cancelText: "Annuleren",
      isDanger: true,
    });

    if (confirmed) {
      paths.splice(selectedPathIndex, 1);
      if (selectedPathIndex >= paths.length) {
        selectedPathIndex = Math.max(0, paths.length - 1);
      }
      renderSidebar();
      renderDetailPanel();
      setMobileView("list", false);
    }
  };

  const deleteBtnDesktop = pathDetailPanel.querySelector(
    "#deleteCurrentPathBtn",
  );
  const deleteBtnMobile = pathDetailPanel.querySelector(
    "#deleteCurrentPathBtnMobile",
  );
  if (deleteBtnDesktop)
    deleteBtnDesktop.addEventListener("click", handleDelete);
  if (deleteBtnMobile) deleteBtnMobile.addEventListener("click", handleDelete);
}

function collectCleanPaths() {
  syncActiveCardToMemory();
  return paths
    .map((p) => ({
      id: p.id || undefined,
      name: String(p.name || "").trim(),
      spiegelnorm:
        p.spiegelnorm !== "" && !isNaN(Number(p.spiegelnorm))
          ? Number(p.spiegelnorm)
          : 0,
      restantennorm:
        p.restantennorm !== "" && !isNaN(Number(p.restantennorm))
          ? Number(p.restantennorm)
          : 0,
      categories: Array.isArray(p.categories)
        ? p.categories
            .filter((c) => c && (String(c.name || "").trim() || c.norm !== ""))
            .map((c) => ({
              id: c.id || undefined,
              name: String(c.name || "").trim(),
              norm:
                c.norm !== "" && !isNaN(Number(c.norm)) ? Number(c.norm) : 0,
            }))
        : [],
    }))
    .filter((p) => p.name || p.categories.length > 0);
}

async function loadStorePaths() {
  try {
    paths = await getStorePaths();
    selectedPathIndex = 0;
    renderSidebar();
    renderDetailPanel();
    originalPathsJson = getPathsSnapshot();
  } catch (err) {
    showToast("error", err.message || "Fout bij ophalen van paden");
    paths = [];
    selectedPathIndex = 0;
    renderSidebar();
    renderDetailPanel();
    originalPathsJson = getPathsSnapshot();
  }
}

async function saveStorePaths() {
  const mobileSaveBtn = pathDetailPanel
    ? pathDetailPanel.querySelector("#mobileDetailSaveBtn")
    : null;
  if (saveAllPathsBtn) {
    saveAllPathsBtn.disabled = true;
    saveAllPathsBtn.innerHTML = `
            <span class="material-icons btn-icon">hourglass_empty</span>
            <span>Opslaan...</span>
        `;
  }
  if (mobileSaveBtn) {
    mobileSaveBtn.disabled = true;
    mobileSaveBtn.innerHTML = `
            <span class="material-icons">hourglass_empty</span>
            <span>Opslaan...</span>
        `;
  }

  const collected = collectCleanPaths();

  try {
    const data = await invokeFn("manage-store-settings", {
      body: {
        action: "update_paths",
        default_paths: collected,
      },
    });

    showToast(
      "notification",
      "Standaard paden en categorieën succesvol opgeslagen",
    );
    if (data && Array.isArray(data.default_paths)) {
      paths = data.default_paths;
      if (selectedPathIndex >= paths.length) selectedPathIndex = 0;
      renderSidebar();
      renderDetailPanel();
      originalPathsJson = getPathsSnapshot();
    }
  } catch (err) {
    showToast("error", err.message || "Fout bij opslaan");
  } finally {
    if (saveAllPathsBtn) {
      saveAllPathsBtn.disabled = false;
      saveAllPathsBtn.innerHTML = `
                <span class="material-icons btn-icon">save</span>
                <span>Wijzigingen opslaan</span>
            `;
    }
    if (mobileSaveBtn) {
      mobileSaveBtn.disabled = false;
      mobileSaveBtn.innerHTML = `
                <span class="material-icons">save</span>
                <span>Opslaan</span>
            `;
    }
  }
}

window.addEventListener("beforeunload", (e) => {
  if (window.isLoggingOut) return;
  if (hasUnsavedChanges()) {
    e.preventDefault();
    e.returnValue = "";
  }
});

document.addEventListener(
  "click",
  async (e) => {
    const link = e.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

    if (hasUnsavedChanges()) {
      e.preventDefault();
      const confirmed = await showConfirmModal({
        title: "Niet opgeslagen wijzigingen",
        message:
          "Je hebt wijzigingen gemaakt die nog niet zijn opgeslagen. Weet je zeker dat je de pagina wilt verlaten?",
        confirmText: "Verlaten",
        cancelText: "Blijven",
        isDanger: true,
      });

      if (confirmed) {
        originalPathsJson = getPathsSnapshot();
        window.location.href = href;
      }
    }
  },
  true,
);

if (addPathBtn) {
  addPathBtn.addEventListener("click", () => {
    syncActiveCardToMemory();
    paths.unshift({
      name: "",
      spiegelnorm: "",
      restantennorm: "",
      categories: [],
    });
    selectedPathIndex = 0;
    renderSidebar();
    renderDetailPanel();
    setMobileView("detail");
    if (window.innerWidth <= 768) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    const nameInput = pathDetailPanel.querySelector("#detailPathName");
    if (nameInput) {
      nameInput.focus();
    }
  });
}

if (saveAllPathsBtn) {
  saveAllPathsBtn.addEventListener("click", saveStorePaths);
}

setMobileView("list", false);
loadStorePaths();
