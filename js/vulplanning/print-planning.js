import { planningState } from "./state.js";
import {
  timeToMinutes,
  minutesToTime,
  formatDuration,
  parsePauseMinutes,
} from "./time-utils.js";
import { escapeHtml, showToast, showModal, closeModal } from "../main.js";

const printOptions = {
  mergeTrio: true,
  hideWorkersWithoutTasks: true,
  notes: [],
};

function getTaskBaseKey(t) {
  if (!t) return "";
  if (t.pathName) return t.pathName.trim().toLowerCase();
  return (t.title || "")
    .replace(/^(restanten|spiegelen)\s*/i, "")
    .replace(/\s*\([^)]*\)/g, "")
    .trim()
    .toLowerCase();
}

function renderPrintLegend() {
  return `
        <div class="print-legend">
            <div class="print-legend-item">
                <span class="print-legend-color type-vullen"></span>
                <span>Vullen</span>
            </div>
            <div class="print-legend-item">
                <span class="print-legend-color type-spiegelen"></span>
                <span>Spiegelen</span>
            </div>
            <div class="print-legend-item">
                <span class="print-legend-color type-restanten"></span>
                <span>Restanten</span>
            </div>
            <div class="print-legend-item">
                <span class="print-legend-color type-overige"></span>
                <span>Overige</span>
            </div>
            <div class="print-legend-item">
                <span class="print-legend-color is-helper"></span>
                <span>Hulptaak</span>
            </div>
            <div class="print-legend-item">
                <span class="print-legend-color type-pauze"></span>
                <span>Pauze</span>
            </div>
        </div>
    `;
}

function renderPrintHeader(title, dateFormatted) {
  return `
        <div class="print-header-row">
            <div class="print-header-left">
                <div class="print-main-title">${title}</div>
                <div class="print-timestamp">${dateFormatted}</div>
            </div>
            ${renderPrintLegend()}
        </div>
    `;
}

function getComboTrioGradient(t1Duration, t2Duration, totalDuration) {
  const p1 = Math.max(1, Math.round((t1Duration / totalDuration) * 100));
  const p2 = Math.min(
    99,
    Math.max(
      p1 + 1,
      Math.round(((t1Duration + t2Duration) / totalDuration) * 100),
    ),
  );
  const innerGrad = `linear-gradient(to right, var(--restanten-ghost-bg) 0%, var(--restanten-ghost-bg) ${p1}%, var(--prod-success-bg) ${p1}%, var(--prod-success-bg) ${p2}%, var(--prod-orange-bg) ${p2}%, var(--prod-orange-bg) 100%)`;
  const bgMask = `linear-gradient(var(--print-bg), var(--print-bg))`;
  const borderGrad = `linear-gradient(to right, var(--purple-color) 0%, var(--purple-color) ${p1}%, var(--accent-color) ${p1}%, var(--accent-color) ${p2}%, var(--warning-color) ${p2}%, var(--warning-color) 100%)`;
  return `${innerGrad}, ${bgMask}, ${borderGrad}`;
}

