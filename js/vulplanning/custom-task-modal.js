import { showModal, closeModal, showToast } from "../main.js";
import { planningState } from "./state.js";
import { triggerAutoSave, saveOtherTasksBlueprint } from "./storage.js";

export function setupCustomTaskModal(btnAddCustomTask, callbacks = {}) {
  if (!btnAddCustomTask) return;

  btnAddCustomTask.addEventListener("click", async () => {
    const modalContent = `
            <div class="modal-header">
                <h2 class="modal-title">Aangepaste Taak Toevoegen</h2>
                <p class="modal-subtitle">Voeg een overige taak toe aan de planning.</p>
            </div>
            <form id="customTaskForm" class="modal-form" novalidate>
                <div class="form-group">
                    <label>Taakomschrijving *</label>
                    <input type="text" id="customTaskTitle" class="modal-input" placeholder="Bijv. Magazijn opruimen, Helpen bij zuivel..." required>
                </div>
                <div class="form-group">
                    <label>Tijdsduur (minuten) *</label>
                    <input type="number" min="1" id="customTaskDuration" class="modal-input" placeholder="30" required>
                    <div id="customTaskDurationError" style="display:none;font-size:12px;color:var(--danger-color);margin-top:2px;"></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="modal-btn-secondary" id="btnCancelCustomTask">Annuleren</button>
                    <button type="submit" class="btn">Toevoegen</button>
                </div>
            </form>
        `;

    const overlay = await showModal(modalContent);
    const form = overlay.querySelector("#customTaskForm");
    const cancelBtn = overlay.querySelector("#btnCancelCustomTask");
    const durInput = overlay.querySelector("#customTaskDuration");
    const durError = overlay.querySelector("#customTaskDurationError");

    const validateCustomDuration = () => {
      const val = parseInt(durInput.value, 10);
      if (isNaN(val) || val < 1) {
        durInput.style.borderColor = "var(--danger-color)";
        durError.textContent =
          "Voer een geldige tijdsduur in (minimaal 1 minuut).";
        durError.style.display = "block";
        return false;
      }
      if (val > 5760) {
        durInput.style.borderColor = "var(--danger-color)";
        durError.textContent =
          "De maximale tijdsduur is 96 uur (5760 minuten).";
        durError.style.display = "block";
        return false;
      }
      durInput.style.borderColor = "";
      durError.style.display = "none";
      return true;
    };

    durInput.addEventListener("input", validateCustomDuration);

    cancelBtn.addEventListener("click", () => closeModal(overlay));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = overlay.querySelector("#customTaskTitle").value.trim();
      const duration = parseInt(durInput.value, 10) || 0;

      if (!validateCustomDuration()) {
        showToast("error", durError.textContent);
        durInput.focus();
        return;
      }

      if (title && duration > 0) {
        const newTask = {
          id: `custom_${Date.now()}`,
          type: "overige",
          title: title,
          duration: duration,
          origDuration: duration,
          colli: 0,
        };
        planningState.unassignedTasks.push(newTask);
        closeModal(overlay);
        if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
        const otherTasks = (planningState.unassignedTasks || []).filter(
          (t) => t.type === "overige",
        );
        saveOtherTasksBlueprint(otherTasks);
        triggerAutoSave();
        showToast("notification", "Taak toegevoegd aan Onverdeelde Taken");
      }
    });
  });
}

export async function openPauseModal(initialMins = 30, onConfirm) {
  const modalContent = `
        <div class="modal-header">
            <h2 class="modal-title">Pauze Inplannen</h2>
            <p class="modal-subtitle">Kies een tijdsduur voor de pauze of voer een aangepaste tijd in.</p>
        </div>
        <form id="pauseTaskForm" class="modal-form" novalidate>
            <div class="pause-preset-buttons" style="display: flex; gap: 8px;">
                <button type="button" class="modal-btn-secondary pause-preset-btn" data-mins="15" style="flex: 1;">15 min</button>
                <button type="button" class="modal-btn-secondary pause-preset-btn" data-mins="30" style="flex: 1;">30 min</button>
                <button type="button" class="modal-btn-secondary pause-preset-btn" data-mins="45" style="flex: 1;">45 min</button>
            </div>
            <div class="form-group">
                <label>Aangepaste pauzeduur (minuten)</label>
                <input type="number" min="0" id="pauseTaskDuration" class="modal-input" value="${Math.min(5760, initialMins)}" placeholder="30" required>
                <div id="pauseTaskDurationError" style="display:none;font-size:12px;color:var(--danger-color);margin-top:2px;"></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="modal-btn-secondary" id="btnCancelPauseTask">Annuleren</button>
                <button type="submit" class="btn">Inplannen</button>
            </div>
        </form>
    `;

  const overlay = await showModal(modalContent);
  const form = overlay.querySelector("#pauseTaskForm");
  const input = overlay.querySelector("#pauseTaskDuration");
  const cancelBtn = overlay.querySelector("#btnCancelPauseTask");
  const pauseError = overlay.querySelector("#pauseTaskDurationError");

  const validatePauseDuration = () => {
    const val = parseInt(input.value, 10);
    if (isNaN(val) || val < 0) {
      input.style.borderColor = "var(--danger-color)";
      pauseError.textContent = "Voer een geldige pauzeduur in.";
      pauseError.style.display = "block";
      return false;
    }
    if (val > 5760) {
      input.style.borderColor = "var(--danger-color)";
      pauseError.textContent =
        "De maximale pauzeduur is 96 uur (5760 minuten).";
      pauseError.style.display = "block";
      return false;
    }
    input.style.borderColor = "";
    pauseError.style.display = "none";
    return true;
  };

  input.addEventListener("input", validatePauseDuration);

  overlay.querySelectorAll(".pause-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mins = Math.min(
        5760,
        parseInt(btn.getAttribute("data-mins"), 10) || 30,
      );
      input.value = mins;
      closeModal(overlay);
      if (onConfirm) onConfirm(mins);
    });
  });

  cancelBtn.addEventListener("click", () => closeModal(overlay));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validatePauseDuration()) {
      showToast("error", pauseError.textContent);
      input.focus();
      return;
    }
    const mins = parseInt(input.value, 10);
    if (!isNaN(mins) && mins >= 0) {
      closeModal(overlay);
      if (onConfirm) onConfirm(mins);
    }
  });
}
