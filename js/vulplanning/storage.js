import {
  supabase,
  getCurrentUser,
  showToast,
  isPermissionError,
} from "../main.js";
import { planningState } from "./state.js";
import { recordSnapshot } from "./history.js";
import { parsePauseMinutes } from "./time-utils.js";

let autoSaveTimeout = null;
let isLocalSave = false;
let localSaveTimeout = null;

export function setLocalSaveFlag() {
  isLocalSave = true;
  if (localSaveTimeout) {
    clearTimeout(localSaveTimeout);
  }
  localSaveTimeout = setTimeout(() => {
    isLocalSave = false;
  }, 2000);
}

export function consumeLocalSaveFlag() {
  return isLocalSave;
}

function handleSaveError(err) {
  if (err) console.error(err);
  if (isPermissionError(err)) {
    showToast("error", "Opslaan mislukt: controleer rechten");
  } else {
    showToast("error", "Opslaan mislukt: controleer verbinding");
  }
}

export async function savePlannerTasksBlueprint({ tasks }) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.store_id) return;

    setLocalSaveFlag();

    const todayStr = new Date().toISOString().split("T")[0];
    const validCategories = ["vullen", "spiegelen", "restanten"];

    await supabase
      .from("planner_tasks")
      .delete()
      .eq("store_id", user.store_id)
      .eq("date", todayStr);

    const payload = (tasks || []).map((t) => ({
      store_id: user.store_id,
      title: t.title || "Taak",
      task_type: validCategories.includes(t.type) ? t.type : "vullen",
      colli: Number(t.colli) || 0,
      duration_minutes: Number(t.duration) || 30,
      date: todayStr,
    }));

    if (payload.length > 0) {
      const { data: inserted, error } = await supabase
        .from("planner_tasks")
        .insert(payload)
        .select();

      if (error) {
        handleSaveError(error);
        return;
      }

      if (Array.isArray(inserted)) {
        inserted.forEach((row, idx) => {
          if (tasks[idx]) {
            tasks[idx].id = row.id;
          }
        });
      }
    }

    setLocalSaveFlag();
  } catch (err) {
    handleSaveError(err);
  }
}

export async function saveOtherTasksBlueprint(otherTasks) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.store_id) return;

    setLocalSaveFlag();
    const todayStr = new Date().toISOString().split("T")[0];

    const payload = (otherTasks || []).map((t) => ({
      store_id: user.store_id,
      title: t.title || "Overige taak",
      task_type: "vullen",
      colli: 0,
      duration_minutes: Number(t.duration) || 30,
      date: todayStr,
    }));

    if (payload.length > 0) {
      await supabase.from("planner_tasks").insert(payload);
    }

    setLocalSaveFlag();
  } catch (err) {
    handleSaveError(err);
  }
}

export async function saveFillerEndTime(rawFillerId, actualEndTime) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.store_id) return;

    setLocalSaveFlag();
    const fillerId = String(rawFillerId);
    const target = (planningState.fillers || []).find(
      (f) => String(f.id) === fillerId,
    );
    if (target) {
      target.actualEndTime = actualEndTime;
    }

    if (fillerId.length === 36) {
      const cleanTime =
        actualEndTime && actualEndTime.trim().length >= 4
          ? actualEndTime.trim()
          : null;

      await supabase
        .from("planner_shifts")
        .update({ actual_end_time: cleanTime })
        .eq("id", fillerId);
    }

    setLocalSaveFlag();
  } catch (err) {
    handleSaveError(err);
  }
}

export async function deleteAllPlanning() {
  try {
    const user = await getCurrentUser();
    if (!user || !user.store_id) return;

    setLocalSaveFlag();

    planningState.fillers = [];
    planningState.unassignedTasks = [];
    planningState.assignedTasks = {};
    planningState.savedTasks = [];
    planningState.settings = {};

    const todayStr = new Date().toISOString().split("T")[0];

    await Promise.all([
      supabase
        .from("planner_tasks")
        .delete()
        .eq("store_id", user.store_id)
        .eq("date", todayStr),
      supabase
        .from("planner_shifts")
        .delete()
        .eq("store_id", user.store_id)
        .eq("shift_date", todayStr),
    ]);

    setLocalSaveFlag();
  } catch (err) {
    handleSaveError(err);
  }
}

export function triggerAutoSave(immediate = false) {
  recordSnapshot();
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;
  }

  const executeSave = async () => {
    try {
      const user = await getCurrentUser();
      if (!user || !user.store_id) return;

      setLocalSaveFlag();
      const todayStr = new Date().toISOString().split("T")[0];
      const fillers = Array.isArray(planningState.fillers)
        ? planningState.fillers
        : [];

      const shiftsPayload = fillers.map((filler) => {
        const cleanActual =
          filler.actualEndTime && filler.actualEndTime.trim().length >= 4
            ? filler.actualEndTime.trim()
            : null;

        const payload = {
          store_id: user.store_id,
          user_id: filler.user_id || user.user_id,
          shift_date: todayStr,
          start_time: filler.from || "08:00",
          end_time: filler.to || "17:00",
          actual_end_time: cleanActual,
          pause_minutes: parsePauseMinutes(filler.pause),
        };
        if (filler.id && String(filler.id).length === 36) {
          payload.id = filler.id;
        }
        return payload;
      });

      if (shiftsPayload.length > 0) {
        const { data: savedShifts, error: shiftsError } = await supabase
          .from("planner_shifts")
          .upsert(shiftsPayload)
          .select("id, user_id, start_time, end_time, actual_end_time");

        if (shiftsError) {
          handleSaveError(shiftsError);
          return;
        }

        if (Array.isArray(savedShifts)) {
          savedShifts.forEach((s, idx) => {
            if (fillers[idx]) {
              fillers[idx].id = s.id;
            }
          });

          const shiftIds = savedShifts.map((s) => s.id);
          await supabase
            .from("planner_shift_tasks")
            .delete()
            .in("shift_id", shiftIds);

          const junctionPayload = [];
          fillers.forEach((f) => {
            const assigned = planningState.assignedTasks[f.id] || [];
            assigned.forEach((t, sortIdx) => {
              if (t && t.id && String(t.id).length === 36) {
                const isCustom =
                  typeof t.duration === "number" &&
                  typeof t.origDuration === "number" &&
                  t.duration !== t.origDuration;

                junctionPayload.push({
                  shift_id: f.id,
                  task_id: t.id,
                  sort_order: sortIdx,
                  custom_duration_minutes: isCustom ? t.duration : null,
                });
              }
            });
          });

          if (junctionPayload.length > 0) {
            const { error: junctionError } = await supabase
              .from("planner_shift_tasks")
              .insert(junctionPayload);

            if (junctionError) {
              handleSaveError(junctionError);
            }
          }
        }
      }

      setLocalSaveFlag();
    } catch (err) {
      handleSaveError(err);
    }
  };

  if (immediate) {
    executeSave();
  } else {
    autoSaveTimeout = setTimeout(executeSave, 300);
  }
}
