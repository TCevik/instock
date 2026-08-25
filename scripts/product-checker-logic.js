export const formatPrice = (price) => {
    if (price === null || price === undefined) return '-';
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(price);
};

export const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

export const calculateStockStatus = (voorraad = 0, minVoorraad = 0) => {
    let progressWidth = 100;
    if (minVoorraad > 0) {
        progressWidth = Math.min((voorraad / minVoorraad) * 100, 100);
    }

    if (voorraad < minVoorraad) {
        if (voorraad < 0.2 * minVoorraad) {
            return {
                progressWidth,
                statusText: 'Kritiek',
                badgeClass: 'widget-badge danger',
                progressClass: 'widget-progress-fill danger',
                titleClass: 'widget-title danger',
                valueClass: 'widget-value-large danger'
            };
        } else {
            return {
                progressWidth,
                statusText: 'Waarschuwing',
                badgeClass: 'widget-badge warning',
                progressClass: 'widget-progress-fill warning',
                titleClass: 'widget-title warning',
                valueClass: 'widget-value-large warning'
            };
        }
    }

    return {
        progressWidth,
        statusText: 'Voldoende',
        badgeClass: 'widget-badge success',
        progressClass: 'widget-progress-fill',
        titleClass: 'widget-title',
        valueClass: 'widget-value-large'
    };
};

export const calculateThtStatus = (dateStr) => {
    if (!dateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thtDate = new Date(dateStr);
    thtDate.setHours(0, 0, 0, 0);

    const diffTime = thtDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        const absDays = Math.abs(diffDays);
        return {
            text: `${absDays} ${absDays === 1 ? 'dag' : 'dagen'} verlopen`,
            color: 'var(--danger-color)'
        };
    } else if (diffDays === 0) {
        return {
            text: 'Verloopt vandaag',
            color: 'var(--warning-color)'
        };
    } else {
        return {
            text: `Nog ${diffDays} ${diffDays === 1 ? 'dag' : 'dagen'}`,
            color: 'var(--accent-color)'
        };
    }
};

export const formatDateInputValue = (val) => {
    let digits = (val || '').replace(/\D/g, '');
    if (digits.length > 8) digits = digits.substring(0, 8);
    if (digits.length >= 5) {
        return digits.substring(0, 2) + '-' + digits.substring(2, 4) + '-' + digits.substring(4);
    } else if (digits.length >= 3) {
        return digits.substring(0, 2) + '-' + digits.substring(2);
    }
    return digits;
};

export const parseDateInputToIso = (formattedVal) => {
    if (!formattedVal) return null;
    const parts = formattedVal.split('-');
    if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && (parts[2].length === 2 || parts[2].length === 4)) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        let year = parseInt(parts[2], 10);
        if (parts[2].length === 2) {
            year += 2000;
        }
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
            const mm = String(month).padStart(2, '0');
            const dd = String(day).padStart(2, '0');
            return `${year}-${mm}-${dd}`;
        }
    }
    return null;
};
