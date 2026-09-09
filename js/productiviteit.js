import { supabase, showToast, escapeHtml, invokeFn } from './main.js';
import { formatDuration, timeToMinutes, getProductivityStatusClass, getProductivityStatusIcon } from './vulplanning/time-utils.js';
import { createCustomSelect } from './select.js';
import { createDatePicker, MONTH_NAMES, SHORT_MONTH_NAMES, parseDate } from './datepicker.js';
import { showModal, closeModal, showConfirmModal } from './modal.js';

let cachedProductivityEntries = [];
let currentChartMode = 'individual';
let currentTimeframe = '1m';
let currentShiftPage = 1;
const SHIFTS_PER_PAGE = 50;
let paginationControlsInitialized = false;
let selectedDateFilter = '';
let shiftsDatePicker = null;
let selectedScoreboardDate = '';
let topFillersDatePicker = null;
let currentUserId = null;
let currentUserRole = 1;
let ownUserData = null;
let selectedFillerUserId = null;
let selectedFillerUserData = null;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProductivityPage);
} else {
    initProductivityPage();
}

async function initProductivityPage() {
    const skeletonEl = document.getElementById('productivitySkeleton');
    const statsSkeletonEl = document.getElementById('productivityStatsSkeleton');
    const emptyEl = document.getElementById('productivityEmpty');
    const listEl = document.getElementById('productivityList');
    const statsEl = document.getElementById('productivitySummaryStats');
    const overviewRow = document.getElementById('productivityOverviewRow');

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
            if (skeletonEl) skeletonEl.style.display = 'none';
            if (statsSkeletonEl) statsSkeletonEl.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            if (overviewRow) overviewRow.classList.add('no-top-fillers');
            return;
        }

        currentUserId = session.user.id;

        const { data: userData, error } = await supabase
            .from('user_data')
            .select('user_id, username, full_name, productivity, role')
            .eq('user_id', session.user.id)
            .maybeSingle();

        if (error) {
            throw error;
        }

        currentUserRole = Number(userData?.role) || 1;
        ownUserData = userData;

        await loadTopFillers(session.user.id);

        if (skeletonEl) skeletonEl.style.display = 'none';
        if (statsSkeletonEl) statsSkeletonEl.style.display = 'none';
        if (statsEl) statsEl.style.display = 'flex';

        initChartControls();
        initPaginationControls();
        initShiftsDatePicker();

        applyUserProductivity(userData, true);

    } catch (err) {
        if (skeletonEl) skeletonEl.style.display = 'none';
        if (statsSkeletonEl) statsSkeletonEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'flex';
        if (overviewRow) overviewRow.classList.add('no-top-fillers');
        showToast('error', err.message || 'Kon productiviteitsgegevens niet ophalen');
    }
}

