import { planningState } from "./state.js";
import { calculateTimelineBounds } from "./timeline-axis.js";
import { triggerAutoSave } from "./storage.js";
import { hideContextMenu } from "./context-menu.js";
import { hideCustomTooltip } from "./tooltip.js";

let history = [];
let historyIndex = -1;
let isApplyingHistory = false;
let callbacks = {};

function serializeState() {
  return JSON.stringify({
    fillers: planningState.fillers,
    unassignedTasks: planningState.unassignedTasks,
    assignedTasks: planningState.assignedTasks,
  });
}

export function updateHistoryButtons() {
  const btnUndo = document.getElementById("btn-history-undo");
  const btnRedo = document.getElementById("btn-history-redo");
  if (btnUndo) {
    btnUndo.disabled = historyIndex <= 0;
  }
  if (btnRedo) {
    btnRedo.disabled = historyIndex >= history.length - 1;
  }
}

export function recordSnapshot() {
  if (isApplyingHistory) return;
  const serialized = serializeState();
  if (historyIndex >= 0 && history[historyIndex] === serialized) {
    return;
  }
  history = history.slice(0, historyIndex + 1);
  history.push(serialized);
  if (history.length > 50) {
    history.shift();
  }
  historyIndex = history.length - 1;
  updateHistoryButtons();
}

export function initHistory(options = {}) {
  if (
    options &&
    (options.onRenderAxis || options.onRenderRows || options.onRenderUnassigned)
  ) {
    callbacks = { ...callbacks, ...options };
  }
  history = [serializeState()];
  historyIndex = 0;
  updateHistoryButtons();
}

export function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    applySnapshot(history[historyIndex]);
  }
}

export function redo() {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    applySnapshot(history[historyIndex]);
  }
}

function applySnapshot(serialized) {
  isApplyingHistory = true;
  try {
    hideContextMenu();
    hideCustomTooltip();

    const data = JSON.parse(serialized);
    planningState.fillers = data.fillers;
    planningState.unassignedTasks = data.unassignedTasks;
    planningState.assignedTasks = data.assignedTasks;
    calculateTimelineBounds(planningState.fillers);

    if (callbacks.onRenderAxis) callbacks.onRenderAxis();
    if (callbacks.onRenderRows) callbacks.onRenderRows();
    if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();

    triggerAutoSave();
  } finally {
    isApplyingHistory = false;
    updateHistoryButtons();
  }
}

export function setupHistoryShortcuts(options = {}) {
  if (options) {
    callbacks = { ...callbacks, ...options };
  }

  const btnUndo = document.getElementById("btn-history-undo");
  const btnRedo = document.getElementById("btn-history-redo");

  if (btnUndo) {
    btnUndo.addEventListener("click", undo);
  }
  if (btnRedo) {
    btnRedo.addEventListener("click", redo);
  }

  window.addEventListener("keydown", (e) => {
    const stepTimelineView = document.getElementById("step-timeline-view");
    if (!stepTimelineView || stepTimelineView.style.display === "none") {
      return;
    }

    const activeEl = document.activeElement;
    const isTyping =
      activeEl &&
      (activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.isContentEditable);
    if (isTyping) {
      return;
    }

    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    if (!isCtrlOrCmd) return;

    if (e.key === "z" || e.key === "Z") {
      if (e.shiftKey) {
        e.preventDefault();
        redo();
      } else {
        e.preventDefault();
        undo();
      }
    } else if (e.key === "y" || e.key === "Y") {
      e.preventDefault();
      redo();
    }
  });

  updateHistoryButtons();
}
