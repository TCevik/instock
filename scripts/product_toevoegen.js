document.addEventListener('DOMContentLoaded', () => {
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

    const setDefaultDate = () => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        thtInput.value = `${yyyy}-${mm}-${dd}`;
    };
    setDefaultDate();

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

    const showMessage = (text, type) => {
        messageText.textContent = text;
        messageBox.className = `message ${type}`;
        messageIcon.textContent = type === 'error' ? 'error_outline' : 'check_circle_outline';
        messageBox.style.display = 'flex';
    };

    const checkAuth = async () => {
        if (!window.supabase) {
            setTimeout(checkAuth, 50);
            return;
        }

        const { data: { session } } = await window.supabase.auth.getSession();
        if (!session) {
            window.location.href = 'login.html';
            return;
        }

        const { data, error } = await window.supabase.from('user_data').select('role').eq('id', session.user.id).single();
        if (error || !data || data.role !== 'beheerder') {
            window.location.href = 'index.html';
            return;
        }
    };

    checkAuth();
    eanInput.focus();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageBox.style.display = 'none';

        const ean = eanInput.value.trim();
        const naam = naamInput.value.trim();

        if (!ean || !naam) {
            showMessage('EAN en Naam zijn verplichte velden.', 'error');
            return;
        }

        submitBtn.disabled = true;
        const btnText = submitBtn.querySelector('span');
        const originalText = btnText.textContent;
        btnText.textContent = 'Bezig met opslaan...';

        const productData = {
            ean: ean,
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

        try {
            const { error } = await window.supabase
                .from('producten')
                .insert([productData]);

            if (error) {
                showMessage(error.message || 'Er is een fout opgetreden bij het toevoegen van het product.', 'error');
            } else {
                showMessage('Product succesvol toegevoegd!', 'success');
                form.reset();
                setDefaultDate();
                eanInput.focus();
            }
        } catch (err) {
            showMessage('Er is een onverwachte fout opgetreden.', 'error');
        } finally {
            submitBtn.disabled = false;
            btnText.textContent = originalText;
        }
    });
});