async function loadTopFillers(userId, date = selectedScoreboardDate) {
    const overviewRow = document.getElementById('productivityOverviewRow');
    const sectionEl = document.getElementById('topFillersSection');
    const listEl = document.getElementById('topFillersList');
    const userRankEl = document.getElementById('topFillerUserRank');
    const myShiftsSection = document.getElementById('myShiftsSection');
    const sectionDivider = document.getElementById('productivitySectionDivider');
    const filterWrapper = document.getElementById('topFillersDateFilterWrapper');
    const headingEl = document.getElementById('topFillersHeading');
    const subtextEl = document.getElementById('topFillersSubtext');
    if (!sectionEl || !listEl) return;

    if (date && listEl) {
        listEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <div class="skeleton" style="height: 52px; border-radius: 12px;"></div>
                <div class="skeleton" style="height: 52px; border-radius: 12px;"></div>
                <div class="skeleton" style="height: 52px; border-radius: 12px;"></div>
            </div>
        `;
    }

    try {
        const { data, error } = await supabase.functions.invoke('get-top-fillers', {
            body: date ? { date } : {}
        });

        const isManager = Boolean(data?.isManager) || currentUserRole === 2 || currentUserRole === 3;
        currentUserRole = isManager ? (currentUserRole > 1 ? currentUserRole : 2) : 1;

        if (filterWrapper) {
            filterWrapper.style.display = isManager ? 'flex' : 'none';
            if (isManager && !topFillersDatePicker) {
                initTopFillersDatePicker();
            }
        }

        if (error || !data || !Array.isArray(data.topFillers)) {
            if (!date) {
                sectionEl.style.display = 'none';
                if (userRankEl) userRankEl.style.display = 'none';
                if (sectionDivider) sectionDivider.style.display = 'none';
                if (overviewRow) overviewRow.classList.add('no-top-fillers');
                return;
            }
        }

        const topFillers = data?.topFillers || [];

        if (topFillers.length === 0 && !date) {
            sectionEl.style.display = 'none';
            if (userRankEl) userRankEl.style.display = 'none';
            if (sectionDivider) sectionDivider.style.display = 'none';
            if (overviewRow) overviewRow.classList.add('no-top-fillers');
            return;
        }

        if (overviewRow) overviewRow.classList.remove('no-top-fillers');

        if (headingEl) {
            if (date) {
                headingEl.textContent = 'Ranglijst';
            } else {
                headingEl.textContent = topFillers.length > 5 ? 'Ranglijst Vullers' : 'Top 5 Vullers';
            }
        }

        if (subtextEl) {
            if (date) {
                subtextEl.textContent = formatDate(date);
            } else {
                subtextEl.textContent = 'Laatste 10 shifts per persoon';
            }
        }

        if (topFillers.length === 0) {
            listEl.innerHTML = `
                <div class="top-fillers-empty">
                    <span class="material-icons">event_busy</span>
                    <span>Geen diensten gevonden op deze datum</span>
                </div>
            `;
            if (userRankEl) {
                userRankEl.innerHTML = '';
                userRankEl.style.display = 'none';
            }
        } else {
            renderTopFillers(topFillers, listEl, userId, isManager);

            const isInList = topFillers.some(f => f.user_id === userId);
            if (userRankEl) {
                if (!isInList && data.currentUserRanking && data.currentUserRanking.rank) {
                    userRankEl.innerHTML = '';
                    userRankEl.appendChild(createTopFillerCard(data.currentUserRanking, data.currentUserRanking.rank, true, isManager));
                    userRankEl.style.display = 'flex';
                } else {
                    userRankEl.innerHTML = '';
                    userRankEl.style.display = 'none';
                }
            }
        }

        sectionEl.style.display = 'flex';
        if (sectionDivider) {
            sectionDivider.style.display = (myShiftsSection && myShiftsSection.style.display !== 'none') ? 'block' : 'none';
        }
    } catch (_) {
        if (!date) {
            sectionEl.style.display = 'none';
            if (userRankEl) userRankEl.style.display = 'none';
            if (sectionDivider) sectionDivider.style.display = 'none';
            if (overviewRow) overviewRow.classList.add('no-top-fillers');
        }
    }
}

function createTopFillerCard(filler, rank, isCurrentUser, canClick) {
    const rawName = filler.full_name || filler.username || 'Medewerker';
    const name = escapeHtml(rawName);
    const avgProd = Math.round(Number(filler.average_productivity) || 0);
    const shiftCount = Number(filler.shifts_count) || 0;
    const statusClass = getProductivityStatusClass(avgProd);
    const statusIcon = getProductivityStatusIcon(avgProd);
    const initials = rawName.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'M';
    const rankIcon = rank === 1 ? 'workspace_premium' : (rank === 2 ? 'military_tech' : (rank === 3 ? 'stars' : ''));

    const activeUserId = selectedFillerUserId || currentUserId;
    const isViewed = filler.user_id === activeUserId;

    const card = document.createElement('div');
    card.className = `top-filler-card${isCurrentUser ? ' is-current-user' : ''}${isViewed ? ' is-viewed' : ''}${canClick ? ' is-clickable' : ''}${rank <= 3 ? ` podium-card rank-${rank}` : ''}`;
    card.dataset.userId = filler.user_id;
    if (canClick) {
        card.setAttribute('data-tooltip', isViewed ? (isCurrentUser ? 'Je bekijkt nu je eigen productiviteit' : 'Klik om terug te gaan naar je eigen productiviteit') : `Klik om de productiviteit van ${name} te bekijken`);
    }

    card.innerHTML = `
        <div class="top-filler-left">
            <div class="rank-badge${rank <= 3 ? ` rank-${rank}` : ''}">
                ${rankIcon ? `<span class="material-icons rank-medal-icon">${rankIcon}</span>` : ''}
                <span>#${rank}</span>
            </div>
            <div class="top-filler-avatar">${initials}</div>
            <div class="top-filler-info">
                <div class="top-filler-name-row">
                    <span class="top-filler-name" data-tooltip="${name}">${name}</span>
                    ${isCurrentUser ? '<span class="you-pill">Jij</span>' : ''}
                </div>
                <span class="top-filler-shifts">${shiftCount} ${shiftCount === 1 ? 'shift' : 'shifts'} afgerond</span>
            </div>
        </div>
        <span class="prod-badge ${statusClass}">
            <span class="material-icons">${statusIcon}</span>
            <span>${avgProd}%</span>
        </span>
    `;

    if (canClick) {
        card.addEventListener('click', () => handleFillerClick(filler));
    }

    return card;
}

function renderTopFillers(topFillers, container, userId, canClick) {
    container.innerHTML = '';

    topFillers.forEach((filler, index) => {
        const isCurrentUser = filler.user_id === userId;
        container.appendChild(createTopFillerCard(filler, index + 1, isCurrentUser, canClick));
    });
}

async function handleFillerClick(filler) {
    if (currentUserRole !== 2 && currentUserRole !== 3) return;

    if (selectedFillerUserId === filler.user_id || filler.user_id === currentUserId) {
        selectedFillerUserId = null;
        selectedFillerUserData = null;
        applyUserProductivity(ownUserData, true);
        updateTopFillerCardSelection();
        return;
    }

    try {
        const { data, error } = await supabase.functions.invoke('get-top-fillers', {
            body: { target_user_id: filler.user_id }
        });

        if (error) throw error;
        if (!data || !data.user) {
            throw new Error('Gegevens van medewerker niet ontvangen');
        }

        selectedFillerUserId = filler.user_id;
        selectedFillerUserData = data.user;
        applyUserProductivity(data.user, false);
        updateTopFillerCardSelection();
    } catch (err) {
        showToast('error', err.message || 'Kon productiviteit niet ophalen');
    }
}

function applyUserProductivity(user, isSelf) {
    const rawName = user?.full_name || user?.username || 'Medewerker';
    const name = escapeHtml(rawName);

    const chartTitleEl = document.getElementById('productivityChartTitle');
    const chartSubEl = document.getElementById('chartCardSubtitle');
    const shiftsHeadingEl = document.getElementById('myShiftsSectionHeading');
    const shiftsSubEl = document.getElementById('myShiftsSectionSubtext');
    const emptyEl = document.getElementById('productivityEmpty');
    const emptyTitleEl = document.getElementById('emptyTitle');
    const emptyTextEl = document.getElementById('emptyText');
    const chartCard = document.getElementById('productivityChartCard');
    const myShiftsSection = document.getElementById('myShiftsSection');
    const sectionDivider = document.getElementById('productivitySectionDivider');
    const topFillersSection = document.getElementById('topFillersSection');

    if (chartTitleEl) {
        chartTitleEl.textContent = isSelf ? 'Mijn Voortgang' : `Voortgang van ${name}`;
    }
    if (chartSubEl) {
        chartSubEl.textContent = isSelf
            ? 'Productiviteit per gewerkte shift'
            : `Productiviteit per gewerkte shift van ${name}`;
    }
    if (shiftsHeadingEl) {
        shiftsHeadingEl.textContent = isSelf ? 'Mijn Gewerkte Diensten' : `Gewerkte Diensten van ${name}`;
    }
    if (shiftsSubEl) {
        shiftsSubEl.textContent = isSelf
            ? 'Overzicht van al jouw afgeronde shifts en behaalde productiviteit'
            : `Overzicht van afgeronde shifts en behaalde productiviteit van ${name}`;
    }

    const entries = extractProductivities(user?.productivity);
    cachedProductivityEntries = entries || [];
    currentShiftPage = 1;
    selectedDateFilter = '';

    const clearDateBtn = document.getElementById('shiftsDateFilterClearBtn');
    if (clearDateBtn) clearDateBtn.style.display = 'none';
    if (shiftsDatePicker) shiftsDatePicker.setValue('');

    if (!entries || entries.length === 0) {
        if (emptyTitleEl) {
            emptyTitleEl.textContent = isSelf ? 'Geen productiviteitsgegevens gevonden' : 'Geen gegevens gevonden';
        }
        if (emptyTextEl) {
            emptyTextEl.textContent = isSelf
                ? 'Er zijn nog geen gefinaliseerde vulplanningen gekoppeld aan jouw account.'
                : `Er zijn nog geen gefinaliseerde vulplanningen gekoppeld aan ${name}.`;
        }
        if (emptyEl) emptyEl.style.display = 'flex';
        if (chartCard) chartCard.style.display = 'none';
        if (myShiftsSection) myShiftsSection.style.display = 'none';
        if (sectionDivider) sectionDivider.style.display = 'none';
    } else {
        if (emptyEl) emptyEl.style.display = 'none';
        if (chartCard) chartCard.style.display = 'flex';
        if (myShiftsSection) myShiftsSection.style.display = 'flex';
        if (sectionDivider) {
            sectionDivider.style.display = (topFillersSection && topFillersSection.style.display !== 'none') ? 'block' : 'none';
        }
        renderProductivityChart(cachedProductivityEntries);
        renderPaginatedProductivityList();
    }

    renderSummaryStats(cachedProductivityEntries);
}

function updateTopFillerCardSelection() {
    const activeUserId = selectedFillerUserId || currentUserId;
    const cards = document.querySelectorAll('.top-filler-card');
    cards.forEach(card => {
        const uId = card.dataset.userId;
        const isViewed = uId === activeUserId;
        if (isViewed) {
            card.classList.add('is-viewed');
        } else {
            card.classList.remove('is-viewed');
        }
        if (card.classList.contains('is-clickable')) {
            const rawName = card.querySelector('.top-filler-name')?.textContent || 'medewerker';
            const isSelf = uId === currentUserId;
            if (isViewed) {
                card.setAttribute('data-tooltip', isSelf ? 'Je bekijkt nu je eigen productiviteit' : 'Klik om terug te gaan naar je eigen productiviteit');
            } else {
                card.setAttribute('data-tooltip', isSelf ? 'Klik om je eigen productiviteit te bekijken' : `Klik om de productiviteit van ${rawName} te bekijken`);
            }
        }
    });
}

function extractProductivities(prodData) {
    if (!prodData) return [];
    const entries = [];
    const seen = new Set();

    const addEntry = (item) => {
        if (!item || typeof item !== 'object') return;
        const key = item.date ? String(item.date).trim() : `${item.finalized_at || ''}_${item.productivity !== undefined ? item.productivity : ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        entries.push(item);
    };

    if (Array.isArray(prodData)) {
        prodData.forEach(addEntry);
    } else if (typeof prodData === 'object') {
        if (Array.isArray(prodData.history)) {
            prodData.history.forEach(addEntry);
        }
        const { history, ...topLevel } = prodData;
        if (topLevel.date || topLevel.productivity !== undefined) {
            addEntry(topLevel);
        }
    }

    return entries.sort((a, b) => {
        const timeA = (parseDate(a.date || a.finalized_at) || new Date(0)).getTime();
        const timeB = (parseDate(b.date || b.finalized_at) || new Date(0)).getTime();
        return timeB - timeA;
    });
}

function formatDate(dateStr) {
    if (!dateStr) return 'Onbekende datum';
    const d = parseDate(dateStr);
    if (d && !isNaN(d.getTime())) {
        return d.toLocaleDateString('nl-NL', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    return dateStr;
}

function getTypeBadge(type) {
    const t = String(type || 'overige').toLowerCase();
    switch (t) {
        case 'vullen':
            return `<span class="task-badge-pill type-vullen"><span class="material-icons" style="font-size:12px;">inventory_2</span>Vullen</span>`;
        case 'spiegelen':
            return `<span class="task-badge-pill type-spiegelen"><span class="material-icons" style="font-size:12px;">auto_fix_high</span>Spiegelen</span>`;
        case 'restanten':
            return `<span class="task-badge-pill type-restanten"><span class="material-icons" style="font-size:12px;">layers</span>Restanten</span>`;
        case 'pauze':
            return `<span class="task-badge-pill type-pauze"><span class="material-icons" style="font-size:12px;">free_breakfast</span>Pauze</span>`;
        default:
            return `<span class="task-badge-pill type-overige"><span class="material-icons" style="font-size:12px;">assignment</span>Overige</span>`;
    }
}

function getTaskIcon(type) {
    const t = String(type || 'overige').toLowerCase();
    switch (t) {
        case 'vullen': return 'inventory_2';
        case 'spiegelen': return 'auto_fix_high';
        case 'restanten': return 'layers';
        case 'pauze': return 'free_breakfast';
        default: return 'assignment';
    }
}

let chartResizeBound = false;
let chartResizeTimer = null;

function handleChartResize() {
    clearTimeout(chartResizeTimer);
    chartResizeTimer = setTimeout(() => {
        renderProductivityChart(cachedProductivityEntries);
    }, 100);
}

function isIndividualModeAllowed(timeframe) {
    return timeframe === '1w' || timeframe === '2w' || timeframe === '1m';
}

function updateChartModeControls() {
    const btnIndividual = document.getElementById('chartModeIndividual');
    const btnAverage = document.getElementById('chartModeAverage');
    const isAllowed = isIndividualModeAllowed(currentTimeframe);

    if (btnIndividual) {
        btnIndividual.disabled = !isAllowed;
        btnIndividual.title = isAllowed ? '' : 'Alleen beschikbaar bij 1 week, 2 weken of 1 maand';
        if (!isAllowed && currentChartMode === 'individual') {
            currentChartMode = 'average';
        }
        btnIndividual.classList.toggle('active', currentChartMode === 'individual');
    }
    if (btnAverage) {
        btnAverage.classList.toggle('active', currentChartMode === 'average');
    }
}

function initChartControls() {
    if (!chartResizeBound) {
        chartResizeBound = true;
        window.addEventListener('resize', handleChartResize);
    }

    const btnIndividual = document.getElementById('chartModeIndividual');
    const btnAverage = document.getElementById('chartModeAverage');
    if (btnIndividual && btnAverage && !btnIndividual.dataset.bound) {
        btnIndividual.dataset.bound = 'true';
        btnIndividual.addEventListener('click', () => {
            if (!isIndividualModeAllowed(currentTimeframe)) return;
            if (currentChartMode === 'individual') return;
            currentChartMode = 'individual';
            btnIndividual.classList.add('active');
            btnAverage.classList.remove('active');
            renderProductivityChart(cachedProductivityEntries);
        });

        btnAverage.addEventListener('click', () => {
            if (currentChartMode === 'average') return;
            currentChartMode = 'average';
            btnAverage.classList.add('active');
            btnIndividual.classList.remove('active');
            renderProductivityChart(cachedProductivityEntries);
        });
    }

    updateChartModeControls();

    const selectContainer = document.getElementById('chartTimeframeSelectContainer');
    if (selectContainer && !selectContainer.hasChildNodes()) {
        const timeframeOptions = [
            { value: 'all', label: 'Altijd' },
            { value: '1y', label: 'Laatste jaar' },
            { value: '6m', label: 'Laatste 6 maanden' },
            { value: '1m', label: 'Laatste maand' },
            { value: '2w', label: '2 weken' },
            { value: '1w', label: 'Een week' }
        ];

        createCustomSelect(
            selectContainer,
            timeframeOptions,
            currentTimeframe,
            'Periode...',
            (newVal) => {
                if (newVal === currentTimeframe) return;
                currentTimeframe = newVal;
                updateChartModeControls();
                renderProductivityChart(cachedProductivityEntries);
            }
        );
    }
}

function renderProductivityChart(entries) {
    const container = document.getElementById('productivityChartContainer');
    if (!container) return;

    updateChartModeControls();

    if (window.ResizeObserver && !container._chartObserver) {
        let lastObservedWidth = 0;
        const ro = new ResizeObserver(roEntries => {
            for (const entry of roEntries) {
                const w = Math.floor(entry.contentRect.width);
                if (w > 0 && w !== lastObservedWidth) {
                    lastObservedWidth = w;
                    handleChartResize();
                }
            }
        });
        ro.observe(container);
        container._chartObserver = ro;
    }



    if (!entries || entries.length === 0) {
        container.innerHTML = `
            <div class="chart-empty-msg">
                <span class="material-icons">info</span>
                <span>Nog geen gewerkte diensten om een voortgangsgrafiek weer te geven.</span>
            </div>
        `;
        return;
    }

    const chronological = [...entries].sort((a, b) => {
        const timeA = (parseDate(a.date || a.finalized_at) || new Date(0)).getTime();
        const timeB = (parseDate(b.date || b.finalized_at) || new Date(0)).getTime();
        return timeA - timeB;
    });

    const enriched = chronological.map((e, idx) => {
        const rawP = Math.round(Number(e.productivity) || 0);
        const windowSlice = chronological.slice(Math.max(0, idx - 9), idx + 1);
        const windowProdList = windowSlice
            .map(item => Number(item.productivity))
            .filter(val => !isNaN(val));
        const windowAvg = windowProdList.length > 0
            ? Math.round(windowProdList.reduce((sum, val) => sum + val, 0) / windowProdList.length)
            : rawP;

        const dObj = parseDate(e.date || e.finalized_at) || new Date(0);
        let dateLabel = '';
        if (!isNaN(dObj.getTime())) {
            dateLabel = dObj.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
        }

        const timestamp = dObj.getTime() || 0;

        return {
            timestamp,
            dateObj: dObj,
            rawPercent: rawP,
            avgPercent: windowAvg,
            windowSize: windowProdList.length,
            dateLabel,
            colli: Number(e.total_colli) || 0
        };
    });

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    let cutoff = 0;
    if (currentTimeframe === '1w') cutoff = now - 7 * dayMs;
    else if (currentTimeframe === '2w') cutoff = now - 14 * dayMs;
    else if (currentTimeframe === '1m') cutoff = now - 31 * dayMs;
    else if (currentTimeframe === '6m') cutoff = now - 183 * dayMs;
    else if (currentTimeframe === '1y') cutoff = now - 365 * dayMs;

    const filtered = cutoff > 0 ? enriched.filter(e => e.timestamp >= cutoff) : enriched;

    const isMonthView = ['6m', '1y', 'all'].includes(currentTimeframe);

    const subtitleEl = document.getElementById('chartCardSubtitle');
    if (subtitleEl) {
        if (isMonthView) {
            subtitleEl.textContent = currentChartMode === 'average'
                ? 'Gemiddelde productiviteit per maand'
                : 'Productiviteit per maand';
        } else if (filtered.length > 12) {
            subtitleEl.textContent = currentChartMode === 'average'
                ? 'Gemiddelde trend per periode'
                : 'Productiviteit per periode';
        } else {
            subtitleEl.textContent = currentChartMode === 'average'
                ? 'Gemiddelde van de laatste 10 shifts per punt'
                : 'Productiviteit per gewerkte shift';
        }
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="chart-empty-msg">
                <span class="material-icons">info</span>
                <span>Geen diensten gevonden binnen de geselecteerde periode.</span>
            </div>
        `;
        return;
    }

    const maxPoints = 12;
    let dataPoints = [];

    if (isMonthView) {
        const monthMap = new Map();
        filtered.forEach(e => {
            const d = e.dateObj;
            if (!d || isNaN(d.getTime())) return;
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            if (!monthMap.has(key)) {
                monthMap.set(key, {
                    year: d.getFullYear(),
                    month: d.getMonth(),
                    items: []
                });
            }
            monthMap.get(key).items.push(e);
        });

        const monthGroups = Array.from(monthMap.values()).map(g => {
            const avgRaw = Math.round(g.items.reduce((sum, c) => sum + c.rawPercent, 0) / g.items.length);
            const avgRoll = Math.round(g.items.reduce((sum, c) => sum + c.avgPercent, 0) / g.items.length);
            const totalColli = g.items.reduce((sum, c) => sum + c.colli, 0);
            const percent = currentChartMode === 'average' ? avgRoll : avgRaw;
            return {
                timestamp: new Date(g.year, g.month, 1).getTime(),
                rawPercent: avgRaw,
                avgPercent: avgRoll,
                percent,
                windowSize: g.items.length,
                dateLabel: SHORT_MONTH_NAMES[g.month] || '',
                fullDateLabel: `${MONTH_NAMES[g.month]} ${g.year}`,
                colli: totalColli,
                statusClass: getProductivityStatusClass(percent)
            };
        });

        if (monthGroups.length <= maxPoints) {
            dataPoints = monthGroups;
        } else {
            const step = (monthGroups.length - 1) / (maxPoints - 1);
            for (let b = 0; b < maxPoints; b++) {
                const centerIdx = Math.round(b * step);
                const start = Math.max(0, Math.floor(b * (monthGroups.length / maxPoints)));
                const end = Math.min(monthGroups.length, Math.floor((b + 1) * (monthGroups.length / maxPoints)));
                const chunk = monthGroups.slice(start, end);
                const items = chunk.length > 0 ? chunk : [monthGroups[centerIdx]];
                const avgRaw = Math.round(items.reduce((sum, c) => sum + c.rawPercent, 0) / items.length);
                const avgRoll = Math.round(items.reduce((sum, c) => sum + c.avgPercent, 0) / items.length);
                const totalColli = items.reduce((sum, c) => sum + c.colli, 0);
                const repItem = monthGroups[centerIdx];
                const percent = currentChartMode === 'average' ? avgRoll : avgRaw;

                dataPoints.push({
                    timestamp: repItem.timestamp,
                    rawPercent: avgRaw,
                    avgPercent: avgRoll,
                    percent,
                    windowSize: items.reduce((sum, c) => sum + c.windowSize, 0),
                    dateLabel: repItem.dateLabel,
                    fullDateLabel: repItem.fullDateLabel,
                    colli: totalColli,
                    statusClass: getProductivityStatusClass(percent)
                });
            }
        }
    } else {
        if (filtered.length <= maxPoints) {
            dataPoints = filtered.map(e => {
                const percent = currentChartMode === 'average' ? e.avgPercent : e.rawPercent;
                return {
                    ...e,
                    windowSize: currentChartMode === 'individual' ? 1 : e.windowSize,
                    percent,
                    statusClass: getProductivityStatusClass(percent)
                };
            });
        } else {
            const bucketSize = filtered.length / maxPoints;
            for (let b = 0; b < maxPoints; b++) {
                const start = Math.floor(b * bucketSize);
                const end = Math.min(filtered.length, Math.floor((b + 1) * bucketSize));
                const chunk = filtered.slice(start, end);
                if (chunk.length === 0) continue;

                const avgRaw = Math.round(chunk.reduce((sum, c) => sum + c.rawPercent, 0) / chunk.length);
                const avgRoll = Math.round(chunk.reduce((sum, c) => sum + c.avgPercent, 0) / chunk.length);
                const totalColli = chunk.reduce((sum, c) => sum + c.colli, 0);

                const repItem = b === 0 ? chunk[0] : (b === maxPoints - 1 ? chunk[chunk.length - 1] : chunk[Math.floor(chunk.length / 2)]);
                const percent = currentChartMode === 'average' ? avgRoll : avgRaw;

                dataPoints.push({
                    timestamp: repItem.timestamp,
                    rawPercent: avgRaw,
                    avgPercent: avgRoll,
                    percent,
                    windowSize: chunk.length,
                    dateLabel: repItem.dateLabel,
                    colli: totalColli,
                    statusClass: getProductivityStatusClass(percent)
                });
            }
        }
    }

    const width = Math.max(300, Math.floor(container.clientWidth || 600));
    const height = 240;
    const padLeft = 46;
    const padRight = 32;
    const padTop = 32;
    const padBottom = 42;
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    const maxVal = Math.max(120, Math.ceil((Math.max(...dataPoints.map(d => d.percent)) + 10) / 10) * 10);
    const minVal = 0;

    const getY = (val) => padTop + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;
    const getX = (index) => {
        if (dataPoints.length === 1) return padLeft + chartW / 2;
        return padLeft + (index / (dataPoints.length - 1)) * chartW;
    };

    const targetY = getY(100);
    const midY = getY(50);
    const zeroY = getY(0);

    const coords = dataPoints.map((d, i) => ({
        x: getX(i),
        y: getY(d.percent),
        ...d
    }));

    const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const areaD = `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} ${zeroY.toFixed(1)} L ${coords[0].x.toFixed(1)} ${zeroY.toFixed(1)} Z`;

    const statusColors = {
        success: 'var(--accent-color)',
        yellow: 'var(--yellow-color)',
        orange: 'var(--warning-color)',
        danger: 'var(--danger-color)'
    };

    const circlesSvg = coords.map((c) => {
        const dotColor = statusColors[c.statusClass] || 'var(--accent-color)';
        const labelText = c.fullDateLabel || c.dateLabel;
        const titleText = isMonthView
            ? `${escapeHtml(labelText)}: ${c.percent}% (${c.windowSize} ${c.windowSize === 1 ? 'shift' : 'shifts'}${c.colli > 0 ? `, ${c.colli.toLocaleString('nl-NL')} colli` : ''})`
            : (c.windowSize > 1
                ? `${escapeHtml(c.dateLabel)}: ${c.percent}% (gemiddeld over ${c.windowSize} shifts)`
                : (currentChartMode === 'average'
                    ? `${escapeHtml(c.dateLabel)}: ${c.percent}% (gemiddelde over ${c.windowSize} ${c.windowSize === 1 ? 'shift' : 'shifts'})`
                    : `${escapeHtml(c.dateLabel)}: ${c.percent}%${c.colli > 0 ? ` (${c.colli.toLocaleString('nl-NL')} colli)` : ''}`));

        return `
            <g class="chart-point-group" data-tooltip="${titleText}">
                <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="5" fill="var(--card-background)" stroke="${dotColor}" stroke-width="3" data-tooltip="${titleText}"></circle>
                <text x="${c.x.toFixed(1)}" y="${(c.y - 10).toFixed(1)}" text-anchor="middle" fill="var(--text-color)" font-size="11" font-weight="700">
                    ${c.percent}%
                </text>
                <text x="${c.x.toFixed(1)}" y="${(padTop + chartH + 20).toFixed(1)}" text-anchor="middle" fill="var(--text-color-muted)" font-size="10.5">
                    ${escapeHtml(c.dateLabel)}
                </text>
            </g>
        `;
    }).join('');

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" class="productivity-svg-chart">
            <defs>
                <linearGradient id="prodChartAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--accent-color)" stop-opacity="0.28"/>
                    <stop offset="100%" stop-color="var(--chart-area-stop)" stop-opacity="0.0"/>
                </linearGradient>
            </defs>

            <line x1="${padLeft}" y1="${zeroY.toFixed(1)}" x2="${width - padRight}" y2="${zeroY.toFixed(1)}" stroke="var(--chart-grid-line)" stroke-width="1"/>
            <text x="${padLeft - 8}" y="${(zeroY + 4).toFixed(1)}" text-anchor="end" fill="var(--text-color-muted)" font-size="10">0%</text>

            <line x1="${padLeft}" y1="${midY.toFixed(1)}" x2="${width - padRight}" y2="${midY.toFixed(1)}" stroke="var(--chart-grid-line)" stroke-width="1" stroke-dasharray="3,3"/>
            <text x="${padLeft - 8}" y="${(midY + 4).toFixed(1)}" text-anchor="end" fill="var(--text-color-muted)" font-size="10">50%</text>

            <line x1="${padLeft}" y1="${targetY.toFixed(1)}" x2="${width - padRight}" y2="${targetY.toFixed(1)}" stroke="var(--chart-target-line)" stroke-width="1.5" stroke-dasharray="5,4"/>
            <text x="${padLeft - 8}" y="${(targetY + 4).toFixed(1)}" text-anchor="end" fill="var(--accent-color)" font-size="10.5" font-weight="700">100%</text>

            <path d="${areaD}" fill="url(#prodChartAreaGrad)"/>
            <path d="${pathD}" fill="none" stroke="var(--accent-color)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>

            ${circlesSvg}
        </svg>
    `;
}

function renderSummaryStats(entries) {
    const avgEl = document.getElementById('statAvgProd');
    const colliEl = document.getElementById('statTotalColli');
    const daysEl = document.getElementById('statTotalDays');

    let totalProd = 0;
    let prodCount = 0;
    let totalColli = 0;

    entries.forEach(e => {
        if (e.productivity !== undefined && e.productivity !== null && !isNaN(Number(e.productivity))) {
            totalProd += Number(e.productivity);
            prodCount++;
        }
        if (e.total_colli && Number(e.total_colli) > 0) {
            totalColli += Number(e.total_colli);
        } else if (Array.isArray(e.tasks)) {
            e.tasks.forEach(t => {
                if (t.colli && Number(t.colli) > 0) {
                    totalColli += Number(t.colli);
                }
            });
        }
    });

    if (avgEl) {
        const avg = prodCount > 0 ? Math.round(totalProd / prodCount) : null;
        avgEl.textContent = avg !== null ? `${avg}%` : '-';
    }

    if (colliEl) {
        colliEl.textContent = totalColli.toLocaleString('nl-NL');
    }

    if (daysEl) {
        daysEl.textContent = entries.length;
    }
}

function renderProductivityList(entries, container) {
    container.innerHTML = '';

    const canManageShifts = currentUserRole === 3 && (Boolean(selectedFillerUserId) || selectedFillerUserId === null);

    if (!entries || entries.length === 0) {
        container.innerHTML = `
            <div style="padding: 40px 20px; text-align: center; color: var(--text-color-muted); background-color: var(--card-background); border: 1px solid var(--card-border); border-radius: 14px; width: 100%;">
                <span class="material-icons" style="font-size: 32px; margin-bottom: 8px; display: block; color: var(--text-color-placeholder);">event_busy</span>
                <span>Geen shifts gevonden voor de geselecteerde datum.</span>
            </div>
        `;
        return;
    }

    entries.forEach((entry, index) => {
        const card = document.createElement('div');
        card.className = 'productivity-day-card';

        const percent = entry.productivity !== undefined ? Math.round(Number(entry.productivity)) : null;
        const statusClass = percent !== null ? getProductivityStatusClass(percent) : 'danger';
        const statusIcon = percent !== null ? getProductivityStatusIcon(percent) : 'trending_down';

        const shift = entry.shift || {};
        const startTime = shift.start || '';
        const endTime = shift.actual_end || shift.planned_end || '';
        const pauseMinutes = Number(shift.pause_minutes) || 0;
        const workMinutes = Number(entry.total_work_minutes) || 0;

        let totalColli = Number(entry.total_colli) || 0;
        const tasks = Array.isArray(entry.tasks) ? entry.tasks : [];

        if (totalColli === 0 && tasks.length > 0) {
            tasks.forEach(t => {
                if (t.colli && Number(t.colli) > 0) {
                    totalColli += Number(t.colli);
                }
            });
        }

        const dateStr = formatDate(entry.date || entry.finalized_at);

        let pillsHtml = '';
        if (startTime && endTime) {
            pillsHtml += `
                <span class="day-meta-pill">
                    <span class="material-icons">schedule</span>
                    <span>${escapeHtml(startTime)} - ${escapeHtml(endTime)}</span>
                </span>
            `;
        }
        if (workMinutes > 0) {
            pillsHtml += `
                <span class="day-meta-pill">
                    <span class="material-icons">timer</span>
                    <span>${formatDuration(workMinutes)} gewerkt</span>
                </span>
            `;
        }
        if (totalColli > 0) {
            pillsHtml += `
                <span class="day-meta-pill">
                    <span class="material-icons">inventory_2</span>
                    <span>${totalColli} colli</span>
                </span>
            `;
        }
        if (pauseMinutes > 0) {
            pillsHtml += `
                <span class="day-meta-pill">
                    <span class="material-icons">free_breakfast</span>
                    <span>${pauseMinutes}m pauze</span>
                </span>
            `;
        }

        let tasksHtml = '';
        if (tasks.length > 0) {
            const taskCards = tasks.map((task, tIndex) => {
                const title = escapeHtml(task.title || task.pathName || task.name || 'Taak');
                const type = task.type || 'overige';
                const colli = Number(task.colli) || 0;
                let dur = Number(task.duration_minutes) || Number(task.duration) || 0;
                const sTime = task.start_time || task.start || '';
                const eTime = task.end_time || task.end || '';

                if (dur <= 0 && sTime && eTime) {
                    const startM = timeToMinutes(sTime);
                    let endM = timeToMinutes(eTime);
                    if (endM < startM) endM += 24 * 60;
                    dur = Math.max(0, endM - startM);
                }

                let timeHtml = '';
                if (sTime && eTime) {
                    timeHtml = `
                        <span class="day-task-time">
                            <span class="material-icons">schedule</span>
                            <span>${escapeHtml(sTime)} - ${escapeHtml(eTime)}${dur > 0 ? ` (${formatDuration(dur)})` : ''}</span>
                        </span>
                    `;
                } else if (sTime) {
                    timeHtml = `
                        <span class="day-task-time">
                            <span class="material-icons">schedule</span>
                            <span>Vanaf ${escapeHtml(sTime)}</span>
                        </span>
                    `;
                } else if (dur > 0) {
                    timeHtml = `
                        <span class="day-task-time">
                            <span class="material-icons">schedule</span>
                            <span>${formatDuration(dur)}</span>
                        </span>
                    `;
                }

                let colliHtml = '';
                if (colli > 0) {
                    colliHtml = `
                        <span class="day-task-colli">
                            <span class="material-icons">inventory_2</span>
                            <span>${colli} colli</span>
                        </span>
                    `;
                }

                let metaBottom = `${timeHtml}${colliHtml}`;

                return `
                    <div class="day-task-card" data-task-index="${tIndex}">
                        <div class="day-task-top">
                            <div class="day-task-name-group">
                                <div class="day-task-icon-box">
                                    <span class="material-icons day-task-icon">${getTaskIcon(type)}</span>
                                </div>
                                <span class="day-task-name" data-tooltip="${title}">${title}</span>
                            </div>
                            <div class="day-task-top-right">
                                ${getTypeBadge(type)}
                            </div>
                        </div>
                        ${metaBottom ? `<div class="day-task-bottom">${metaBottom}</div>` : ''}
                    </div>
                `;
            }).join('');

            tasksHtml = `
                <div class="day-tasks-grid">
                    ${taskCards}
                </div>
            `;
        } else {
            tasksHtml = `<div class="day-tasks-empty"><span class="material-icons" style="font-size:18px;">info</span><span>Geen afzonderlijke paden geregistreerd voor deze shift.</span></div>`;
        }

        card.innerHTML = `
            <div class="day-card-header">
                <div class="day-card-header-left">
                    <div class="day-date-row">
                        <div class="day-date-icon-box">
                            <span class="material-icons day-date-icon">event</span>
                        </div>
                        <span class="day-date-text">${escapeHtml(dateStr)}</span>
                    </div>
                    <div class="day-meta-pills">
                        ${pillsHtml}
                    </div>
                </div>
                <div class="day-card-header-right">
                    ${percent !== null ? `
                        <span class="prod-badge ${statusClass}">
                            <span class="material-icons">${statusIcon}</span>
                            <span>${percent}%</span>
                        </span>
                    ` : ''}
                    ${canManageShifts ? `
                        <div class="day-card-actions">
                            <button type="button" class="action-btn edit-shift-btn" title="Dienst aanpassen">
                                <span class="material-icons">edit</span>
                            </button>
                            <button type="button" class="action-btn delete-shift-btn" title="Dienst verwijderen">
                                <span class="material-icons">delete</span>
                            </button>
                        </div>
                    ` : ''}
                    <span class="material-icons day-card-chevron">expand_more</span>
                </div>
            </div>
            <div class="day-card-body">
                <div class="day-tasks-title-row">
                    <span class="day-tasks-heading">
                        <span class="material-icons">route</span>
                        <span>Uitgevoerde paden & taken</span>
                    </span>
                    <span class="day-tasks-count">${tasks.length} ${tasks.length === 1 ? 'pad / taak' : 'paden / taken'}</span>
                </div>
                ${tasksHtml}
            </div>
        `;

        if (canManageShifts) {
            const editBtn = card.querySelector('.edit-shift-btn');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEditShiftModal(entry);
                });
            }
            const deleteBtn = card.querySelector('.delete-shift-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleDeleteShift(entry);
                });
            }
        }

        const headerEl = card.querySelector('.day-card-header');
        if (headerEl) {
            headerEl.addEventListener('click', () => {
                card.classList.toggle('collapsed');
            });
        }

        if (window.innerWidth <= 768) {
            card.classList.add('collapsed');
        }

        container.appendChild(card);
    });
}

