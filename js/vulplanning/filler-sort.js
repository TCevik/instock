import { planningState } from "./state.js";
import { timeToMinutes } from "./time-utils.js";
import { recordSnapshot } from "./history.js";
import { triggerAutoSave } from "./storage.js";
import { fillRoosterShifts } from "./rooster.js";
import { keepInViewport, resetDropdownPosition } from "../dropdown-utils.js";
import { hideCustomTooltip } from "./tooltip.js";
import { hideContextMenu } from "./context-menu.js";

const SORT_STORAGE_KEY = "instock_filler_sort";
let currentSortType = null;
let boundCallbacks = {};

function getEffectiveEnd(f) {
  const start = timeToMinutes(f?.from);
  let end = timeToMinutes(f?.to);
  if (end > 0 && end <= start) {
    end += 24 * 60;
  }
  return end;
}

export function sortFillersByStartAsc(a, b) {
  const aVal = timeToMinutes(a?.from);
  const bVal = timeToMinutes(b?.from);
  const aNorm = aVal > 0 ? aVal : 9999;
  const bNorm = bVal > 0 ? bVal : 9999;
  if (aNorm !== bNorm) return aNorm - bNorm;
  return (a?.name || "").localeCompare(b?.name || "", "nl", {
    sensitivity: "base",
  });
}

export function sortFillersByStartDesc(a, b) {
  const aVal = timeToMinutes(a?.from);
  const bVal = timeToMinutes(b?.from);
  const aNorm = aVal > 0 ? aVal : -1;
  const bNorm = bVal > 0 ? bVal : -1;
  if (aNorm !== bNorm) return bNorm - aNorm;
  return (a?.name || "").localeCompare(b?.name || "", "nl", {
    sensitivity: "base",
  });
}

export function sortFillersByEndAsc(a, b) {
  const aEnd = getEffectiveEnd(a);
  const bEnd = getEffectiveEnd(b);
  const aNorm = aEnd > 0 ? aEnd : 9999;
  const bNorm = bEnd > 0 ? bEnd : 9999;
  if (aNorm !== bNorm) return aNorm - bNorm;
  return (a?.name || "").localeCompare(b?.name || "", "nl", {
    sensitivity: "base",
  });
}

export function sortFillersByEndDesc(a, b) {
  const aEnd = getEffectiveEnd(a);
  const bEnd = getEffectiveEnd(b);
  const aNorm = aEnd > 0 ? aEnd : -1;
  const bNorm = bEnd > 0 ? bEnd : -1;
  if (aNorm !== bNorm) return bNorm - aNorm;
  return (a?.name || "").localeCompare(b?.name || "", "nl", {
    sensitivity: "base",
  });
}

export function sortFillersByNameAsc(a, b) {
  const comp = (a?.name || "").localeCompare(b?.name || "", "nl", {
    sensitivity: "base",
  });
  if (comp !== 0) return comp;
  return (timeToMinutes(a?.from) || 9999) - (timeToMinutes(b?.from) || 9999);
}

export function sortFillersByNameDesc(a, b) {
  const comp = (b?.name || "").localeCompare(a?.name || "", "nl", {
    sensitivity: "base",
  });
  if (comp !== 0) return comp;
  return (timeToMinutes(a?.from) || 9999) - (timeToMinutes(b?.from) || 9999);
}

export function syncCustomOrder() {
  if (!Array.isArray(planningState.fillers)) return;
  planningState.fillers.forEach((f, idx) => {
    f.customOrder = idx;
  });
}

export function ensureCustomOrder() {
  if (!Array.isArray(planningState.fillers)) return;
  planningState.fillers.forEach((f, idx) => {
    if (typeof f.customOrder !== "number") {
      f.customOrder = idx;
    }
  });
}

export function updateSortUI() {
  const btn = document.getElementById("btn-sort-fillers");
  const menu = document.getElementById("timeline-sort-menu");
  const labelSpan = btn ? btn.querySelector(".sort-btn-text") : null;
  if (!btn || !menu) return;

  menu.querySelectorAll(".sort-menu-item").forEach((item) => {
    const itemSort = item.getAttribute("data-sort");
    item.classList.toggle("selected", itemSort === currentSortType);
  });

  if (currentSortType) {
    btn.classList.add("active");
    const labelMap = {
      "start-asc": "Begin ↑",
      "start-desc": "Begin ↓",
      "end-asc": "Eind ↑",
      "end-desc": "Eind ↓",
      "name-asc": "Naam A-Z",
      "name-desc": "Naam Z-A",
    };
    if (labelSpan) {
      labelSpan.textContent = labelMap[currentSortType] || "Sorteren";
    }
  } else {
    btn.classList.remove("active");
    if (labelSpan) {
      labelSpan.textContent = "Sorteren";
    }
  }
}

export function clearFillerSortState() {
  currentSortType = null;
  try {
    localStorage.removeItem(SORT_STORAGE_KEY);
  } catch (_) {}
  syncCustomOrder();
  updateSortUI();
}

