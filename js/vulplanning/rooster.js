import {
  supabase,
  showToast,
  showModal,
  closeModal,
  parseUserDisplay,
} from "../main.js";
import { openImportModal, stripDiacritics } from "./import-rooster.js";
import { formatTimeInput, normalizeTimeOnBlur } from "./time-utils.js";
import {
  keepInViewport,
  resetDropdownPosition,
  bindViewportCheck,
} from "../dropdown-utils.js";

const vullersContainer = document.getElementById("vullers-container");
const btnAddVuller = document.getElementById("btn-add-vuller");
const btnImportRooster = document.getElementById("btn-import-rooster");

let availableUsers = [];
let storeUsersPromise = null;

export function loadStoreUsers() {
  if (!storeUsersPromise) {
    storeUsersPromise = (async () => {
      const { data: users, error } = await supabase
        .from("user_data")
        .select("user_id, full_name, username");

      if (!error && users) {
        availableUsers = users;
      }
      return availableUsers;
    })();
  }
  return storeUsersPromise;
}

function filterUsers(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const normQ = stripDiacritics(q);
  return availableUsers.filter((u) => {
    const fullName = (u.full_name || "").toLowerCase();
    const username = (u.username || "").toLowerCase();
    if (fullName.includes(q) || username.includes(q)) return true;
    const normFull = stripDiacritics(fullName);
    const normUser = stripDiacritics(username);
    return normFull.includes(normQ) || normUser.includes(normQ);
  });
}

function findUserByUsername(uname) {
  if (!uname) return null;
  const clean = String(uname).replace(/^@/, "").toLowerCase().trim();
  if (!clean) return null;
  return (
    availableUsers.find(
      (u) => (u.username || "").toLowerCase().trim() === clean,
    ) || null
  );
}

function findExactUser(val) {
  const q = (val || "").toLowerCase().trim();
  if (!q) return null;

  const byUser = findUserByUsername(q);
  if (byUser) return byUser;

  const normQ = stripDiacritics(q);
  const exactNameMatches = availableUsers.filter((u) => {
    const fullName = (u.full_name || "").toLowerCase().trim();
    return fullName === q || stripDiacritics(fullName) === normQ;
  });

  if (exactNameMatches.length === 1) {
    return exactNameMatches[0];
  }

  return null;
}

function updateUsernameBadge(nameInput, userBadge) {
  let exactUser = null;
  if (nameInput?.dataset?.username) {
    exactUser = findUserByUsername(nameInput.dataset.username);
  }
  if (!exactUser) {
    exactUser = findExactUser(nameInput.value);
  }
  if (exactUser && exactUser.username) {
    nameInput.dataset.username = exactUser.username;
    nameInput.dataset.userId = exactUser.user_id || "";
    userBadge.textContent = `@${exactUser.username}`;
    userBadge.classList.add("visible");
  } else {
    nameInput.dataset.username = "";
    nameInput.dataset.userId = "";
    userBadge.textContent = "";
    userBadge.classList.remove("visible");
  }
}

