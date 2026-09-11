import { supabase, showModal, closeModal, parseUserDisplay } from './main.js';
import { createCustomSelect } from './select.js';
import { getProductivityStatusClass } from './vulplanning/time-utils.js';

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function formatDateTime(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

function formatDutchDate(dateStr) {
    if (!dateStr) return '-';
    const parts = String(dateStr).split('-');
    if (parts.length === 3) {
        if (parts[0].length === 4) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dateStr;
    }
    return dateStr;
}

function getLogFieldIcon(key) {
    const k = String(key).toLowerCase().trim();
    if (k.includes('naam') || k.includes('user') || k.includes('gebruiker')) return 'person';
    if (k.includes('rol')) return 'admin_panel_settings';
    if (k.includes('geboorte') || k.includes('datum') || k.includes('date')) return 'calendar_today';
    if (k.includes('afdeling') || k.includes('department')) return 'storefront';
    if (k.includes('productiviteit')) return 'trending_up';
    if (k.includes('wachtwoord') || k.includes('password')) return 'lock';
    if (k.includes('prijs') || k.includes('price')) return 'payments';
    if (k.includes('voorraad') || k.includes('stock')) return 'inventory_2';
    if (k.includes('ean') || k.includes('barcode')) return 'qr_code';
    if (k.includes('merk') || k.includes('brand')) return 'branding_watermark';
    if (k.includes('pad') || k.includes('path')) return 'alt_route';
    if (k.includes('setting') || k.includes('instelling')) return 'tune';
    return 'info';
}

function formatLogValue(key, val) {
    if (val === null || val === undefined || val === '') return '-';

    let clean = val;
    if (typeof clean === 'string') {
        clean = clean.trim();
        const prefix = `${key}:`;
        if (clean.toLowerCase().startsWith(prefix.toLowerCase())) {
            clean = clean.substring(prefix.length).trim();
        }
    }

    const k = String(key).toLowerCase();

    if (k.includes('rol')) {
        const num = String(clean).trim();
        if (num === '1') return 'Medewerker';
        if (num === '2') return 'Teamleider';
        if (num === '3') return 'Beheerder';
        return clean;
    }

    if (k.includes('geboorte')) {
        if (clean === 'Niet ingesteld') return 'Niet ingesteld';
        return formatDutchDate(clean);
    }

    if (k.includes('prijs')) {
        const num = parseFloat(String(clean).replace('€', '').replace(',', '.').trim());
        if (!isNaN(num)) {
            return `€ ${num.toFixed(2).replace('.', ',')}`;
        }
        return clean;
    }

    if (k.includes('voorraad')) {
        const num = parseInt(String(clean).trim(), 10);
        if (!isNaN(num)) {
            return `${num} ${num === 1 ? 'stuk' : 'stuks'}`;
        }
        return clean;
    }

    if (k.includes('productiviteit')) {
        const num = parseFloat(String(clean).replace('%', '').trim());
        if (!isNaN(num)) {
            return `${Math.round(num)}%`;
        }
        return clean;
    }

    if (k.includes('afdeling') || k.includes('department')) {
        let depts = [];
        if (Array.isArray(clean)) {
            depts = clean;
        } else if (typeof clean === 'string') {
            if (clean.startsWith('[') && clean.endsWith(']')) {
                try {
                    const parsed = JSON.parse(clean);
                    if (Array.isArray(parsed)) depts = parsed;
                } catch (_) {}
            }
            if (depts.length === 0) {
                depts = clean.split(',').map(s => s.trim()).filter(Boolean);
            }
        }
        if (depts.length > 0) {
            return { isBadges: true, badges: depts };
        }
    }

    if (typeof clean === 'object') {
        return JSON.stringify(clean, null, 2);
    }

    return String(clean);
}

function renderPathsDiff(oldPaths, newPaths) {
    const oldList = Array.isArray(oldPaths) ? oldPaths : [];
    const newList = Array.isArray(newPaths) ? newPaths : [];

    function norm(s) {
        return String(s || '').trim().toLowerCase();
    }

    const matchedOldIndices = new Set();
    const matchedNewIndices = new Set();
    const pairs = [];

    newList.forEach((newP, newIdx) => {
        if (!newP) return;
        if (newP.id) {
            const oldIdx = oldList.findIndex((oldP, idx) => !matchedOldIndices.has(idx) && oldP && oldP.id && oldP.id === newP.id);
            if (oldIdx !== -1) {
                matchedOldIndices.add(oldIdx);
                matchedNewIndices.add(newIdx);
                pairs.push({ oldP: oldList[oldIdx], newP });
            }
        }
    });

    newList.forEach((newP, newIdx) => {
        if (matchedNewIndices.has(newIdx) || !newP) return;
        const targetName = norm(newP.name);
        const oldIdx = oldList.findIndex((oldP, idx) => !matchedOldIndices.has(idx) && oldP && norm(oldP.name) === targetName);
        if (oldIdx !== -1) {
            matchedOldIndices.add(oldIdx);
            matchedNewIndices.add(newIdx);
            pairs.push({ oldP: oldList[oldIdx], newP });
        }
    });

    const pathChanges = [];

    pairs.forEach(({ oldP, newP }) => {
        const fieldDiffs = [];

        if (norm(oldP.name) !== norm(newP.name)) {
            fieldDiffs.push({
                label: 'Naam gangpad',
                oldVal: oldP.name,
                newVal: newP.name
            });
        }

        if (Number(oldP.spiegelnorm) !== Number(newP.spiegelnorm)) {
            fieldDiffs.push({
                label: 'Spiegelnorm',
                oldVal: `${Number(oldP.spiegelnorm || 0)} min`,
                newVal: `${Number(newP.spiegelnorm || 0)} min`
            });
        }

        if (Number(oldP.restantennorm) !== Number(newP.restantennorm)) {
            fieldDiffs.push({
                label: 'Restantennorm',
                oldVal: `${Number(oldP.restantennorm || 0)} min`,
                newVal: `${Number(newP.restantennorm || 0)} min`
            });
        }

        const oldCats = Array.isArray(oldP.categories) ? oldP.categories : [];
        const newCats = Array.isArray(newP.categories) ? newP.categories : [];
        const matchedOldCatIndices = new Set();
        const matchedNewCatIndices = new Set();
        const catPairs = [];

        newCats.forEach((newC, nIdx) => {
            if (!newC) return;
            if (newC.id) {
                const oIdx = oldCats.findIndex((oldC, idx) => !matchedOldCatIndices.has(idx) && oldC && oldC.id && oldC.id === newC.id);
                if (oIdx !== -1) {
                    matchedOldCatIndices.add(oIdx);
                    matchedNewCatIndices.add(nIdx);
                    catPairs.push({ oldC: oldCats[oIdx], newC });
                }
            }
        });

        newCats.forEach((newC, nIdx) => {
            if (matchedNewCatIndices.has(nIdx) || !newC) return;
            const cName = norm(newC.name);
            const oIdx = oldCats.findIndex((oldC, idx) => !matchedOldCatIndices.has(idx) && oldC && norm(oldC.name) === cName);
            if (oIdx !== -1) {
                matchedOldCatIndices.add(oIdx);
                matchedNewCatIndices.add(nIdx);
                catPairs.push({ oldC: oldCats[oIdx], newC });
            }
        });

        const addedCats = [];
        newCats.forEach((newC, nIdx) => {
            if (!matchedNewCatIndices.has(nIdx) && newC && newC.name) addedCats.push(newC);
        });

        const removedCats = [];
        oldCats.forEach((oldC, oIdx) => {
            if (!matchedOldCatIndices.has(oIdx) && oldC && oldC.name) removedCats.push(oldC);
        });

        const modifiedCats = [];
        catPairs.forEach(({ oldC, newC }) => {
            const nameChanged = norm(oldC.name) !== norm(newC.name);
            const normChanged = Number(oldC.norm) !== Number(newC.norm);
            if (nameChanged || normChanged) {
                modifiedCats.push({
                    oldName: oldC.name,
                    newName: newC.name,
                    oldNorm: oldC.norm,
                    newNorm: newC.norm,
                    nameChanged,
                    normChanged
                });
            }
        });

        if (fieldDiffs.length > 0 || addedCats.length > 0 || removedCats.length > 0 || modifiedCats.length > 0) {
            pathChanges.push({
                type: 'modified',
                path: newP,
                fieldDiffs,
                addedCats,
                removedCats,
                modifiedCats
            });
        }
    });

    newList.forEach((newP, newIdx) => {
        if (!matchedNewIndices.has(newIdx) && newP && newP.name) {
            pathChanges.push({
                type: 'added',
                path: newP
            });
        }
    });

    oldList.forEach((oldP, oldIdx) => {
        if (!matchedOldIndices.has(oldIdx) && oldP && oldP.name) {
            pathChanges.push({
                type: 'removed',
                path: oldP
            });
        }
    });

    if (pathChanges.length === 0) {
        if (oldList.length > 0 && newList.length > 0) {
            const oldOrder = oldList.map(p => p?.name).join(' | ');
            const newOrder = newList.map(p => p?.name).join(' | ');
            if (oldOrder !== newOrder) {
                return {
                    count: 1,
                    html: `
                        <div class="log-detail-card">
                            <div class="log-detail-header">
                                <div class="log-detail-icon-wrap">
                                    <span class="material-icons">swap_vert</span>
                                </div>
                                <span class="log-detail-title">Volgorde gangpaden</span>
                            </div>
                            <div class="log-val-badge neutral">
                                <span>Volgorde van de gangpaden is opnieuw gerangschikt</span>
                            </div>
                        </div>
                    `
                };
            }
        }
        return {
            count: 0,
            html: '<div class="empty-state" style="padding: 16px 0;">Geen inhoudelijke wijzigingen in de gangpaden gedetecteerd.</div>'
        };
    }

    const cardsHtml = pathChanges.map(change => {
        const p = change.path;
        const name = escapeHtml(p.name || 'Onbekend pad');

        if (change.type === 'added') {
            const cats = Array.isArray(p.categories) ? p.categories : [];
            return `
                <div class="log-detail-card">
                    <div class="log-detail-header">
                        <div class="log-detail-icon-wrap">
                            <span class="material-icons">add_circle</span>
                        </div>
                        <span class="log-detail-title">Nieuw gangpad: ${name}</span>
                    </div>
                    <div class="log-detail-diff-row">
                        <div class="log-val-badge new">
                            <span class="material-icons val-icon">check</span>
                            <span>Gangpad "${name}" toegevoegd</span>
                        </div>
                    </div>
                    ${p.spiegelnorm || p.restantennorm ? `
                        <div class="log-detail-diff-row">
                            ${p.spiegelnorm ? `<span class="log-norm-pill"><span class="material-icons">visibility</span>Spiegelen: ${p.spiegelnorm}m</span>` : ''}
                            ${p.restantennorm ? `<span class="log-norm-pill"><span class="material-icons">inventory_2</span>Restanten: ${p.restantennorm}m</span>` : ''}
                        </div>
                    ` : ''}
                    ${cats.length > 0 ? `
                        <div class="log-path-categories" style="margin-top: 4px;">
                            ${cats.map(c => `
                                <span class="log-cat-pill">
                                    <span class="cat-name">${escapeHtml(c.name)}</span>
                                    ${c.norm ? `<span class="cat-norm">${c.norm} c/u</span>` : ''}
                                </span>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        if (change.type === 'removed') {
            return `
                <div class="log-detail-card">
                    <div class="log-detail-header">
                        <div class="log-detail-icon-wrap" style="border-color: var(--prod-danger-border);">
                            <span class="material-icons" style="color: var(--danger-color);">delete_outline</span>
                        </div>
                        <span class="log-detail-title">Verwijderd gangpad: ${name}</span>
                    </div>
                    <div class="log-detail-diff-row">
                        <div class="log-val-badge old">
                            <span class="material-icons val-icon">close</span>
                            <span>Gangpad "${name}" verwijderd</span>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="log-detail-card">
                <div class="log-detail-header">
                    <div class="log-detail-icon-wrap">
                        <span class="material-icons">route</span>
                    </div>
                    <span class="log-detail-title">Gangpad: ${name}</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${(change.fieldDiffs || []).map(f => `
                        <div class="log-detail-diff-row">
                            <span class="log-detail-title" style="min-width: 110px;">${escapeHtml(f.label)}:</span>
                            <div class="log-val-badge old">
                                <span class="material-icons val-icon">close</span>
                                <span>${escapeHtml(f.oldVal)}</span>
                            </div>
                            <span class="material-icons log-arrow-icon">arrow_forward</span>
                            <div class="log-val-badge new">
                                <span class="material-icons val-icon">check</span>
                                <span>${escapeHtml(f.newVal)}</span>
                            </div>
                        </div>
                    `).join('')}

                    ${(change.modifiedCats || []).map(mc => {
                        let innerHtml = '';
                        if (mc.nameChanged && mc.normChanged) {
                            innerHtml = `
                                <div class="log-detail-diff-row">
                                    <span class="log-detail-title" style="min-width: 110px;">Categorie:</span>
                                    <div class="log-val-badge old"><span class="material-icons val-icon">close</span><span>${escapeHtml(mc.oldName)} (${escapeHtml(String(mc.oldNorm))} c/u)</span></div>
                                    <span class="material-icons log-arrow-icon">arrow_forward</span>
                                    <div class="log-val-badge new"><span class="material-icons val-icon">check</span><span>${escapeHtml(mc.newName)} (${escapeHtml(String(mc.newNorm))} c/u)</span></div>
                                </div>
                            `;
                        } else if (mc.nameChanged) {
                            innerHtml = `
                                <div class="log-detail-diff-row">
                                    <span class="log-detail-title" style="min-width: 110px;">Naam categorie:</span>
                                    <div class="log-val-badge old"><span class="material-icons val-icon">close</span><span>${escapeHtml(mc.oldName)}</span></div>
                                    <span class="material-icons log-arrow-icon">arrow_forward</span>
                                    <div class="log-val-badge new"><span class="material-icons val-icon">check</span><span>${escapeHtml(mc.newName)}</span></div>
                                </div>
                            `;
                        } else {
                            innerHtml = `
                                <div class="log-detail-diff-row">
                                    <span class="log-detail-title" style="min-width: 110px;">Norm ${escapeHtml(mc.newName)}:</span>
                                    <div class="log-val-badge old"><span class="material-icons val-icon">close</span><span>${escapeHtml(String(mc.oldNorm))} c/u</span></div>
                                    <span class="material-icons log-arrow-icon">arrow_forward</span>
                                    <div class="log-val-badge new"><span class="material-icons val-icon">check</span><span>${escapeHtml(String(mc.newNorm))} c/u</span></div>
                                </div>
                            `;
                        }
                        return innerHtml;
                    }).join('')}

                    ${(change.addedCats || []).length > 0 ? `
                        <div class="log-detail-diff-row">
                            <span class="log-detail-title" style="min-width: 110px;">Toegevoegd:</span>
                            <div class="log-badges-wrap">
                                ${(change.addedCats).map(c => `
                                    <span class="log-val-badge new">
                                        <span class="material-icons val-icon">add</span>
                                        <span>${escapeHtml(c.name)}${c.norm ? ` (${c.norm} c/u)` : ''}</span>
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${(change.removedCats || []).length > 0 ? `
                        <div class="log-detail-diff-row">
                            <span class="log-detail-title" style="min-width: 110px;">Verwijderd:</span>
                            <div class="log-badges-wrap">
                                ${(change.removedCats).map(c => `
                                    <span class="log-val-badge old">
                                        <span class="material-icons val-icon">remove</span>
                                        <span>${escapeHtml(c.name)}</span>
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    return {
        count: pathChanges.length,
        html: cardsHtml
    };
}

function renderShiftDiff(oldShift, newShift) {
    const oldObj = oldShift || {};
    const newObj = newShift || {};

    const diffs = [];

    const oldDate = oldObj.date || '';
    const newDate = newObj.date || '';
    if (oldDate && newDate && oldDate !== newDate) {
        diffs.push({
            label: 'Datum',
            icon: 'event',
            oldVal: formatDutchDate(oldDate),
            newVal: formatDutchDate(newDate)
        });
    }

    const oldProd = oldObj.productivity !== undefined ? Math.round(Number(oldObj.productivity)) : null;
    const newProd = newObj.productivity !== undefined ? Math.round(Number(newObj.productivity)) : null;
    if (oldProd !== null && newProd !== null && oldProd !== newProd) {
        diffs.push({
            label: 'Productiviteit',
            icon: 'trending_up',
            oldVal: `${oldProd}%`,
            newVal: `${newProd}%`
        });
    }

    const oldS = oldObj.shift || {};
    const newS = newObj.shift || {};

    if ((oldS.start || '') !== (newS.start || '')) {
        diffs.push({
            label: 'Starttijd',
            icon: 'schedule',
            oldVal: oldS.start || '-',
            newVal: newS.start || '-'
        });
    }

    const oldEnd = oldS.actual_end || oldS.planned_end || '';
    const newEnd = newS.actual_end || newS.planned_end || '';
    if (oldEnd !== newEnd) {
        diffs.push({
            label: 'Eindtijd',
            icon: 'schedule',
            oldVal: oldEnd || '-',
            newVal: newEnd || '-'
        });
    }

    const oldPause = Number(oldS.pause_minutes) || 0;
    const newPause = Number(newS.pause_minutes) || 0;
    if (oldPause !== newPause) {
        diffs.push({
            label: 'Pauze',
            icon: 'free_breakfast',
            oldVal: `${oldPause} min`,
            newVal: `${newPause} min`
        });
    }

    const oldColli = Number(oldObj.total_colli) || 0;
    const newColli = Number(newObj.total_colli) || 0;
    if (oldColli !== newColli) {
        diffs.push({
            label: 'Totaal colli',
            icon: 'inventory_2',
            oldVal: `${oldColli} colli`,
            newVal: `${newColli} colli`
        });
    }

    const oldTasks = Array.isArray(oldObj.tasks) ? oldObj.tasks : [];
    const newTasks = Array.isArray(newObj.tasks) ? newObj.tasks : [];
    const taskCards = [];

    const maxLen = Math.max(oldTasks.length, newTasks.length);
    for (let i = 0; i < maxLen; i++) {
        const oT = oldTasks[i];
        const nT = newTasks[i];

        if (!oT && nT) {
            const tTitle = nT.title || nT.pathName || nT.name || 'Taak';
            const details = [];
            if (nT.type) details.push(`Type: ${nT.type}`);
            if (nT.colli > 0) details.push(`${nT.colli} colli`);
            if (nT.start_time || nT.end_time) details.push(`${nT.start_time || ''} - ${nT.end_time || ''}`);
            if (nT.duration_minutes > 0) details.push(`${nT.duration_minutes}m`);

            taskCards.push(`
                <div class="log-detail-card">
                    <div class="log-detail-header">
                        <div class="log-detail-icon-wrap" style="border-color: var(--prod-success-border);">
                            <span class="material-icons" style="color: var(--accent-color);">add</span>
                        </div>
                        <span class="log-detail-title">Taak toegevoegd: ${escapeHtml(tTitle)}</span>
                    </div>
                    <div class="log-detail-diff-row">
                        <div class="log-val-badge new">
                            <span class="material-icons val-icon">check</span>
                            <span>${escapeHtml(details.join(' • ') || tTitle)}</span>
                        </div>
                    </div>
                </div>
            `);
        } else if (oT && !nT) {
            const tTitle = oT.title || oT.pathName || oT.name || 'Taak';
            taskCards.push(`
                <div class="log-detail-card">
                    <div class="log-detail-header">
                        <div class="log-detail-icon-wrap" style="border-color: var(--prod-danger-border);">
                            <span class="material-icons" style="color: var(--danger-color);">delete_outline</span>
                        </div>
                        <span class="log-detail-title">Taak verwijderd: ${escapeHtml(tTitle)}</span>
                    </div>
                    <div class="log-detail-diff-row">
                        <div class="log-val-badge old">
                            <span class="material-icons val-icon">close</span>
                            <span>${escapeHtml(tTitle)}</span>
                        </div>
                    </div>
                </div>
            `);
        } else if (oT && nT) {
            const oTitle = oT.title || oT.pathName || oT.name || 'Taak';
            const nTitle = nT.title || nT.pathName || nT.name || 'Taak';
            const oType = oT.type || 'overige';
            const nType = nT.type || 'overige';
            const oColli = Number(oT.colli) || 0;
            const nColli = Number(nT.colli) || 0;
            const oStart = oT.start_time || oT.start || '';
            const nStart = nT.start_time || nT.start || '';
            const oEnd = oT.end_time || oT.end || '';
            const nEnd = nT.end_time || nT.end || '';
            const oDur = Number(oT.duration_minutes) || Number(oT.duration) || 0;
            const nDur = Number(nT.duration_minutes) || Number(nT.duration) || 0;

            const tFieldDiffs = [];
            if (oTitle !== nTitle) tFieldDiffs.push({ label: 'Naam', oldVal: oTitle, newVal: nTitle });
            if (oType !== nType) tFieldDiffs.push({ label: 'Type', oldVal: oType, newVal: nType });
            if (oColli !== nColli) tFieldDiffs.push({ label: 'Colli', oldVal: `${oColli} colli`, newVal: `${nColli} colli` });
            if (oStart !== nStart || oEnd !== nEnd) tFieldDiffs.push({ label: 'Tijd', oldVal: `${oStart || '-'} - ${oEnd || '-'}`, newVal: `${nStart || '-'} - ${nEnd || '-'}` });
            if (oDur !== nDur) tFieldDiffs.push({ label: 'Duur', oldVal: `${oDur}m`, newVal: `${nDur}m` });

            if (tFieldDiffs.length > 0) {
                taskCards.push(`
                    <div class="log-detail-card">
                        <div class="log-detail-header">
                            <div class="log-detail-icon-wrap">
                                <span class="material-icons">route</span>
                            </div>
                            <span class="log-detail-title">Taak: ${escapeHtml(nTitle)}</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            ${tFieldDiffs.map(f => `
                                <div class="log-detail-diff-row">
                                    <span class="log-detail-title" style="min-width: 80px;">${escapeHtml(f.label)}:</span>
                                    <div class="log-val-badge old">
                                        <span class="material-icons val-icon">close</span>
                                        <span>${escapeHtml(f.oldVal)}</span>
                                    </div>
                                    <span class="material-icons log-arrow-icon">arrow_forward</span>
                                    <div class="log-val-badge new">
                                        <span class="material-icons val-icon">check</span>
                                        <span>${escapeHtml(f.newVal)}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `);
            }
        }
    }

    let html = '';
    diffs.forEach(d => {
        html += `
            <div class="log-detail-card">
                <div class="log-detail-header">
                    <div class="log-detail-icon-wrap">
                        <span class="material-icons">${d.icon}</span>
                    </div>
                    <span class="log-detail-title">${escapeHtml(d.label)}</span>
                </div>
                <div class="log-detail-diff-row">
                    <div class="log-val-badge old">
                        <span class="material-icons val-icon">close</span>
                        <span>${escapeHtml(d.oldVal)}</span>
                    </div>
                    <span class="material-icons log-arrow-icon">arrow_forward</span>
                    <div class="log-val-badge new">
                        <span class="material-icons val-icon">check</span>
                        <span>${escapeHtml(d.newVal)}</span>
                    </div>
                </div>
            </div>
        `;
    });

    html += taskCards.join('');

    return {
        count: diffs.length + taskCards.length,
        html
    };
}

const PAGE_SIZE = 50;
let currentLogs = [];
let usersMap = new Map();
let totalCount = 0;
let currentPage = 1;
let sortAscending = false;
let currentActionFilter = 'all';
let searchQuery = '';
let searchDebounceTimer = null;

function getLogAction(log) {
    if (log.action) return log.action;
    const t = log.new_value?.type;
    if (t === 'add_shift') return 'Dienst toegevoegd';
    if (t === 'update_shift') return 'Dienst aangepast';
    if (t === 'delete_shift') return 'Dienst verwijderd';
    if (t === 'update_task') return 'Taak aangepast';
    if (t === 'delete_task') return 'Taak verwijderd';
    if (t === 'finalize_productivity') return 'Productiviteiten gefinaliseerd';
    return 'Onbekende actie';
}

function getAffectedDisplay(affected, action = '', log = null) {
    if (!affected) return null;
    if (String(affected).toLowerCase() === 'productiviteit') {
        const targetUId = log?.new_value?.user_id;
        const targetU = targetUId ? usersMap.get(targetUId) : null;
        if (targetU) {
            const parsed = parseUserDisplay(targetU.full_name, targetU.username);
            return {
                title: parsed.title || 'Medewerker',
                sub: parsed.sub,
                icon: 'person_outline'
            };
        }
        if (log?.new_value?.username) {
            const parsed = parseUserDisplay(log.new_value.full_name, log.new_value.username);
            return {
                title: parsed.title || 'Medewerker',
                sub: parsed.sub,
                icon: 'person_outline'
            };
        }
        return {
            title: 'Productiviteit',
            sub: '',
            icon: 'fact_check'
        };
    }
    const user = usersMap.get(affected);
    if (user) {
        const parsed = parseUserDisplay(user.full_name, user.username);
        return {
            title: parsed.title || 'Onbekende gebruiker',
            sub: parsed.sub,
            icon: 'person_outline'
        };
    }
    const isUser = action.toLowerCase().includes('gebruiker') || action.toLowerCase().includes('dienst') || action.toLowerCase().includes('taak') || String(affected).includes('@');
    const parsed = parseUserDisplay(affected, '');
    return {
        title: parsed.title || affected,
        sub: parsed.sub,
        icon: isUser ? 'person_outline' : 'inventory_2'
    };
}

function renderTable() {
    const tbody = document.getElementById('logsTableBody');
    const paginationInfo = document.getElementById('paginationInfo');
    const paginationCurrent = document.getElementById('paginationCurrent');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    if (!tbody) return;

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const endIndex = Math.min(startIndex + currentLogs.length, totalCount);

    if (currentLogs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">Geen logs gevonden</td>
            </tr>
        `;
    } else {
        tbody.innerHTML = currentLogs.map((log, idx) => {
            const user = usersMap.get(log.user_id);
            const parsedUser = parseUserDisplay(user?.full_name, user?.username);
            const displayName = parsedUser.title || (log.user_id ? 'Onbekende gebruiker' : 'Systeem');
            const subName = parsedUser.sub;

            const action = getLogAction(log);
            let affectedHtml = '-';
            const aff = getAffectedDisplay(log.affected ?? log.affected_user, action, log);
            if (aff) {
                affectedHtml = `
                    <div class="user-cell">
                        <div class="user-avatar-sm">
                            <span class="material-icons">${aff.icon}</span>
                        </div>
                        <div class="user-info-stacked">
                            <span class="user-full-name">${escapeHtml(aff.title)}</span>
                            ${aff.sub ? `<span class="user-subname">${escapeHtml(aff.sub)}</span>` : ''}
                        </div>
                    </div>
                `;
            }

            const isDanger = action.toLowerCase().includes('verwijderd');
            const timeStr = formatDateTime(log.happened_at || log.created_at);

            return `
                <tr>
                    <td>
                        <div class="user-cell">
                            <div class="user-avatar-sm">
                                <span class="material-icons">person</span>
                            </div>
                            <div class="user-info-stacked">
                                <span class="user-full-name">${escapeHtml(displayName)}</span>
                                ${subName ? `<span class="user-subname">${escapeHtml(subName)}</span>` : ''}
                            </div>
                        </div>
                    </td>
                    <td>${affectedHtml}</td>
                    <td>
                        <span class="action-badge ${isDanger ? 'danger' : ''}">${escapeHtml(action)}</span>
                    </td>
                    <td class="time-cell">${escapeHtml(timeStr)}</td>
                    <td class="td-actions">
                        <button type="button" class="action-btn view-details-btn" data-index="${idx}" title="Log Details - Uitgebreide informatie van deze gebeurtenis inzien">
                            <span class="material-icons">visibility</span>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    const cardsContainer = document.getElementById('logsCardsContainer');
    if (cardsContainer) {
        if (currentLogs.length === 0) {
            cardsContainer.innerHTML = `<div class="empty-state">Geen logs gevonden</div>`;
        } else {
            cardsContainer.innerHTML = currentLogs.map((log, idx) => {
                const user = usersMap.get(log.user_id);
                const parsedUser = parseUserDisplay(user?.full_name, user?.username);
                const displayName = parsedUser.title || (log.user_id ? 'Onbekende gebruiker' : 'Systeem');
                const action = getLogAction(log);
                const isDanger = action.toLowerCase().includes('verwijderd');
                const timeStr = formatDateTime(log.happened_at || log.created_at);
                const aff = getAffectedDisplay(log.affected ?? log.affected_user, action, log);

                return `
                    <div class="log-list-item" data-index="${idx}">
                        <div class="user-avatar-sm">
                            <span class="material-icons">${aff?.icon || 'person'}</span>
                        </div>
                        <div class="log-list-content">
                            <div class="log-list-top">
                                <span class="log-list-user">${escapeHtml(displayName)}</span>
                                <span class="action-badge ${isDanger ? 'danger' : ''}">${escapeHtml(action)}</span>
                            </div>
                            <div class="log-list-sub">
                                ${aff ? `<span class="log-affected">${escapeHtml(aff.title)}</span><span class="log-meta-dot">•</span>` : ''}
                                <span class="log-time">${escapeHtml(timeStr)}</span>
                            </div>
                        </div>
                        <span class="material-icons log-list-chevron">chevron_right</span>
                    </div>
                `;
            }).join('');
        }
    }

    if (paginationInfo) {
        if (totalCount === 0) {
            paginationInfo.textContent = '0 logs';
        } else {
            paginationInfo.textContent = `${startIndex + 1}-${endIndex} van ${totalCount} logs`;
        }
    }

    if (paginationCurrent) {
        paginationCurrent.textContent = `Pagina ${currentPage} van ${totalPages}`;
    }

    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

function openDetailsModal(log) {
    const user = usersMap.get(log.user_id);
    const parsedUser = parseUserDisplay(user?.full_name, user?.username);
    const displayName = parsedUser.title || (log.user_id ? 'Onbekende gebruiker' : 'Systeem');
    const timeStr = formatDateTime(log.happened_at || log.created_at);
    const action = getLogAction(log);

    let detailsHtml = '';
    const oldVal = log.old_value;
    const newVal = log.new_value;

    let isProductivityLog = false;
    let prodItems = [];
    let prodBatchDate = '';

    if (newVal && typeof newVal === 'object') {
        if (newVal.type === 'finalize_productivity' && Array.isArray(newVal.items)) {
            isProductivityLog = true;
            prodItems = newVal.items;
            prodBatchDate = newVal.date || '';
        } else if (newVal.type === 'update_shift' || newVal.type === 'delete_shift') {
            isProductivityLog = true;
            const shiftObj = newVal.shift || (newVal.type === 'delete_shift' ? oldVal : null);
            const targetUser = (newVal.user_id && usersMap.get(newVal.user_id)) || null;
            const targetUName = targetUser?.username || newVal.username || '';
            const targetFName = targetUser?.full_name || newVal.full_name || '';
            if (shiftObj) {
                prodItems = [{
                    username: targetUName,
                    full_name: targetFName,
                    productivity: shiftObj.productivity,
                    prev_productivity: oldVal?.productivity !== undefined ? oldVal.productivity : null,
                    date: shiftObj.date || oldVal?.date || '',
                    shift: shiftObj.shift || null,
                    total_colli: shiftObj.total_colli !== undefined ? shiftObj.total_colli : null,
                    task_count: Array.isArray(shiftObj.tasks) ? shiftObj.tasks.length : 0
                }];
                prodBatchDate = prodItems[0].date;
            }
        } else if (Array.isArray(newVal.items) && (String(action).toLowerCase().includes('productiviteit') || String(log.affected).toLowerCase() === 'productiviteit')) {
            isProductivityLog = true;
            prodItems = newVal.items;
            prodBatchDate = newVal.date || '';
        } else if (newVal.productivity && (String(action).toLowerCase().includes('productiviteit') || String(log.affected).toLowerCase() === 'productiviteit')) {
            isProductivityLog = true;
            const p = newVal.productivity;
            prodItems = [{
                username: String(log.affected).match(/@([a-zA-Z0-9._-]+)/)?.[1] || '',
                full_name: String(log.affected).replace(/@.*$/, '').replace(/[()]/g, '').trim() || 'Medewerker',
                productivity: typeof p === 'object' ? p.productivity : p,
                prev_productivity: oldVal?.productivity ? (typeof oldVal.productivity === 'object' ? oldVal.productivity.productivity : oldVal.productivity) : null,
                date: typeof p === 'object' ? p.date : '',
                shift: typeof p === 'object' ? p.shift : null,
                total_colli: typeof p === 'object' ? p.total_colli : null,
                task_count: typeof p === 'object' && Array.isArray(p.tasks) ? p.tasks.length : 0
            }];
            prodBatchDate = prodItems[0].date;
        }
    }

    if (isProductivityLog && prodItems.length > 0) {
        let bannerText = '';
        let diffHtml = '';
        if (newVal?.type === 'update_shift') {
            bannerText = `Dienst aangepast voor ${prodBatchDate ? formatDutchDate(prodBatchDate) : 'medewerker'}`;
            const diffResult = renderShiftDiff(oldVal, newVal.shift);
            if (diffResult.count > 0) {
                diffHtml = diffResult.html;
            }
        } else if (newVal?.type === 'add_shift') {
            bannerText = `Dienst toegevoegd voor ${prodBatchDate ? formatDutchDate(prodBatchDate) : 'medewerker'}`;
        } else if (newVal?.type === 'delete_shift') {
            bannerText = `Dienst verwijderd voor ${prodBatchDate ? formatDutchDate(prodBatchDate) : 'medewerker'}`;
        } else {
            bannerText = prodBatchDate 
                ? `${prodItems.length} ${prodItems.length === 1 ? 'medewerker' : 'medewerkers'} gefinaliseerd voor ${formatDutchDate(prodBatchDate)}`
                : `${prodItems.length} ${prodItems.length === 1 ? 'medewerker' : 'medewerkers'} gefinaliseerd`;
        }

        detailsHtml = `
            <div class="log-prod-wrapper">
                <div class="log-prod-banner">
                    <span class="material-icons">${newVal?.type === 'delete_shift' ? 'delete_outline' : (newVal?.type === 'update_shift' ? 'edit' : 'fact_check')}</span>
                    <span>${escapeHtml(bannerText)}</span>
                </div>
                <div class="log-prod-list">
                    ${prodItems.map(item => {
                        const parsedItem = parseUserDisplay(item.full_name, item.username);
                        const name = escapeHtml(parsedItem.title || 'Medewerker');
                        const uname = parsedItem.sub ? escapeHtml(parsedItem.sub) : '';
                        const pct = Number(item.productivity || 0);
                        const statusClass = getProductivityStatusClass(pct);
                        const dateStr = item.date ? formatDutchDate(item.date) : '';

                        let subParts = [];
                        if (dateStr) subParts.push(dateStr);
                        if (item.shift && item.shift.actual_end) {
                            subParts.push(`Eind: ${escapeHtml(item.shift.actual_end)}`);
                        } else if (item.shift && item.shift.start && item.shift.planned_end) {
                            subParts.push(`${escapeHtml(item.shift.start)} - ${escapeHtml(item.shift.planned_end)}`);
                        }
                        if (item.task_count > 0) {
                            subParts.push(`${item.task_count} ${item.task_count === 1 ? 'taak' : 'taken'}`);
                        }
                        if (item.total_colli > 0) {
                            subParts.push(`${item.total_colli} colli`);
                        }

                        let prevTagHtml = '';
                        if (item.prev_productivity !== null && item.prev_productivity !== undefined) {
                            prevTagHtml = `<span class="log-prod-prev-pill"><span class="material-icons">history</span>Was ${escapeHtml(String(item.prev_productivity))}%</span>`;
                        }

                        return `
                            <div class="log-prod-card">
                                <div class="log-prod-card-left">
                                    <div class="user-avatar-sm">
                                        <span class="material-icons">person</span>
                                    </div>
                                    <div class="log-prod-user-details">
                                        <div class="log-prod-user-top">
                                            <span class="log-prod-user-name">${name}</span>
                                            ${uname ? `<span class="log-prod-user-uname">${uname}</span>` : ''}
                                        </div>
                                        <div class="log-prod-user-sub">
                                            ${subParts.map(p => `<span>${escapeHtml(p)}</span>`).join('<span class="log-meta-dot">•</span>')}
                                        </div>
                                    </div>
                                </div>
                                <div class="log-prod-card-right">
                                    ${prevTagHtml}
                                    <span class="finalize-prod-badge ${statusClass}">Prod: ${pct}%</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${diffHtml}
            </div>
        `;
    } else {
        const allKeys = new Set([
            ...(oldVal && typeof oldVal === 'object' ? Object.keys(oldVal) : []),
            ...(newVal && typeof newVal === 'object' ? Object.keys(newVal) : [])
        ]);

        if (allKeys.size === 0) {
            if (oldVal !== null && oldVal !== undefined) {
                detailsHtml += `
                    <div class="log-detail-card">
                        <div class="log-detail-header">
                            <div class="log-detail-icon-wrap">
                                <span class="material-icons">history</span>
                            </div>
                            <span class="log-detail-title">Oude waarde</span>
                        </div>
                        <div class="log-detail-diff-row">
                            <div class="log-val-badge old">
                                <span>${escapeHtml(typeof oldVal === 'object' ? JSON.stringify(oldVal, null, 2) : String(oldVal))}</span>
                            </div>
                        </div>
                    </div>
                `;
            }
            if (newVal !== null && newVal !== undefined) {
                detailsHtml += `
                    <div class="log-detail-card">
                        <div class="log-detail-header">
                            <div class="log-detail-icon-wrap">
                                <span class="material-icons">info</span>
                            </div>
                            <span class="log-detail-title">Nieuwe waarde</span>
                        </div>
                        <div class="log-detail-diff-row">
                            <div class="log-val-badge new">
                                <span>${escapeHtml(typeof newVal === 'object' ? JSON.stringify(newVal, null, 2) : String(newVal))}</span>
                            </div>
                        </div>
                    </div>
                `;
            }
        } else {
            let cardsCount = 0;
            let cardsHtml = '';

            allKeys.forEach(key => {
                const oldField = oldVal ? oldVal[key] : null;
                const newField = newVal ? newVal[key] : null;

                if (oldField === null && newField === null) return;
                if (oldField !== null && newField !== null && JSON.stringify(oldField) === JSON.stringify(newField)) return;

                if (key === 'default_paths') {
                    const diffResult = renderPathsDiff(oldField, newField);
                    if (diffResult.count > 0) {
                        cardsHtml += diffResult.html;
                        cardsCount += diffResult.count;
                    } else if (diffResult.html) {
                        cardsHtml += diffResult.html;
                    }
                    return;
                }

                const icon = getLogFieldIcon(key);
                const oldFormatted = formatLogValue(key, oldField);
                const newFormatted = formatLogValue(key, newField);

                function renderValHtml(formatted, type) {
                    if (formatted && typeof formatted === 'object' && formatted.isBadges) {
                        return `
                            <div class="log-badges-wrap">
                                ${formatted.badges.map(b => `<span class="department-badge">${escapeHtml(b)}</span>`).join('')}
                            </div>
                        `;
                    }
                    const text = escapeHtml(String(formatted));
                    const iconName = type === 'new' ? 'check' : (type === 'old' ? 'close' : 'info');
                    return `
                        <div class="log-val-badge ${type}">
                            <span class="material-icons val-icon">${iconName}</span>
                            <span>${text}</span>
                        </div>
                    `;
                }

                let diffContent = '';
                if (oldField !== null && oldField !== undefined && newField !== null && newField !== undefined) {
                    diffContent = `
                        <div class="log-detail-diff-row">
                            ${renderValHtml(oldFormatted, 'old')}
                            <span class="material-icons log-arrow-icon">arrow_forward</span>
                            ${renderValHtml(newFormatted, 'new')}
                        </div>
                    `;
                } else if (newField !== null && newField !== undefined) {
                    diffContent = `
                        <div class="log-detail-diff-row">
                            ${renderValHtml(newFormatted, 'new')}
                        </div>
                    `;
                } else if (oldField !== null && oldField !== undefined) {
                    diffContent = `
                        <div class="log-detail-diff-row">
                            ${renderValHtml(oldFormatted, 'old')}
                        </div>
                    `;
                }

                cardsHtml += `
                    <div class="log-detail-card">
                        <div class="log-detail-header">
                            <div class="log-detail-icon-wrap">
                                <span class="material-icons">${icon}</span>
                            </div>
                            <span class="log-detail-title">${escapeHtml(key)}</span>
                        </div>
                        ${diffContent}
                    </div>
                `;
                cardsCount++;
            });

            let bannerHtml = '';
            const actLower = String(log.action).toLowerCase();
            if (actLower.includes('aangemaakt') || actLower.includes('toegevoegd')) {
                bannerHtml = `
                    <div class="log-prod-banner">
                        <span class="material-icons">add_circle</span>
                        <span>Succesvol toegevoegd</span>
                    </div>
                `;
            } else if (actLower.includes('verwijderd')) {
                bannerHtml = `
                    <div class="log-prod-banner" style="border-color: var(--prod-danger-border);">
                        <span class="material-icons" style="color: var(--danger-color);">delete_outline</span>
                        <span>Item verwijderd</span>
                    </div>
                `;
            }

            detailsHtml = bannerHtml + cardsHtml;
        }
    }

    if (!detailsHtml) {
        detailsHtml = `<div class="empty-state" style="padding: 20px 0;">Geen detailgegevens beschikbaar voor deze actie.</div>`;
    }

    let affectedUserHtml = '';
    const aff = getAffectedDisplay(log.affected ?? log.affected_user, log.action);
    if (aff) {
        affectedUserHtml = `
            <div class="form-group">
                <label>Betrokken</label>
                <div class="user-cell">
                    <div class="user-avatar-sm">
                        <span class="material-icons">${aff.icon}</span>
                    </div>
                    <div class="user-info-stacked">
                        <span class="user-full-name">${escapeHtml(aff.title)}</span>
                        ${aff.sub ? `<span class="user-subname">${escapeHtml(aff.sub)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    showModal(`
        <div class="modal-header">
            <h2 class="modal-title">Log details</h2>
            <p class="modal-subtitle">${escapeHtml(displayName)} • ${escapeHtml(timeStr)}</p>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label>Actie</label>
                <div><span class="action-badge">${escapeHtml(action)}</span></div>
            </div>
            ${affectedUserHtml}
            <div class="form-group">
                <label>${newVal?.type === 'add_shift' || newVal?.type === 'update_shift' || newVal?.type === 'delete_shift' ? 'Gewijzigde Dienst & Taken' : (isProductivityLog ? 'Gefinaliseerde Productiviteiten' : 'Wijzigingen / Gegevens')}</label>
                <div class="log-details-list">
                    ${detailsHtml}
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="modal-btn-secondary" id="closeDetailsModalBtn">Sluiten</button>
        </div>
    `);

    const closeBtn = document.getElementById('closeDetailsModalBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
}

async function fetchLogsPage() {
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let matchingUserIds = [];
    const q = searchQuery.trim().toLowerCase();

    if (q) {
        for (const [userId, u] of usersMap.entries()) {
            const name = (u.full_name || '').toLowerCase();
            const uname = (u.username || '').toLowerCase();
            if (name.includes(q) || uname.includes(q)) {
                matchingUserIds.push(userId);
            }
        }
    }

    let query = supabase
        .from('logs')
        .select('*', { count: 'exact' });

    if (currentActionFilter && currentActionFilter !== 'all') {
        query = query.eq('action', currentActionFilter);
    }

    if (q) {
        const conditions = [`affected.ilike.%${q}%`];
        if (matchingUserIds.length > 0) {
            conditions.push(`user_id.in.(${matchingUserIds.join(',')})`);
            conditions.push(`affected.in.(${matchingUserIds.join(',')})`);
        }
        query = query.or(conditions.join(','));
    }

    query = query
        .order('happened_at', { ascending: sortAscending })
        .range(from, to);

    const { data, count, error } = await query;

    if (!error && data) {
        currentLogs = data;
        totalCount = count ?? 0;
    } else {
        currentLogs = [];
        totalCount = 0;
    }

    renderTable();
}

async function initActionFilter() {
    const { data } = await supabase.from('logs').select('action').limit(500);
    if (!data) return;

    const uniqueActions = Array.from(new Set(data.map(l => l.action).filter(Boolean))).sort();
    const actionFilterContainer = document.getElementById('actionFilterContainer');
    if (actionFilterContainer) {
        const selectOptions = [
            { value: 'all', label: 'Alle acties' },
            ...uniqueActions.map(act => ({ value: act, label: act }))
        ];
        createCustomSelect(actionFilterContainer, selectOptions, 'all', 'Filter op actie', (val) => {
            currentActionFilter = val;
            currentPage = 1;
            fetchLogsPage();
        });
    }
}

async function loadData() {
    const { data: users } = await supabase
        .from('user_data')
        .select('user_id, full_name, username');

    if (users) {
        usersMap = new Map(users.map(u => [u.user_id, u]));
    }

    await initActionFilter();
    await fetchLogsPage();
}

const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            currentPage = 1;
            fetchLogsPage();
        }, 300);
    });
}

const thTime = document.getElementById('thTime');
const sortTimeIcon = document.getElementById('sortTimeIcon');
if (thTime) {
    thTime.addEventListener('click', () => {
        sortAscending = !sortAscending;
        if (sortTimeIcon) {
            sortTimeIcon.textContent = sortAscending ? 'arrow_upward' : 'arrow_downward';
        }
        currentPage = 1;
        fetchLogsPage();
    });
}

const prevPageBtn = document.getElementById('prevPageBtn');
if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            fetchLogsPage();
        }
    });
}

const nextPageBtn = document.getElementById('nextPageBtn');
if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(totalCount / PAGE_SIZE);
        if (currentPage < totalPages) {
            currentPage++;
            fetchLogsPage();
        }
    });
}

const logsTableBody = document.getElementById('logsTableBody');
if (logsTableBody) {
    logsTableBody.addEventListener('click', (e) => {
        const viewBtn = e.target.closest('.view-details-btn');
        if (viewBtn) {
            const index = Number(viewBtn.getAttribute('data-index'));
            const log = currentLogs[index];
            if (log) {
                openDetailsModal(log);
            }
        }
    });
}

const logsCardsContainer = document.getElementById('logsCardsContainer');
if (logsCardsContainer) {
    logsCardsContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.log-list-item');
        if (item) {
            const index = Number(item.getAttribute('data-index'));
            const log = currentLogs[index];
            if (log) {
                openDetailsModal(log);
            }
        }
    });
}

loadData();