function getFilteredShiftEntries() {
    if (!selectedDateFilter) return cachedProductivityEntries;
    return cachedProductivityEntries.filter(entry => {
        const itemDate = (entry.date || entry.finalized_at || '').split('T')[0];
        return itemDate === selectedDateFilter;
    });
}

function renderPaginatedProductivityList() {
    const listEl = document.getElementById('productivityList');
    const paginationEl = document.getElementById('productivityPagination');
    const infoEl = document.getElementById('productivityPaginationInfo');
    const currentEl = document.getElementById('productivityPaginationCurrent');
    const prevBtn = document.getElementById('productivityPrevPageBtn');
    const nextBtn = document.getElementById('productivityNextPageBtn');

    if (!listEl) return;

    const filteredEntries = getFilteredShiftEntries();
    const totalCount = filteredEntries.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / SHIFTS_PER_PAGE));

    if (currentShiftPage > totalPages) currentShiftPage = totalPages;
    if (currentShiftPage < 1) currentShiftPage = 1;

    const startIndex = (currentShiftPage - 1) * SHIFTS_PER_PAGE;
    const endIndex = Math.min(startIndex + SHIFTS_PER_PAGE, totalCount);
    const pageEntries = filteredEntries.slice(startIndex, endIndex);

    renderProductivityList(pageEntries, listEl);

    if (paginationEl) {
        paginationEl.style.display = totalCount > SHIFTS_PER_PAGE ? 'flex' : 'none';
    }

    if (infoEl) {
        if (totalCount === 0) {
            infoEl.textContent = '0 shifts';
        } else {
            infoEl.textContent = `${startIndex + 1}-${endIndex} van ${totalCount} shifts`;
        }
    }

    if (currentEl) {
        currentEl.textContent = `Pagina ${currentShiftPage} van ${totalPages}`;
    }

    if (prevBtn) prevBtn.disabled = currentShiftPage <= 1;
    if (nextBtn) nextBtn.disabled = currentShiftPage >= totalPages;
}