function focusNextInput(currentInput) {
  const modalForm = currentInput.closest(".modal-worker-form");
  if (modalForm) {
    const nameInput = modalForm.querySelector(".vuller-name");
    const fromInput = modalForm.querySelector(".vuller-from");
    const toInput = modalForm.querySelector(".vuller-to");
    const pauseInput = modalForm.querySelector(".vuller-pause");
    if (currentInput === nameInput) {
      fromInput?.focus();
      fromInput?.select();
    } else if (currentInput === fromInput) {
      toInput?.focus();
      toInput?.select();
    } else if (currentInput === toInput) {
      pauseInput?.focus();
      pauseInput?.select();
    }
    return;
  }

  const row = currentInput.closest(".vuller-row");
  if (!row) return;

  const nameInput = row.querySelector(".vuller-name");
  const fromInput = row.querySelector(".vuller-from");
  const toInput = row.querySelector(".vuller-to");
  const pauseInput = row.querySelector(".vuller-pause");

  if (currentInput === nameInput) {
    fromInput.focus();
    fromInput.select();
  } else if (currentInput === fromInput) {
    toInput.focus();
    toInput.select();
  } else if (currentInput === toInput) {
    pauseInput.focus();
    pauseInput.select();
  } else if (currentInput === pauseInput) {
    const nextRow = row.nextElementSibling;
    if (nextRow && nextRow.classList.contains("vuller-row")) {
      const nextName = nextRow.querySelector(".vuller-name");
      if (nextName) {
        nextName.focus();
        nextName.select();
      }
    } else {
      createVullerRow();
      const allRows = vullersContainer.querySelectorAll(".vuller-row");
      const newlyAdded = allRows[allRows.length - 1];
      if (newlyAdded) {
        const nextName = newlyAdded.querySelector(".vuller-name");
        if (nextName) {
          nextName.focus();
        }
      }
    }
  }
}

function focusPreviousInput(currentInput) {
  const modalForm = currentInput.closest(".modal-worker-form");
  if (modalForm) {
    const nameInput = modalForm.querySelector(".vuller-name");
    const fromInput = modalForm.querySelector(".vuller-from");
    const toInput = modalForm.querySelector(".vuller-to");
    const pauseInput = modalForm.querySelector(".vuller-pause");
    if (currentInput === pauseInput) {
      toInput?.focus();
      toInput?.select();
    } else if (currentInput === toInput) {
      fromInput?.focus();
      fromInput?.select();
    } else if (currentInput === fromInput) {
      nameInput?.focus();
      nameInput?.select();
    }
    return;
  }

  const row = currentInput.closest(".vuller-row");
  if (!row) return;

  const nameInput = row.querySelector(".vuller-name");
  const fromInput = row.querySelector(".vuller-from");
  const toInput = row.querySelector(".vuller-to");
  const pauseInput = row.querySelector(".vuller-pause");

  if (currentInput === pauseInput) {
    toInput.focus();
    toInput.select();
  } else if (currentInput === toInput) {
    fromInput.focus();
    fromInput.select();
  } else if (currentInput === fromInput) {
    nameInput.focus();
    nameInput.select();
  } else if (currentInput === nameInput) {
    const prevRow = row.previousElementSibling;
    if (prevRow && prevRow.classList.contains("vuller-row")) {
      const prevPause = prevRow.querySelector(".vuller-pause");
      if (prevPause) {
        prevPause.focus();
        prevPause.select();
      }
    }
  }
}

