import { keepInViewport, resetDropdownPosition, bindViewportCheck } from './dropdown-utils.js';

if (!document.querySelector('link[href*="modal.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/modal.css';
    document.head.appendChild(link);
}

export const MONTH_NAMES = [
    'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
    'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'
];

export const SHORT_MONTH_NAMES = [
    'Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun',
    'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'
];

export function parseDate(str) {
    if (!str) return null;
    if (str instanceof Date) return isNaN(str.getTime()) ? null : str;
    const clean = String(str).trim();
    if (clean.includes('-')) {
        const parts = clean.split('T')[0].split('-');
        if (parts.length === 3) {
            if (parts[0].length === 4) {
                const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                return isNaN(d.getTime()) ? null : d;
            } else if (parts[2].length === 4) {
                const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
                return isNaN(d.getTime()) ? null : d;
            }
        }
    }
    const d = new Date(clean);
    return isNaN(d.getTime()) ? null : d;
}

export function createDatePicker(containerElement, initialDateStr = '', onSelect = null) {
    let selectedDate = parseDate(initialDateStr);
    let tempDate = selectedDate ? new Date(selectedDate) : null;
    let viewDate = selectedDate ? new Date(selectedDate) : new Date();
    let viewMode = 'days';

    function formatDate(d) {
        if (!d) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function formatDisplayDate(d) {
        if (!d) return '';
        const day = String(d.getDate()).padStart(2, '0');
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const y = d.getFullYear();
        return `${day}-${m}-${y}`;
    }

    containerElement.innerHTML = `
        <div class="custom-datepicker">
            <input type="hidden" class="datepicker-value" value="${formatDate(selectedDate)}">
            <div class="datepicker-trigger">
                <input type="text" class="datepicker-input" placeholder="DD-MM-JJJJ" value="${selectedDate ? formatDisplayDate(selectedDate) : ''}" maxlength="10">
                <button type="button" class="datepicker-icon-btn" aria-label="Kies datum">
                    <span class="material-icons">calendar_today</span>
                </button>
            </div>
            <div class="datepicker-dropdown"></div>
        </div>
    `;

    const root = containerElement.querySelector('.custom-datepicker');
    const input = root.querySelector('.datepicker-input');
    const iconBtn = root.querySelector('.datepicker-icon-btn');
    const hiddenVal = root.querySelector('.datepicker-value');
    const dropdown = root.querySelector('.datepicker-dropdown');

    function applyDate(newDate, updateInput = true) {
        selectedDate = newDate;
        tempDate = newDate ? new Date(newDate) : null;
        hiddenVal.value = formatDate(selectedDate);
        if (updateInput) {
            input.value = selectedDate ? formatDisplayDate(selectedDate) : '';
        }
        if (onSelect) onSelect(hiddenVal.value);
    }

    input.addEventListener('input', () => {
        let raw = input.value.replace(/[^\d]/g, '');
        if (raw.length > 8) raw = raw.substring(0, 8);

        let formatted = '';
        if (raw.length > 0) {
            formatted = raw.substring(0, 2);
            if (raw.length >= 3) {
                formatted += '-' + raw.substring(2, 4);
                if (raw.length >= 5) {
                    formatted += '-' + raw.substring(4, 8);
                }
            }
        }
        input.value = formatted;

        if (formatted.length === 10) {
            const parsed = parseDate(formatted);
            if (parsed) {
                selectedDate = parsed;
                tempDate = new Date(parsed);
                viewDate = new Date(parsed);
                hiddenVal.value = formatDate(parsed);
                if (onSelect) onSelect(hiddenVal.value);
            }
        } else if (formatted.length === 0) {
            selectedDate = null;
            tempDate = null;
            hiddenVal.value = '';
            if (onSelect) onSelect('');
        }
    });

    function getFooterHtml() {
        return `
            <div class="dp-footer">
                <button type="button" class="dp-action-btn dp-clear-btn">Wissen</button>
                <button type="button" class="dp-action-btn dp-confirm-btn">Bevestigen</button>
            </div>
        `;
    }

    function bindFooterEvents() {
        dropdown.querySelector('.dp-clear-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            tempDate = null;
            applyDate(null, true);
            closeDropdown();
        });

        dropdown.querySelector('.dp-confirm-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            applyDate(tempDate, true);
            closeDropdown();
        });
    }

    function renderDays() {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();

        const firstDay = new Date(year, month, 1);
        let startDayOfWeek = firstDay.getDay() - 1;
        if (startDayOfWeek === -1) startDayOfWeek = 6;

        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDays = new Date(year, month, 0).getDate();

        let daysHtml = '';
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            daysHtml += `<button type="button" class="dp-cell dp-other-month" disabled>${prevMonthDays - i}</button>`;
        }

        const today = new Date();
        for (let day = 1; day <= daysInMonth; day++) {
            const isSelected = tempDate &&
                tempDate.getFullYear() === year &&
                tempDate.getMonth() === month &&
                tempDate.getDate() === day;
            const isToday = today.getFullYear() === year &&
                today.getMonth() === month &&
                today.getDate() === day;

            daysHtml += `<button type="button" class="dp-cell dp-day${isSelected ? ' active' : ''}${isToday ? ' today' : ''}" data-day="${day}">${day}</button>`;
        }

        dropdown.innerHTML = `
            <div class="dp-header">
                <button type="button" class="dp-nav-btn dp-prev-month"><span class="material-icons">chevron_left</span></button>
                <div class="dp-title-btn" id="dpTitleBtn">${MONTH_NAMES[month]} ${year}</div>
                <button type="button" class="dp-nav-btn dp-next-month"><span class="material-icons">chevron_right</span></button>
            </div>
            <div class="dp-weekdays">
                <span>Ma</span><span>Di</span><span>Wo</span><span>Do</span><span>Vr</span><span>Za</span><span>Zo</span>
            </div>
            <div class="dp-grid dp-days-grid">${daysHtml}</div>
            ${getFooterHtml()}
        `;

        dropdown.querySelector('.dp-prev-month').addEventListener('click', (e) => {
            e.stopPropagation();
            viewDate.setMonth(viewDate.getMonth() - 1);
            renderCalendar();
        });

        dropdown.querySelector('.dp-next-month').addEventListener('click', (e) => {
            e.stopPropagation();
            viewDate.setMonth(viewDate.getMonth() + 1);
            renderCalendar();
        });

        dropdown.querySelector('#dpTitleBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            viewMode = 'years';
            renderCalendar();
        });

        dropdown.querySelectorAll('.dp-day').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const day = parseInt(btn.getAttribute('data-day'), 10);
                tempDate = new Date(year, month, day);
                renderCalendar();
            });
        });

        bindFooterEvents();
    }

    function renderYears() {
        const year = viewDate.getFullYear();
        const startYear = Math.floor(year / 12) * 12;
        const endYear = startYear + 11;

        let yearsHtml = '';
        for (let y = startYear; y <= endYear; y++) {
            const isSelected = tempDate && tempDate.getFullYear() === y;
            yearsHtml += `<button type="button" class="dp-cell dp-year${isSelected ? ' active' : ''}" data-year="${y}">${y}</button>`;
        }

        dropdown.innerHTML = `
            <div class="dp-header">
                <button type="button" class="dp-nav-btn dp-prev-decade"><span class="material-icons">chevron_left</span></button>
                <div class="dp-title-btn" id="dpDecadeBtn">${startYear} - ${endYear}</div>
                <button type="button" class="dp-nav-btn dp-next-decade"><span class="material-icons">chevron_right</span></button>
            </div>
            <div class="dp-grid dp-years-grid">${yearsHtml}</div>
            ${getFooterHtml()}
        `;

        dropdown.querySelector('.dp-prev-decade').addEventListener('click', (e) => {
            e.stopPropagation();
            viewDate.setFullYear(viewDate.getFullYear() - 12);
            renderCalendar();
        });

        dropdown.querySelector('.dp-next-decade').addEventListener('click', (e) => {
            e.stopPropagation();
            viewDate.setFullYear(viewDate.getFullYear() + 12);
            renderCalendar();
        });

        dropdown.querySelector('#dpDecadeBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            viewMode = 'days';
            renderCalendar();
        });

        dropdown.querySelectorAll('.dp-year').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const chosenYear = parseInt(btn.getAttribute('data-year'), 10);
                viewDate.setFullYear(chosenYear);
                viewMode = 'months';
                renderCalendar();
            });
        });

        bindFooterEvents();
    }

    function renderMonths() {
        const year = viewDate.getFullYear();
        let monthsHtml = '';
        MONTH_NAMES.forEach((name, index) => {
            const isSelected = tempDate && tempDate.getFullYear() === year && tempDate.getMonth() === index;
            monthsHtml += `<button type="button" class="dp-cell dp-month${isSelected ? ' active' : ''}" data-month="${index}">${name.substring(0, 3)}</button>`;
        });

        dropdown.innerHTML = `
            <div class="dp-header">
                <button type="button" class="dp-nav-btn dp-prev-year"><span class="material-icons">chevron_left</span></button>
                <div class="dp-title-btn" id="dpYearTitleBtn">${year}</div>
                <button type="button" class="dp-nav-btn dp-next-year"><span class="material-icons">chevron_right</span></button>
            </div>
            <div class="dp-grid dp-months-grid">${monthsHtml}</div>
            ${getFooterHtml()}
        `;

        dropdown.querySelector('.dp-prev-year').addEventListener('click', (e) => {
            e.stopPropagation();
            viewDate.setFullYear(viewDate.getFullYear() - 1);
            renderCalendar();
        });

        dropdown.querySelector('.dp-next-year').addEventListener('click', (e) => {
            e.stopPropagation();
            viewDate.setFullYear(viewDate.getFullYear() + 1);
            renderCalendar();
        });

        dropdown.querySelector('#dpYearTitleBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            viewMode = 'years';
            renderCalendar();
        });

        dropdown.querySelectorAll('.dp-month').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const chosenMonth = parseInt(btn.getAttribute('data-month'), 10);
                viewDate.setMonth(chosenMonth);
                viewMode = 'days';
                renderCalendar();
            });
        });

        bindFooterEvents();
    }

    bindViewportCheck(dropdown, root);

    function renderCalendar() {
        if (viewMode === 'years') {
            renderYears();
        } else if (viewMode === 'months') {
            renderMonths();
        } else {
            renderDays();
        }
        if (dropdown.classList.contains('active')) {
            requestAnimationFrame(() => keepInViewport(dropdown, root));
        }
    }

    function openDropdown() {
        viewMode = 'days';
        tempDate = selectedDate ? new Date(selectedDate) : null;
        viewDate = selectedDate ? new Date(selectedDate) : new Date();
        renderCalendar();
        dropdown.classList.add('active');
        requestAnimationFrame(() => keepInViewport(dropdown, root));
    }

    function closeDropdown() {
        dropdown.classList.remove('active');
        resetDropdownPosition(dropdown);
    }

    iconBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown.classList.contains('active')) {
            closeDropdown();
        } else {
            openDropdown();
        }
    });

    document.addEventListener('click', (e) => {
        if (!root.contains(e.target)) {
            closeDropdown();
        }
    });

    return {
        getValue: () => hiddenVal.value,
        setValue: (val) => {
            const parsed = parseDate(val);
            applyDate(parsed, true);
        },
        clear: () => {
            applyDate(null, true);
        }
    };
}
