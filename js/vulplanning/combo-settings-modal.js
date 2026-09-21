import { showModal, closeModal, showToast } from "../main.js";
import { createCustomSelect } from "../select.js";
import { planningState } from "./state.js";
import { triggerAutoSave } from "./storage.js";

export function loadComboSettings() {
  try {
    const saved = localStorage.getItem("instock_planner_combo_settings");
    if (saved) {
      const parsed = JSON.parse(saved);
      planningState.comboSettings = {
        autoRestanten: parsed.autoRestanten !== false,
        autoSpiegelen: parsed.autoSpiegelen !== false,
        autoOverige: !!parsed.autoOverige,
        selectedOverigeTaskId: parsed.selectedOverigeTaskId || null,
        selectedOverigeTitle: parsed.selectedOverigeTitle || null,
      };
      return;
    }
  } catch (_) {}
  planningState.comboSettings = {
    autoRestanten: true,
    autoSpiegelen: true,
    autoOverige: false,
    selectedOverigeTaskId: null,
    selectedOverigeTitle: null,
  };
}

export function saveComboSettings(settings) {
  planningState.comboSettings = { ...settings };
  try {
    localStorage.setItem(
      "instock_planner_combo_settings",
      JSON.stringify(planningState.comboSettings),
    );
  } catch (_) {}
}