function setupAutocomplete(nameInput, dropdown, userBadge) {
  let highlightedIndex = -1;
  bindViewportCheck(dropdown, nameInput);

  function renderMatches(matches) {
    if (matches.length === 0) {
      dropdown.innerHTML = "";
      dropdown.classList.remove("active");
      resetDropdownPosition(dropdown);
      highlightedIndex = -1;
      return;
    }

    dropdown.innerHTML = matches
      .map((u, idx) => {
        const parsed = parseUserDisplay(u.full_name, u.username);
        const displayName = parsed.title;
        const sub = parsed.sub;
        return `
                <div class="autocomplete-item ${idx === 0 ? "selected" : ""}" data-name="${displayName}" data-user="${u.username || ""}" data-id="${u.user_id || ""}">
                    <span class="autocomplete-item-name">${displayName}</span>
                    ${sub ? `<span class="autocomplete-item-user">${sub}</span>` : ""}
                </div>
            `;
      })
      .join("");

    highlightedIndex = 0;
    dropdown.classList.add("active");
    keepInViewport(dropdown, nameInput);

    dropdown.querySelectorAll(".autocomplete-item").forEach((item) => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        nameInput.value = item.getAttribute("data-name");
        nameInput.dataset.username = item.getAttribute("data-user") || "";
        nameInput.dataset.userId = item.getAttribute("data-id") || "";
        dropdown.classList.remove("active");
        resetDropdownPosition(dropdown);
        dropdown.innerHTML = "";
        updateUsernameBadge(nameInput, userBadge);
        focusNextInput(nameInput);
      });
      item.addEventListener("click", (e) => {
        e.stopPropagation();
      });
    });
  }

  nameInput.addEventListener("input", () => {
    const val = nameInput.value.trim();
    const userByUname = findUserByUsername(val);
    if (userByUname) {
      nameInput.dataset.username = userByUname.username || "";
      nameInput.dataset.userId = userByUname.user_id || "";
    } else {
      const currentUname = nameInput.dataset.username;
      if (currentUname) {
        const currentUser = findUserByUsername(currentUname);
        const currentName = (currentUser?.full_name || "").toLowerCase().trim();
        const vLower = val.toLowerCase();
        if (
          currentName !== vLower &&
          stripDiacritics(currentName) !== stripDiacritics(vLower)
        ) {
          nameInput.dataset.username = "";
          nameInput.dataset.userId = "";
        }
      }
    }
    const matches = filterUsers(nameInput.value);
    renderMatches(matches);
    updateUsernameBadge(nameInput, userBadge);
  });

  nameInput.addEventListener("keydown", (e) => {
    const items = dropdown.querySelectorAll(".autocomplete-item");

    if (e.key === "Backspace") {
      if (nameInput.value.length === 0) {
        e.preventDefault();
        dropdown.classList.remove("active");
        resetDropdownPosition(dropdown);
        focusPreviousInput(nameInput);
        return;
      }
    }

    if (e.key === "ArrowDown" && items.length > 0) {
      e.preventDefault();
      highlightedIndex = (highlightedIndex + 1) % items.length;
      updateSelection(items);
    } else if (e.key === "ArrowUp" && items.length > 0) {
      e.preventDefault();
      highlightedIndex = (highlightedIndex - 1 + items.length) % items.length;
      updateSelection(items);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items.length > 0 && dropdown.classList.contains("active")) {
        const targetItem = items[highlightedIndex >= 0 ? highlightedIndex : 0];
        if (targetItem) {
          nameInput.value = targetItem.getAttribute("data-name");
          nameInput.dataset.username =
            targetItem.getAttribute("data-user") || "";
          nameInput.dataset.userId = targetItem.getAttribute("data-id") || "";
          dropdown.classList.remove("active");
          resetDropdownPosition(dropdown);
          dropdown.innerHTML = "";
          updateUsernameBadge(nameInput, userBadge);
        }
      }
      if (nameInput.value.trim().length > 0) {
        focusNextInput(nameInput);
      }
    } else if (e.key === "Escape") {
      dropdown.classList.remove("active");
      resetDropdownPosition(dropdown);
    }
  });

  function updateSelection(items) {
    items.forEach((item, i) => {
      if (i === highlightedIndex) {
        item.classList.add("selected");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.classList.remove("selected");
      }
    });
  }

  nameInput.addEventListener("blur", () => {
    setTimeout(() => {
      dropdown.classList.remove("active");
      resetDropdownPosition(dropdown);
      updateUsernameBadge(nameInput, userBadge);
    }, 150);
  });

  nameInput.addEventListener("focus", () => {
    if (nameInput.value.trim()) {
      const matches = filterUsers(nameInput.value);
      renderMatches(matches);
    }
  });
}

function generateTimeOptions() {
  const list = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      list.push(`${hh}:${mm}`);
    }
  }
  return list;
}

const ALL_TIME_OPTIONS = generateTimeOptions();
const PAUSE_OPTIONS = [
  "0 min",
  "15 min",
  "30 min",
  "45 min",
  "60 min",
  "75 min",
  "90 min",
];

function finalizeTime(input, isPause) {
  if (isPause) {
    let digits = input.value.replace(/\D/g, "");
    if (digits) {
      input.value = `${digits} min`;
    } else {
      input.value = "";
    }
  } else if (input.value) {
    input.value = normalizeTimeOnBlur(input.value);
  }
}

