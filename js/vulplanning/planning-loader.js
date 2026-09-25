import { supabase, getCurrentUser } from "../main.js";
import { planningState } from "./state.js";
import { fillRoosterShifts, loadStoreUsers } from "./rooster.js";
import { loadStorePathsForColli } from "./colli-invoer.js";
import { calculateTimelineBounds } from "./timeline-axis.js";
import { applyStoredFillerSort } from "./filler-sort.js";
import { consumeLocalSaveFlag } from "./storage.js";
import { getFillerStats } from "./time-utils.js";

export async function loadSavedPlanning(options = {}) {
  const {
    stepInputView,
    stepTimelineView,
    onRenderAxis,
    onRenderRows,
    onRenderUnassigned,
    onRestoreScroll,
  } = options;

  try {
    const user = await getCurrentUser();
    if (!user || !user.store_id) return;

    const todayStr = new Date().toISOString().split("T")[0];

    const [tasksRes, shiftsRes, storeUsers, _] = await Promise.all([
      supabase
        .from("planner_tasks")
        .select("*")
        .eq("store_id", user.store_id)
        .eq("date", todayStr),
      supabase
        .from("planner_shifts")
        .select(`
          id,
          store_id,
          user_id,
          shift_date,
          start_time,
          end_time,
          actual_end_time,
          pause_minutes,
          planner_shift_tasks (
            id,
            shift_id,
            task_id,
            sort_order,
            custom_duration_minutes,
            planner_tasks (
              id,
              store_id,
              title,
              task_type,
              colli,
              duration_minutes,
              date
            )
          )
        `)
        .eq("store_id", user.store_id)
        .eq("shift_date", todayStr),
      loadStoreUsers(),
      loadStorePathsForColli(),
    ]);

    const tasksList = tasksRes.data || [];
    const shiftsList = shiftsRes.data || [];

    if (shiftsList.length === 0 && tasksList.length === 0) {
      if (window.innerWidth <= 768) {
        if (stepInputView) stepInputView.style.display = "none";
        if (stepTimelineView) stepTimelineView.style.display = "flex";
        if (onRenderRows) onRenderRows();
      }
      return;
    }

    const userMap = new Map();
    (storeUsers || []).forEach((u) => {
      userMap.set(u.user_id, u);
    });

    const savedFillers = shiftsList.map((s, idx) => {
      const u = userMap.get(s.user_id);
      const actual = s.actual_end_time ? s.actual_end_time.slice(0, 5) : "";

      return {
        id: s.id,
        user_id: s.user_id,
        name: u ? (u.full_name || u.username) : "Medewerker",
        username: u ? u.username : "",
        from: s.start_time ? s.start_time.slice(0, 5) : "08:00",
        to: s.end_time ? s.end_time.slice(0, 5) : "17:00",
        pause: `${s.pause_minutes || 0} min`,
        actualEndTime: actual,
        customOrder: idx,
      };
    });

    const taskPool = new Map();
    tasksList.forEach((t) => {
      taskPool.set(t.id, {
        id: t.id,
        title: t.title,
        type: t.task_type || "vullen",
        duration: Number(t.duration_minutes) || 30,
        origDuration: Number(t.duration_minutes) || 30,
        colli: Number(t.colli) || 0,
      });
    });

    const hydratedAssignedTasks = {};
    const assignedTaskIds = new Set();

    savedFillers.forEach((f) => {
      hydratedAssignedTasks[f.id] = [];
    });

    shiftsList.forEach((shift) => {
      const fillerId = shift.id;
      const shiftTasks = (shift.planner_shift_tasks || []).sort(
        (a, b) => a.sort_order - b.sort_order,
      );

      shiftTasks.forEach((st) => {
        const originalTask = taskPool.get(st.task_id);
        if (originalTask) {
          const effectiveDur =
            st.custom_duration_minutes !== null &&
            st.custom_duration_minutes !== undefined
              ? Number(st.custom_duration_minutes)
              : originalTask.duration;

          hydratedAssignedTasks[fillerId].push({
            ...originalTask,
            shiftTaskId: st.id,
            duration: effectiveDur,
            origDuration: originalTask.duration,
          });
          assignedTaskIds.add(st.task_id);
        }
      });
    });

    const unassignedTasks = tasksList
      .filter((t) => !assignedTaskIds.has(t.id))
      .map((t) => ({
        id: t.id,
        title: t.title,
        type: t.task_type || "vullen",
        duration: Number(t.duration_minutes) || 30,
        origDuration: Number(t.duration_minutes) || 30,
        colli: Number(t.colli) || 0,
      }));

    planningState.fillers = savedFillers;
    planningState.assignedTasks = hydratedAssignedTasks;
    planningState.unassignedTasks = unassignedTasks;

    fillRoosterShifts(savedFillers);

    if (stepInputView) stepInputView.style.display = "none";
    if (stepTimelineView) stepTimelineView.style.display = "flex";

    applyStoredFillerSort();
    calculateTimelineBounds(planningState.fillers);

    const savedZoom = localStorage.getItem("instock_planner_zoom");
    if (savedZoom !== null) {
      const parsedZoom = parseFloat(savedZoom);
      if (!isNaN(parsedZoom)) {
        planningState.zoom = parsedZoom;
        const zoomIndicator = document.getElementById("zoomLevelIndicator");
        if (zoomIndicator) {
          zoomIndicator.textContent = `${Math.round(planningState.zoom * 100)}%`;
        }
      }
    }

    if (onRenderAxis) onRenderAxis();
    if (onRenderRows) onRenderRows();
    if (onRenderUnassigned) onRenderUnassigned();
    if (onRestoreScroll) {
      setTimeout(onRestoreScroll, 50);
    }
  } catch (err) {
    if (err) console.error(err);
  }
}

