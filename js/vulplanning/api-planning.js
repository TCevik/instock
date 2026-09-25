import { supabase, getCurrentUser } from "../main.js";

export async function getStoreDayPlanning(storeId, date) {
  const currentDate = date || new Date().toISOString().split("T")[0];

  const [tasksRes, shiftsRes] = await Promise.all([
    supabase
      .from("planner_tasks")
      .select("*")
      .eq("store_id", storeId)
      .eq("date", currentDate),
    supabase
      .from("planner_shifts")
      .select(`
        id,
        store_id,
        user_id,
        shift_date,
        start_time,
        end_time,
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
      .eq("store_id", storeId)
      .eq("shift_date", currentDate)
  ]);

  if (tasksRes.error) throw tasksRes.error;
  if (shiftsRes.error) throw shiftsRes.error;

  return {
    tasks: tasksRes.data || [],
    shifts: (shiftsRes.data || []).map((s) => ({
      ...s,
      shift_tasks: (s.planner_shift_tasks || []).sort(
        (a, b) => a.sort_order - b.sort_order
      )
    }))
  };
}

export async function getShiftWithTasks(shiftId) {
  const { data, error } = await supabase
    .from("planner_shifts")
    .select(`
      id,
      store_id,
      user_id,
      shift_date,
      start_time,
      end_time,
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
    .eq("id", shiftId)
    .order("sort_order", { referencedTable: "planner_shift_tasks", ascending: true })
    .single();

  if (error) throw error;
  return data;
}

export async function createTasksBatch(storeId, tasksList, date) {
  const currentDate = date || new Date().toISOString().split("T")[0];

  const payload = tasksList.map((t) => ({
    store_id: storeId,
    title: t.title,
    task_type: t.type || t.task_type || "vullen",
    colli: Number(t.colli) || 0,
    duration_minutes: Number(t.duration) || Number(t.duration_minutes) || 30,
    date: currentDate
  }));

  const { data, error } = await supabase
    .from("planner_tasks")
    .insert(payload)
    .select();

  if (error) throw error;
  return data;
}

export async function createShiftsBatch(storeId, shiftsList, date) {
  const currentDate = date || new Date().toISOString().split("T")[0];
  const user = await getCurrentUser();
  const fallbackUserId = user?.user_id;

  const payload = shiftsList.map((s) => ({
    store_id: storeId,
    user_id: s.user_id || fallbackUserId,
    shift_date: currentDate,
    start_time: s.from || s.start_time || "08:00",
    end_time: s.to || s.end_time || "17:00",
    pause_minutes: Number(s.pause_minutes) || 0
  }));

  const { data, error } = await supabase
    .from("planner_shifts")
    .insert(payload)
    .select();

  if (error) throw error;
  return data;
}

export async function reorderShiftTasks(reorderedItems) {
  const payload = reorderedItems.map((item) => ({
    id: item.id,
    sort_order: item.sort_order,
    updated_at: new Date().toISOString()
  }));

  const { data, error } = await supabase
    .from("planner_shift_tasks")
    .upsert(payload, { onConflict: "id" })
    .select("id, sort_order");

  if (error) throw error;
  return data;
}

export async function assignTaskToShift(shiftId, taskId, sortOrder = 0) {
  const { data, error } = await supabase
    .from("planner_shift_tasks")
    .insert({
      shift_id: shiftId,
      task_id: taskId,
      sort_order: sortOrder
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removeTaskFromShift(shiftTaskId) {
  const { error } = await supabase
    .from("planner_shift_tasks")
    .delete()
    .eq("id", shiftTaskId);

  if (error) throw error;
}

export async function deleteAllDayPlanning(storeId, date) {
  const currentDate = date || new Date().toISOString().split("T")[0];

  const [tasksRes, shiftsRes] = await Promise.all([
    supabase
      .from("planner_tasks")
      .delete()
      .eq("store_id", storeId)
      .eq("date", currentDate),
    supabase
      .from("planner_shifts")
      .delete()
      .eq("store_id", storeId)
      .eq("shift_date", currentDate)
  ]);

  if (tasksRes.error) throw tasksRes.error;
  if (shiftsRes.error) throw shiftsRes.error;
}
