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
