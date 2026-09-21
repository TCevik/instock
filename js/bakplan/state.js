let bakplanData = [];
let undoStack = [];
let redoStack = [];
let isUndoRedoAction = false;
let savedSnapshot = "[]";
let currentDay = "maandag";

export const DAYS = [
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
  "zondag",
];

export function getBakplanData() {
  return bakplanData;
}

export function setBakplanData(data) {
  bakplanData = data;
}

export function getCurrentDay() {
  return currentDay;
}

export function setCurrentDay(day) {
  currentDay = day;
}

export function saveState() {
  if (isUndoRedoAction) return;
  const currentState = JSON.stringify(bakplanData);
  if (
    undoStack.length === 0 ||
    undoStack[undoStack.length - 1] !== currentState
  ) {
    undoStack.push(currentState);
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
  }
}

export function initUndoStack(initialData) {
  undoStack = [JSON.stringify(initialData)];
  redoStack = [];
}

export function undo(renderCb) {
  if (undoStack.length <= 1) return;
  isUndoRedoAction = true;
  redoStack.push(undoStack.pop());
  const previousState = undoStack[undoStack.length - 1];
  bakplanData = JSON.parse(previousState);
  if (renderCb) renderCb();
  isUndoRedoAction = false;
}

export function redo(renderCb) {
  if (redoStack.length === 0) return;
  isUndoRedoAction = true;
  const nextState = redoStack.pop();
  undoStack.push(nextState);
  bakplanData = JSON.parse(nextState);
  if (renderCb) renderCb();
  isUndoRedoAction = false;
}

export function getBakplanSnapshot() {
  return JSON.stringify(
    bakplanData.map((cat) => ({
      id: cat.id,
      name: cat.name,
      cartType: cat.cartType || "normaal",
      items: cat.items.map((item) => ({
        id: item.id,
        omschrijving: item.omschrijving,
        perPlaat: item.perPlaat,
        prijs: item.prijs,
        promo: item.promo,
        opleggen: item.opleggen,
        derving: item.derving,
        days: item.days || {},
      })),
    })),
  );
}

export function setSavedSnapshot(snapshot) {
  savedSnapshot = snapshot;
}

export function hasUnsavedChanges() {
  return savedSnapshot !== getBakplanSnapshot();
}
