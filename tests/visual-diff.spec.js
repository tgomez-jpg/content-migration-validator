require('dotenv').config();
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
//const pixelmatch = require('pixelmatch');
const { default: pixelmatch } = require('pixelmatch');
const { PNG } = require('pngjs');

const BASE_URL_ORIGINAL = process.env.BASE_URL_ORIGINAL;
const BASE_URL_NUEVO = process.env.BASE_URL_NUEVO;

// Carga dinámica del JSON guardado por el crawler
const urlsPath = path.join(__dirname, '../data/urls.json');
const urlData = fs.existsSync(urlsPath) ? require(urlsPath) : [];

if (!BASE_URL_ORIGINAL || !BASE_URL_NUEVO) {
    throw new Error(
        'Faltan BASE_URL_ORIGINAL o BASE_URL_NUEVO en el archivo .env'
    );
}

function obtenerNombreArchivo(item) {
    const nombre = `${item.path}${item.search || ''}`
        .replace(/^\/+/, '')
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, '_');

    return nombre || 'home';
}

test.describe(`Validación de migración visual`, () => {
    for (const item of urlData) {
        test(`Comparar visualmente en: ${item.url} (${item.path}${item.search})`, async ({ page }) => {

            // 1. Sitio Base 
            const urlOriginal = `${BASE_URL_ORIGINAL}${item.path}${item.search || ''}`;
            const urlNuevo = `${BASE_URL_NUEVO}${item.path}${item.search || ''}`;

            let screenshotOriginal;
            let screenshotNuevo;


            // 2. Cargar sitio Original
            await test.step('Cargar sitio Original', async () => {
                await page.goto(urlOriginal, { waitUntil: 'domcontentloaded' });
                await page.waitForLoadState('networkidle', { timeout: 50000 });
            });

            // 3. Tomar captura de pantalla del sitio original
            await test.step('Tomar captura de pantalla del sitio original', async () => {
                const locatorOriginal = page.locator(item.selector);
                await expect(locatorOriginal).toBeVisible();

                screenshotOriginal = await locatorOriginal.screenshot();
            });

            // 4. Cargar sitio Nuevo 
            await test.step('Cargar sitio Nuevo', async () => {
                await page.goto(urlNuevo, { waitUntil: 'domcontentloaded' });
                await page.waitForLoadState('networkidle', { timeout: 50000 });
            });

            // 5. Tomar captura de pantalla del sitio nuevo 
            await test.step('Tomar captura de pantalla del sitio Nuevo', async () => {
                const locatorNuevo = page.locator(item.selector);
                await expect(locatorNuevo).toBeVisible();

                screenshotNuevo = await locatorNuevo.screenshot();
            });

            // 6. Comparar capturas de pantalla
            await test.step('Validación visual entre sitio original y sitio nuevo', async () => {
                const imgOriginal = PNG.sync.read(screenshotOriginal);
                const imgNuevo = PNG.sync.read(screenshotNuevo);

                // if (imgOriginal.width !== imgNuevo.width || imgOriginal.height !== imgNuevo.height) {
                //     throw new Error(
                //         `Las imágenes tienen dimensiones diferentes.\n` +
                //         `Original: ${imgOriginal.width}x${imgOriginal.height}\n` +
                //         `Nuevo: ${imgNuevo.width}x${imgNuevo.height}\n` +
                //         `Base: ${urlOriginal}\n` +
                //         `Nuevo: ${urlNuevo}`
                //     );
                // }
                const diff = new PNG({
                    width: imgOriginal.width,
                    height: imgOriginal.height
                });

                const diferencias = pixelmatch(
                    imgOriginal.data,
                    imgNuevo.data,
                    diff.data,
                    imgOriginal.width,
                    imgOriginal.height,
                    {
                        threshold: 0.1
                    }
                );
                const totalPixeles = imgOriginal.width * imgOriginal.height;

                const porcentajeDiferencia = (diferencias / totalPixeles) * 100;

                console.log(`\n📊 ${item.path}`);

                console.log(`   Píxeles diferentes: ${diferencias}`);

                console.log(`   Diferencia visual: ${porcentajeDiferencia.toFixed(4)}%`);

                if (diferencias > 0) {

                    throw new Error(
                        `Se detectaron diferencias visuales.\n` +
                        `Diferencia: ${porcentajeDiferencia.toFixed(4)}%\n` +
                        `Base: ${urlOriginal}\n` +
                        `Nuevo: ${urlNuevo}`
                    );
                }

            });
        });
    }
});