let realtimeChannel = null;
let realtimeListenersAdded = false;

export async function setupRealtimeSubscription(options = {}) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.store_id) return;

    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }

    realtimeChannel = supabase
      .channel(`planner_realtime_${user.store_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "planner_shift_tasks",
        },
        () => {
          if (consumeLocalSaveFlag()) return;
          loadSavedPlanning(options);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "planner_shifts",
          filter: `store_id=eq.${user.store_id}`,
        },
        (payload) => {
          if (consumeLocalSaveFlag()) return;
          if (payload.new) {
            const row = payload.new;
            const filler = (planningState.fillers || []).find(
              (f) => String(f.id) === String(row.id),
            );
            if (filler) {
              filler.actualEndTime = row.actual_end_time
                ? row.actual_end_time.slice(0, 5)
                : "";

              const mobileInput = document.getElementById(`prod-input-${filler.id}`);
              if (mobileInput && document.activeElement !== mobileInput) {
                mobileInput.value = filler.actualEndTime;
              }

              const card = mobileInput?.closest(".mobile-worker-card");
              if (card) {
                const badge = card.querySelector(".mobile-prod-badge");
                if (badge) {
                  const assigned = planningState.assignedTasks[filler.id] || [];
                  const res = getFillerStats(filler, assigned).prodResult;
                  if (!res) {
                    badge.textContent = "";
                    badge.className = "mobile-prod-badge";
                  } else {
                    badge.textContent = `Prod: ${res.percent}%`;
                    badge.className = `mobile-prod-badge ${res.statusClass}`;
                  }
                }
              }

              if (options.onRenderRows) {
                const active = document.activeElement;
                const isTyping =
                  active &&
                  (active.classList.contains("mobile-prod-input") ||
                    active.classList.contains("timeline-worker-input"));
                if (!isTyping) options.onRenderRows();
              }
              return;
            }
          }
          loadSavedPlanning(options);
        },
      )
      .subscribe(async (status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setTimeout(() => setupRealtimeSubscription(options), 5000);
        }
      });

    if (!realtimeListenersAdded) {
      realtimeListenersAdded = true;
      document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState === "visible" && navigator.onLine) {
          const active = document.activeElement;
          const isTyping =
            active &&
            (active.classList.contains("mobile-prod-input") ||
              active.classList.contains("timeline-worker-input"));
          if (!isTyping) {
            loadSavedPlanning(options);
          }
        }
      });
      window.addEventListener("online", async () => {
        loadSavedPlanning(options);
        setupRealtimeSubscription(options);
      });
    }
  } catch (_) {}
}
