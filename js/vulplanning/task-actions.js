import { planningState } from "./state.js";
import { triggerAutoSave } from "./storage.js";
import { showToast } from "../main.js";
import { hideCustomTooltip } from "./tooltip.js";

export function getComboTasksForTask(task) {
  if (!task || task.type !== "vullen") {
    return { prependedTasks: [], appendedTasks: [] };
  }

  const combo = planningState.comboSettings || {
    autoRestanten: true,
    autoSpiegelen: true,
    autoOverige: false,
  };

  const pathName =
    task.pathName || task.title.replace(/\s*\([^)]*\)/g, "").trim();
  const prependedTasks = [];
  const appendedTasks = [];

  if (combo.autoOverige) {
    let oTask = null;
    if (combo.selectedOverigeTaskId) {
      oTask = planningState.unassignedTasks.find(
        (t) =>
          t.type === "overige" &&
          !t.isHelper &&
          String(t.id) === String(combo.selectedOverigeTaskId),
      );
    }
    if (!oTask && combo.selectedOverigeTitle) {
      oTask = planningState.unassignedTasks.find(
        (t) =>
          t.type === "overige" &&
          !t.isHelper &&
          t.title.toLowerCase().trim() ===
            combo.selectedOverigeTitle.toLowerCase().trim(),
      );
    }
    if (!oTask) {
      oTask = planningState.unassignedTasks.find(
        (t) => t.type === "overige" && !t.isHelper,
      );
    }
    if (!oTask && combo.selectedOverigeTitle) {
      const inAssigned = Object.values(planningState.assignedTasks || {})
        .flat()
        .find(
          (t) =>
            t &&
            t.type === "overige" &&
            !t.isHelper &&
            ((combo.selectedOverigeTaskId &&
              String(t.templateId || t.id) ===
                String(combo.selectedOverigeTaskId)) ||
              (t.title &&
                t.title.toLowerCase().trim() ===
                  combo.selectedOverigeTitle.toLowerCase().trim())),
        );
      if (inAssigned) {
        oTask = {
          id: inAssigned.templateId || inAssigned.id,
          type: "overige",
          title: inAssigned.origTitle || inAssigned.title,
          duration: inAssigned.origDuration || inAssigned.duration || 30,
          colli: 0,
        };
      }
    }
    if (oTask) {
      prependedTasks.push({
        ...oTask,
        id: `combo_overige_${oTask.id}`,
        templateId: oTask.id,
        duration: oTask.duration || 30,
        origTitle: oTask.title,
        origDuration: oTask.duration || 30,
      });
    }
  }

  if (combo.autoRestanten) {
    const rTask = planningState.unassignedTasks.find(
      (t) =>
        t.type === "restanten" &&
        (t.pathName === pathName ||
          t.title.toLowerCase().includes(pathName.toLowerCase())),
    );
    if (rTask) {
      prependedTasks.push(rTask);
    }
  }

  if (combo.autoSpiegelen) {
    const sTask = planningState.unassignedTasks.find(
      (t) =>
        t.type === "spiegelen" &&
        (t.pathName === pathName ||
          t.title.toLowerCase().includes(pathName.toLowerCase())),
    );
    if (sTask) {
      appendedTasks.push(sTask);
    }
  }

  return { prependedTasks, appendedTasks };
}

