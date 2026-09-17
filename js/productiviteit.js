import { supabase, showToast, escapeHtml, invokeFn } from './main.js';
import { formatDuration, timeToMinutes, getProductivityStatusClass, getProductivityStatusIcon, calculateTaskDuration, calculateShiftWorkMinutes, calculateShiftTotalColli } from './vulplanning/time-utils.js';
import { createCustomSelect } from './select.js';
import { createDatePicker, MONTH_NAMES, SHORT_MONTH_NAMES, parseDate } from './datepicker.js';
import { createTimePicker } from './timepicker.js';
import { showModal, closeModal, showConfirmModal } from './modal.js';

let cachedProductivityEntries = [];
let currentChartMode = 'individual';
let currentTimeframe = '1m';
let currentShiftPage = 1;
const SHIFTS_PER_PAGE = 20;
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
            .select('user_id, username, full_name, role')
            .eq('user_id', session.user.id)
            .maybeSingle();

        if (error) {
            throw error;
        }

        currentUserRole = Number(userData?.role) || 1;
        ownUserData = userData;

        const topData = await loadTopFillers(session.user.id);
        if (topData?.currentUserProductivity) {
            ownUserData = topData.currentUserProductivity;
        }

        if (skeletonEl) skeletonEl.style.display = 'none';
        if (statsSkeletonEl) statsSkeletonEl.style.display = 'none';
        if (statsEl) statsEl.style.display = 'flex';

        initChartControls();
        initPaginationControls();
        initShiftsDatePicker();

        applyUserProductivity(ownUserData, true);

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
    if (!sectionEl || !listEl) return null;

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
        const data = await invokeFn('get-top-fillers', {
            body: date ? { date } : {}
        });

        const isManager = data?.isManager ?? [2, 3].includes(currentUserRole);

        if (filterWrapper) {
            filterWrapper.style.display = 'flex';
            if (!topFillersDatePicker) {
                initTopFillersDatePicker();
            }
        }

        if (!data || !Array.isArray(data.topFillers)) {
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
        return data;
    } catch (_) {
        if (!date) {
            sectionEl.style.display = 'none';
            if (userRankEl) userRankEl.style.display = 'none';
            if (sectionDivider) sectionDivider.style.display = 'none';
            if (overviewRow) overviewRow.classList.add('no-top-fillers');
        }
        return null;
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
                <span class="top-filler-shifts">${shiftCount} ${shiftCount === 1 ? 'shift' : 'shifts'} opgeslagen</span>
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
    if (selectedFillerUserId === filler.user_id || filler.user_id === currentUserId) {
        selectedFillerUserId = null;
        selectedFillerUserData = null;
        applyUserProductivity(ownUserData, true);
        updateTopFillerCardSelection();
        return;
    }

    selectedFillerUserId = filler.user_id;
    updateTopFillerCardSelection();
    showProductivityUserSkeleton(filler);

    try {
        const data = await invokeFn('get-top-fillers', {
            body: { target_user_id: filler.user_id }
        });

        if (!data || !data.user) {
            throw new Error('Gegevens van medewerker niet ontvangen');
        }

        if (selectedFillerUserId === filler.user_id) {
            selectedFillerUserData = data.user;
            applyUserProductivity(data.user, false);
        }
    } catch (err) {
        showToast('error', err.message || 'Kon productiviteit niet ophalen');
    }
}