export async function openComboSettingsModal(callbacks = {}) {
  loadComboSettings();
  const current = planningState.comboSettings || {
    autoRestanten: true,
    autoSpiegelen: true,
    autoOverige: false,
    selectedOverigeTaskId: null,
    selectedOverigeTitle: null,
  };

  let tempSettings = { ...current };

  const availableOverigeTasks = [];
  const seenTitles = new Set();
  (planningState.unassignedTasks || []).forEach((t) => {
    if (
      t &&
      t.type === "overige" &&
      !t.isHelper &&
      !t.title.includes("(Helper)")
    ) {
      const key = t.title.toLowerCase().trim();
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        availableOverigeTasks.push(t);
      }
    }
  });
  Object.values(planningState.assignedTasks || {})
    .flat()
    .forEach((t) => {
      if (
        t &&
        t.type === "overige" &&
        !t.isHelper &&
        !t.title.includes("(Helper)")
      ) {
        const key = t.title.toLowerCase().trim();
        if (!seenTitles.has(key)) {
          seenTitles.add(key);
          availableOverigeTasks.push(t);
        }
      }
    });

  let initialSelectedTask = availableOverigeTasks.find(
    (t) => String(t.id) === String(tempSettings.selectedOverigeTaskId),
  );
  if (!initialSelectedTask && tempSettings.selectedOverigeTitle) {
    initialSelectedTask = availableOverigeTasks.find(
      (t) =>
        t.title.toLowerCase().trim() ===
        tempSettings.selectedOverigeTitle.toLowerCase().trim(),
    );
  }
  if (!initialSelectedTask && availableOverigeTasks.length > 0) {
    initialSelectedTask = availableOverigeTasks[0];
  }
  if (initialSelectedTask) {
    tempSettings.selectedOverigeTaskId = initialSelectedTask.id;
    tempSettings.selectedOverigeTitle = initialSelectedTask.title;
  }

  const modalContent = `
        <div class="modal-header" style="display: flex; flex-direction: row; align-items: center; gap: 14px; padding-right: 28px;">
            <div class="combo-modal-icon-wrap">
                <span class="material-icons" style="font-size: 22px;">tune</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px;">
                <h2 class="modal-title" style="font-size: 18px;">Samen Indelen Instellingen</h2>
                <p class="modal-subtitle" style="font-size: 12px;">Automatische combinaties bij inslepen</p>
            </div>
        </div>

        <div class="combo-info-banner">
            <span class="material-icons">info</span>
            <span>Werkt alleen bij het inslepen van een <strong>vulopdracht</strong>.</span>
        </div>

        <div class="combo-options-list">
            <div class="combo-option-row ${tempSettings.autoRestanten ? "is-checked" : ""}" data-key="autoRestanten">
                <div class="combo-option-left">
                    <div class="combo-option-icon icon-restanten">
                        <span class="material-icons">inventory_2</span>
                    </div>
                    <span class="combo-option-title">Restanten automatisch ervoor zetten</span>
                </div>
                <div class="combo-checkbox">
                    <span class="material-icons">check</span>
                </div>
            </div>

            <div class="combo-option-row ${tempSettings.autoSpiegelen ? "is-checked" : ""}" data-key="autoSpiegelen">
                <div class="combo-option-left">
                    <div class="combo-option-icon icon-spiegelen">
                        <span class="material-icons">flip</span>
                    </div>
                    <span class="combo-option-title">Spiegelen automatisch erachter zetten</span>
                </div>
                <div class="combo-checkbox">
                    <span class="material-icons">check</span>
                </div>
            </div>

            <div class="combo-option-card ${tempSettings.autoOverige ? "is-checked" : ""}">
                <div class="combo-option-row ${tempSettings.autoOverige ? "is-checked" : ""}" data-key="autoOverige">
                    <div class="combo-option-left">
                        <div class="combo-option-icon icon-overige">
                            <span class="material-icons">playlist_add</span>
                        </div>
                        <span class="combo-option-title">Overige taak automatisch ervoor zetten</span>
                    </div>
                    <div class="combo-checkbox">
                        <span class="material-icons">check</span>
                    </div>
                </div>
                <div id="combo-overige-subwrapper" class="combo-sub-wrapper" style="${tempSettings.autoOverige ? "display: flex;" : "display: none;"}">
                    <label class="combo-sub-label">Selecteer overige taak</label>
                    <div id="combo-overige-select-container"></div>
                    <div id="combo-inline-add-task" class="combo-inline-add" style="display: none;">
                        <div class="combo-inline-inputs">
                            <input type="text" id="combo-new-task-title" class="combo-inline-input-title" placeholder="Taakomschrijving...">
                            <input type="number" id="combo-new-task-dur" class="combo-inline-input-dur" placeholder="Min" min="1" value="30">
                        </div>
                        <div class="combo-inline-actions">
                            <button type="button" class="combo-inline-btn-cancel" id="btn-cancel-inline-task">Annuleren</button>
                            <button type="button" class="combo-inline-btn-add" id="btn-add-inline-task">Toevoegen</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="modal-footer" style="margin-top: 14px;">
            <button type="button" class="modal-btn-secondary" id="btn-cancel-combo">Annuleren</button>
            <button type="button" class="btn" id="btn-save-combo">Opslaan</button>
        </div>
    `;

  await showModal(modalContent);

  function getSelectOptions() {
    return availableOverigeTasks.map((t) => ({
      value: String(t.id),
      label: `${t.title} (${t.duration || 30} min)`,
    }));
  }

  const selectContainer = document.getElementById(
    "combo-overige-select-container",
  );
  const inlineAddBox = document.getElementById("combo-inline-add-task");
  const newTitleInput = document.getElementById("combo-new-task-title");
  const newDurInput = document.getElementById("combo-new-task-dur");
  const btnCancelInline = document.getElementById("btn-cancel-inline-task");
  const btnAddInline = document.getElementById("btn-add-inline-task");

  let overigeSelect = null;
  if (selectContainer) {
    overigeSelect = createCustomSelect(
      selectContainer,
      getSelectOptions(),
      tempSettings.selectedOverigeTaskId
        ? String(tempSettings.selectedOverigeTaskId)
        : availableOverigeTasks[0]
          ? String(availableOverigeTasks[0].id)
          : "",
      availableOverigeTasks.length > 0
        ? "Selecteer overige taak..."
        : "Geen overige taken beschikbaar",
      (val) => {
        tempSettings.selectedOverigeTaskId = val;
        const found = availableOverigeTasks.find(
          (t) => String(t.id) === String(val),
        );
        if (found) {
          tempSettings.selectedOverigeTitle = found.title;
        }
      },
      {
        label: "Nieuwe overige taak toevoegen...",
        icon: "add",
        onClick: () => {
          if (inlineAddBox) {
            inlineAddBox.style.display = "flex";
            if (newTitleInput) {
              newTitleInput.focus();
            }
          }
        },
      },
    );
  }

  if (btnCancelInline && inlineAddBox) {
    btnCancelInline.addEventListener("click", () => {
      inlineAddBox.style.display = "none";
      if (newTitleInput) newTitleInput.value = "";
    });
  }

  if (btnAddInline && inlineAddBox) {
    btnAddInline.addEventListener("click", () => {
      const title = newTitleInput ? newTitleInput.value.trim() : "";
      const duration =
        parseInt(newDurInput ? newDurInput.value : "30", 10) || 30;
      if (!title) return;

      const newTask = {
        id: `custom_${Date.now()}`,
        type: "overige",
        title: title,
        duration: duration,
        colli: 0,
      };

      planningState.unassignedTasks.push(newTask);
      availableOverigeTasks.push(newTask);

      tempSettings.selectedOverigeTaskId = newTask.id;
      tempSettings.selectedOverigeTitle = newTask.title;

      if (overigeSelect) {
        overigeSelect.setOptions(getSelectOptions(), String(newTask.id));
      }

      inlineAddBox.style.display = "none";
      if (newTitleInput) newTitleInput.value = "";
      if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
    });
  }

  const rows = document.querySelectorAll(".combo-option-row");
  rows.forEach((row) => {
    row.addEventListener("click", () => {
      const key = row.getAttribute("data-key");
      tempSettings[key] = !tempSettings[key];
      row.classList.toggle("is-checked", tempSettings[key]);
      if (key === "autoOverige") {
        const card = row.closest(".combo-option-card");
        if (card) card.classList.toggle("is-checked", tempSettings[key]);
        const subwrapper = document.getElementById("combo-overige-subwrapper");
        if (subwrapper) {
          subwrapper.style.display = tempSettings[key] ? "flex" : "none";
        }
      }
    });
  });

  const cancelBtn = document.getElementById("btn-cancel-combo");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      closeModal();
    });
  }

  const saveBtn = document.getElementById("btn-save-combo");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      saveComboSettings(tempSettings);
      if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
      closeModal();
      showToast("notification", "Samen indelen instellingen opgeslagen");
    });
  }
}
