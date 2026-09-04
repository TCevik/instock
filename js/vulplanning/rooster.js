import { supabase, showToast, showModal, closeModal } from '../main.js';

const vullersContainer = document.getElementById('vullers-container');
const btnAddVuller = document.getElementById('btn-add-vuller');

let availableUsers = [];

async function loadStoreUsers() {
    const { data: users, error } = await supabase
        .from('user_data')
        .select('user_id, full_name, username');

    if (!error && users) {
        availableUsers = users;
    }
}

function filterUsers(query) {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return availableUsers.filter(u => {
        const fullName = (u.full_name || '').toLowerCase();
        const username = (u.username || '').toLowerCase();
        return fullName.includes(q) || username.includes(q);
    });
}

function findExactUser(val) {
    const q = (val || '').toLowerCase().trim();
    if (!q) return null;
    return availableUsers.find(u => {
        const fullName = (u.full_name || '').toLowerCase().trim();
        const username = (u.username || '').toLowerCase().trim();
        return fullName === q || username === q || `@${username}` === q;
    }) || null;
}

function updateUsernameBadge(nameInput, userBadge) {
    const exactUser = findExactUser(nameInput.value);
    if (exactUser && exactUser.username) {
        userBadge.textContent = `@${exactUser.username}`;
        userBadge.classList.add('visible');
    } else {
        userBadge.textContent = '';
        userBadge.classList.remove('visible');
    }
}

function focusNextInput(currentInput) {
    const row = currentInput.closest('.vuller-row');
    if (!row) return;

    const nameInput = row.querySelector('.vuller-name');
    const fromInput = row.querySelector('.vuller-from');
    const toInput = row.querySelector('.vuller-to');
    const pauseInput = row.querySelector('.vuller-pause');

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
        if (nextRow && nextRow.classList.contains('vuller-row')) {
            const nextName = nextRow.querySelector('.vuller-name');
            if (nextName) {
                nextName.focus();
                nextName.select();
            }
        } else {
            createVullerRow();
            const allRows = vullersContainer.querySelectorAll('.vuller-row');
            const newlyAdded = allRows[allRows.length - 1];
            if (newlyAdded) {
                const nextName = newlyAdded.querySelector('.vuller-name');
                if (nextName) {
                    nextName.focus();
                }
            }
        }
    }
}

function focusPreviousInput(currentInput) {
    const row = currentInput.closest('.vuller-row');
    if (!row) return;

    const nameInput = row.querySelector('.vuller-name');
    const fromInput = row.querySelector('.vuller-from');
    const toInput = row.querySelector('.vuller-to');
    const pauseInput = row.querySelector('.vuller-pause');

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
        if (prevRow && prevRow.classList.contains('vuller-row')) {
            const prevPause = prevRow.querySelector('.vuller-pause');
            if (prevPause) {
                prevPause.focus();
                prevPause.select();
            }
        }
    }
}

