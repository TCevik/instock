export const fetchProductsPage = async (supabase, storeId, searchQuery, currentPage, pageSize) => {
    const from = currentPage * pageSize;
    const to = from + pageSize - 1;

    let query = supabase.from('producten').select('*', { count: 'exact' });

    if (storeId) {
        query = query.eq('winkel_id', storeId);
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

    query = query.range(from, to);
    return await query;
};

export const saveProduct = async (supabase, isEditMode, editingEan, productData) => {
    if (isEditMode) {
        return await supabase.from('producten').update(productData).eq('ean', editingEan);
    } else {
        return await supabase.from('producten').insert([productData]);
    }
};
