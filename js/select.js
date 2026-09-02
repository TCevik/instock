export function createCustomSelect(containerElement, options = [], selectedValue = '', placeholder = 'Selecteer...', onChange = null) {
    let currentVal = selectedValue;
    const selectedOption = options.find(o => String(o.value) === String(selectedValue));
    const label = selectedOption ? selectedOption.label : placeholder;

    containerElement.innerHTML = `
        <div class="custom-select-wrapper">
            <input type="hidden" class="custom-select-value" value="${currentVal}">
            <div class="custom-select-trigger" tabindex="0">
                <span class="custom-select-label">${label}</span>
                <span class="material-icons custom-select-arrow">expand_more</span>
            </div>
            <div class="custom-select-dropdown">
                ${options.length === 0 
                    ? `<div class="custom-select-empty">Geen opties beschikbaar</div>`
                    : options.map(opt => `
                        <div class="custom-select-option${String(opt.value) === String(currentVal) ? ' selected' : ''}" data-value="${opt.value}">
                            <span>${opt.label}</span>
                            ${String(opt.value) === String(currentVal) ? '<span class="material-icons custom-select-check">check</span>' : ''}
                        </div>
                    `).join('')}
            </div>
        </div>
    `;

    const root = containerElement.querySelector('.custom-select-wrapper');
    const trigger = root.querySelector('.custom-select-trigger');
    const labelSpan = root.querySelector('.custom-select-label');
    const hiddenVal = root.querySelector('.custom-select-value');
    const dropdown = root.querySelector('.custom-select-dropdown');

    function openDropdown() {
        dropdown.classList.add('active');
        trigger.classList.add('active');
    }

    function closeDropdown() {
        dropdown.classList.remove('active');
        trigger.classList.remove('active');
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
        const optionEl = e.target.closest('.custom-select-option');
        if (!optionEl) return;

        const val = optionEl.getAttribute('data-value');
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
    });

    document.addEventListener('click', (e) => {
        if (!root.contains(e.target)) {
            closeDropdown();
        }
    });

    return {
        getValue: () => hiddenVal.value,
        setValue: (val) => {
            currentVal = val;
            hiddenVal.value = val;
            const opt = options.find(o => String(o.value) === String(val));
            labelSpan.textContent = opt ? opt.label : placeholder;
        },
        setOptions: (newOptions) => {
            options = newOptions;
            if (options.length === 0) {
                dropdown.innerHTML = `<div class="custom-select-empty">Geen opties beschikbaar</div>`;
            } else {
                dropdown.innerHTML = options.map(opt => `
                    <div class="custom-select-option${String(opt.value) === String(currentVal) ? ' selected' : ''}" data-value="${opt.value}">
                        <span>${opt.label}</span>
                        ${String(opt.value) === String(currentVal) ? '<span class="material-icons custom-select-check">check</span>' : ''}
                    </div>
                `).join('');
            }
        }
    };
}
