require('dotenv').config();
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { normalizeText } = require('../utils/textNormalizaer');


const BASE_URL_ORIGINAL = process.env.BASE_URL_ORIGINAL || 'https://playwright.dev';
const BASE_URL_NUEVO = process.env.BASE_URL_NUEVO || 'https://playwright.dev';

// Carga dinámica del JSON guardado por el crawler
const urlsPath = path.join(__dirname, '../data/urls.json');
const urlData = fs.existsSync(urlsPath) ? require(urlsPath) : [];

test.describe(`Validación de migración de texto plano`, () => {

    for (const item of urlData) {
        test(`Comparar textos en: ${item.url} (${item.path} ${item.search})`, async ({ page }) => {

            // 1. Sitio Base
            const urlOriginal = `${BASE_URL_ORIGINAL}${item.path}${item.search}`;

            await test.step('Cargar sitio Original', async () => {
                await page.goto(urlOriginal, { waitUntil: 'domcontentloaded' });
                await page.waitForLoadState('networkidle', { timeout: 50000 });
            });

            let textOriginal;
            await test.step('Obtener contenido del sitio original', async () => {
                const locatorOriginal = page.locator(item.selector);
                await expect(locatorOriginal).toBeVisible();
                textOriginal = normalizeText(await locatorOriginal.innerText());
            });


            // 2. Sitio Nuevo            
            const urlNuevo = `${BASE_URL_NUEVO}${item.path}${item.search}`;

            await test.step('Cargar sitio Nuevo', async () => {
                await page.goto(urlNuevo, { waitUntil: 'domcontentloaded' });
                await page.waitForLoadState('networkidle', { timeout: 50000 });
            });

            let textNuevo;
            await test.step('Obtener contenido del sitio nuevo', async () => {
                const locatorNuevo = page.locator(item.selector);
                await expect(locatorNuevo).toBeVisible();
                textNuevo = normalizeText(await locatorNuevo.innerText());
            });

            // 3. Aserción
            await test.step('Comparar textos entre sitio original y sitio nuevo', async () => {
                expect(
                    textNuevo,
                    `Textos-Inconsistencia detectada.\nBase: ${urlOriginal}\nNuevo: ${urlNuevo}`
                ).toBe(textOriginal);
            });

        });
    }

});