function showProductivityUserSkeleton(user) {
    const rawName = user?.full_name || user?.username || 'Medewerker';
    const name = escapeHtml(rawName);

    const chartTitleEl = document.getElementById('productivityChartTitle');
    const chartSubEl = document.getElementById('chartCardSubtitle');
    const shiftsHeadingEl = document.getElementById('myShiftsSectionHeading');
    const shiftsSubEl = document.getElementById('myShiftsSectionSubtext');
    const emptyEl = document.getElementById('productivityEmpty');
    const chartCard = document.getElementById('productivityChartCard');
    const myShiftsSection = document.getElementById('myShiftsSection');
    const chartContainer = document.getElementById('productivityChart');
    const listEl = document.getElementById('productivityList');
    const colliEl = document.getElementById('statTotalColli');
    const daysEl = document.getElementById('statTotalDays');

    if (chartTitleEl) chartTitleEl.textContent = `Voortgang van ${name}`;
    if (chartSubEl) chartSubEl.textContent = `Productiviteit per gewerkte shift van ${name}`;
    if (shiftsHeadingEl) shiftsHeadingEl.textContent = `Gewerkte Diensten van ${name}`;
    if (shiftsSubEl) shiftsSubEl.textContent = `Overzicht van opgeslagen shifts en behaalde productiviteit van ${name}`;

    if (emptyEl) emptyEl.style.display = 'none';
    if (chartCard) chartCard.style.display = 'flex';
    if (myShiftsSection) myShiftsSection.style.display = 'flex';

    if (colliEl) colliEl.innerHTML = '<span class="skeleton" style="display:inline-block; width:36px; height:18px; border-radius:4px;"></span>';
    if (daysEl) daysEl.innerHTML = '<span class="skeleton" style="display:inline-block; width:24px; height:18px; border-radius:4px;"></span>';

    if (chartContainer) {
        chartContainer.innerHTML = '<div class="skeleton" style="width:100%; height:240px; border-radius:10px;"></div>';
    }

    if (listEl) {
        listEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div class="skeleton" style="height: 72px; border-radius: 12px;"></div>
                <div class="skeleton" style="height: 72px; border-radius: 12px;"></div>
                <div class="skeleton" style="height: 72px; border-radius: 12px;"></div>
            </div>
        `;
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
            ? 'Overzicht van al jouw opgeslagen shifts en behaalde productiviteit'
            : `Overzicht van opgeslagen shifts en behaalde productiviteit van ${name}`;
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
        const canManage = currentUserRole === 3;
        const addShiftBtn = document.getElementById('addShiftBtn');
        if (addShiftBtn) {
            if (canManage) {
                addShiftBtn.style.display = 'inline-flex';
                if (!addShiftBtn.dataset.initialized) {
                    addShiftBtn.dataset.initialized = 'true';
                    addShiftBtn.addEventListener('click', () => openAddShiftModal());
                }
            } else {
                addShiftBtn.style.display = 'none';
            }
        }

        if (emptyEl) emptyEl.style.display = 'flex';
        if (chartCard) chartCard.style.display = 'none';
        if (myShiftsSection) myShiftsSection.style.display = canManage ? 'flex' : 'none';
        if (sectionDivider) sectionDivider.style.display = 'none';
    } else {
        const canManage = currentUserRole === 3;
        const addShiftBtn = document.getElementById('addShiftBtn');
        if (addShiftBtn) {
            if (canManage) {
                addShiftBtn.style.display = 'inline-flex';
                if (!addShiftBtn.dataset.initialized) {
                    addShiftBtn.dataset.initialized = 'true';
                    addShiftBtn.addEventListener('click', () => openAddShiftModal());
                }
            } else {
                addShiftBtn.style.display = 'none';
            }
        }

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
        btnIndividual.title = isAllowed ? '' : 'Alleen beschikbaar bij 7 shifts, 14 shifts of 1 maand';
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
            { value: '2w', label: 'Laatste 14 shifts' },
            { value: '1w', label: 'Laatste 7 shifts' }
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
            colli: calculateShiftTotalColli(e)
        };
    });

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    let filtered = enriched;

    if (currentTimeframe === '1w') {
        filtered = enriched.slice(-7);
    } else if (currentTimeframe === '2w') {
        filtered = enriched.slice(-14);
    } else {
        let cutoff = 0;
        if (currentTimeframe === '1m') cutoff = now - 31 * dayMs;
        else if (currentTimeframe === '6m') cutoff = now - 183 * dayMs;
        else if (currentTimeframe === '1y') cutoff = now - 365 * dayMs;
        if (cutoff > 0) filtered = enriched.filter(e => e.timestamp >= cutoff);
    }

    const isMonthView = ['6m', '1y', 'all'].includes(currentTimeframe);

    const subtitleEl = document.getElementById('chartCardSubtitle');
    if (subtitleEl) {
        const userSuffix = (selectedFillerUserData && selectedFillerUserId !== currentUserId)
            ? ` van ${selectedFillerUserData.full_name || selectedFillerUserData.username || 'Medewerker'}`
            : '';

        if (isMonthView) {
            subtitleEl.textContent = (currentChartMode === 'average'
                ? 'Gemiddelde productiviteit per maand'
                : 'Productiviteit per maand') + userSuffix;
        } else if (filtered.length > 12) {
            subtitleEl.textContent = (currentChartMode === 'average'
                ? 'Gemiddelde trend per periode'
                : 'Productiviteit per periode') + userSuffix;
        } else {
            subtitleEl.textContent = (currentChartMode === 'average'
                ? 'Gemiddelde van de laatste 10 shifts per punt'
                : 'Productiviteit per gewerkte shift') + userSuffix;
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
    const isMobile = width < 480;
    const padLeft = isMobile ? 36 : 46;
    const padRight = isMobile ? 16 : 32;
    const padTop = isMobile ? 26 : 32;
    const padBottom = isMobile ? 36 : 42;
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    const rawMin = Math.min(...dataPoints.map(d => d.percent), 100);
    const rawMax = Math.max(...dataPoints.map(d => d.percent), 100);
    const spread = Math.max(15, rawMax - rawMin);
    const margin = Math.ceil(spread * 0.15);

    const minVal = Math.max(0, Math.floor((rawMin - margin) / 5) * 5);
    const maxVal = Math.ceil((rawMax + margin) / 5) * 5;

    const getY = (val) => padTop + chartH - ((val - minVal) / (maxVal - minVal || 1)) * chartH;
    const getX = (index) => {
        if (dataPoints.length === 1) return padLeft + chartW / 2;
        return padLeft + (index / (dataPoints.length - 1)) * chartW;
    };

    const targetY = getY(100);
    const bottomY = getY(minVal);

    const coords = dataPoints.map((d, i) => ({
        x: getX(i),
        y: getY(d.percent),
        ...d
    }));

    const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const areaD = `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} ${bottomY.toFixed(1)} L ${coords[0].x.toFixed(1)} ${bottomY.toFixed(1)} Z`;

    const statusColors = {
        success: 'var(--accent-color)',
        yellow: 'var(--yellow-color)',
        orange: 'var(--warning-color)',
        danger: 'var(--danger-color)'
    };

    const dateStep = (isMobile && coords.length > 5) ? Math.ceil(coords.length / 5) : 1;
    const valFontSize = isMobile ? (coords.length > 8 ? "9" : "10") : "11";
    const valOffsetY = isMobile ? 8 : 10;

    const circlesSvg = coords.map((c, i) => {
        const dotColor = statusColors[c.statusClass] || 'var(--accent-color)';
        const labelText = c.fullDateLabel || c.dateLabel;
        const titleText = isMonthView
            ? `${escapeHtml(labelText)}: ${c.percent}% (${c.windowSize} ${c.windowSize === 1 ? 'shift' : 'shifts'}${c.colli > 0 ? `, ${c.colli.toLocaleString('nl-NL')} colli` : ''})`
            : (c.windowSize > 1
                ? `${escapeHtml(c.dateLabel)}: ${c.percent}% (gemiddeld over ${c.windowSize} shifts)`
                : (currentChartMode === 'average'
                    ? `${escapeHtml(c.dateLabel)}: ${c.percent}% (gemiddelde over ${c.windowSize} ${c.windowSize === 1 ? 'shift' : 'shifts'})`
                    : `${escapeHtml(c.dateLabel)}: ${c.percent}%${c.colli > 0 ? ` (${c.colli.toLocaleString('nl-NL')} colli)` : ''}`));

        const showDate = (i % dateStep === 0) || (i === coords.length - 1);

        return `
            <g class="chart-point-group" data-tooltip="${titleText}">
                <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${isMobile ? 4 : 5}" fill="var(--card-background)" stroke="${dotColor}" stroke-width="${isMobile ? 2.5 : 3}"></circle>
                <text x="${c.x.toFixed(1)}" y="${(c.y - valOffsetY).toFixed(1)}" text-anchor="middle" fill="var(--text-color)" font-size="${valFontSize}" font-weight="700" stroke="var(--card-background)" stroke-width="3" paint-order="stroke fill">
                    ${c.percent}%
                </text>
                ${showDate ? `
                <text x="${c.x.toFixed(1)}" y="${(padTop + chartH + (isMobile ? 16 : 20)).toFixed(1)}" text-anchor="middle" fill="var(--text-color-muted)" font-size="${isMobile ? 9.5 : 10.5}">
                    ${escapeHtml(c.dateLabel)}
                </text>` : ''}
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

            <line x1="${padLeft}" y1="${bottomY.toFixed(1)}" x2="${width - padRight}" y2="${bottomY.toFixed(1)}" stroke="var(--chart-grid-line)" stroke-width="1"/>
            <text x="${padLeft - 8}" y="${(bottomY + 4).toFixed(1)}" text-anchor="end" fill="var(--text-color-muted)" font-size="10">${minVal}%</text>

            ${minVal < 100 && maxVal > 100 ? `
            <line x1="${padLeft}" y1="${targetY.toFixed(1)}" x2="${width - padRight}" y2="${targetY.toFixed(1)}" stroke="var(--chart-target-line)" stroke-width="1.5" stroke-dasharray="5,4"/>
            <text x="${padLeft - 8}" y="${(targetY + 4).toFixed(1)}" text-anchor="end" fill="var(--accent-color)" font-size="10.5" font-weight="700">100%</text>
            ` : ''}

            <path d="${areaD}" fill="url(#prodChartAreaGrad)"/>
            <path d="${pathD}" fill="none" stroke="var(--accent-color)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>

            ${circlesSvg}
        </svg>
    `;
}

function renderSummaryStats(entries) {
    const colliEl = document.getElementById('statTotalColli');
    const daysEl = document.getElementById('statTotalDays');

    let totalColli = 0;

    entries.forEach(e => {
        totalColli += calculateShiftTotalColli(e);
    });

    if (colliEl) {
        colliEl.textContent = totalColli.toLocaleString('nl-NL');
    }

    if (daysEl) {
        daysEl.textContent = entries.length;
    }
}

function renderDayCardBody(card, entry) {
    const bodyEl = card.querySelector('.day-card-body');
    if (!bodyEl) return;

    const tasks = Array.isArray(entry.tasks) ? entry.tasks : [];

    let tasksHtml = '';
    if (tasks.length > 0) {
        const taskCards = tasks.map((task, tIndex) => {
            const title = escapeHtml(task.title || task.pathName || task.name || 'Taak');
            const type = task.type || 'overige';
            const colli = Number(task.colli) || 0;
            let dur = calculateTaskDuration(task);
            const sTime = task.start_time || task.start || '';
            const eTime = task.end_time || task.end || '';

            let timeHtml = '';
            if (sTime && eTime) {
                timeHtml = `<span class="day-task-time"><span class="material-icons">schedule</span><span>${escapeHtml(sTime)} - ${escapeHtml(eTime)}${dur > 0 ? ` (${formatDuration(dur)})` : ''}</span></span>`;
            } else if (sTime) {
                timeHtml = `<span class="day-task-time"><span class="material-icons">schedule</span><span>Vanaf ${escapeHtml(sTime)}</span></span>`;
            } else if (dur > 0) {
                timeHtml = `<span class="day-task-time"><span class="material-icons">schedule</span><span>${formatDuration(dur)}</span></span>`;
            }

            let colliHtml = '';
            if (colli > 0) {
                colliHtml = `<span class="day-task-colli"><span class="material-icons">inventory_2</span><span>${colli} colli</span></span>`;
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

        tasksHtml = `<div class="day-tasks-grid">${taskCards}</div>`;
    } else {
        tasksHtml = `<div class="day-tasks-empty"><span class="material-icons" style="font-size:18px;">info</span><span>Geen afzonderlijke paden geregistreerd voor deze shift.</span></div>`;
    }

    bodyEl.innerHTML = `
        <div class="day-card-body-inner">
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
}

