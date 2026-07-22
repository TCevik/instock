import { getSupabase, checkAuth, showMessage, handleFormSubmit } from './main.js';
import { loadHeader } from './header.js';

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('add-product-form');
    const eanInput = document.getElementById('ean');
    const naamInput = document.getElementById('naam');
    const merkInput = document.getElementById('merk');
    const afdelingInput = document.getElementById('afdeling');
    const voorraadInput = document.getElementById('voorraad');
    const minimaleVoorraadInput = document.getElementById('minimale_voorraad');
    const prijsInput = document.getElementById('prijs');
    const inkoopprijsInput = document.getElementById('inkoopprijs');
    const thtInput = document.getElementById('tht');
    const locatiecodeInput = document.getElementById('locatiecode');
    const afbeeldingInput = document.getElementById('afbeelding');

    loadHeader();

    const auth = await checkAuth(['beheerder']);
    if (!auth) return;

    const supabase = await getSupabase();

    const messageBox = document.getElementById('message-box');
    const messageIcon = document.getElementById('message-icon');
    const messageText = document.getElementById('message-text');
    const submitBtn = document.getElementById('submitBtn');

    const inputs = Array.from(form.querySelectorAll('input'));
    inputs.forEach((input, index) => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const nextInput = inputs[index + 1];
                if (nextInput) {
                    nextInput.focus();
                } else {
                    submitBtn.click();
                }
            }
        });
    });

    const barcodeTypeSelect = document.getElementById('barcode_type');

    const validateBarcode = (code, type) => {
        if (!code) return { valid: false, error: 'Barcode mag niet leeg zijn.' };

        if (type === 'EAN-13') {
            if (!/^\d{13}$/.test(code)) {
                return { valid: false, error: 'EAN-13 moet precies 13 cijfers bevatten.' };
            }
        } else if (type === 'EAN-8') {
            if (!/^\d{8}$/.test(code)) {
                return { valid: false, error: 'EAN-8 moet precies 8 cijfers bevatten.' };
            }
        } else if (type === 'UPC-A') {
            if (!/^\d{12}$/.test(code)) {
                return { valid: false, error: 'UPC-A moet precies 12 cijfers bevatten.' };
            }
        } else if (type === 'Modified Plessy') {
            if (!/^[0-9A-Fa-f]{2,16}$/.test(code)) {
                return { valid: false, error: 'Modified Plessy moet 2 tot 16 hexadecimale tekens (0-9, A-F) bevatten.' };
            }
        }

        return { valid: true };
    };

    eanInput.focus();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const ean = eanInput.value.trim();
        const naam = naamInput.value.trim();
        const barcodeType = barcodeTypeSelect ? barcodeTypeSelect.value : 'EAN-13';

        if (!ean || !naam) {
            showMessage(messageBox, messageText, messageIcon, 'EAN en Naam zijn verplichte velden.', 'error');
            return;
        }

        const barcodeValidation = validateBarcode(ean, barcodeType);
        if (!barcodeValidation.valid) {
            showMessage(messageBox, messageText, messageIcon, barcodeValidation.error, 'error');
            return;
        }

        const productData = {
            ean: ean,
            barcode_type: barcodeType,
            naam: naam,
            merk: merkInput.value.trim() || null,
            afdeling: afdelingInput.value.trim() || null,
            voorraad: voorraadInput.value === '' ? null : parseInt(voorraadInput.value, 10),
            minimale_voorraad: minimaleVoorraadInput.value === '' ? null : parseInt(minimaleVoorraadInput.value, 10),
            prijs: prijsInput.value === '' ? null : parseFloat(prijsInput.value),
            inkoopprijs: inkoopprijsInput.value === '' ? null : parseFloat(inkoopprijsInput.value),
            tht: thtInput.value || null,
            locatiecode: locatiecodeInput.value.trim() || null,
            afbeelding: afbeeldingInput.value.trim() || null
        };

        await handleFormSubmit(submitBtn, 'Bezig met opslaan...', messageBox, async () => {
            const { error } = await supabase
                .from('producten')
                .insert([productData]);

            if (error) {
                showMessage(messageBox, messageText, messageIcon, error.message || 'Er is een fout opgetreden bij het toevoegen van het product.', 'error');
            } else {
                showMessage(messageBox, messageText, messageIcon, 'Product succesvol toegevoegd!', 'success');
                form.reset();
                eanInput.focus();
            }
        });
    });
});
