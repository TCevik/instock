export const parseStoreDepartments = (storeInfo) => {
    if (!storeInfo || !storeInfo.afdelingen) return [];
    let depts = [];
    if (Array.isArray(storeInfo.afdelingen)) {
        depts = storeInfo.afdelingen;
    } else if (typeof storeInfo.afdelingen === 'string' && storeInfo.afdelingen.trim()) {
        depts = storeInfo.afdelingen.split(',').map(s => s.trim()).filter(Boolean);
    }
    return Array.from(new Set(depts.map(d => d.trim()).filter(Boolean))).sort();
};

export const sortUsersByRole = (users) => {
    return [...users].sort((a, b) => {
        const roleA = (a.role || '').toLowerCase() === 'beheerder' ? 0 : 1;
        const roleB = (b.role || '').toLowerCase() === 'beheerder' ? 0 : 1;
        if (roleA !== roleB) return roleA - roleB;
        return (a.full_name || '').localeCompare(b.full_name || '', 'nl', { sensitivity: 'base' });
    });
};

export const groupUsersByDepartment = (users, currentStoreDepartments) => {
    const departmentMap = {};
    users.forEach(u => {
        let deptList = [];
        if (Array.isArray(u.afdeling)) {
            deptList = u.afdeling;
        } else if (typeof u.afdeling === 'string' && u.afdeling.trim()) {
            deptList = u.afdeling.split(',').map(s => s.trim()).filter(Boolean);
        }
        if (deptList.length === 0) {
            deptList = ['Overig'];
        }

        deptList.forEach(dept => {
            if (!departmentMap[dept]) {
                departmentMap[dept] = [];
            }
            departmentMap[dept].push(u);
        });
    });

    const allDeptKeys = Array.from(new Set([...currentStoreDepartments, ...Object.keys(departmentMap)])).sort();
    return { departmentMap, allDeptKeys };
};

export const calculateProductivityStats = (history) => {
    if (!Array.isArray(history) || history.length === 0) {
        return { average: null, count: 0, validEntries: [] };
    }
    const validEntries = history.filter(item => item && typeof item.date === 'string');
    const prodValues = validEntries
        .map(item => item.productivity)
        .filter(val => typeof val === 'number' && !isNaN(val));

    const count = prodValues.length;
    if (count === 0) {
        return { average: null, count: 0, validEntries };
    }
    const sum = prodValues.reduce((acc, curr) => acc + curr, 0);
    const average = Math.round(sum / count);
    return { average, count, validEntries };
};

export const sortHistoryByDate = (history) => {
    if (!Array.isArray(history)) return [];
    return [...history].sort((a, b) => {
        const dateA = a && a.date ? a.date : '';
        const dateB = b && b.date ? b.date : '';
        return dateB.localeCompare(dateA);
    });
};

export const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
};

export const getLeaderboardData = (users) => {
    if (!Array.isArray(users)) return [];
    const withStats = users.map(user => {
        const stats = calculateProductivityStats(user.history_productivity);
        return {
            user,
            average: stats.average,
            count: stats.count
        };
    }).filter(item => item.average !== null && item.count > 0);

    return withStats.sort((a, b) => {
        if (b.average !== a.average) {
            return b.average - a.average;
        }
        return b.count - a.count;
    });
};

export const parseTaskInput = (inputStr) => {
    if (!inputStr || typeof inputStr !== 'string') return [];
    return inputStr
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
        .map(task => {
            const isHelper = task.toLowerCase().includes('(hulp)');
            let clean = task.replace(/\s*\(Hulp\)/i, '').trim();

            let type = '';
            if (clean.toLowerCase().includes('(vullen)')) {
                type = 'fill';
                clean = clean.replace(/\s*\(Vullen\)/i, '').trim();
            } else if (clean.toLowerCase().includes('(spiegelen)')) {
                type = 'mirror';
                clean = clean.replace(/\s*\(Spiegelen\)/i, '').trim();
            } else if (clean.toLowerCase().includes('(overig)')) {
                type = 'other';
                clean = clean.replace(/\s*\(Overig\)/i, '').trim();
            }

            let result = clean;
            if (type && !clean.includes(`_${type}`)) {
                result = `${clean}_${type}`;
            }
            if (isHelper && !result.endsWith('_helper')) {
                result = `${result}_helper`;
            }
            return result;
        });
};

export const updateProductivityEntry = (history, date, newProductivity, newTasks) => {
    const list = Array.isArray(history) ? [...history] : [];
    const index = list.findIndex(item => item && item.date === date);
    const parsedTasks = Array.isArray(newTasks)
        ? newTasks
        : (typeof newTasks === 'string' ? parseTaskInput(newTasks) : []);

    const updatedEntry = {
        date,
        productivity: newProductivity,
        tasks: parsedTasks
    };

    if (index >= 0) {
        list[index] = updatedEntry;
    } else {
        list.push(updatedEntry);
    }
    return list;
};

export const removeProductivityEntry = (history, date) => {
    if (!Array.isArray(history)) return [];
    return history.filter(item => item && item.date !== date);
};
