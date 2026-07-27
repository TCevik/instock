export const DAYS = ['MAANDAG', 'DINSDAG', 'WOENSDAG', 'DONDERDAG', 'VRIJDAG', 'ZATERDAG', 'ZONDAG'];

export const DEFAULT_CARTS = [
    { id: 1, name: 'Kar 1', type: 'single', capacity: 15, oven: true, desc: '15 plekken in 1 keer in de oven (1 categorie)' },
    { id: 2, name: 'Kar 2', type: 'single', capacity: 15, oven: true, desc: '15 plekken in 1 keer in de oven (1 categorie)' },
    { id: 3, name: 'Kar 3', type: 'single', capacity: 15, oven: true, desc: '15 plekken in 1 keer in de oven (1 categorie)' },
    { id: 4, name: 'Kar 4', type: 'mixed', capacity: 18, oven: true, desc: '18 plekken gemixt in de oven' },
    { id: 5, name: 'Kar 5', type: 'mixed', capacity: 18, oven: true, desc: '18 plekken gemixt in de oven' },
    { id: 6, name: 'Kar 6', type: 'mixed', capacity: 18, oven: true, desc: '18 plekken gemixt in de oven' },
    { id: 7, name: 'Kar 7', type: 'mixed', capacity: 18, oven: true, desc: '18 plekken gemixt in de oven' },
    { id: 8, name: 'Kar 8 (Ontdooien)', type: 'thaw', capacity: 18, oven: false, desc: '18 plekken om te laten ontdooien (alleen Batch 1)' }
];

export const state = {
    selectedDay: 'MAANDAG',
    daysData: {
        'MAANDAG': [],
        'DINSDAG': [],
        'WOENSDAG': [],
        'DONDERDAG': [],
        'VRIJDAG': [],
        'ZATERDAG': [],
        'ZONDAG': []
    },
    productPlateConfig: {},
    customCarts: JSON.parse(JSON.stringify(DEFAULT_CARTS))
};

export let previousStateData = null;
export const setPreviousStateData = (data) => {
    previousStateData = data;
};

export let storeId = null;
export const setStoreId = (id) => {
    storeId = id;
};