function bindDateFilter(containerId, clearBtnId, onSelect, onClear) {
    const container = document.getElementById(containerId);
    const clearBtn = document.getElementById(clearBtnId);
    if (!container || container.hasChildNodes()) return null;

    const picker = createDatePicker(container, '', (val) => {
        const dateVal = val || '';
        if (clearBtn) {
            clearBtn.style.display = dateVal ? 'inline-flex' : 'none';
        }
        onSelect(dateVal);
    });

    if (clearBtn && !clearBtn.dataset.bound) {
        clearBtn.dataset.bound = 'true';
        clearBtn.addEventListener('click', () => {
            if (picker) picker.setValue('');
            clearBtn.style.display = 'none';
            onClear();
        });
    }

    return picker;
}

function initShiftsDatePicker() {
    shiftsDatePicker = bindDateFilter(
        'shiftsDatePickerContainer',
        'shiftsDateFilterClearBtn',
        (val) => {
            selectedDateFilter = val;
            currentShiftPage = 1;
            renderPaginatedProductivityList();
        },
        () => {
            selectedDateFilter = '';
            currentShiftPage = 1;
            renderPaginatedProductivityList();
        }
    );
}

function initTopFillersDatePicker() {
    topFillersDatePicker = bindDateFilter(
        'topFillersDatePickerContainer',
        'topFillersDateFilterClearBtn',
        async (val) => {
            selectedScoreboardDate = val;
            await loadTopFillers(currentUserId, selectedScoreboardDate);
        },
        async () => {
            selectedScoreboardDate = '';
            await loadTopFillers(currentUserId, '');
        }
    );
}

