import { keepInViewport, resetDropdownPosition, bindViewportCheck } from './dropdown-utils.js';

export function createCustomSelect(containerElement, options = [], selectedValue = '', placeholder = 'Selecteer...', onChange = null, actionOption = null, isMulti = false) {
    let currentVal = isMulti 
        ? (Array.isArray(selectedValue) ? selectedValue.map(String) : (selectedValue ? [String(selectedValue)] : []))
        : (selectedValue !== null && selectedValue !== undefined ? String(selectedValue) : '');

    function getDisplayLabel() {
        if (isMulti) {
            if (!Array.isArray(currentVal) || currentVal.length === 0) {
                return placeholder;
            }
            return currentVal.map(val => {
                const opt = options.find(o => String(o.value) === String(val));
                return opt ? opt.label : val;
            }).join(', ');
        } else {
            const selectedOption = options.find(o => String(o.value) === String(currentVal));
            return selectedOption ? selectedOption.label : (currentVal ? currentVal : placeholder);
        }
    }

    function isOptionSelected(val) {
        if (isMulti) {
            return Array.isArray(currentVal) && currentVal.includes(String(val));
        }
        return String(val) === String(currentVal);
    }

    function renderDropdownContent() {
        if (options.length === 0 && !actionOption) {
            return `<div class="custom-select-empty">Geen opties beschikbaar</div>`;
        }

        let html = options.map(opt => `
            <div class="custom-select-option ${isOptionSelected(opt.value) ? 'selected' : ''}" data-value="${opt.value}">
                <span>${opt.label}</span>
                ${isOptionSelected(opt.value) ? '<span class="material-icons custom-select-check">check</span>' : ''}
            </div>
        `).join('');

        if (actionOption) {
            if (options.length > 0) {
                html += `<div class="custom-select-divider"></div>`;
            }
            html += `
                <div class="custom-select-action-option">
                    <span class="material-icons">${actionOption.icon || 'add'}</span>
                    <span>${actionOption.label}</span>
                </div>
            `;
        }

        return html;
    }

    containerElement.innerHTML = `
        <div class="custom-select-wrapper">
            <input type="hidden" class="custom-select-value" value="${isMulti ? JSON.stringify(currentVal) : currentVal}">
            <div class="custom-select-trigger" tabindex="0">
                <span class="custom-select-label">${getDisplayLabel()}</span>
                <span class="material-icons custom-select-arrow">expand_more</span>
            </div>
            <div class="custom-select-dropdown">
                ${renderDropdownContent()}
            </div>
        </div>
    `;

    const root = containerElement.querySelector('.custom-select-wrapper');
    const trigger = root.querySelector('.custom-select-trigger');
    const labelSpan = root.querySelector('.custom-select-label');
    const hiddenVal = root.querySelector('.custom-select-value');
    const dropdown = root.querySelector('.custom-select-dropdown');

    bindViewportCheck(dropdown, trigger);

    function openDropdown() {
        dropdown.classList.add('active');
        trigger.classList.add('active');
        keepInViewport(dropdown, trigger);
    }

    function closeDropdown() {
        dropdown.classList.remove('active');
        trigger.classList.remove('active');
        resetDropdownPosition(dropdown);
    }

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown.classList.contains('active')) {
            closeDropdown();
        } else {
            openDropdown();
        }
    });

    trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (dropdown.classList.contains('active')) {
                closeDropdown();
            } else {
                openDropdown();
            }
        }
    });

    dropdown.addEventListener('click', (e) => {
        const actionEl = e.target.closest('.custom-select-action-option');
        if (actionEl && actionOption && actionOption.onClick) {
            closeDropdown();
            actionOption.onClick();
            return;
        }

        const optionEl = e.target.closest('.custom-select-option');
        if (!optionEl) return;

        const val = optionEl.getAttribute('data-value');

        if (isMulti) {
            e.stopPropagation();
            if (!Array.isArray(currentVal)) currentVal = [];
            const index = currentVal.indexOf(val);
            if (index > -1) {
                currentVal.splice(index, 1);
            } else {
                currentVal.push(val);
            }
            hiddenVal.value = JSON.stringify(currentVal);
            labelSpan.textContent = getDisplayLabel();
            dropdown.innerHTML = renderDropdownContent();
            if (onChange) onChange([...currentVal]);
        } else {
            const text = optionEl.querySelector('span').textContent;
            currentVal = val;
            hiddenVal.value = val;
            labelSpan.textContent = text;

            dropdown.querySelectorAll('.custom-select-option').forEach(el => {
                el.classList.remove('selected');
                const check = el.querySelector('.custom-select-check');
                if (check) check.remove();
            });

            optionEl.classList.add('selected');
            optionEl.insertAdjacentHTML('beforeend', '<span class="material-icons custom-select-check">check</span>');

            closeDropdown();
            if (onChange) onChange(val);
        }
    });

    let closeTimer = null;

    root.addEventListener('mouseenter', () => {
        if (closeTimer) {
            clearTimeout(closeTimer);
            closeTimer = null;
        }
    });

    root.addEventListener('mouseleave', () => {
        if (dropdown.classList.contains('active')) {
            closeTimer = setTimeout(() => {
                closeDropdown();
            }, 120);
        }
    });

    document.addEventListener('click', (e) => {
        if (!root.contains(e.target)) {
            closeDropdown();
        }
    });

    return {
        getValue: () => {
            if (isMulti) {
                return Array.isArray(currentVal) ? [...currentVal] : [];
            }
            return hiddenVal.value;
        },
        setValue: (val) => {
            if (isMulti) {
                currentVal = Array.isArray(val) ? val.map(String) : (val ? [String(val)] : []);
                hiddenVal.value = JSON.stringify(currentVal);
            } else {
                currentVal = val !== null && val !== undefined ? String(val) : '';
                hiddenVal.value = currentVal;
            }
            labelSpan.textContent = getDisplayLabel();
            dropdown.innerHTML = renderDropdownContent();
        },
        setOptions: (newOptions, newSelectedValue = undefined) => {
            options = newOptions;
            if (newSelectedValue !== undefined) {
                if (isMulti) {
                    currentVal = Array.isArray(newSelectedValue) ? newSelectedValue.map(String) : (newSelectedValue ? [String(newSelectedValue)] : []);
                    hiddenVal.value = JSON.stringify(currentVal);
                } else {
                    currentVal = newSelectedValue !== null && newSelectedValue !== undefined ? String(newSelectedValue) : '';
                    hiddenVal.value = currentVal;
                }
                labelSpan.textContent = getDisplayLabel();
            }
            dropdown.innerHTML = renderDropdownContent();
        }
    };
}
