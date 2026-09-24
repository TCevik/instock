export const MONTH_NAMES_NL = [
  "Januari",
  "Februari",
  "Maart",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Augustus",
  "September",
  "Oktober",
  "November",
  "December",
];

export const MONTH_NAMES_LOWER_NL = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

export const SHORT_MONTH_NAMES_NL = [
  "Jan",
  "Feb",
  "Mrt",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dec",
];

export function parseDate(str) {
  if (!str) return null;
  if (str instanceof Date) return isNaN(str.getTime()) ? null : str;
  const clean = String(str).trim();
  if (clean.includes("-")) {
    const parts = clean.split("T")[0].split("-");
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const d = new Date(
          parseInt(parts[0], 10),
          parseInt(parts[1], 10) - 1,
          parseInt(parts[2], 10),
        );
        return isNaN(d.getTime()) ? null : d;
      } else if (parts[2].length === 4) {
        const d = new Date(
          parseInt(parts[2], 10),
          parseInt(parts[1], 10) - 1,
          parseInt(parts[0], 10),
        );
        return isNaN(d.getTime()) ? null : d;
      }
    }
  }
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDutchDate(dateStr, fallback = "-") {
  if (!dateStr) return fallback;
  const parts = String(dateStr).split("T")[0].split("-");
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return String(dateStr);
  }
  return String(dateStr);
}

export function formatDutchBirthday(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split("T")[0].split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    const mIdx = parseInt(month, 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      return `${parseInt(day, 10)} ${MONTH_NAMES_LOWER_NL[mIdx]} ${year}`;
    }
    return `${day}-${month}-${year}`;
  }
  return String(dateStr);
}

export function formatDutchFullDate(dateStr, fallback = "Onbekende datum") {
  if (!dateStr) return fallback;
  const d = parseDate(dateStr);
  if (d && !isNaN(d.getTime())) {
    return d.toLocaleDateString("nl-NL", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
  return String(dateStr);
}

export function formatDateTime(isoString, fallback = "-") {
  if (!isoString) return fallback;
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return String(isoString);

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

export function formatDateToISO(d) {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDisplayDate(d) {
  if (!d) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  return `${day}-${m}-${y}`;
}