export function generatePrintDocument(options = printOptions) {
  const container = document.getElementById("print-planning-container");
  if (!container) return;

  if (!planningState.fillers || planningState.fillers.length === 0) {
    container.innerHTML = `
            <div style="padding: 24px; text-align: center; font-size: 14px; color: var(--print-text);">
                Geen vulplanning data gevonden om te printen.
            </div>
        `;
    return;
  }

  const fillersToPrint = options.hideWorkersWithoutTasks
    ? planningState.fillers.filter(
        (filler) => (planningState.assignedTasks[filler.id] || []).length > 0,
      )
    : planningState.fillers;

  if (fillersToPrint.length === 0) {
    container.innerHTML = `
            <div style="padding: 24px; text-align: center; font-size: 14px; color: var(--print-text);">
                Geen medewerkers met toegewezen taken gevonden om te printen.
            </div>
        `;
    return;
  }

  const pad = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const dateFormatted = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const rowsHtml = fillersToPrint
    .map((filler) => {
      const shiftStart = timeToMinutes(filler.from);
      let shiftEnd = timeToMinutes(filler.to);
      if (shiftEnd > 0 && shiftEnd <= shiftStart) {
        shiftEnd += 24 * 60;
      }
      const shiftGrossDuration = Math.max(0, shiftEnd - shiftStart);
      const assigned = planningState.assignedTasks[filler.id] || [];

      let assignedPauzeMins = 0;
      let totalAssignedMins = 0;

      assigned.forEach((t) => {
        totalAssignedMins += t.duration;
        if (t.type === "pauze") {
          assignedPauzeMins += t.duration;
        }
      });

      const presetPause = parsePauseMinutes(filler.pause);
      const presetPauseStr = formatDuration(presetPause);
      const targetShiftDuration =
        Math.max(0, shiftGrossDuration - presetPause) + assignedPauzeMins;

      let currentMins = shiftStart >= 0 ? shiftStart : 0;
      let tasksHtml = "";

      if (assigned.length === 0) {
        tasksHtml = `<div class="print-no-tasks">Geen taken toegewezen</div>`;
      } else {
        const pills = [];
        let i = 0;
        while (i < assigned.length) {
          const t1 = assigned[i];
          const t2 = assigned[i + 1];
          const t3 = assigned[i + 2];

          const isTrio =
            options.mergeTrio &&
            t2 &&
            t3 &&
            !t1.isHelper &&
            !t2.isHelper &&
            !t3.isHelper &&
            t1.type === "restanten" &&
            t2.type === "vullen" &&
            t3.type === "spiegelen" &&
            getTaskBaseKey(t1) === getTaskBaseKey(t2) &&
            getTaskBaseKey(t3) === getTaskBaseKey(t2);

          if (isTrio) {
            const totalDuration = t1.duration + t2.duration + t3.duration;
            const startStr = minutesToTime(currentMins);
            const endStr = minutesToTime(currentMins + totalDuration);
            currentMins += totalDuration;

            const baseName = (t2.pathName || t2.title || "Taak")
              .replace(/\s*\(\d+\s*c\)/gi, "")
              .trim();
            const comboTitle = baseName;
            const colliSpan = t2.colli
              ? `<span class="print-task-colli">${t2.colli} c</span>`
              : "";

            const grad = getComboTrioGradient(
              t1.duration,
              t2.duration,
              totalDuration,
            );

            pills.push(`
                        <div class="print-task-pill is-combo-trio" style="background-image: ${grad};">
                            <div class="print-task-top" title="${escapeHtml(comboTitle)}">${escapeHtml(comboTitle)}</div>
                            <div class="print-task-sub">
                                <span>${formatDuration(totalDuration)} ${startStr} - ${endStr}</span>
                                ${colliSpan}
                            </div>
                        </div>
                    `);
            i += 3;
          } else {
            const isHelper = !!t1.isHelper;
            const typeClass = isHelper
              ? "is-helper"
              : `type-${t1.type || "overige"}`;
            const startStr = minutesToTime(currentMins);
            const endStr = minutesToTime(currentMins + t1.duration);
            currentMins += t1.duration;

            const titleText = (t1.title || "Taak")
              .replace(/\s*\(\d+\s*c\)/gi, "")
              .replace(/\s*\([Hh]ulp\)/gi, "")
              .trim();
            const colliSpan = t1.colli
              ? `<span class="print-task-colli">${t1.colli} c</span>`
              : "";

            pills.push(`
                        <div class="print-task-pill ${typeClass}">
                            <div class="print-task-top" title="${escapeHtml(titleText)}">${escapeHtml(titleText)}</div>
                            <div class="print-task-sub">
                                <span>${formatDuration(t1.duration)} ${startStr} - ${endStr}</span>
                                ${colliSpan}
                            </div>
                        </div>
                    `);
            i += 1;
          }
        }
        tasksHtml = pills.join("");
      }

      return `
            <tr class="print-worker-row">
                <td>
                    <div class="print-worker-cell-name">${escapeHtml(filler.name || "Medewerker")}</div>
                    <div class="print-worker-cell-hours">${filler.from || "00:00"} - ${filler.to || "00:00"}</div>
                </td>
                <td>
                    <div class="print-statbox">
                        <div class="print-statbox-line">Tijd: <strong>${formatDuration(totalAssignedMins)} / ${formatDuration(targetShiftDuration)}</strong></div>
                        <div class="print-statbox-line">Pauze: <strong>${formatDuration(assignedPauzeMins)} / ${presetPauseStr}</strong></div>
                    </div>
                </td>
                <td>
                    <div class="print-endtime-box"></div>
                </td>
                <td>
                    <div class="print-tasks-wrap">
                        ${tasksHtml}
                    </div>
                </td>
            </tr>
        `;
    })
    .join("");

  const notesHtml =
    options.notes && options.notes.length > 0
      ? `
            <div class="print-notes-container">
                <div class="print-notes-header">Notities</div>
                <div class="print-notes-content">
                    ${options.notes
                      .map(
                        (n) => `
                        <div class="print-note-item">
                            <span class="print-note-bullet">•</span>
                            <span>${escapeHtml(n)}</span>
                        </div>
                    `,
                      )
                      .join("")}
                </div>
            </div>
        `
      : "";

  const page1Html = `
        <div class="print-page print-page-table">
            ${renderPrintHeader("Vulplanning", dateFormatted)}
            <table class="print-planning-table">
                <thead>
                    <tr>
                        <th class="print-th-worker">MEDEWERKER</th>
                        <th class="print-th-time">TIJD & PAUZE</th>
                        <th class="print-th-endtime">EINDTIJD</th>
                        <th class="print-th-tasks">TOEGEWEZEN TAKEN</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
            ${notesHtml}
        </div>
    `;

  let minMinutes = Infinity;
  let maxMinutes = -Infinity;

  fillersToPrint.forEach((filler) => {
    const shiftStart = timeToMinutes(filler.from);
    let shiftEnd = timeToMinutes(filler.to);
    if (shiftEnd > 0 && shiftEnd <= shiftStart) {
      shiftEnd += 24 * 60;
    }
    if (shiftStart >= 0 && shiftStart < minMinutes) minMinutes = shiftStart;
    if (shiftEnd > maxMinutes) maxMinutes = shiftEnd;

    const assigned = planningState.assignedTasks[filler.id] || [];
    let cur = shiftStart >= 0 ? shiftStart : 0;
    assigned.forEach((t) => {
      cur += t.duration || 0;
    });
    if (cur > maxMinutes) maxMinutes = cur;
  });

  if (!isFinite(minMinutes)) minMinutes = 6 * 60;
  if (!isFinite(maxMinutes) || maxMinutes <= minMinutes)
    maxMinutes = minMinutes + 8 * 60;

  const startHour = Math.max(0, Math.floor(minMinutes / 60));
  const endHour = Math.min(
    30,
    Math.max(startHour + 4, Math.ceil(maxMinutes / 60)),
  );
  const totalHours = endHour - startHour;
  const startMins = startHour * 60;
  const totalSpanMins = totalHours * 60;

  const hourMarkersHtml = [];
  for (let h = startHour; h < endHour; h++) {
    const dayH = h % 24;
    const label = `${pad(dayH)}:00`;
    const leftPercent = ((h - startHour) / totalHours) * 100;
    const widthPercent = (1 / totalHours) * 100;
    hourMarkersHtml.push(`
            <div class="print-scale-hour-marker" style="left: ${leftPercent.toFixed(3)}%; width: ${widthPercent.toFixed(3)}%;">
                <span>${label}</span>
            </div>
        `);
  }

  const gridLinesHtml = [];
  for (let h = startHour; h <= endHour; h++) {
    const leftPercent = ((h - startHour) / totalHours) * 100;
    gridLinesHtml.push(`
            <div class="print-scale-grid-line" style="left: ${leftPercent.toFixed(3)}%;"></div>
        `);
  }

  const scaleRowsHtml = fillersToPrint
    .map((filler) => {
      const shiftStart = timeToMinutes(filler.from);
      let shiftEnd = timeToMinutes(filler.to);
      if (shiftEnd > 0 && shiftEnd <= shiftStart) {
        shiftEnd += 24 * 60;
      }
      const assigned = planningState.assignedTasks[filler.id] || [];

      let shiftBoxHtml = "";
      if (shiftStart >= 0 && shiftEnd > shiftStart) {
        const shiftLeft = Math.max(
          0,
          ((shiftStart - startMins) / totalSpanMins) * 100,
        );
        const shiftWidth = Math.min(
          100 - shiftLeft,
          ((shiftEnd - shiftStart) / totalSpanMins) * 100,
        );
        shiftBoxHtml = `<div class="print-scale-shift-bg" style="left: ${shiftLeft.toFixed(3)}%; width: ${shiftWidth.toFixed(3)}%;"></div>`;
      }

      let currentMins = shiftStart >= 0 ? shiftStart : startMins;
      const taskBlocksHtml = [];

      let i = 0;
      while (i < assigned.length) {
        const t1 = assigned[i];
        const t2 = assigned[i + 1];
        const t3 = assigned[i + 2];

        const isTrio =
          options.mergeTrio &&
          t2 &&
          t3 &&
          !t1.isHelper &&
          !t2.isHelper &&
          !t3.isHelper &&
          t1.type === "restanten" &&
          t2.type === "vullen" &&
          t3.type === "spiegelen" &&
          getTaskBaseKey(t1) === getTaskBaseKey(t2) &&
          getTaskBaseKey(t3) === getTaskBaseKey(t2);

        if (isTrio) {
          const totalDuration = t1.duration + t2.duration + t3.duration;
          const leftPercent = ((currentMins - startMins) / totalSpanMins) * 100;
          const widthPercent = (totalDuration / totalSpanMins) * 100;
          currentMins += totalDuration;

          const baseName = (t2.pathName || t2.title || "Taak")
            .replace(/\s*\(\d+\s*c\)/gi, "")
            .trim();
          const colliText = t2.colli ? ` ${t2.colli}c` : "";
          const titleText = `${baseName}${colliText}`;

          const grad = getComboTrioGradient(
            t1.duration,
            t2.duration,
            totalDuration,
          );

          taskBlocksHtml.push(`
                    <div class="print-scale-task is-combo-trio" style="left: ${leftPercent.toFixed(3)}%; width: ${widthPercent.toFixed(3)}%; background-image: ${grad};" title="${escapeHtml(titleText)}">
                        <span class="print-scale-task-title">${escapeHtml(titleText)}</span>
                        <span class="print-scale-task-dur">${formatDuration(totalDuration)}</span>
                    </div>
                `);
          i += 3;
        } else {
          const isHelper = !!t1.isHelper;
          const typeClass = isHelper
            ? "is-helper"
            : `type-${t1.type || "overige"}`;
          const leftPercent = ((currentMins - startMins) / totalSpanMins) * 100;
          const widthPercent = (t1.duration / totalSpanMins) * 100;
          currentMins += t1.duration;

          const titleText = (t1.title || "Taak")
            .replace(/\s*\(\d+\s*c\)/gi, "")
            .replace(/\s*\([Hh]ulp\)/gi, "")
            .trim();
          const colliText = t1.colli ? ` ${t1.colli}c` : "";
          const displayTitle = `${titleText}${colliText}`;

          taskBlocksHtml.push(`
                    <div class="print-scale-task ${typeClass}" style="left: ${leftPercent.toFixed(3)}%; width: ${widthPercent.toFixed(3)}%;" title="${escapeHtml(displayTitle)}">
                        <span class="print-scale-task-title">${escapeHtml(displayTitle)}</span>
                        <span class="print-scale-task-dur">${formatDuration(t1.duration)}</span>
                    </div>
                `);
          i += 1;
        }
      }

      return `
            <div class="print-scale-row">
                <div class="print-scale-worker-col">
                    <div class="print-worker-cell-name">${escapeHtml(filler.name || "Medewerker")}</div>
                    <div class="print-worker-cell-hours">${filler.from || "00:00"} - ${filler.to || "00:00"}</div>
                </div>
                <div class="print-scale-track">
                    ${gridLinesHtml.join("")}
                    ${shiftBoxHtml}
                    ${taskBlocksHtml.join("")}
                </div>
            </div>
        `;
    })
    .join("");

  const page2Html = `
        <div class="print-page print-page-scale">
            ${renderPrintHeader("Vulplanning - Tijdlijn (op schaal)", dateFormatted)}
            <div class="print-scale-container">
                <div class="print-scale-axis-row">
                    <div class="print-scale-worker-header">MEDEWERKER</div>
                    <div class="print-scale-axis-track">
                        ${hourMarkersHtml.join("")}
                        ${gridLinesHtml.join("")}
                    </div>
                </div>
                <div class="print-scale-rows">
                    ${scaleRowsHtml}
                </div>
            </div>
        </div>
    `;

  container.innerHTML = `
        ${page1Html}
        ${page2Html}
    `;
}

