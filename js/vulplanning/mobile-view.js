import { planningState } from "./state.js";
import {
  timeToMinutes,
  minutesToTime,
  formatDuration,
  parsePauseMinutes,
  calculateProductivity,
  formatTimeInput,
  normalizeTimeOnBlur,
  getFillerStats,
} from "./time-utils.js";
import { triggerAutoSave } from "./storage.js";
import { escapeHtml } from "../main.js";
import { sortFillersByNameAsc } from "./filler-sort.js";

const expandedFillerIds = new Set();

export function resetMobileExpandedFillers() {
  expandedFillerIds.clear();
}

export function renderMobilePlanningView(container) {
  if (!container) return;
  if (container.contains(document.activeElement)) return;

  if (!planningState.fillers || planningState.fillers.length === 0) {
    container.innerHTML = `
            <div class="mobile-planning-empty">
                <span class="material-icons mobile-empty-icon">assignment</span>
                <p>Geen planning gevonden</p>
                <span class="mobile-empty-sub">Maak eerst een planning op de computer</span>
            </div>
        `;
    return;
  }

  const sortedFillers = [...planningState.fillers].sort(sortFillersByNameAsc);

  container.innerHTML = sortedFillers
    .map((filler) => {
      const shiftStart = timeToMinutes(filler.from);
      let shiftEnd = timeToMinutes(filler.to);
      if (shiftEnd > 0 && shiftEnd <= shiftStart) {
        shiftEnd += 24 * 60;
      }
      const shiftGrossDuration = Math.max(0, shiftEnd - shiftStart);
      const assigned = planningState.assignedTasks[filler.id] || [];
      const stats = getFillerStats(filler, assigned);
      const workAssignedMins = stats.workAssignedMins;
      const assignedPauzeMins = stats.assignedPauzeMins;
      const totalAssignedMins = workAssignedMins + assignedPauzeMins;
      const presetPauseStr = formatDuration(stats.presetPause);
      const targetShiftDuration =
        Math.max(0, shiftGrossDuration - stats.presetPause) + assignedPauzeMins;

      const prodResult = stats.prodResult;
      const prodText = prodResult ? `Prod: ${prodResult.percent}%` : "";
      const prodClass = prodResult ? prodResult.statusClass : "";

      const isExpanded = expandedFillerIds.has(String(filler.id));
      const collapseClass = isExpanded ? "" : "collapsed";

      let currentBlockStartMins = shiftStart >= 0 ? shiftStart : 0;
      const tasksHtml =
        assigned.length === 0
          ? `<div class="mobile-worker-no-tasks">Geen taken toegewezen</div>`
          : assigned
              .map((t, taskIdx) => {
                const isHelper = !!t.isHelper;
                const typeClass = isHelper
                  ? "is-helper"
                  : `type-${t.type || "overige"}`;
                const typeLabel = isHelper
                  ? "HELPER"
                  : (t.type || "overige").toUpperCase();
                const colliText = t.colli ? ` &bull; ${t.colli} colli` : "";
                const taskStartMins = currentBlockStartMins;
                const taskEndMins = currentBlockStartMins + t.duration;
                const startStr = minutesToTime(taskStartMins);
                const endStr = minutesToTime(taskEndMins);
                currentBlockStartMins += t.duration;

                return `
                    <div class="mobile-worker-task-item ${typeClass}">
                        <div class="mobile-task-main">
                            <span class="mobile-task-pill ${typeClass}">${typeLabel}</span>
                            <div class="mobile-task-title">${escapeHtml(t.title || "Taak")}</div>
                        </div>
                        <div class="mobile-task-time-info">
                            <span class="mobile-task-duration">${formatDuration(t.duration)}${colliText}</span>
                            <span class="mobile-task-time-range">${startStr} - ${endStr}</span>
                        </div>
                    </div>
                `;
              })
              .join("");

      return `
            <div class="mobile-worker-card ${collapseClass}" data-filler-id="${filler.id}">
                <div class="mobile-worker-card-header" role="button" tabindex="0" aria-expanded="${isExpanded}">
                    <div class="mobile-worker-identity">
                        <div class="mobile-worker-name">${escapeHtml(filler.name || "Medewerker")}</div>
                        <div class="mobile-worker-shift">
                            <span class="material-icons mobile-icon-small">schedule</span>
                            <span>${filler.from || "00:00"} - ${filler.to || "00:00"}</span>
                            <span class="mobile-dot">&bull;</span>
                            <span>Pauze: ${formatDuration(assignedPauzeMins)} / ${presetPauseStr}</span>
                            <span class="mobile-dot">&bull;</span>
                            <span>Totaal: ${formatDuration(totalAssignedMins)} / ${formatDuration(targetShiftDuration)}</span>
                        </div>
                    </div>
                    <span class="material-icons mobile-worker-chevron">expand_more</span>
                </div>

                <div class="mobile-prod-box">
                    <div class="mobile-prod-field">
                        <label class="mobile-prod-label" for="prod-input-${filler.id}">Eindtijd</label>
                        <div class="mobile-prod-input-wrap">
                            <span class="mobile-prod-badge ${prodClass}" id="prod-badge-${filler.id}">${prodText}</span>
                            <input 
                                type="text" 
                                inputmode="numeric" 
                                id="prod-input-${filler.id}" 
                                class="input-field mobile-prod-input" 
                                placeholder="00:00" 
                                maxlength="5" 
                                value="${filler.actualEndTime || ""}"
                                data-filler-id="${filler.id}"
                            />
                        </div>
                    </div>
                </div>

                <div class="mobile-worker-tasks-body">
                    <div class="mobile-worker-tasks-body-inner">
                        <div class="mobile-worker-tasks-section">
                            <div class="mobile-tasks-heading">
                                <span>Taken (${assigned.length})</span>
                                <span class="mobile-tasks-total-work">${formatDuration(workAssignedMins)} werk</span>
                            </div>
                            <div class="mobile-worker-tasks-list">
                                ${tasksHtml}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    })
    .join("");

  container.querySelectorAll(".mobile-worker-card").forEach((card) => {
    const fillerId = card.getAttribute("data-filler-id");
    const filler = planningState.fillers.find(
      (f) => String(f.id) === String(fillerId),
    );
    if (!filler) return;

    const header = card.querySelector(".mobile-worker-card-header");
    if (header) {
      const toggleCard = (e) => {
        if (e.target.closest("input, button, a, select")) return;
        const isCurrentlyCollapsed = card.classList.contains("collapsed");
        if (isCurrentlyCollapsed) {
          card.classList.remove("collapsed");
          expandedFillerIds.add(String(filler.id));
          header.setAttribute("aria-expanded", "true");
        } else {
          card.classList.add("collapsed");
          expandedFillerIds.delete(String(filler.id));
          header.setAttribute("aria-expanded", "false");
        }
      };

      header.addEventListener("click", toggleCard);
      header.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleCard(e);
        }
      });
    }

    const assigned = planningState.assignedTasks[filler.id] || [];
    const timeInput = card.querySelector(".mobile-prod-input");
    const badge = card.querySelector(".mobile-prod-badge");

    const updateProd = () => {
      filler.actualEndTime = timeInput.value;
      const currentFiller = planningState.fillers.find(f => String(f.id) === String(filler.id));
      if (currentFiller) {
        currentFiller.actualEndTime = timeInput.value;
      }
      const res = getFillerStats(filler, assigned).prodResult;
      if (!res) {
        badge.textContent = "";
        badge.className = "mobile-prod-badge";
        return;
      }
      badge.textContent = `Prod: ${res.percent}%`;
      badge.className = `mobile-prod-badge ${res.statusClass}`;
    };

    if (timeInput) {
      let lastVal = timeInput.value;

      timeInput.addEventListener("input", (e) => {
        const isDeleting =
          (e && e.inputType && e.inputType.startsWith("delete")) ||
          timeInput.value.length < lastVal.length;
        timeInput.value = formatTimeInput(timeInput.value, isDeleting);
        lastVal = timeInput.value;
        updateProd();
        if (timeInput.value.length === 5 || timeInput.value === "") {
          triggerAutoSave(true);
        } else {
          triggerAutoSave(false);
        }
      });

      timeInput.addEventListener("change", () => {
        if (timeInput.value) {
          timeInput.value = normalizeTimeOnBlur(timeInput.value);
          lastVal = timeInput.value;
        }
        updateProd();
        triggerAutoSave(true);
      });

      timeInput.addEventListener("blur", () => {
        if (timeInput.value) {
          timeInput.value = normalizeTimeOnBlur(timeInput.value);
          lastVal = timeInput.value;
        }
        updateProd();
        triggerAutoSave(true);
      });

      timeInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          timeInput.blur();
        }
      });
    }
  });
}