function setupTimeInput(input, dropdown, isPause = false) {
  const options = isPause ? PAUSE_OPTIONS : ALL_TIME_OPTIONS;
  bindViewportCheck(dropdown, input);

  function renderOptions(filterStr = "") {
    const q = filterStr.toLowerCase().replace(/[^0-9]/g, "");
    const filtered = options.filter((opt) => {
      if (!q) return true;
      return opt.replace(/[^0-9]/g, "").startsWith(q);
    });

    if (filtered.length === 0) {
      dropdown.innerHTML = "";
      dropdown.classList.remove("active");
      resetDropdownPosition(dropdown);
      return;
    }

    dropdown.innerHTML = filtered
      .map(
        (opt) => `
            <div class="time-option ${opt === input.value || (isPause && opt.replace(/\D/g, "") === q && q !== "") ? "selected" : ""}" data-val="${opt}">${opt}</div>
        `,
      )
      .join("");

    dropdown.querySelectorAll(".time-option").forEach((item) => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        input.value = item.getAttribute("data-val");
        dropdown.classList.remove("active");
        resetDropdownPosition(dropdown);
        focusNextInput(input);
      });
      item.addEventListener("click", (e) => {
        e.stopPropagation();
      });
    });

    dropdown.classList.add("active");
    keepInViewport(dropdown, input);
  }

  if (isPause) {
    input.addEventListener("input", () => {
      let digits = input.value.replace(/\D/g, "");
      if (digits.length > 3) digits = digits.substring(0, 3);
      input.value = digits;
      renderOptions(digits);
    });
  } else {
    let lastVal = input.value;
    input.addEventListener("input", (e) => {
      const isDeleting =
        (e && e.inputType && e.inputType.startsWith("delete")) ||
        input.value.length < lastVal.length;
      const formatted = formatTimeInput(input.value, isDeleting);
      input.value = formatted;
      lastVal = input.value;
      renderOptions(formatted);
    });
  }

  input.addEventListener("focus", () => {
    if (isPause && input.value) {
      input.value = input.value.replace(/\D/g, "");
    }
    renderOptions(input.value);
  });

  input.addEventListener("blur", () => {
    finalizeTime(input, isPause);
    setTimeout(() => {
      dropdown.classList.remove("active");
      resetDropdownPosition(dropdown);
    }, 150);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Backspace") {
      if (input.value.length === 0) {
        e.preventDefault();
        dropdown.classList.remove("active");
        resetDropdownPosition(dropdown);
        focusPreviousInput(input);
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const firstOpt = dropdown.querySelector(".time-option");
      if (firstOpt && dropdown.classList.contains("active")) {
        input.value = firstOpt.getAttribute("data-val");
      } else {
        finalizeTime(input, isPause);
      }
      dropdown.classList.remove("active");
      resetDropdownPosition(dropdown);

      if (input.value.trim().length > 0) {
        focusNextInput(input);
      }
    } else if (e.key === "Escape") {
      dropdown.classList.remove("active");
      resetDropdownPosition(dropdown);
    }
  });
}