export function assignTaskToFiller(
  taskId,
  fillerId,
  insertIndex = null,
  callbacks = {},
  customDuration = null,
) {
  hideCustomTooltip();
  let task = planningState.unassignedTasks.find((t) => t.id === taskId);
  if (!task && (taskId === "pauze_template" || taskId.startsWith("pauze"))) {
    task = {
      id: "pauze_template",
      type: "pauze",
      title: "Pauze",
      duration: customDuration || 30,
      colli: 0,
    };
  }
  if (!task) return;
  if (task.type === "pauze" && customDuration !== null && customDuration <= 0)
    return;

  if (!planningState.assignedTasks[fillerId]) {
    planningState.assignedTasks[fillerId] = [];
  }

  const list = planningState.assignedTasks[fillerId];
  let effectiveInsertIndex =
    insertIndex !== null && insertIndex >= 0 && insertIndex <= list.length
      ? insertIndex
      : list.length;

  const prependedTasks = [];
  const appendedTasks = [];

  if (task.type === "vullen") {
    const { prependedTasks: cPre, appendedTasks: cApp } =
      getComboTasksForTask(task);
    cPre.forEach((pt) => {
      if (pt.type === "overige") {
        prependedTasks.push({
          ...pt,
          id: `overige_inst_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        });
      } else if (pt.type === "restanten") {
        const rIdx = planningState.unassignedTasks.findIndex(
          (t) => t.id === pt.id,
        );
        if (rIdx !== -1) {
          planningState.unassignedTasks.splice(rIdx, 1);
        }
        prependedTasks.push(pt);
      }
    });
    cApp.forEach((at) => {
      if (at.type === "spiegelen") {
        const sIdx = planningState.unassignedTasks.findIndex(
          (t) => t.id === at.id,
        );
        if (sIdx !== -1) {
          planningState.unassignedTasks.splice(sIdx, 1);
        }
        appendedTasks.push(at);
      }
    });
  }

  prependedTasks.forEach((pt) => {
    list.splice(effectiveInsertIndex, 0, pt);
    effectiveInsertIndex++;
  });

  let taskToInsert = null;
  if (task.type === "overige" || task.type === "pauze") {
    const dur = customDuration || task.duration || 30;
    taskToInsert = {
      ...task,
      id: `${task.type}_inst_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      templateId: task.id,
      duration: dur,
      origTitle: task.title,
      origDuration: dur,
    };
  } else {
    const taskIdx = planningState.unassignedTasks.findIndex(
      (t) => t.id === taskId,
    );
    if (taskIdx !== -1) {
      planningState.unassignedTasks.splice(taskIdx, 1);
    }
    if (!task.origTitle) task.origTitle = task.title;
    if (!task.origDuration) task.origDuration = task.duration;
    taskToInsert = task;
  }

  list.splice(effectiveInsertIndex, 0, taskToInsert);
  effectiveInsertIndex++;

  appendedTasks.forEach((at) => {
    list.splice(effectiveInsertIndex, 0, at);
    effectiveInsertIndex++;
  });

  if (callbacks.onRenderRows) callbacks.onRenderRows();
  if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
  triggerAutoSave(true);
}

export function unassignTask(fillerId, taskIndex, callbacks = {}) {
  hideCustomTooltip();
  const assignedList = planningState.assignedTasks[fillerId];
  if (!assignedList || taskIndex < 0 || taskIndex >= assignedList.length)
    return;

  const [task] = assignedList.splice(taskIndex, 1);

  if (task.isHelper && task.parentTaskId) {
    returnHelperDurationToMain(task);
  } else {
    const rootTaskId = task.id;
    planningState.fillers.forEach((f) => {
      if (planningState.assignedTasks[f.id]) {
        planningState.assignedTasks[f.id] = planningState.assignedTasks[
          f.id
        ].filter((t) => !(t.isHelper && t.parentTaskId === rootTaskId));
      }
    });

    if (task.type !== "pauze" && task.type !== "overige") {
      if (task.origTitle) {
        task.title = task.origTitle;
        delete task.origTitle;
      }
      if (task.origDuration) {
        task.duration = task.origDuration;
        delete task.origDuration;
      }

      if (typeof task.origOrder === "number") {
        let insertIdx = planningState.unassignedTasks.findIndex(
          (t) =>
            typeof t.origOrder === "number" && t.origOrder > task.origOrder,
        );
        if (insertIdx === -1) {
          const firstOverigeIdx = planningState.unassignedTasks.findIndex(
            (t) => t.type === "overige",
          );
          if (firstOverigeIdx !== -1) {
            insertIdx = firstOverigeIdx;
          }
        }
        if (insertIdx !== -1) {
          planningState.unassignedTasks.splice(insertIdx, 0, task);
        } else {
          planningState.unassignedTasks.push(task);
        }
      } else {
        planningState.unassignedTasks.push(task);
      }
    } else if (task.templateId) {
      const template = planningState.unassignedTasks.find(
        (t) => t.id === task.templateId,
      );
      if (template && task.origDuration !== undefined) {
        template.duration = task.origDuration;
      }
    }
  }

  if (callbacks.onRenderRows) callbacks.onRenderRows();
  if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
  if (!callbacks.skipAutoSave) triggerAutoSave(true);
}

export function unassignWorkerTasks(fillerId, callbacks = {}) {
  let unassignedAny = false;
  while ((planningState.assignedTasks[fillerId] || []).length > 0) {
    unassignTask(fillerId, 0, {
      onRenderRows: () => {},
      onRenderUnassigned: () => {},
      skipAutoSave: true,
    });
    unassignedAny = true;
  }
  if (unassignedAny) {
    if (callbacks.onRenderRows) callbacks.onRenderRows();
    if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
    if (!callbacks.skipAutoSave) triggerAutoSave(true);
  }
  return unassignedAny;
}

export function unassignAllTasks(callbacks = {}) {
  hideCustomTooltip();
  let hasAny = false;
  const fillerIds = Object.keys(planningState.assignedTasks || {});
  for (const fillerId of fillerIds) {
    if ((planningState.assignedTasks[fillerId] || []).length > 0) {
      unassignWorkerTasks(fillerId, { skipAutoSave: true });
      hasAny = true;
    }
  }
  if (planningState.fillers && planningState.fillers.length > 0) {
    planningState.fillers.forEach((f) => {
      if (f.actualEndTime) {
        f.actualEndTime = "";
        hasAny = true;
      }
    });
  }
  if (hasAny) {
    if (callbacks.onRenderAxis) callbacks.onRenderAxis();
    if (callbacks.onRenderRows) callbacks.onRenderRows();
    if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
    triggerAutoSave(true);
  }
  return hasAny;
}

export function addHelperToTask(
  sourceFillerId,
  sourceTaskIndex,
  targetFillerId,
  targetIndex = null,
  callbacks = {},
) {
  const sourceList = planningState.assignedTasks[sourceFillerId];
  if (
    !sourceList ||
    sourceTaskIndex < 0 ||
    sourceTaskIndex >= sourceList.length
  )
    return;

  const origTask = sourceList[sourceTaskIndex];
  if (origTask.isHelper) return;

  const rootTaskId = origTask.id;
  const existingHelpers = [];
  planningState.fillers.forEach((f) => {
    const flist = planningState.assignedTasks[f.id] || [];
    flist.forEach((t, idx) => {
      if (t.isHelper && t.parentTaskId === rootTaskId) {
        existingHelpers.push({ fillerId: f.id, taskIndex: idx, task: t });
      }
    });
  });

  const activeTotalDuration =
    origTask.duration +
    existingHelpers.reduce((sum, h) => sum + h.task.duration, 0);
  const totalOrig = origTask.origDuration || activeTotalDuration;
  const baseTitle = origTask.origTitle || origTask.title;

  if (sourceFillerId === targetFillerId) {
    showToast(
      "error",
      "Een medewerker kan niet als helper aan de eigen taak worden toegevoegd.",
    );
    return;
  }

  if (existingHelpers.some((h) => h.fillerId === targetFillerId)) {
    showToast("error", "Deze medewerker helpt al bij deze taak.");
    return;
  }

  if (existingHelpers.length >= 4) {
    showToast("error", "Maximaal 4 helpers toegestaan per taak.");
    return;
  }

  const helperList = [
    ...existingHelpers.map((h) => ({
      fillerId: h.fillerId,
      targetIndex: null,
    })),
    { fillerId: targetFillerId, targetIndex },
  ];
  const totalPeople = 1 + helperList.length;
  const baseMinutes = Math.floor(activeTotalDuration / totalPeople);
  let remainder = activeTotalDuration % totalPeople;

  const giverMinutes = baseMinutes + (remainder > 0 ? 1 : 0);
  if (remainder > 0) remainder--;

  const helpersPayload = helperList.map((h) => {
    const add = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder--;
    return {
      fillerId: h.fillerId,
      duration: baseMinutes + add,
      targetIndex: h.targetIndex,
    };
  });

  applyMultiHelpers({
    sourceFillerId,
    sourceTaskIndex,
    giverDuration: giverMinutes,
    helpers: helpersPayload,
    callbacks,
  });
}

export function addHelperTask(params) {
  const {
    sourceFillerId,
    sourceTaskIndex,
    targetFillerId,
    targetIndex = null,
    callbacks = {},
  } = params;

  addHelperToTask(
    sourceFillerId,
    sourceTaskIndex,
    targetFillerId,
    targetIndex,
    callbacks,
  );
}

export function applyMultiHelpers(params) {
  const {
    sourceFillerId,
    sourceTaskIndex,
    giverDuration,
    helpers = [],
    callbacks = {},
  } = params;

  const sourceList = planningState.assignedTasks[sourceFillerId];
  if (
    !sourceList ||
    sourceTaskIndex < 0 ||
    sourceTaskIndex >= sourceList.length
  )
    return;

  const origTask = sourceList[sourceTaskIndex];
  const rootTaskId = origTask.parentTaskId || origTask.id;
  const totalOrig = origTask.origDuration || origTask.duration;
  const baseTitle =
    origTask.origTitle || origTask.title.replace(/\s*\(Helper\)$/, "");

  planningState.fillers.forEach((f) => {
    if (planningState.assignedTasks[f.id]) {
      planningState.assignedTasks[f.id] = planningState.assignedTasks[
        f.id
      ].filter((t) => !(t.isHelper && t.parentTaskId === rootTaskId));
    }
  });

  if (giverDuration <= 0) {
    const curIdx = sourceList.findIndex((t) => t.id === origTask.id);
    if (curIdx !== -1) {
      sourceList.splice(curIdx, 1);
    }
  } else {
    origTask.duration = giverDuration;
    if (!origTask.origDuration) origTask.origDuration = totalOrig;
    if (!origTask.origTitle) origTask.origTitle = baseTitle;
  }

  helpers.forEach((h) => {
    if (!h.duration || h.duration <= 0) return;
    if (!planningState.assignedTasks[h.fillerId]) {
      planningState.assignedTasks[h.fillerId] = [];
    }

    const helperTask = {
      id: `${rootTaskId}_helper_${h.fillerId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: origTask.type,
      title: baseTitle,
      duration: h.duration,
      colli: origTask.colli || 0,
      origTitle: baseTitle,
      origDuration: totalOrig,
      isHelper: true,
      parentTaskId: rootTaskId,
      helperOfFillerId: sourceFillerId,
    };

    const targetList = planningState.assignedTasks[h.fillerId];
    if (
      h.targetIndex !== null &&
      h.targetIndex >= 0 &&
      h.targetIndex <= targetList.length
    ) {
      targetList.splice(h.targetIndex, 0, helperTask);
    } else {
      targetList.push(helperTask);
    }
  });

  if (callbacks.onRenderRows) callbacks.onRenderRows();
  if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
  triggerAutoSave(true);
}

export function moveAssignedTask(
  fromFillerId,
  fromIndex,
  toFillerId,
  insertIndex = null,
  callbacks = {},
) {
  const fromList = planningState.assignedTasks[fromFillerId];
  if (!fromList || fromIndex < 0 || fromIndex >= fromList.length) return;

  const [task] = fromList.splice(fromIndex, 1);
  if (!planningState.assignedTasks[toFillerId]) {
    planningState.assignedTasks[toFillerId] = [];
  }

  if (task.isHelper) {
    const mainInfo = findMainTaskForHelper(task);
    if (mainInfo && mainInfo.fillerId === toFillerId) {
      returnHelperDurationToMain(task);
      if (callbacks.onRenderRows) callbacks.onRenderRows();
      if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
      triggerAutoSave(true);
      return;
    }
  } else {
    const rootTaskId = task.id;
    if (fromFillerId !== toFillerId) {
      const targetTasks = planningState.assignedTasks[toFillerId] || [];
      const helperTaskIdx = targetTasks.findIndex(
        (t) => t.isHelper && t.parentTaskId === rootTaskId,
      );
      if (helperTaskIdx !== -1) {
        const helperTaskOnTarget = targetTasks[helperTaskIdx];
        task.duration += helperTaskOnTarget.duration;
        insertIndex = helperTaskIdx;
        planningState.assignedTasks[toFillerId].splice(helperTaskIdx, 1);
      }

      planningState.fillers.forEach((f) => {
        const flist = planningState.assignedTasks[f.id] || [];
        flist.forEach((t) => {
          if (t.isHelper && t.parentTaskId === rootTaskId) {
            t.helperOfFillerId = toFillerId;
          }
        });
      });
    }
  }

  const toList = planningState.assignedTasks[toFillerId];
  if (insertIndex !== null && insertIndex >= 0) {
    const boundedIndex = Math.min(insertIndex, toList.length);
    toList.splice(boundedIndex, 0, task);
  } else {
    toList.push(task);
  }

  if (callbacks.onRenderRows) callbacks.onRenderRows();
  if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
  triggerAutoSave(true);
}

export function returnHelperDurationToMain(helperTask) {
  if (!helperTask || !helperTask.isHelper || !helperTask.parentTaskId) return;
  const mainInfo = findMainTaskForHelper(helperTask);
  if (!mainInfo || !mainInfo.task) return;
  mainInfo.task.duration += helperTask.duration;
}

export function findMainTaskForHelper(helperTask) {
  if (!helperTask || !helperTask.isHelper || !helperTask.parentTaskId)
    return null;
  const rootId = helperTask.parentTaskId;
  for (const f of planningState.fillers) {
    const list = planningState.assignedTasks[f.id] || [];
    const found = list.find((t) => t.id === rootId && !t.isHelper);
    if (found) {
      return { fillerId: f.id, task: found };
    }
  }
  return null;
}

export function findHelpersForMainTask(mainTask) {
  if (!mainTask) return [];
  const rootId = mainTask.id;
  const helpers = [];
  planningState.fillers.forEach((f) => {
    const list = planningState.assignedTasks[f.id] || [];
    list.forEach((t, idx) => {
      if (t.isHelper && t.parentTaskId === rootId) {
        helpers.push({ fillerId: f.id, taskIndex: idx, task: t });
      }
    });
  });
  return helpers;
}
