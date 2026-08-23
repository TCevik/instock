import { state } from './state.js';
import { renderWorkspace } from './workspace.js';
import { triggerSave } from './storage.js';

let undoStack = [];
let redoStack = [];
let isApplyingHistory = false;

const getSnapshot = () => JSON.stringify({
    selectedFillers: state.selectedFillers,
    pathColli: state.pathColli,
    fillerTasks: state.fillerTasks,
    helpers: state.helpers,
    otherTimes: state.otherTimes,
    instanceTimes: state.instanceTimes,
    fillerBreaks: state.fillerBreaks,
    actualEndTimes: state.actualEndTimes,
    nonFillers: state.nonFillers,
    hiddenFillers: state.hiddenFillers,
    showNonFillers: state.showNonFillers,
    showReallyHidden: state.showReallyHidden,
    autoPairSettings: state.autoPairSettings
});

const applySnapshot = (snapshot) => {
    if (!snapshot) return;
    const data = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
    if (data.selectedFillers !== undefined) state.selectedFillers = JSON.parse(JSON.stringify(data.selectedFillers));
    if (data.pathColli !== undefined) state.pathColli = JSON.parse(JSON.stringify(data.pathColli));
    if (data.fillerTasks !== undefined) state.fillerTasks = JSON.parse(JSON.stringify(data.fillerTasks));
    if (data.helpers !== undefined) state.helpers = JSON.parse(JSON.stringify(data.helpers));
    if (data.otherTimes !== undefined) state.otherTimes = JSON.parse(JSON.stringify(data.otherTimes));
    if (data.instanceTimes !== undefined) state.instanceTimes = JSON.parse(JSON.stringify(data.instanceTimes));
    if (data.fillerBreaks !== undefined) state.fillerBreaks = JSON.parse(JSON.stringify(data.fillerBreaks));
    if (data.actualEndTimes !== undefined) state.actualEndTimes = JSON.parse(JSON.stringify(data.actualEndTimes));
    if (data.nonFillers !== undefined) state.nonFillers = JSON.parse(JSON.stringify(data.nonFillers));
    if (data.hiddenFillers !== undefined) state.hiddenFillers = JSON.parse(JSON.stringify(data.hiddenFillers));
    if (data.showNonFillers !== undefined) state.showNonFillers = !!data.showNonFillers;
    if (data.showReallyHidden !== undefined) state.showReallyHidden = !!data.showReallyHidden;
    if (data.autoPairSettings !== undefined) state.autoPairSettings = JSON.parse(JSON.stringify(data.autoPairSettings));
};

export const updateUndoRedoButtons = () => {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    if (undoBtn) {
        undoBtn.disabled = undoStack.length <= 1;
    }
    if (redoBtn) {
        redoBtn.disabled = redoStack.length === 0;
    }
};

export const pushHistory = () => {
    if (isApplyingHistory) return;
    const snap = getSnapshot();
    if (undoStack.length > 0 && undoStack[undoStack.length - 1] === snap) return;
    undoStack.push(snap);
    if (undoStack.length > 50) {
        undoStack.shift();
    }
    redoStack = [];
    updateUndoRedoButtons();
};

export const undo = () => {
    if (undoStack.length <= 1) return;
    const current = undoStack.pop();
    redoStack.push(current);
    const previous = undoStack[undoStack.length - 1];
    isApplyingHistory = true;
    applySnapshot(previous);
    renderWorkspace();
    triggerSave();
    isApplyingHistory = false;
    updateUndoRedoButtons();
};

export const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack.pop();
    undoStack.push(next);
    isApplyingHistory = true;
    applySnapshot(next);
    renderWorkspace();
    triggerSave();
    isApplyingHistory = false;
    updateUndoRedoButtons();
};

export const initHistory = () => {
    undoStack = [getSnapshot()];
    redoStack = [];
    const group = document.getElementById('undo-redo-group');
    if (group) group.style.display = 'inline-flex';
    updateUndoRedoButtons();
};

export const resetHistory = () => {
    undoStack = [];
    redoStack = [];
    const group = document.getElementById('undo-redo-group');
    if (group) group.style.display = 'none';
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    if (undoBtn) undoBtn.disabled = true;
    if (redoBtn) redoBtn.disabled = true;
};

export const setupHistoryListeners = () => {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    if (undoBtn) {
        undoBtn.addEventListener('click', undo);
    }
    if (redoBtn) {
        redoBtn.addEventListener('click', redo);
    }

    document.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
            return;
        }
        if ((e.ctrlKey || e.metaKey) && !e.altKey) {
            if (e.key === 'z' || e.key === 'Z') {
                if (!e.shiftKey) {
                    e.preventDefault();
                    undo();
                } else {
                    e.preventDefault();
                    redo();
                }
            } else if (e.key === 'y' || e.key === 'Y') {
                e.preventDefault();
                redo();
            }
        }
    });
};
