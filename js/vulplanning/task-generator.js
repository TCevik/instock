import { getColliData, getLoadedPaths } from "./colli-invoer.js";

export function generateTasksFromPathsAndColli() {
  const rawColliData = getColliData();
  const paths = getLoadedPaths();
  const tasks = [];
  let idCounter = 1;

  const pathMap = new Map();
  paths.forEach((p) => {
    const name = (p.name || "").trim();
    if (name) pathMap.set(name.toLowerCase(), p);
  });

  const groupedByPath = new Map();
  rawColliData.forEach((item) => {
    const pName = (item.path || "").trim();
    if (!groupedByPath.has(pName)) {
      groupedByPath.set(pName, []);
    }
    groupedByPath.get(pName).push(item);
  });

  groupedByPath.forEach((items, pathName) => {
    let totalColli = 0;
    let totalMinutes = 0;
    const matchedPath = pathMap.get(pathName.toLowerCase()) || null;

    items.forEach((it) => {
      const c = Number(it.colli) || 0;
      const norm = Number(it.norm) || 50;
      totalColli += c;
      if (c > 0 && norm > 0) {
        totalMinutes += (c / norm) * 60;
      }
    });

    if (totalColli <= 0) return;

    const fillDuration = Math.min(5760, Math.max(1, Math.round(totalMinutes)));
    tasks.push({
      id: `task_fill_${idCounter++}`,
      type: "vullen",
      title: pathName,
      pathName: pathName,
      colli: totalColli,
      duration: fillDuration,
      origDuration: fillDuration,
      categoryDetails: items,
      origOrder: tasks.length,
    });

    const spiegelNorm =
      matchedPath &&
      matchedPath.spiegelnorm !== undefined &&
      matchedPath.spiegelnorm !== null
        ? Number(matchedPath.spiegelnorm)
        : 0;
    if (spiegelNorm > 0) {
      const spiegelDuration = Math.min(
        5760,
        Math.max(1, Math.round(spiegelNorm)),
      );
      tasks.push({
        id: `task_spiegel_${idCounter++}`,
        type: "spiegelen",
        title: `Spiegelen ${pathName}`,
        pathName: pathName,
        colli: 0,
        duration: spiegelDuration,
        origDuration: spiegelDuration,
        origOrder: tasks.length,
      });
    }

    const restantenNorm =
      matchedPath &&
      matchedPath.restantennorm !== undefined &&
      matchedPath.restantennorm !== null
        ? Number(matchedPath.restantennorm)
        : 0;
    if (restantenNorm > 0) {
      const restantenDuration = Math.min(
        5760,
        Math.max(1, Math.round(restantenNorm)),
      );
      tasks.push({
        id: `task_restant_${idCounter++}`,
        type: "restanten",
        title: `Restanten ${pathName}`,
        pathName: pathName,
        colli: 0,
        duration: restantenDuration,
        origDuration: restantenDuration,
        origOrder: tasks.length,
      });
    }
  });

  return tasks;
}