export function sortFillers(
  sortType,
  callbacks = {},
  record = true,
  syncRooster = true,
) {
  if (!planningState.fillers || planningState.fillers.length === 0) return;

  ensureCustomOrder();

  if (sortType === "custom") {
    planningState.fillers.sort(
      (a, b) => (Number(a?.customOrder) || 0) - (Number(b?.customOrder) || 0),
    );
    currentSortType = null;
    try {
      localStorage.removeItem(SORT_STORAGE_KEY);
    } catch (_) {}
  } else {
    if (sortType === "start-asc") {
      planningState.fillers.sort(sortFillersByStartAsc);
    } else if (sortType === "start-desc") {
      planningState.fillers.sort(sortFillersByStartDesc);
    } else if (sortType === "end-asc") {
      planningState.fillers.sort(sortFillersByEndAsc);
    } else if (sortType === "end-desc") {
      planningState.fillers.sort(sortFillersByEndDesc);
    } else if (sortType === "name-asc") {
      planningState.fillers.sort(sortFillersByNameAsc);
    } else if (sortType === "name-desc") {
      planningState.fillers.sort(sortFillersByNameDesc);
    } else {
      return;
    }

    currentSortType = sortType;
    try {
      localStorage.setItem(SORT_STORAGE_KEY, sortType);
    } catch (_) {}
  }

  updateSortUI();
  if (syncRooster) {
    fillRoosterShifts(planningState.fillers);
  }

  if (record) {
    recordSnapshot();
    triggerAutoSave(true);
  }

  const cb = { ...boundCallbacks, ...callbacks };
  if (cb.onRenderRows) {
    cb.onRenderRows();
  }
}

export function applyStoredFillerSort(callbacks = {}) {
  if (
    !Array.isArray(planningState.fillers) ||
    planningState.fillers.length === 0
  )
    return;
  ensureCustomOrder();
  let savedSort = null;
  try {
    savedSort = localStorage.getItem(SORT_STORAGE_KEY);
  } catch (_) {}

  const validSorts = [
    "start-asc",
    "start-desc",
    "end-asc",
    "end-desc",
    "name-asc",
    "name-desc",
  ];
  if (savedSort && validSorts.includes(savedSort)) {
    sortFillers(savedSort, callbacks, false, false);
  } else {
    currentSortType = null;
    try {
      localStorage.removeItem(SORT_STORAGE_KEY);
    } catch (_) {}
    planningState.fillers.sort(
      (a, b) => (Number(a?.customOrder) || 0) - (Number(b?.customOrder) || 0),
    );
    updateSortUI();
  }
}

export function closeFillerSortMenu() {
  const btn = document.getElementById("btn-sort-fillers");
  const menu = document.getElementById("timeline-sort-menu");
  if (btn) btn.classList.remove("open");
  if (menu) {
    menu.classList.remove("active");
    resetDropdownPosition(menu);
  }
}

export function toggleFillerSortMenu() {
  const btn = document.getElementById("btn-sort-fillers");
  const menu = document.getElementById("timeline-sort-menu");
  if (!btn || !menu) return;

  const isOpen = menu.classList.contains("active");
  if (isOpen) {
    closeFillerSortMenu();
  } else {
    hideCustomTooltip();
    hideContextMenu();
    btn.classList.add("open");
    menu.classList.add("active");
    keepInViewport(menu, btn);
  }
}

export function initFillerSort(callbacks = {}) {
  boundCallbacks = { ...callbacks };

  const btn = document.getElementById("btn-sort-fillers");
  const menu = document.getElementById("timeline-sort-menu");
  const headerName = document.getElementById("header-sort-name");
  const headerEnd = document.getElementById("header-sort-end");

  if (btn && !btn.__sortBound) {
    btn.__sortBound = true;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFillerSortMenu();
    });
  }

  if (menu && !menu.__sortBound) {
    menu.__sortBound = true;
    menu.addEventListener("click", (e) => {
      const item = e.target.closest(".sort-menu-item");
      if (!item) return;
      const sortType = item.getAttribute("data-sort");
      closeFillerSortMenu();
      if (sortType) {
        sortFillers(sortType, boundCallbacks);
      }
    });
  }

  if (headerName && !headerName.__sortBound) {
    headerName.__sortBound = true;
    headerName.addEventListener("click", () => {
      closeFillerSortMenu();
      const nextSort =
        currentSortType === "name-asc" ? "name-desc" : "name-asc";
      sortFillers(nextSort, boundCallbacks);
    });
  }

  if (headerEnd && !headerEnd.__sortBound) {
    headerEnd.__sortBound = true;
    headerEnd.addEventListener("click", () => {
      closeFillerSortMenu();
      const nextSort = currentSortType === "end-asc" ? "end-desc" : "end-asc";
      sortFillers(nextSort, boundCallbacks);
    });
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".timeline-sort-dropdown-container")) {
      closeFillerSortMenu();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeFillerSortMenu();
    }
  });

  applyStoredFillerSort();
}
