let tooltipElement = null;
let delayTimer = null;
let activeDelayedTarget = null;
let isShowingDelayed = false;
let lastMouseEvent = null;

const TOOLTIP_DELAY_MS = 650;

export function getOrCreateTooltip() {
    if (!tooltipElement) {
        tooltipElement = document.createElement('div');
        tooltipElement.className = 'custom-planning-tooltip custom-tooltip';
        document.body.appendChild(tooltipElement);
    }
    return tooltipElement;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDuration(minutes) {
    if (isNaN(minutes) || minutes <= 0) return '0m';
    const mins = Math.round(minutes);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h}u ${m}m`;
    if (h > 0) return `${h}u`;
    return `${m}m`;
}

function formatTooltipText(text) {
    if (!text) return '';
    let escaped = escapeHtml(text);
    escaped = escaped.replace(/(@[\w.-]+)/g, '<span class="tooltip-accent">$1</span>');
    escaped = escaped.replace(/\n/g, '<br>');
    return escaped;
}

function renderTextWithSubtitle(text) {
    if (text.includes(' - ')) {
        const parts = text.split(' - ');
        const main = parts[0].trim();
        const sub = parts.slice(1).join(' - ').trim();
        return `
            <div class="tooltip-text-group">
                <span class="tooltip-title">${formatTooltipText(main)}</span>
                <span class="tooltip-subtitle">${formatTooltipText(sub)}</span>
            </div>
        `;
    }
    return `<span class="tooltip-title">${formatTooltipText(text)}</span>`;
}

export function showCustomTooltip(e, data) {
    if (!data) return;
    if (delayTimer) {
        clearTimeout(delayTimer);
        delayTimer = null;
    }

    const tip = getOrCreateTooltip();

    if (typeof data === 'string') {
        tip.innerHTML = renderTextWithSubtitle(data);
        positionCustomTooltip(e);
        tip.classList.add('visible');
        return;
    }

    activeDelayedTarget = null;
    isShowingDelayed = false;

    if (data.isWorker) {
        const uText = data.username ? `@${data.username.replace(/^@/, '')}` : '';
        const titleContent = uText
            ? `<span class="tooltip-accent">${escapeHtml(uText)}</span>`
            : `Medewerker`;
        tip.innerHTML = `
            <div class="tooltip-text-group">
                <span class="tooltip-title">${titleContent}</span>
                <span class="tooltip-subtitle">Klik om te bewerken</span>
            </div>
        `;
        positionCustomTooltip(e);
        tip.classList.add('visible');
        return;
    }

    if (data.text) {
        tip.innerHTML = renderTextWithSubtitle(data.text);
        positionCustomTooltip(e);
        tip.classList.add('visible');
        return;
    }

    const type = data.type || 'vullen';
    const typeLabel = data.isHelper ? 'Helper' : (type.charAt(0).toUpperCase() + type.slice(1));
    const typeBadgeClass = data.isHelper ? 'type-helper' : `type-${type}`;
    
    let colliHtml = '';
    if (data.colli > 0) {
        colliHtml = `<span class="tooltip-detail-item"><span class="tooltip-colli-val">${data.colli}</span> colli</span>`;
    }

    let timeHtml = '';
    if (data.startStr && data.endStr) {
        timeHtml = `<span class="tooltip-detail-item"><strong>${escapeHtml(data.startStr)} - ${escapeHtml(data.endStr)}</strong></span>`;
    }

    let durationHtml = '';
    if (data.duration && !data.isFlexible) {
        const durText = data.origDuration && data.origDuration !== data.duration
            ? `${formatDuration(data.origDuration)} &bull; ${formatDuration(data.duration)}`
            : formatDuration(data.duration);
        durationHtml = `<span class="tooltip-detail-item">${durText}</span>`;
    }

    tip.innerHTML = `
        <span class="tooltip-badge-pill ${typeBadgeClass}">${typeLabel}</span>
        <span class="tooltip-title">${escapeHtml(data.title || '')}</span>
        ${colliHtml}
        ${durationHtml}
        ${timeHtml}
    `;

    positionCustomTooltip(e);
    tip.classList.add('visible');
}

export function positionCustomTooltip(e) {
    if (!tooltipElement || !e) return;
    const clientX = typeof e.clientX === 'number' ? e.clientX : 0;
    const clientY = typeof e.clientY === 'number' ? e.clientY : 0;

    const x = clientX + 12;
    const y = clientY + 12;
    const tipRect = tooltipElement.getBoundingClientRect();

    let left = x;
    let top = y;

    if (left + tipRect.width > window.innerWidth - 10) {
        left = clientX - tipRect.width - 12;
    }
    if (top + tipRect.height > window.innerHeight - 10) {
        top = clientY - tipRect.height - 12;
    }

    tooltipElement.style.left = `${Math.max(10, left)}px`;
    tooltipElement.style.top = `${Math.max(10, top)}px`;
}

export function hideCustomTooltip() {
    if (delayTimer) {
        clearTimeout(delayTimer);
        delayTimer = null;
    }
    activeDelayedTarget = null;
    isShowingDelayed = false;
    if (tooltipElement) {
        tooltipElement.classList.remove('visible');
    }
}

function processTitles(root = document.body) {
    if (!root) return;
    if (root.hasAttribute && root.hasAttribute('title') && root.tagName !== 'TITLE') {
        const val = root.getAttribute('title');
        if (val) {
            root.setAttribute('data-tooltip', val);
        }
        root.removeAttribute('title');
    }
    if (root.querySelectorAll) {
        const elements = root.querySelectorAll('[title]');
        for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            if (el.tagName === 'TITLE') continue;
            const text = el.getAttribute('title');
            if (text) {
                el.setAttribute('data-tooltip', text);
            }
            el.removeAttribute('title');
        }
    }
}

export function initGlobalTooltips() {
    getOrCreateTooltip();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => processTitles());
    } else {
        processTitles();
    }

    const observer = new MutationObserver((mutations) => {
        for (let i = 0; i < mutations.length; i++) {
            const m = mutations[i];
            if (m.type === 'attributes' && m.attributeName === 'title') {
                const target = m.target;
                if (target && target.hasAttribute && target.hasAttribute('title') && target.tagName !== 'TITLE') {
                    const val = target.getAttribute('title');
                    if (val) {
                        target.setAttribute('data-tooltip', val);
                    }
                    target.removeAttribute('title');
                }
            } else if (m.type === 'childList') {
                for (let j = 0; j < m.addedNodes.length; j++) {
                    const node = m.addedNodes[j];
                    if (node.nodeType === 1 && node.tagName !== 'TITLE') {
                        processTitles(node);
                    }
                }
            }
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['title']
    });

    document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('[title], [data-tooltip]');
        if (!target || target.tagName === 'TITLE') return;
        if (target.hasAttribute('title')) {
            const val = target.getAttribute('title');
            if (val) {
                target.setAttribute('data-tooltip', val);
            }
            target.removeAttribute('title');
        }
        const text = target.getAttribute('data-tooltip');
        if (text && text.trim()) {
            if (activeDelayedTarget === target) return;
            if (delayTimer) {
                clearTimeout(delayTimer);
                delayTimer = null;
            }
            activeDelayedTarget = target;
            isShowingDelayed = false;
            lastMouseEvent = e;
            delayTimer = setTimeout(() => {
                if (activeDelayedTarget === target) {
                    isShowingDelayed = true;
                    showCustomTooltip(lastMouseEvent || e, text);
                }
            }, TOOLTIP_DELAY_MS);
        }
    }, { passive: true });

    document.addEventListener('mousemove', (e) => {
        lastMouseEvent = e;
        if (activeDelayedTarget) {
            const text = activeDelayedTarget.getAttribute('data-tooltip');
            if (delayTimer) {
                clearTimeout(delayTimer);
                delayTimer = null;
            }
            if (isShowingDelayed && tooltipElement && tooltipElement.classList.contains('visible')) {
                tooltipElement.classList.remove('visible');
                isShowingDelayed = false;
            }
            if (text && text.trim()) {
                const currentTarget = activeDelayedTarget;
                delayTimer = setTimeout(() => {
                    if (activeDelayedTarget === currentTarget) {
                        isShowingDelayed = true;
                        showCustomTooltip(lastMouseEvent || e, text);
                    }
                }, TOOLTIP_DELAY_MS);
            }
            return;
        }

        if (tooltipElement && tooltipElement.classList.contains('visible')) {
            positionCustomTooltip(e);
        }
    }, { passive: true });

    document.addEventListener('mouseout', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (!target) return;
        const related = e.relatedTarget ? e.relatedTarget.closest('[data-tooltip]') : null;
        if (related !== target) {
            hideCustomTooltip();
        }
    }, { passive: true });

    window.addEventListener('mousedown', hideCustomTooltip, { passive: true });
    window.addEventListener('scroll', hideCustomTooltip, { passive: true });
    window.addEventListener('blur', hideCustomTooltip);
}