function renderProductivityList(entries, container) {
    container.innerHTML = '';

    const canManageShifts = [3].includes(currentUserRole);

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

        const isMostRecent = index === 0 && currentShiftPage === 1 && !selectedDateFilter;
        if (!isMostRecent) {
            card.classList.add('collapsed');
        }

        const percent = entry.productivity !== undefined ? Math.round(Number(entry.productivity)) : null;
        const statusClass = percent !== null ? getProductivityStatusClass(percent) : 'danger';
        const statusIcon = percent !== null ? getProductivityStatusIcon(percent) : 'trending_down';

        const shift = entry.shift || {};
        const startTime = shift.start || '';
        const endTime = shift.actual_end || shift.planned_end || '';
        const pauseMinutes = Number(shift.pause_minutes) || 0;
        const workMinutes = calculateShiftWorkMinutes(entry);
        let totalColli = calculateShiftTotalColli(entry);

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
            <div class="day-card-body"></div>
        `;

        renderDayCardBody(card, entry);

        const ensureTasksLoaded = async () => {
            if (!entry.tasksLoaded) {
                const bodyEl = card.querySelector('.day-card-body');
                if (bodyEl) {
                    bodyEl.innerHTML = `
                        <div class="day-card-body-inner">
                            <div style="padding: 24px; text-align: center; color: var(--text-color-muted);">
                                <span class="material-icons" style="animation: spin 1s linear infinite;">sync</span>
                            </div>
                        </div>
                    `;
                }
                try {
                    const activeUserId = selectedFillerUserId || currentUserId;
                    const data = await invokeFn('get-top-fillers', {
                        body: {
                            target_user_id: activeUserId,
                            shift_date: entry.date,
                            finalized_at: entry.finalized_at
                        }
                    });
                    if (data?.shift) {
                        entry.tasks = data.shift.tasks || [];
                        entry.tasksLoaded = true;
                    }
                } catch (_) {}
                renderDayCardBody(card, entry);
            }
        };

        if (isMostRecent) {
            ensureTasksLoaded();
        }

        if (canManageShifts) {
            const editBtn = card.querySelector('.edit-shift-btn');
            if (editBtn) {
                editBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await ensureTasksLoaded();
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
            headerEl.addEventListener('click', async () => {
                const isCurrentlyCollapsed = card.classList.contains('collapsed');
                if (isCurrentlyCollapsed) {
                    card.classList.remove('collapsed');
                    await ensureTasksLoaded();
                } else {
                    card.classList.add('collapsed');
                }
            });
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

async function openShiftModal(entry = {}, isEdit = true) {
    const targetUserId = selectedFillerUserId || currentUserId;

    const shift = entry.shift || {};
    const startTime = shift.start || shift.start_time || (isEdit ? '' : '08:00');
    const endTime = shift.actual_end || shift.planned_end || shift.end_time || (isEdit ? '' : '16:00');
    const pauseMinutes = Number(shift.pause_minutes || shift.pauze || shift.break_minutes) || 0;
    const totalColli = calculateShiftTotalColli(entry);
    const percent = entry.productivity !== undefined ? Math.round(Number(entry.productivity)) : 100;
    const targetName = selectedFillerUserData?.full_name || selectedFillerUserData?.username || ownUserData?.full_name || ownUserData?.username || 'Medewerker';

    const modalTasks = Array.isArray(entry.tasks) ? JSON.parse(JSON.stringify(entry.tasks)) : [];

    const titleText = isEdit ? 'Dienst bewerken' : 'Dienst toevoegen';
    const subtitleText = isEdit ? `Dienst van ${escapeHtml(targetName)} aanpassen` : `Nieuwe dienst toevoegen voor ${escapeHtml(targetName)}`;
    const defaultDate = entry.date || (selectedDateFilter ? selectedDateFilter : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date()));

    const overlay = await showModal(`
        <div class="modal-header">
            <h2 class="modal-title">${titleText}</h2>
            <p class="modal-subtitle">${subtitleText}</p>
        </div>
        <form class="modal-form" id="editShiftForm">
            <div class="modal-form-row">
                <div class="form-group">
                    <label>Datum</label>
                    <div id="editShiftDatePickerContainer"></div>
                </div>
                <div class="form-group">
                    <label for="editShiftProd">Productiviteit (%)</label>
                    <input type="number" id="editShiftProd" class="modal-input" value="${percent}">
                </div>
            </div>
            <div class="modal-form-row">
                <div class="form-group">
                    <label>Starttijd</label>
                    <div id="editShiftStartContainer"></div>
                </div>
                <div class="form-group">
                    <label>Eindtijd</label>
                    <div id="editShiftEndContainer"></div>
                </div>
            </div>
            <div class="modal-form-row">
                <div class="form-group">
                    <label for="editShiftPause">Pauze (minuten)</label>
                    <input type="number" id="editShiftPause" class="modal-input" value="${pauseMinutes}">
                </div>
                <div class="form-group">
                    <label>Totaal colli</label>
                    <div class="modal-input" style="display: flex; align-items: center; background-color: var(--card-background-hover); cursor: default;">
                        <span id="editShiftColliDisplay" style="font-weight: 600;">${totalColli}</span>
                    </div>
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
                ${isEdit ? `
                    <button type="button" class="modal-btn-danger" id="deleteShiftModalBtn">
                        <span class="material-icons">delete</span>
                        <span>Verwijderen</span>
                    </button>
                ` : ''}
                <button type="button" class="modal-btn-secondary" id="cancelEditShiftBtn">Annuleren</button>
                <button type="submit" class="btn" id="saveEditShiftBtn">${isEdit ? 'Opslaan' : 'Toevoegen'}</button>
            </div>
        </form>
    `, 'modal-wide');

    const dateContainer = overlay.querySelector('#editShiftDatePickerContainer');
    let shiftDatePicker = null;
    if (dateContainer) {
        shiftDatePicker = createDatePicker(dateContainer, defaultDate);
    }

    const startContainer = overlay.querySelector('#editShiftStartContainer');
    let shiftStartPicker = null;
    if (startContainer) {
        shiftStartPicker = createTimePicker(startContainer, startTime, () => {});
    }

    const endContainer = overlay.querySelector('#editShiftEndContainer');
    let shiftEndPicker = null;
    if (endContainer) {
        shiftEndPicker = createTimePicker(endContainer, endTime, () => {});
    }

    const tasksListEl = overlay.querySelector('#modalTasksList');
    const tasksCountEl = overlay.querySelector('#modalTasksCount');
    const addTaskBtn = overlay.querySelector('#modalAddTaskBtn');
    const totalColliDisplay = overlay.querySelector('#editShiftColliDisplay');

    const taskTypeOptions = [
        { value: 'vullen', label: 'Vullen' },
        { value: 'spiegelen', label: 'Spiegelen' },
        { value: 'restanten', label: 'Restanten' },
        { value: 'pauze', label: 'Pauze' },
        { value: 'overige', label: 'Overige' }
    ];

    let taskPickerInstances = [];

    function syncInputsToModalTasks() {
        if (!tasksListEl) return;
        const items = tasksListEl.querySelectorAll('.modal-task-item');
        items.forEach((itemEl, idx) => {
            if (!modalTasks[idx]) return;
            const inst = taskPickerInstances[idx];
            const titleInput = itemEl.querySelector('.task-title-input');
            const colliInput = itemEl.querySelector('.task-colli-input');

            if (titleInput) modalTasks[idx].title = titleInput.value.trim();
            if (inst) {
                if (inst.typeSelect) modalTasks[idx].type = inst.typeSelect.getValue();
                if (inst.startPicker) modalTasks[idx].start_time = inst.startPicker.getValue();
                if (inst.endPicker) modalTasks[idx].end_time = inst.endPicker.getValue();

                const sVal = modalTasks[idx].start_time;
                const eVal = modalTasks[idx].end_time;
                if (sVal && eVal) {
                    const sm = timeToMinutes(sVal);
                    let em = timeToMinutes(eVal);
                    if (em < sm) em += 24 * 60;
                    modalTasks[idx].duration_minutes = em - sm;
                }
            }
            if (colliInput) modalTasks[idx].colli = Number(colliInput.value) || 0;
        });
    }

    function updateTotalColliFromTasks() {
        if (!totalColliDisplay) return;
        const sum = modalTasks.reduce((acc, t) => acc + (Number(t.colli) || 0), 0);
        totalColliDisplay.textContent = sum;
    }

    function renderModalTasks() {
        if (!tasksListEl) return;
        if (tasksCountEl) tasksCountEl.textContent = modalTasks.length;
        taskPickerInstances = [];

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
            const title = escapeHtml(t.title || t.pathName || t.name || '');
            const colli = Number(t.colli) || 0;
            let dur = calculateTaskDuration(t);

            return `
                <div class="modal-task-item" data-idx="${idx}">
                    <div class="modal-task-item-top">
                        <input type="text" class="modal-input task-title-input" placeholder="Pad / taaknaam" value="${title}">
                        <div class="task-type-select-wrap" style="flex: 1; min-width: 110px;"></div>
                        <button type="button" class="action-btn delete-task-row-btn" data-idx="${idx}" title="Taak verwijderen">
                            <span class="material-icons">delete</span>
                        </button>
                    </div>
                    <div class="modal-task-item-bottom">
                        <div class="task-start-wrap" style="flex: 1;"></div>
                        <div class="task-end-wrap" style="flex: 1;"></div>
                        <input type="number" class="modal-input task-colli-input" placeholder="Colli" value="${colli}" title="Colli">
                        <div class="modal-input task-dur-display" style="display: flex; align-items: center; justify-content: center; background-color: var(--card-background-hover); cursor: default; flex: 1;" title="Duur">
                            <span style="font-weight: 600;">${dur}m</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        modalTasks.forEach((t, idx) => {
            const itemEl = tasksListEl.querySelector(`.modal-task-item[data-idx="${idx}"]`);
            if (!itemEl) return;

            const typeWrap = itemEl.querySelector('.task-type-select-wrap');
            const startWrap = itemEl.querySelector('.task-start-wrap');
            const endWrap = itemEl.querySelector('.task-end-wrap');

            const type = t.type || 'overige';
            const sTime = t.start_time || t.start || '';
            const eTime = t.end_time || t.end || '';

            const typeSelect = createCustomSelect(typeWrap, taskTypeOptions, type, (val) => {
                modalTasks[idx].type = val;
            });

            const onTimeChange = () => {
                syncInputsToModalTasks();
                const sVal = startPicker.getValue();
                const eVal = endPicker.getValue();
                let dur = 0;
                if (sVal && eVal) {
                    const sm = timeToMinutes(sVal);
                    let em = timeToMinutes(eVal);
                    if (em < sm) em += 24 * 60;
                    dur = em - sm;
                } else {
                    dur = Number(modalTasks[idx].duration_minutes) || Number(modalTasks[idx].duration) || 0;
                }
                modalTasks[idx].duration_minutes = dur;
                const durSpan = itemEl.querySelector('.task-dur-display span');
                if (durSpan) {
                    durSpan.textContent = `${dur}m`;
                }
            };

            const startPicker = createTimePicker(startWrap, sTime, onTimeChange, 'Start');
            const endPicker = createTimePicker(endWrap, eTime, onTimeChange, 'Eind');

            taskPickerInstances[idx] = { typeSelect, startPicker, endPicker };
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
    }

    renderModalTasks();

    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', () => {
            syncInputsToModalTasks();
            modalTasks.push({
                title: '',
                type: 'vullen',
                start_time: '',
                end_time: '',
                colli: 0
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
                saveBtn.textContent = isEdit ? 'Opslaan...' : 'Toevoegen...';
            }

            const chosenDate = shiftDatePicker ? shiftDatePicker.getValue() : (entry.date || '');
            const newProd = Number(overlay.querySelector('#editShiftProd')?.value) || 0;
            const newStart = shiftStartPicker ? shiftStartPicker.getValue() : '';
            const newEnd = shiftEndPicker ? shiftEndPicker.getValue() : '';
            const newPause = Number(overlay.querySelector('#editShiftPause')?.value) || 0;

            const cleanTasks = modalTasks.map(t => ({
                title: t.title !== undefined ? t.title : '',
                type: t.type !== undefined ? t.type : '',
                start_time: t.start_time || '',
                end_time: t.end_time || '',
                colli: Number(t.colli) || 0
            }));

            try {
                const payloadAction = isEdit ? 'update_shift' : 'add_shift';
                const payloadBody = {
                    action: payloadAction,
                    target_user_id: targetUserId,
                    shift_date: chosenDate,
                    shift_data: {
                        date: chosenDate,
                        start_time: newStart,
                        end_time: newEnd,
                        productivity: newProd,
                        pauze: newPause,
                        shift: {
                            ...(entry.shift || {}),
                            start: newStart,
                            planned_end: newEnd,
                            actual_end: newEnd,
                            pause_minutes: newPause
                        },
                        tasks: cleanTasks
                    }
                };

                if (isEdit) {
                    payloadBody.original_date = entry.date;
                    payloadBody.original_finalized_at = entry.finalized_at;
                }

                const data = await invokeFn('manage-productivity', { body: payloadBody });

                closeModal(overlay);
                showToast('notification', isEdit ? 'Dienst en taken succesvol bijgewerkt' : 'Dienst succesvol toegevoegd');

                if (data?.user) {
                    if (targetUserId === currentUserId) {
                        ownUserData = data.user;
                    }
                    selectedFillerUserData = data.user;
                    applyUserProductivity(data.user, targetUserId === currentUserId);
                }

                await loadTopFillers(currentUserId, selectedScoreboardDate);
            } catch (err) {
                showToast('error', err.message || (isEdit ? 'Kon dienst niet opslaan' : 'Kon dienst niet toevoegen'));
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.textContent = isEdit ? 'Opslaan' : 'Toevoegen';
                }
            }
        });
    }
}

async function openEditShiftModal(entry) {
    return openShiftModal(entry, true);
}

async function openAddShiftModal() {
    return openShiftModal({}, false);
}