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
