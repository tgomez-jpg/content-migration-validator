require('dotenv').config();
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { normalizeText } = require('../utils/textNormalizaer');
const { diffLines } = require('diff');


const BASE_URL_ORIGINAL = process.env.BASE_URL_ORIGINAL;
const BASE_URL_NUEVO = process.env.BASE_URL_NUEVO;

if (!BASE_URL_ORIGINAL || !BASE_URL_NUEVO) {
    throw new Error(
        'Faltan BASE_URL_ORIGINAL o BASE_URL_NUEVO en el archivo .env'
    );
}

// Carga dinámica del JSON guardado por el crawler
const urlsPath = path.join(__dirname, '../data/urls.json');
const urlData = fs.existsSync(urlsPath) ? require(urlsPath) : [];

const reportDir = process.env.REPORT_DIR || 'playwright-report/default';

const textDir = path.join(
    reportDir,
    'test-results',
    'text'
);

function obtenerNombreArchivo(item) {
    const nombre = `${item.path}${item.search || ''}`
        .replace(/^\/+/, '')
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, '_');

    return nombre || 'home';
}

test.describe(`Validación de migración de texto plano`, () => {

    for (const item of urlData) {
        test(`Comparar textos en: ${item.url} (${item.path} ${item.search})`, async ({ page }) => {

            // 1. Sitio Base
            const urlOriginal = `${BASE_URL_ORIGINAL}${item.path}${item.search || ''}`;
            let textOriginal, textoOriginalRaw;
            let textNuevo, textoNuevoRaw;

            await test.step('Cargar sitio Original', async () => {
                await page.goto(urlOriginal, { waitUntil: 'domcontentloaded' });
                await page.waitForLoadState('networkidle', { timeout: 50000 });
            });


            await test.step('Obtener contenido del sitio original', async () => {
                const locatorOriginal = page.locator(item.selector);
                await expect(locatorOriginal).toBeVisible();
                textoOriginalRaw = await locatorOriginal.innerText();
                textOriginal = normalizeText(textoOriginalRaw);
            });


            // 2. Sitio Nuevo            
            const urlNuevo = `${BASE_URL_NUEVO}${item.path}${item.search}`;

            await test.step('Cargar sitio Nuevo', async () => {
                await page.goto(urlNuevo, { waitUntil: 'domcontentloaded' });
                await page.waitForLoadState('networkidle', { timeout: 50000 });
            });


            await test.step('Obtener contenido del sitio nuevo', async () => {
                const locatorNuevo = page.locator(item.selector);
                await expect(locatorNuevo).toBeVisible();
                textoNuevoRaw = await locatorNuevo.innerText();
                textNuevo = normalizeText(textoNuevoRaw);
            });

            await test.step('Guardar textos de evidencias', async () => {
                //Guardar textos como evidencia 
                const nombreArchivo = obtenerNombreArchivo(item);
                const evidenciaDir = path.join(
                    textDir,
                    nombreArchivo
                );
                fs.mkdirSync(evidenciaDir, { recursive: true });
                fs.writeFileSync(
                    path.join(evidenciaDir, 'original.txt'),
                    textoOriginalRaw,
                    'utf8'
                );
                fs.writeFileSync(
                    path.join(evidenciaDir, 'nuevo.txt'),
                    textoNuevoRaw,
                    'utf8'
                );
            });

            // 3. Aserción
            await test.step('Comparar textos entre sitio original y sitio nuevo', async () => {
                if (textOriginal !== textNuevo) {
                    const diferencias = diffLines(
                        textOriginal,
                        textNuevo
                    );
                    let diffTexto = '';
                    for (const parte of diferencias) {
                        if (parte.added) {
                            diffTexto += `+ ${parte.value}`;
                        } else if (parte.removed) {
                            diffTexto += `- ${parte.value}`;
                        }
                    }
                    const nombreArchivo = obtenerNombreArchivo(item);
                    const evidenciaDir =
                        path.join(
                            textDir,
                            nombreArchivo
                        );
                    fs.writeFileSync(
                        path.join(
                            evidenciaDir,
                            'diff.txt'
                        ),
                        diffTexto,
                        'utf8'
                    );
                }
                expect(
                    textNuevo,
                    `Textos-Inconsistencia detectada.\n Base: ${urlOriginal}\n Nuevo: ${urlNuevo}`
                ).toBe(textOriginal);
            });




        });
    }

});