import { formatDuration } from './time-utils.js';

let tooltipElement = null;

export function getOrCreateTooltip() {
    if (!tooltipElement) {
        tooltipElement = document.createElement('div');
        tooltipElement.className = 'custom-planning-tooltip';
        document.body.appendChild(tooltipElement);
    }
    return tooltipElement;
}

export function showCustomTooltip(e, data) {
    const tip = getOrCreateTooltip();
    const type = data.type || 'vullen';
    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
    
    let colliHtml = '';
    if (data.colli > 0) {
        colliHtml = `<span class="tooltip-detail-item"><span class="tooltip-colli-val">${data.colli}</span> colli</span>`;
    }

    let timeHtml = '';
    if (data.startStr && data.endStr) {
        timeHtml = `<span class="tooltip-detail-item"><strong>${data.startStr} - ${data.endStr}</strong></span>`;
    }

    tip.innerHTML = `
        <span class="tooltip-badge-pill type-${type}">${typeLabel}</span>
        <span class="tooltip-title">${data.title}</span>
        ${colliHtml}
        <span class="tooltip-detail-item">${formatDuration(data.duration)}</span>
        ${timeHtml}
    `;

    positionCustomTooltip(e);
    tip.classList.add('visible');
}

export function positionCustomTooltip(e) {
    if (!tooltipElement) return;
    const x = e.clientX + 12;
    const y = e.clientY + 12;
    const tipRect = tooltipElement.getBoundingClientRect();

    let left = x;
    let top = y;

    if (left + tipRect.width > window.innerWidth - 10) {
        left = e.clientX - tipRect.width - 12;
    }
    if (top + tipRect.height > window.innerHeight - 10) {
        top = e.clientY - tipRect.height - 12;
    }

    tooltipElement.style.left = `${Math.max(10, left)}px`;
    tooltipElement.style.top = `${Math.max(10, top)}px`;
}

export function hideCustomTooltip() {
    if (tooltipElement) {
        tooltipElement.classList.remove('visible');
    }
}