function setupAutocomplete(nameInput, dropdown, userBadge) {
    let highlightedIndex = -1;

    function renderMatches(matches) {
        if (matches.length === 0) {
            dropdown.innerHTML = '';
            dropdown.classList.remove('active');
            highlightedIndex = -1;
            return;
        }

        dropdown.innerHTML = matches.map((u, idx) => {
            const displayName = u.full_name?.trim() || u.username?.trim() || '';
            const sub = u.username ? `@${u.username}` : '';
            return `
                <div class="autocomplete-item ${idx === 0 ? 'selected' : ''}" data-name="${displayName}" data-user="${u.username || ''}">
                    <span class="autocomplete-item-name">${displayName}</span>
                    <span class="autocomplete-item-user">${sub}</span>
                </div>
            `;
        }).join('');

        highlightedIndex = 0;
        dropdown.classList.add('active');

        dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                nameInput.value = item.getAttribute('data-name');
                dropdown.classList.remove('active');
                dropdown.innerHTML = '';
                updateUsernameBadge(nameInput, userBadge);
                focusNextInput(nameInput);
            });
        });
    }

    nameInput.addEventListener('input', () => {
        const matches = filterUsers(nameInput.value);
        renderMatches(matches);
        updateUsernameBadge(nameInput, userBadge);
    });

    nameInput.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.autocomplete-item');

        if (e.key === 'Backspace') {
            if (nameInput.value.length === 0) {
                e.preventDefault();
                dropdown.classList.remove('active');
                focusPreviousInput(nameInput);
                return;
            }
        }

        if (e.key === 'ArrowDown' && items.length > 0) {
            e.preventDefault();
            highlightedIndex = (highlightedIndex + 1) % items.length;
            updateSelection(items);
        } else if (e.key === 'ArrowUp' && items.length > 0) {
            e.preventDefault();
            highlightedIndex = (highlightedIndex - 1 + items.length) % items.length;
            updateSelection(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (items.length > 0 && dropdown.classList.contains('active')) {
                const targetItem = items[highlightedIndex >= 0 ? highlightedIndex : 0];
                if (targetItem) {
                    nameInput.value = targetItem.getAttribute('data-name');
                    dropdown.classList.remove('active');
                    dropdown.innerHTML = '';
                    updateUsernameBadge(nameInput, userBadge);
                }
            }
            if (nameInput.value.trim().length > 0) {
                focusNextInput(nameInput);
            }
        } else if (e.key === 'Escape') {
            dropdown.classList.remove('active');
        }
    });

    function updateSelection(items) {
        items.forEach((item, i) => {
            if (i === highlightedIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    nameInput.addEventListener('blur', () => {
        setTimeout(() => {
            dropdown.classList.remove('active');
            updateUsernameBadge(nameInput, userBadge);
        }, 150);
    });

    nameInput.addEventListener('focus', () => {
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
            const hh = String(h).padStart(2, '0');
            const mm = String(m).padStart(2, '0');
            list.push(`${hh}:${mm}`);
        }
    }
    return list;
}

const ALL_TIME_OPTIONS = generateTimeOptions();
const PAUSE_OPTIONS = ['0 min', '15 min', '30 min', '45 min', '60 min', '75 min', '90 min'];

function finalizeTime(input, isPause) {
    if (isPause) {
        let digits = input.value.replace(/\D/g, '');
        if (digits) {
            input.value = `${digits} min`;
        }
    } else if (input.value) {
        let digits = input.value.replace(/\D/g, '');
        if (digits.length === 1 || digits.length === 2) {
            let hh = Math.min(23, parseInt(digits, 10));
            input.value = `${String(hh).padStart(2, '0')}:00`;
        } else if (digits.length === 3) {
            let hh = Math.min(23, parseInt(digits.substring(0, 2), 10));
            let mm = parseInt(digits[2] + '0', 10);
            input.value = `${String(hh).padStart(2, '0')}:${String(Math.min(59, mm)).padStart(2, '0')}`;
        }
    }
}

function setupTimeInput(input, dropdown, isPause = false) {
    const options = isPause ? PAUSE_OPTIONS : ALL_TIME_OPTIONS;

    function renderOptions(filterStr = '') {
        const q = filterStr.toLowerCase().replace(/[^0-9]/g, '');
        const filtered = options.filter(opt => {
            if (!q) return true;
            return opt.replace(/[^0-9]/g, '').startsWith(q);
        });

        if (filtered.length === 0) {
            dropdown.innerHTML = '';
            dropdown.classList.remove('active');
            return;
        }

        dropdown.innerHTML = filtered.map(opt => `
            <div class="time-option ${opt === input.value ? 'selected' : ''}" data-val="${opt}">${opt}</div>
        `).join('');

        dropdown.querySelectorAll('.time-option').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                input.value = item.getAttribute('data-val');
                dropdown.classList.remove('active');
                focusNextInput(input);
            });
        });

        dropdown.classList.add('active');
    }

    if (isPause) {
        input.addEventListener('input', () => {
            let digits = input.value.replace(/\D/g, '');
            if (digits.length > 3) digits = digits.substring(0, 3);
            if (digits) {
                input.value = `${digits} min`;
            } else {
                input.value = '';
            }
            renderOptions(digits);
        });
    } else {
        input.addEventListener('input', () => {
            let digits = input.value.replace(/\D/g, '');
            if (digits.length > 4) digits = digits.substring(0, 4);

            let formatted = '';
            if (digits.length > 0) {
                let h1 = parseInt(digits[0], 10);
                if (h1 > 2) {
                    digits = '0' + digits;
                }
            }

            if (digits.length >= 2) {
                let hh = parseInt(digits.substring(0, 2), 10);
                if (hh > 23) hh = 23;
                formatted = String(hh).padStart(2, '0');

                if (digits.length >= 3) {
                    let mmStr = digits.substring(2);
                    if (mmStr.length >= 1 && parseInt(mmStr[0], 10) > 5) {
                        mmStr = '5' + (mmStr[1] || '');
                    }
                    if (mmStr.length >= 2) {
                        let mm = parseInt(mmStr.substring(0, 2), 10);
                        if (mm > 59) mm = 59;
                        formatted += ':' + String(mm).padStart(2, '0');
                    } else {
                        formatted += ':' + mmStr;
                    }
                }
            } else if (digits.length === 1) {
                formatted = digits;
            }

            input.value = formatted;
            renderOptions(formatted);
        });
    }

    input.addEventListener('focus', () => {
        renderOptions(input.value);
    });

    input.addEventListener('blur', () => {
        setTimeout(() => {
            dropdown.classList.remove('active');
            finalizeTime(input, isPause);
        }, 150);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace') {
            if (input.value.length === 0) {
                e.preventDefault();
                dropdown.classList.remove('active');
                focusPreviousInput(input);
                return;
            }
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            const firstOpt = dropdown.querySelector('.time-option');
            if (firstOpt && dropdown.classList.contains('active')) {
                input.value = firstOpt.getAttribute('data-val');
            } else {
                finalizeTime(input, isPause);
            }
            dropdown.classList.remove('active');

            if (input.value.trim().length > 0) {
                focusNextInput(input);
            }
        } else if (e.key === 'Escape') {
            dropdown.classList.remove('active');
        }
    });
}

