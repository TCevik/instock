export function resetDropdownPosition(dropdown) {
    if (!dropdown) return;
    dropdown.style.top = '';
    dropdown.style.bottom = '';
    dropdown.style.left = '';
    dropdown.style.right = '';
    dropdown.style.transform = '';
    dropdown.style.maxHeight = '';
    dropdown.style.maxWidth = '';
}

export function keepInViewport(dropdown, anchor = null) {
    if (!dropdown) return;

    dropdown.style.top = '';
    dropdown.style.bottom = '';
    dropdown.style.left = '';
    dropdown.style.right = '';
    dropdown.style.transform = '';
    dropdown.style.maxHeight = '';
    dropdown.style.maxWidth = '';

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 10;

    const anchorEl = anchor || dropdown.parentElement;
    const anchorRect = anchorEl ? anchorEl.getBoundingClientRect() : null;
    const rect = dropdown.getBoundingClientRect();
    const dropdownHeight = rect.height || 200;

    if (anchorRect) {
        const spaceBelow = viewportHeight - anchorRect.bottom - margin;
        const spaceAbove = anchorRect.top - margin;

        if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
            dropdown.style.top = 'auto';
            dropdown.style.bottom = 'calc(100% + 4px)';
            if (spaceAbove < dropdownHeight) {
                dropdown.style.maxHeight = `${Math.max(100, Math.floor(spaceAbove) - 6)}px`;
                dropdown.style.overflowY = 'auto';
            }
        } else {
            dropdown.style.top = 'calc(100% + 4px)';
            dropdown.style.bottom = 'auto';
            if (spaceBelow < dropdownHeight) {
                dropdown.style.maxHeight = `${Math.max(100, Math.floor(spaceBelow) - 6)}px`;
                dropdown.style.overflowY = 'auto';
            }
        }
    }

    dropdown.style.maxWidth = `calc(${viewportWidth}px - ${margin * 2}px)`;

    let curRect = dropdown.getBoundingClientRect();
    if (curRect.right > viewportWidth - margin) {
        dropdown.style.left = 'auto';
        dropdown.style.right = '0px';
        dropdown.style.transform = 'none';
    }

    curRect = dropdown.getBoundingClientRect();
    if (curRect.left < margin) {
        dropdown.style.right = 'auto';
        dropdown.style.left = '0px';
        dropdown.style.transform = 'none';
    }

    curRect = dropdown.getBoundingClientRect();
    if (curRect.right > viewportWidth - margin) {
        const diff = curRect.right - (viewportWidth - margin);
        dropdown.style.transform = `translateX(-${diff}px)`;
    } else if (curRect.left < margin) {
        const diff = margin - curRect.left;
        dropdown.style.transform = `translateX(${diff}px)`;
    }
}

export function bindViewportCheck(dropdown, anchor = null) {
    const handler = () => {
        if (dropdown.classList.contains('active')) {
            keepInViewport(dropdown, anchor);
        }
    };
    window.addEventListener('resize', handler, { passive: true });
    window.addEventListener('scroll', handler, { passive: true, capture: true });
}