export async function openPrintOptionsModal() {
  if (!planningState.fillers || planningState.fillers.length === 0) {
    showToast("error", "Geen planning om te printen. Maak eerst een planning.");
    return;
  }

  const currentNotes =
    printOptions.notes && printOptions.notes.length > 0
      ? [...printOptions.notes]
      : [""];
  let isMergeChecked = printOptions.mergeTrio !== false;
  let isHideEmptyChecked = printOptions.hideWorkersWithoutTasks !== false;

  const modalContent = `
        <div class="modal-header" style="display: flex; flex-direction: row; align-items: center; gap: 14px; padding-right: 28px;">
            <div class="combo-modal-icon-wrap">
                <span class="material-icons" style="font-size: 22px;">print</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px;">
                <h2 class="modal-title" style="font-size: 18px;">Notities &amp; Opties voor Vulplanning</h2>
                <p class="modal-subtitle" style="font-size: 12px;">Voeg eventueel extra opmerkingen toe op de print</p>
            </div>
        </div>
        <div class="modal-body" style="gap: 12px;">
            <div class="print-notes-list" id="printNotesList">
                ${currentNotes
                  .map(
                    (note) => `
                    <div class="print-note-row">
                        <input type="text" class="modal-input print-note-input" placeholder="Typ een notitie..." value="${escapeHtml(note)}">
                        <button type="button" class="print-note-delete-btn" title="Verwijderen">
                            <span class="material-icons">delete</span>
                        </button>
                    </div>
                `,
                  )
                  .join("")}
            </div>
            <button type="button" class="print-add-note-btn" id="btnAddPrintNote">
                <span class="material-icons" style="font-size: 18px;">add</span>
                <span>Regel Toevoegen</span>
            </button>
            <div class="print-modal-divider"></div>
            <div class="combo-option-row ${isMergeChecked ? "is-checked" : ""}" id="printMergeOptionRow">
                <div class="combo-option-left">
                    <span class="material-icons" style="font-size: 18px; color: var(--accent-color);">call_merge</span>
                    <span class="combo-option-title">Restanten, vullen &amp; spiegelen samenvoegen</span>
                </div>
                <div class="combo-checkbox">
                    <span class="material-icons">check</span>
                </div>
            </div>
            <div class="combo-option-row ${isHideEmptyChecked ? "is-checked" : ""}" id="printEmptyOptionRow">
                <div class="combo-option-left">
                    <span class="material-icons" style="font-size: 18px; color: var(--accent-color);">person_off</span>
                    <span class="combo-option-title">Medewerkers zonder taken niet tonen</span>
                </div>
                <div class="combo-checkbox">
                    <span class="material-icons">check</span>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="modal-btn-secondary" id="btnPrintCancel">Annuleren</button>
            <button type="button" class="btn" id="btnPrintConfirm">Afdrukken</button>
        </div>
    `;

  const overlay = await showModal(modalContent);
  const notesList = overlay.querySelector("#printNotesList");
  const btnAddNote = overlay.querySelector("#btnAddPrintNote");
  const mergeOptionRow = overlay.querySelector("#printMergeOptionRow");
  const emptyOptionRow = overlay.querySelector("#printEmptyOptionRow");
  const btnCancel = overlay.querySelector("#btnPrintCancel");
  const btnConfirm = overlay.querySelector("#btnPrintConfirm");

  function updateDeleteButtons() {
    const rows = notesList.querySelectorAll(".print-note-row");
    const isSingle = rows.length <= 1;
    rows.forEach((r) => {
      const btn = r.querySelector(".print-note-delete-btn");
      if (btn) {
        btn.disabled = isSingle;
        btn.style.opacity = isSingle ? "0.35" : "1";
        btn.style.cursor = isSingle ? "not-allowed" : "pointer";
      }
    });
  }

  function attachDeleteListener(row) {
    const delBtn = row.querySelector(".print-note-delete-btn");
    if (delBtn) {
      delBtn.addEventListener("click", () => {
        if (notesList.querySelectorAll(".print-note-row").length <= 1) return;
        row.remove();
        updateDeleteButtons();
      });
    }
  }

  notesList.querySelectorAll(".print-note-row").forEach(attachDeleteListener);
  updateDeleteButtons();

  btnAddNote.addEventListener("click", () => {
    const row = document.createElement("div");
    row.className = "print-note-row";
    row.innerHTML = `
            <input type="text" class="modal-input print-note-input" placeholder="Typ een notitie...">
            <button type="button" class="print-note-delete-btn" title="Verwijderen">
                <span class="material-icons">delete</span>
            </button>
        `;
    notesList.appendChild(row);
    attachDeleteListener(row);
    updateDeleteButtons();
    const input = row.querySelector(".print-note-input");
    if (input) input.focus();
  });

  mergeOptionRow.addEventListener("click", () => {
    isMergeChecked = !isMergeChecked;
    mergeOptionRow.classList.toggle("is-checked", isMergeChecked);
  });

  if (emptyOptionRow) {
    emptyOptionRow.addEventListener("click", () => {
      isHideEmptyChecked = !isHideEmptyChecked;
      emptyOptionRow.classList.toggle("is-checked", isHideEmptyChecked);
    });
  }

  btnCancel.addEventListener("click", () => {
    closeModal(overlay);
  });

  btnConfirm.addEventListener("click", () => {
    const noteInputs = notesList.querySelectorAll(".print-note-input");
    const validNotes = [];
    noteInputs.forEach((inp) => {
      const val = inp.value.trim();
      if (val) validNotes.push(val);
    });

    printOptions.mergeTrio = isMergeChecked;
    printOptions.hideWorkersWithoutTasks = isHideEmptyChecked;
    printOptions.notes = validNotes;

    closeModal(overlay);
    generatePrintDocument(printOptions);
    window.print();
  });
}

export function printVulplanning() {
  openPrintOptionsModal();
}

export function setupPrintPlanning(printButton) {
  if (printButton) {
    printButton.addEventListener("click", () => {
      printVulplanning();
    });
  }

  window.addEventListener("beforeprint", () => {
    generatePrintDocument(printOptions);
  });
}
