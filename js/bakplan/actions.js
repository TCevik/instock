import { showToast, showConfirmModal } from "../main.js";
import { getBakplanData, setBakplanData, saveState } from "./state.js";
import { renderCategories } from "./render.js";

export function findItem(itemId) {
  const bakplanData = getBakplanData();
  for (const cat of bakplanData) {
    const item = cat.items.find((i) => i.id === itemId);
    if (item) return { item, cat };
  }
  return null;
}

export function deleteCategory(catId) {
  saveState();
  const cardEl = document.querySelector(
    `.category-card[data-cat-id="${catId}"]`,
  );
  if (cardEl) {
    cardEl.classList.add("category-card-exit");
    setTimeout(() => {
      setBakplanData(getBakplanData().filter((c) => c.id !== catId));
      const searchInput = document.getElementById("bakplanSearch");
      renderCategories(searchInput ? searchInput.value : "");
    }, 240);
  } else {
    setBakplanData(getBakplanData().filter((c) => c.id !== catId));
    const searchInput = document.getElementById("bakplanSearch");
    renderCategories(searchInput ? searchInput.value : "");
  }
}

export function deleteRow(itemId) {
  const res = findItem(itemId);
  if (!res || res.cat.items.length <= 1) {
    if (typeof showToast === "function") {
      showToast("Een categorie moet minimaal 1 artikel bevatten", "error");
    }
    return;
  }

  saveState();
  const searchInput = document.getElementById("bakplanSearch");
  const bakplanData = getBakplanData();
  for (const cat of bakplanData) {
    const idx = cat.items.findIndex((i) => i.id === itemId);
    if (idx !== -1) {
      cat.items.splice(idx, 1);
      break;
    }
  }
  renderCategories(searchInput ? searchInput.value : "");
}

export async function addCategory() {
  const bakplanData = getBakplanData();
  if (bakplanData.length === 50) {
    const confirmed = await showConfirmModal({
      title: "Veel categorieën waarschuwing",
      message:
        "Je staat op het punt om meer dan 50 categorieën toe te voegen. Dit kan mogelijke vertragingen of prestatieproblemen veroorzaken. Weet je zeker dat je door wilt gaan?",
      confirmText: "Toevoegen",
      cancelText: "Annuleren",
      isDanger: true,
    });
    if (!confirmed) return;
  }

  saveState();
  const searchInput = document.getElementById("bakplanSearch");
  const newId = "cat-" + Date.now();
  const newCat = {
    id: newId,
    name: "Nieuwe categorie",
    cartType: "normaal",
    collapsed: false,
    isNew: true,
    items: [
      {
        id: "item-" + Date.now(),
        omschrijving: "",
        perPlaat: null,
        prijs: null,
        promo: null,
        opleggen: null,
        derving: null,
        days: {},
      },
    ],
  };
  bakplanData.push(newCat);
  renderCategories(searchInput ? searchInput.value : "");
  const newCard = document.querySelector(
    `.category-card[data-cat-id="${newId}"]`,
  );
  if (newCard) {
    const pageContainer = document.querySelector(".page-container");
    if (pageContainer) {
      pageContainer.scrollTo({
        top: pageContainer.scrollHeight,
        behavior: "smooth",
      });
    } else {
      newCard.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    const input = newCard.querySelector(".category-title-input");
    if (input) input.select();
  }
}

export function addRowToCategory(catId) {
  const bakplanData = getBakplanData();
  let targetCat = bakplanData.find((c) => c.id === catId);
  if (!targetCat) return;

  saveState();
  const searchInput = document.getElementById("bakplanSearch");
  const newId = "item-" + Date.now();
  targetCat.items.push({
    id: newId,
    omschrijving: "",
    perPlaat: null,
    prijs: null,
    promo: null,
    opleggen: null,
    derving: null,
    days: {},
  });
  renderCategories(searchInput ? searchInput.value : "");
  const newTr = document.querySelector(`tr[data-id="${newId}"]`);
  if (newTr) {
    const pageContainer = document.querySelector(".page-container");
    if (pageContainer) {
      pageContainer.scrollTop += Math.max(0, newTr.offsetHeight - 0);
    }
    const input = newTr.querySelector(".bakplan-input");
    if (input) input.focus();
  }
}

export function toggleCategoryCollapse(catId) {
  const bakplanData = getBakplanData();
  const cat = bakplanData.find((c) => c.id === catId);
  if (!cat) return;
  cat.collapsed = !cat.collapsed;
  const cardEl = document.querySelector(
    `.category-card[data-cat-id="${catId}"]`,
  );
  if (cardEl) {
    cardEl.classList.toggle("collapsed", cat.collapsed);
  }
}

export function toggleCartType(catId) {
  const bakplanData = getBakplanData();
  const cat = bakplanData.find((c) => c.id === catId);
  if (!cat) return;
  saveState();
  cat.cartType = cat.cartType === "ontdooi" ? "normaal" : "ontdooi";
  const searchInput = document.getElementById("bakplanSearch");
  renderCategories(searchInput ? searchInput.value : "");
}

export function toggleAllCategories() {
  const bakplanData = getBakplanData();
  const anyCollapsed = bakplanData.some((c) => c.collapsed);
  bakplanData.forEach((c) => {
    c.collapsed = !anyCollapsed;
    const cardEl = document.querySelector(
      `.category-card[data-cat-id="${c.id}"]`,
    );
    if (cardEl) {
      cardEl.classList.toggle("collapsed", !anyCollapsed);
    }
  });
}
