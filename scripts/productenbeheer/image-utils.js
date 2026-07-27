export const validateBarcode = (code, type) => {
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

export const resizeAndCompressImage = (file) => {
    return new Promise((resolve) => {
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = (evt) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 128;
                canvas.height = 128;
                const ctx = canvas.getContext('2d');

                const minDim = Math.min(img.width, img.height);
                const sx = (img.width - minDim) / 2;
                const sy = (img.height - minDim) / 2;

                ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 128, 128);
                const compressedUrl = canvas.toDataURL('image/webp', 0.85);
                resolve(compressedUrl);
            };
            img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    });
};
