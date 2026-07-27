export const fetchProductsPage = async (supabase, storeId, searchQuery, currentPage, pageSize, options = {}) => {
    const { department = '', location = '', thtFilter = '', sortBy = 'naam', sortOrder = 'asc' } = options;
    const from = currentPage * pageSize;
    const to = from + pageSize - 1;

    const fields = 'ean, naam, merk, afdeling, voorraad, minimale_voorraad, prijs, tht, locatiecode, winkel_id';
    let query = supabase.from('producten').select(fields, { count: 'exact' });

    if (storeId) {
        query = query.eq('winkel_id', storeId);
    }

    if (department) {
        query = query.ilike('afdeling', department);
    }

    if (location) {
        query = query.ilike('locatiecode', location);
    }

    if (thtFilter) {
        const today = new Date().toISOString().split('T')[0];
        if (thtFilter === 'verlopen') {
            query = query.lt('tht', today);
        } else if (thtFilter === 'vandaag') {
            query = query.eq('tht', today);
        } else if (thtFilter === 'week') {
            const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            query = query.gte('tht', today).lte('tht', nextWeek);
        } else if (thtFilter === 'maand') {
            const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            query = query.gte('tht', today).lte('tht', nextMonth);
        }
    }

    const trimmed = searchQuery.trim();
    if (trimmed) {
        const isEan = /^\d+$/.test(trimmed) && trimmed.length >= 8;
        if (isEan) {
            query = query.eq('ean', trimmed);
        } else {
            query = query.or(`naam.ilike.%${trimmed}%,merk.ilike.%${trimmed}%,afdeling.ilike.%${trimmed}%`);
        }
    }

    const ascending = sortOrder === 'asc';
    query = query.order(sortBy, { ascending, nullsFirst: false });

    query = query.range(from, to);
    return await query;
};

export const fetchDepartments = async (supabase, storeId) => {
    const map = new Map();

    let query = supabase.from('producten').select('afdeling');
    if (storeId) query = query.eq('winkel_id', storeId);
    const { data: productData } = await query;

    if (productData) {
        productData.forEach(item => {
            if (!item.afdeling) return;
            const trimmed = item.afdeling.trim();
            const key = trimmed.toLowerCase();
            if (!map.has(key)) {
                const formatted = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
                map.set(key, formatted);
            }
        });
    }

    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};

export const fetchLocations = async (supabase, storeId) => {
    let query = supabase.from('producten').select('locatiecode');
    if (storeId) query = query.eq('winkel_id', storeId);
    const { data } = await query;
    if (!data) return [];
    const map = new Map();
    data.forEach(item => {
        if (!item.locatiecode) return;
        const trimmed = item.locatiecode.trim();
        const key = trimmed.toLowerCase();
        if (!map.has(key)) {
            map.set(key, trimmed);
        }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
};

export const fetchSingleProduct = async (supabase, ean) => {
    return await supabase.from('producten').select('*').eq('ean', ean).maybeSingle();
};

export const saveProduct = async (supabase, isEditMode, editingEan, productData) => {
    if (isEditMode) {
        return await supabase.from('producten').update(productData).eq('ean', editingEan);
    } else {
        return await supabase.from('producten').insert([productData]);
    }
};

export const deleteProduct = async (supabase, ean) => {
    return await supabase.from('producten').delete().eq('ean', ean);
};
