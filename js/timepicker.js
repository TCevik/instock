if (!document.querySelector('link[href*="modal.css"]')) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "css/modal.css";
  document.head.appendChild(link);
}

export function createTimePicker(
  containerElement,
  initialTimeStr = "",
  onSelect = null,
  placeholder = "HH:MM",
) {
  let currentTime = initialTimeStr ? String(initialTimeStr).trim() : "";

  function formatDisplayTime(t) {
    if (!t) return "";
    const parts = t.split(":");
    if (parts.length >= 2) {
      const h = String(parts[0]).padStart(2, "0");
      const m = String(parts[1]).padStart(2, "0");
      return `${h}:${m}`;
    }
    return t;
  }

  const formattedInitial = formatDisplayTime(currentTime);

  containerElement.innerHTML = `
        <div class="custom-timepicker">
            <input type="hidden" class="timepicker-value" value="${formattedInitial}">
            <div class="timepicker-trigger">
                <input type="text" class="timepicker-input" placeholder="${placeholder}" value="${formattedInitial}" maxlength="5">
                <span class="material-icons timepicker-icon">schedule</span>
            </div>
        </div>
    `;

  const root = containerElement.querySelector(".custom-timepicker");
  const input = root.querySelector(".timepicker-input");
  const hiddenVal = root.querySelector(".timepicker-value");

  function applyTime(newTimeStr, updateInput = true) {
    currentTime = newTimeStr;
    const formatted = formatDisplayTime(newTimeStr);
    hiddenVal.value = formatted;
    if (updateInput) {
      input.value = formatted;
    }
    if (onSelect) onSelect(formatted);
  }

  input.addEventListener("input", () => {
    let raw = input.value.replace(/[^\d]/g, "");
    if (raw.length > 4) raw = raw.substring(0, 4);

    let formatted = "";
    if (raw.length >= 1) {
      let h1 = parseInt(raw[0], 10);
      if (h1 > 2) h1 = 2;

      let hStr = String(h1);
      if (raw.length >= 2) {
        let h2 = parseInt(raw[1], 10);
        if (h1 === 2 && h2 > 3) h2 = 3;
        hStr = `${h1}${h2}`;
      }

      formatted = hStr;

      if (raw.length >= 3) {
        let m1 = parseInt(raw[2], 10);
        if (m1 > 5) m1 = 5;
        let mStr = String(m1);

        if (raw.length >= 4) {
          let m2 = parseInt(raw[3], 10);
          mStr = `${m1}${m2}`;
        }

        formatted = `${hStr}:${mStr}`;
      }
    }

    input.value = formatted;

    if (formatted.length === 5) {
      applyTime(formatted, false);
    } else if (formatted === "") {
      applyTime("", false);
    }
  });

  input.addEventListener("blur", () => {
    if (!input.value) {
      applyTime("", true);
      return;
    }

    const parts = input.value.split(":");
    let h = parseInt(parts[0], 10) || 0;
    let m = parts[1] ? parseInt(parts[1], 10) || 0 : 0;

    if (h > 23) h = 23;
    if (m > 59) m = 59;

    const formatted = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    applyTime(formatted, true);
  });

  return {
    getValue: () => hiddenVal.value,
    setValue: (val) => {
      applyTime(val || "", true);
    },
  };
}