function initPaginationControls() {
    if (paginationControlsInitialized) return;
    paginationControlsInitialized = true;

    const prevBtn = document.getElementById('productivityPrevPageBtn');
    const nextBtn = document.getElementById('productivityNextPageBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentShiftPage > 1) {
                currentShiftPage--;
                renderPaginatedProductivityList();
                document.getElementById('myShiftsSection')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const filteredEntries = getFilteredShiftEntries();
            const totalPages = Math.ceil(filteredEntries.length / SHIFTS_PER_PAGE);
            if (currentShiftPage < totalPages) {
                currentShiftPage++;
                renderPaginatedProductivityList();
                document.getElementById('myShiftsSection')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }
}

async function handleDeleteShift(entry) {
    if (currentUserRole !== 3) return;
    const targetUserId = selectedFillerUserId || currentUserId;

    const dateLabel = formatDate(entry.date || entry.finalized_at);
    const confirmed = await showConfirmModal({
        title: 'Dienst verwijderen',
        message: `Weet je zeker dat je de dienst van ${escapeHtml(dateLabel)} wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`,
        confirmText: 'Verwijderen',
        cancelText: 'Annuleren',
        isDanger: true
    });

    if (!confirmed) return;

    try {
        const data = await invokeFn('manage-productivity', {
            body: {
                action: 'delete_shift',
                target_user_id: targetUserId,
                shift_date: entry.date,
                original_finalized_at: entry.finalized_at
            }
        });

        showToast('notification', 'Dienst succesvol verwijderd');

        if (data?.user) {
            selectedFillerUserData = data.user;
            applyUserProductivity(data.user, false);
        }

        await loadTopFillers(currentUserId, selectedScoreboardDate);
    } catch (err) {
        showToast('error', err.message || 'Kon dienst niet verwijderen');
    }
}

async function openEditShiftModal(entry) {
    if (currentUserRole !== 3) return;
    const targetUserId = selectedFillerUserId || currentUserId;

    const shift = entry.shift || {};
    const startTime = shift.start || '';
    const endTime = shift.actual_end || shift.planned_end || '';
    const pauseMinutes = Number(shift.pause_minutes) || 0;
    const totalColli = Number(entry.total_colli) || 0;
    const percent = entry.productivity !== undefined ? Math.round(Number(entry.productivity)) : 100;
    const targetName = selectedFillerUserData?.full_name || selectedFillerUserData?.username || 'Medewerker';

    const modalTasks = Array.isArray(entry.tasks) ? JSON.parse(JSON.stringify(entry.tasks)) : [];

    const overlay = await showModal(`
        <div class="modal-header">
            <h2 class="modal-title">Dienst bewerken</h2>
            <p class="modal-subtitle">Dienst van ${escapeHtml(targetName)} aanpassen</p>
        </div>
        <form class="modal-form" id="editShiftForm">
            <div class="modal-form-row">
                <div class="form-group">
                    <label>Datum</label>
                    <div id="editShiftDatePickerContainer"></div>
                </div>
                <div class="form-group">
                    <label for="editShiftProd">Productiviteit (%)</label>
                    <input type="number" id="editShiftProd" class="modal-input" value="${percent}" min="0" max="500" required>
                </div>
            </div>
            <div class="modal-form-row">
                <div class="form-group">
                    <label for="editShiftStart">Starttijd</label>
                    <input type="time" id="editShiftStart" class="modal-input" value="${escapeHtml(startTime)}">
                </div>
                <div class="form-group">
                    <label for="editShiftEnd">Eindtijd</label>
                    <input type="time" id="editShiftEnd" class="modal-input" value="${escapeHtml(endTime)}">
                </div>
            </div>
            <div class="modal-form-row">
                <div class="form-group">
                    <label for="editShiftPause">Pauze (minuten)</label>
                    <input type="number" id="editShiftPause" class="modal-input" value="${pauseMinutes}" min="0">
                </div>
                <div class="form-group">
                    <label for="editShiftColli">Totaal colli</label>
                    <input type="number" id="editShiftColli" class="modal-input" value="${totalColli}" min="0">
                </div>
            </div>

            <div class="modal-tasks-section">
                <div class="modal-tasks-header">
                    <label>Uitgevoerde paden & taken (<span id="modalTasksCount">${modalTasks.length}</span>)</label>
                    <button type="button" class="btn btn-secondary" id="modalAddTaskBtn" style="padding: 4px 10px; font-size: 12px;">
                        <span class="material-icons" style="font-size: 16px;">add</span>
                        <span>Taak toevoegen</span>
                    </button>
                </div>
                <div class="modal-tasks-list" id="modalTasksList"></div>
            </div>

            <div class="modal-footer">
                <button type="button" class="modal-btn-danger" id="deleteShiftModalBtn">
                    <span class="material-icons">delete</span>
                    <span>Verwijderen</span>
                </button>
                <button type="button" class="modal-btn-secondary" id="cancelEditShiftBtn">Annuleren</button>
                <button type="submit" class="btn" id="saveEditShiftBtn">Opslaan</button>
            </div>
        </form>
    `, 'modal-wide');

    const dateContainer = overlay.querySelector('#editShiftDatePickerContainer');
    let shiftDatePicker = null;
    if (dateContainer) {
        shiftDatePicker = createDatePicker(dateContainer, entry.date || '');
    }

    const tasksListEl = overlay.querySelector('#modalTasksList');
    const tasksCountEl = overlay.querySelector('#modalTasksCount');
    const addTaskBtn = overlay.querySelector('#modalAddTaskBtn');
    const totalColliInput = overlay.querySelector('#editShiftColli');

    function syncInputsToModalTasks() {
        if (!tasksListEl) return;
        const items = tasksListEl.querySelectorAll('.modal-task-item');
        items.forEach((itemEl, idx) => {
            if (!modalTasks[idx]) return;
            const titleInput = itemEl.querySelector('.task-title-input');
            const typeSelect = itemEl.querySelector('.task-type-select-native');
            const startInput = itemEl.querySelector('.task-start-input');
            const endInput = itemEl.querySelector('.task-end-input');
            const colliInput = itemEl.querySelector('.task-colli-input');
            const durInput = itemEl.querySelector('.task-dur-input');

            const isPauze = (modalTasks[idx].type === 'pauze');
            if (titleInput) modalTasks[idx].title = isPauze ? 'Pauze' : titleInput.value.trim();
            if (typeSelect) modalTasks[idx].type = typeSelect.value;
            if (startInput) modalTasks[idx].start_time = startInput.value;
            if (endInput) modalTasks[idx].end_time = endInput.value;
            if (colliInput) {
                const isVullen = (modalTasks[idx].type === 'vullen');
                modalTasks[idx].colli = isVullen ? (Number(colliInput.value) || 0) : 0;
            }
            if (durInput) modalTasks[idx].duration_minutes = Number(durInput.value) || 0;
        });
    }

    function updateTotalColliFromTasks() {
        if (!totalColliInput) return;
        const sum = modalTasks.reduce((acc, t) => acc + (t.type === 'vullen' ? (Number(t.colli) || 0) : 0), 0);
        if (sum > 0) {
            totalColliInput.value = sum;
        }
    }

    function renderModalTasks() {
        if (!tasksListEl) return;
        if (tasksCountEl) tasksCountEl.textContent = modalTasks.length;

        if (modalTasks.length === 0) {
            tasksListEl.innerHTML = `
                <div class="modal-tasks-empty">
                    <span class="material-icons" style="font-size: 20px; display: block; margin-bottom: 4px;">info</span>
                    Geen paden of taken geregistreerd
                </div>
            `;
            return;
        }

        tasksListEl.innerHTML = modalTasks.map((t, idx) => {
            const type = t.type || 'overige';
            const isPauze = (type === 'pauze');
            const title = escapeHtml(isPauze ? 'Pauze' : (t.title || t.pathName || t.name || ''));
            const sTime = escapeHtml(t.start_time || t.start || '');
            const eTime = escapeHtml(t.end_time || t.end || '');
            const isVullen = (type === 'vullen');
            const colli = isVullen ? (Number(t.colli) || 0) : 0;
            const dur = Number(t.duration_minutes) || Number(t.duration) || 0;

            return `
                <div class="modal-task-item" data-idx="${idx}">
                    <div class="modal-task-item-top">
                        <input type="text" class="modal-input task-title-input" placeholder="Pad / taaknaam" value="${title}"${isPauze ? ' value="Pauze" disabled title="Pauze taak heet altijd Pauze"' : ''}>
                        <select class="modal-input task-type-select task-type-select-native" data-idx="${idx}">
                            <option value="vullen"${type === 'vullen' ? ' selected' : ''}>Vullen</option>
                            <option value="spiegelen"${type === 'spiegelen' ? ' selected' : ''}>Spiegelen</option>
                            <option value="restanten"${type === 'restanten' ? ' selected' : ''}>Restanten</option>
                            <option value="pauze"${type === 'pauze' ? ' selected' : ''}>Pauze</option>
                            <option value="overige"${type === 'overige' ? ' selected' : ''}>Overige</option>
                        </select>
                        <button type="button" class="action-btn delete-task-row-btn" data-idx="${idx}" title="Taak verwijderen">
                            <span class="material-icons">delete</span>
                        </button>
                    </div>
                    <div class="modal-task-item-bottom">
                        <input type="time" class="modal-input task-start-input" placeholder="Start" value="${sTime}" title="Starttijd">
                        <input type="time" class="modal-input task-end-input" placeholder="Eind" value="${eTime}" title="Eindtijd">
                        <input type="number" class="modal-input task-colli-input" placeholder="Colli" value="${isVullen ? colli : ''}" min="0" title="${isVullen ? 'Colli' : 'Alleen van toepassing bij vullen'}"${!isVullen ? ' disabled' : ''}>
                        <input type="number" class="modal-input task-dur-input" placeholder="Duur (m)" value="${dur}" min="0" title="Duur in minuten">
                    </div>
                </div>
            `;
        }).join('');

        tasksListEl.querySelectorAll('.task-type-select-native').forEach(select => {
            select.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.idx, 10);
                const itemEl = e.target.closest('.modal-task-item');
                const titleInput = itemEl?.querySelector('.task-title-input');
                const colliInput = itemEl?.querySelector('.task-colli-input');
                const isVullen = (e.target.value === 'vullen');
                const isPauze = (e.target.value === 'pauze');

                if (titleInput) {
                    if (isPauze) {
                        titleInput.value = 'Pauze';
                        titleInput.disabled = true;
                        titleInput.title = 'Pauze taak heet altijd Pauze';
                    } else {
                        if (titleInput.value === 'Pauze') {
                            titleInput.value = '';
                        }
                        titleInput.disabled = false;
                        titleInput.title = '';
                    }
                }

                if (colliInput) {
                    colliInput.disabled = !isVullen;
                    colliInput.title = isVullen ? 'Colli' : 'Alleen van toepassing bij vullen';
                    if (!isVullen) {
                        colliInput.value = '';
                    }
                }

                if (modalTasks[idx]) {
                    modalTasks[idx].type = e.target.value;
                    if (isPauze) {
                        modalTasks[idx].title = 'Pauze';
                    }
                    if (!isVullen) {
                        modalTasks[idx].colli = 0;
                    }
                }
                syncInputsToModalTasks();
                updateTotalColliFromTasks();
            });
        });

        tasksListEl.querySelectorAll('.delete-task-row-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                syncInputsToModalTasks();
                const idx = parseInt(btn.dataset.idx, 10);
                modalTasks.splice(idx, 1);
                renderModalTasks();
                updateTotalColliFromTasks();
            });
        });

        tasksListEl.querySelectorAll('.task-colli-input').forEach(input => {
            input.addEventListener('input', () => {
                syncInputsToModalTasks();
                updateTotalColliFromTasks();
            });
        });

        tasksListEl.querySelectorAll('.task-start-input, .task-end-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const itemEl = e.target.closest('.modal-task-item');
                if (!itemEl) return;
                const sInput = itemEl.querySelector('.task-start-input');
                const eInput = itemEl.querySelector('.task-end-input');
                const dInput = itemEl.querySelector('.task-dur-input');
                if (sInput?.value && eInput?.value && dInput) {
                    const sm = timeToMinutes(sInput.value);
                    let em = timeToMinutes(eInput.value);
                    if (em < sm) em += 24 * 60;
                    dInput.value = Math.max(0, em - sm);
                }
                syncInputsToModalTasks();
            });
        });
    }

    renderModalTasks();

    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', () => {
            syncInputsToModalTasks();
            modalTasks.push({
                title: 'Nieuw pad / taak',
                type: 'vullen',
                start_time: '',
                end_time: '',
                colli: 0,
                duration_minutes: 0
            });
            renderModalTasks();
            updateTotalColliFromTasks();
        });
    }

    const cancelBtn = overlay.querySelector('#cancelEditShiftBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => closeModal(overlay));
    }

    const deleteModalBtn = overlay.querySelector('#deleteShiftModalBtn');
    if (deleteModalBtn) {
        deleteModalBtn.addEventListener('click', async () => {
            closeModal(overlay);
            await handleDeleteShift(entry);
        });
    }

    const form = overlay.querySelector('#editShiftForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            syncInputsToModalTasks();

            const saveBtn = overlay.querySelector('#saveEditShiftBtn');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Opslaan...';
            }

            const chosenDate = shiftDatePicker ? shiftDatePicker.getValue() : (entry.date || '');
            const newProd = Number(overlay.querySelector('#editShiftProd')?.value) || 0;
            const newStart = overlay.querySelector('#editShiftStart')?.value || '';
            const newEnd = overlay.querySelector('#editShiftEnd')?.value || '';
            const newPause = Number(overlay.querySelector('#editShiftPause')?.value) || 0;
            const newColli = Number(overlay.querySelector('#editShiftColli')?.value) || 0;

            let newWorkMinutes = Number(entry.total_work_minutes) || 0;
            if (newStart && newEnd) {
                const sM = timeToMinutes(newStart);
                let eM = timeToMinutes(newEnd);
                if (eM < sM) eM += 24 * 60;
                newWorkMinutes = Math.max(0, eM - sM - newPause);
            }

            const cleanTasks = modalTasks.map(t => ({
                title: t.type === 'pauze' ? 'Pauze' : (t.title || t.pathName || t.name || 'Taak'),
                type: t.type || 'overige',
                start_time: t.start_time || t.start || '',
                end_time: t.end_time || t.end || '',
                colli: t.type === 'vullen' ? (Number(t.colli) || 0) : 0,
                duration_minutes: Number(t.duration_minutes) || Number(t.duration) || 0
            }));

            try {
                const data = await invokeFn('manage-productivity', {
                    body: {
                        action: 'update_shift',
                        target_user_id: targetUserId,
                        original_date: entry.date,
                        original_finalized_at: entry.finalized_at,
                        shift_data: {
                            date: chosenDate || entry.date,
                            productivity: newProd,
                            total_colli: newColli,
                            total_work_minutes: newWorkMinutes,
                            shift: {
                                ...(entry.shift || {}),
                                start: newStart,
                                planned_end: newEnd,
                                actual_end: newEnd,
                                pause_minutes: newPause
                            },
                            tasks: cleanTasks
                        }
                    }
                });

                closeModal(overlay);
                showToast('notification', 'Dienst en taken succesvol bijgewerkt');

                if (data?.user) {
                    selectedFillerUserData = data.user;
                    applyUserProductivity(data.user, false);
                }

                await loadTopFillers(currentUserId, selectedScoreboardDate);
            } catch (err) { 
                showToast('error', err.message || 'Kon dienst niet opslaan');
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Opslaan';
                }
            }
        });
    }
}
