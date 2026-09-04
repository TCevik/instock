import { supabase } from '../supabase.js';

export async function parsePdfWithEdge(files, options = {}) {
    const formData = new FormData();
    const fileList = Array.isArray(files) ? files : [files];

    for (const f of fileList) {
        formData.append('files', f);
    }

    if (options.availableUsers) {
        formData.append('availableUsers', JSON.stringify(options.availableUsers));
    }

    const { data, error } = await supabase.functions.invoke('parse-pdf', {
        body: formData
    });

    if (error) {
        let msg = error.message || 'Fout bij het verwerken van de PDF';
        if (error.context && typeof error.context.json === 'function') {
            try {
                const b = await error.context.json();
                if (b && b.error) msg = b.error;
            } catch (_) {}
        }
        throw new Error(msg);
    }

    return data;
}

export async function resetStorePathsToDefault() {
    const { data, error } = await supabase.functions.invoke('parse-pdf', {
        body: { action: 'reset_default_paths' }
    });

    if (error) {
        let msg = error.message || 'Fout bij herstellen van standaard paden';
        if (error.context && typeof error.context.json === 'function') {
            try {
                const b = await error.context.json();
                if (b && b.error) msg = b.error;
            } catch (_) {}
        }
        throw new Error(msg);
    }

    return data?.default_paths || [];
}