function createVullerRow(name = '', from = '', to = '', pause = '') {
    const row = document.createElement('div');
    row.className = 'vuller-row';
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
        <button type="button" class="btn-delete-row" title="Verwijder rij">
            <span class="material-icons">delete</span>
        </button>
    `;

    const nameInput = row.querySelector('.vuller-name');
    const nameDropdown = row.querySelector('.autocomplete-dropdown');
    const userBadge = row.querySelector('.vuller-matched-user');
    setupAutocomplete(nameInput, nameDropdown, userBadge);
    if (name) {
        updateUsernameBadge(nameInput, userBadge);
    }

    const fromInput = row.querySelector('.vuller-from');
    const fromDropdown = fromInput.nextElementSibling;
    setupTimeInput(fromInput, fromDropdown, false);

    const toInput = row.querySelector('.vuller-to');
    const toDropdown = toInput.nextElementSibling;
    setupTimeInput(toInput, toDropdown, false);

    const pauseInput = row.querySelector('.vuller-pause');
    const pauseDropdown = pauseInput.nextElementSibling;
    setupTimeInput(pauseInput, pauseDropdown, true);

    row.querySelector('.btn-delete-row').addEventListener('click', () => {
        row.remove();
        if (vullersContainer.children.length === 0) {
            createVullerRow();
        }
    });

    vullersContainer.appendChild(row);
}

if (btnAddVuller) {
    btnAddVuller.addEventListener('click', () => {
        createVullerRow();
    });
}

export function fillRoosterShifts(shifts) {
    if (!shifts || shifts.length === 0) return;
    vullersContainer.innerHTML = '';
    shifts.forEach(s => {
        createVullerRow(s.name, s.from, s.to, s.pause);
    });
}

export function getAvailableUsers() {
    return availableUsers;
}

export function getFillersData() {
    if (!vullersContainer) return [];

    const rows = vullersContainer.querySelectorAll('.vuller-row');
    const fillers = [];
    let idCounter = 1;

    rows.forEach(row => {
        const nameInput = row.querySelector('.vuller-name');
        const fromInput = row.querySelector('.vuller-from');
        const toInput = row.querySelector('.vuller-to');
        const pauseInput = row.querySelector('.vuller-pause');

        const name = (nameInput?.value || '').trim();
        const from = (fromInput?.value || '').trim();
        const to = (toInput?.value || '').trim();
        const pause = (pauseInput?.value || '').trim();

        if (name || from || to) {
            const matchedUser = findExactUser(name);
            fillers.push({
                id: idCounter++,
                name: name,
                user_id: matchedUser ? matchedUser.user_id : null,
                username: matchedUser ? matchedUser.username : null,
                from: from,
                to: to,
                pause: pause
            });
        }
    });

    return fillers;
}

loadStoreUsers();
createVullerRow();