function createVullerRow(
  name = "",
  from = "",
  to = "",
  pause = "",
  username = "",
  userId = "",
) {
  const row = document.createElement("div");
  row.className = "vuller-row";
  row.innerHTML = `
        <div class="vuller-name-wrapper">
            <input type="text" class="input-field vuller-name" placeholder="Naam medewerker..." value="${name}" autocomplete="off">
            <div class="autocomplete-dropdown"></div>
            <div class="vuller-matched-user"></div>
        </div>
        <div class="vuller-inputs-subgroup">
            <div class="vuller-time-field-wrapper">
                <input type="text" class="input-field vuller-from" placeholder="vanaf" value="${from}" autocomplete="off" inputmode="numeric">
                <div class="time-dropdown"></div>
            </div>
            <div class="vuller-time-field-wrapper">
                <input type="text" class="input-field vuller-to" placeholder="tot" value="${to}" autocomplete="off" inputmode="numeric">
                <div class="time-dropdown"></div>
            </div>
            <div class="vuller-time-field-wrapper">
                <input type="text" class="input-field vuller-pause" placeholder="pauze" value="${pause}" autocomplete="off" inputmode="numeric">
                <div class="time-dropdown"></div>
            </div>
        </div>
        <button type="button" class="btn-delete-row" title="Rij Verwijderen - Medewerker uit het rooster verwijderen">
            <span class="material-icons">delete</span>
        </button>
    `;

  const nameInput = row.querySelector(".vuller-name");
  const nameDropdown = row.querySelector(".autocomplete-dropdown");
  const userBadge = row.querySelector(".vuller-matched-user");
  if (username) {
    nameInput.dataset.username = username;
  }
  if (userId) {
    nameInput.dataset.userId = userId;
  }
  setupAutocomplete(nameInput, nameDropdown, userBadge);
  if (name || username) {
    updateUsernameBadge(nameInput, userBadge);
  }

  const fromInput = row.querySelector(".vuller-from");
  const fromDropdown = fromInput.nextElementSibling;
  setupTimeInput(fromInput, fromDropdown, false);

  const toInput = row.querySelector(".vuller-to");
  const toDropdown = toInput.nextElementSibling;
  setupTimeInput(toInput, toDropdown, false);

  const pauseInput = row.querySelector(".vuller-pause");
  const pauseDropdown = pauseInput.nextElementSibling;
  setupTimeInput(pauseInput, pauseDropdown, true);

  row.querySelector(".btn-delete-row").addEventListener("click", () => {
    row.remove();
    if (vullersContainer.children.length === 0) {
      createVullerRow();
    }
  });

  vullersContainer.appendChild(row);
}

if (btnAddVuller) {
  btnAddVuller.addEventListener("click", () => {
    createVullerRow();
  });
}

export function fillRoosterShifts(shifts) {
  if (!vullersContainer) return;
  vullersContainer.innerHTML = "";
  if (!shifts || shifts.length === 0) {
    createVullerRow();
    return;
  }
  shifts.forEach((s) => {
    createVullerRow(s.name, s.from, s.to, s.pause, s.username, s.user_id);
  });
}

export function getAvailableUsers() {
  return availableUsers;
}

export function getFillersData() {
  if (!vullersContainer) return [];

  const rows = vullersContainer.querySelectorAll(".vuller-row");
  const fillers = [];
  let idCounter = 1;

  rows.forEach((row) => {
    const nameInput = row.querySelector(".vuller-name");
    const fromInput = row.querySelector(".vuller-from");
    const toInput = row.querySelector(".vuller-to");
    const pauseInput = row.querySelector(".vuller-pause");

    const name = (nameInput?.value || "").trim();
    const from = (fromInput?.value || "").trim();
    const to = (toInput?.value || "").trim();
    const rawPause = (pauseInput?.value || "").trim();
    let pause = rawPause;
    if (rawPause) {
      const d = rawPause.replace(/\D/g, "");
      if (d) pause = `${d} min`;
    }

    if (name || from || to) {
      let matchedUser = null;
      if (nameInput?.dataset?.username) {
        matchedUser = findUserByUsername(nameInput.dataset.username);
      }
      if (!matchedUser) {
        matchedUser = findExactUser(name);
      }
      const username = matchedUser
        ? matchedUser.username
        : nameInput?.dataset?.username || null;
      const userId = matchedUser
        ? matchedUser.user_id
        : nameInput?.dataset?.userId || null;
      fillers.push({
        id: idCounter++,
        name: name,
        user_id: userId,
        username: username,
        from: from,
        to: to,
        pause: pause,
      });
    }
  });

  return fillers;
}

export {
  setupAutocomplete,
  setupTimeInput,
  findExactUser,
  findUserByUsername,
  updateUsernameBadge,
};

loadStoreUsers();
createVullerRow();
