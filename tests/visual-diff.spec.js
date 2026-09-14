require('dotenv').config();
const { test,testInfo , expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { default: pixelmatch } = require('pixelmatch');
const { PNG } = require('pngjs');

const BASE_URL_ORIGINAL = process.env.BASE_URL_ORIGINAL;
const BASE_URL_NUEVO = process.env.BASE_URL_NUEVO;
const reportDir = process.env.REPORT_DIR || 'playwright-report/default';

// Carga dinámica del JSON guardado por el crawler
const urlsPath = path.join(__dirname, '../data/urls.json');
const urlData = fs.existsSync(urlsPath) ? require(urlsPath) : [];
const visualDir = path.join(
    reportDir,
    'Evidencias-Capturas',
);

if (!BASE_URL_ORIGINAL || !BASE_URL_NUEVO) {
    throw new Error('Faltan BASE_URL_ORIGINAL o BASE_URL_NUEVO en el archivo .env');
}

// =====================================================================
// VALIDACIÓN TEMPRANA: Evitar el error "No tests found"
// =====================================================================
if (urlData.length === 0) {
    console.error("\n⚠️ ADVERTENCIA CRÍTICA: El archivo data/urls.json está vacío o no existe.");
    console.error("⚠️ Por favor, ejecuta primero el crawler (ej. node scripts/crawl.js o tu script orquestador) para generar las URLs.\n");
}

// =====================================================================
//  CONSTANTES Y FUNCIONES DE ESTABILIZACIÓN
// =====================================================================
const HIDE_DYNAMIC_ELEMENTS_CSS = `
    .cookie-policy-container, .cookie-banner, #cookie-banner ,
    header, .headHome, .header-talet,
    footer,
    #MenuInterior,
    .crm,
    .ChatXS_Icon {
        display: none !important; 
        visibility: hidden !important; 
        height: 0 !important; 
    }
`;

function obtenerNombreArchivo(item) {
    const nombre = `${item.path}${item.search || ''}`
        .replace(/^\/+/, '')
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, '_');
    return nombre || 'home';
}

// =====================================================================
// Función para estabilizar el renderizado antes de capturar
// =====================================================================
async function waitForPageStability(page) {
    await page.evaluate(async () => {
        // 1. Esperar a que las fuentes web (Web Fonts) estén completamente cargadas
        await document.fonts.ready;
        // 2. Esperar a que todas las imágenes (<img>) del documento terminen de cargar
        const images = Array.from(document.images);
        const pendingImages = images.filter(img => !img.complete);
        await Promise.all(
            pendingImages.map(
                img => new Promise(resolve => {
                    img.onload = resolve;
                    img.onerror = resolve; // Resolvemos en error para no bloquear la prueba si una imagen está rota
                })
            )
        );
    });
}
// =====================================================================
// Función para forzar la carga de elementos Lazy Load (imágenes que cargan al hacer scroll) -->
async function forceLazyLoadRendering(page) {
    // 1. Ir hasta el final de la página
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve,800)))
    // 2. Volver al inicio para que la captura comience desde arriba
    await page.evaluate(() => window.scrollTo(0, 0));
    // 3. Pequeña pausa para asegurar que el renderizado finalizó
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve,800)))
}

async function forceLayoutRecalculation(page){
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve,500)));
}

// =====================================================================
// Funcion maestra de preparacion con fallback de recarga
// =====================================================================
async function preparePageForCapture(page, url){
    //1. Navegacion inicial 
    await page.goto(url, { waitUntil: 'domcontentloaded'});
    await page.waitForLoadState('networkidle',{ timeout: 50000 });
    await waitForPageStability(page);

    // NUEVO: Si es una página de Cupra, hacer una recarga preventiva para limpiar estados de JS atascados
    if (url.includes('/Cupra/')) {
        console.log(`   🔄 [${new URL(url).pathname}] Página Cupra detectada. Aplicando recarga preventiva de limpieza...`);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 40000 });
        await waitForPageStability(page);
    }

    // Función interna para aplicar todos los trucos visuales
    const applyVisualStabilization = async () => {
        await page.addStyleTag({ content: HIDE_DYNAMIC_ELEMENTS_CSS });
        await forceLazyLoadRendering(page);
        await forceLayoutRecalculation(page);
    };

    await applyVisualStabilization();

    // 2. DETECCIÓN ROBUSTA DE ELEMENTOS ATORADOS
    const criticalSelectors = ['.dato-ficha', '.btn-ficha'];
    // Primero, verificamos si la página siquiera tiene estos elementos en el DOM
    const existsInDOM = await page.evaluate((selectors) => {
        return selectors.some(sel => document.querySelector(sel) !== null);
    }, criticalSelectors);

    if (existsInDOM) {
        try {
            // Espera de hasta 3 segundos a que AL MENOS UNO de estos elementos 
            // tenga altura y ancho real (> 0). Esto le da tiempo al JS del sitio para renderizarlos.
            await page.waitForFunction((selectors) => {
                return selectors.some(sel => {
                    const el = document.querySelector(sel);
                    return el && el.offsetHeight > 0 && el.offsetWidth > 0;
                });
            }, criticalSelectors, { timeout: 4000 });
        } catch (error) {
            // Si llegamos aquí, pasaron 3 segundos y siguen con altura 0. Están "atorados".
            console.log(`   🔄 [${new URL(url).pathname}] Elementos de ficha técnica atorados. Simulando F5...`);
            
            // Recarga forzada
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 40000 });
            await waitForPageStability(page);
            await applyVisualStabilization();
            
            // Pausa extra post-recarga para asegurar que el JS de renderizado se ejecute
            await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1500)));
        }
    }
}
// =====================================================================
// Función para expandir elementos colapsados (ej. <details>, <summary>, acordeones, etc.)
// =====================================================================

const EXPAND_HIDDEN_CONTENT_CSS = `
    .collapse,
    .collapsing,
    [class*="collapse"],
    details:not([open]) > *:not(summary) {
        display: block !important;
        visibility: visible !important;
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
    }
    
    /* Asegurar que los botones/títulos de acordeones no interfieran */
    .collapsed,
    [aria-expanded="false"] {
        pointer-events: none !important;
    }
`;

async function expandCollapsedElements(page) {
    await page.addStyleTag({ content: EXPAND_HIDDEN_CONTENT_CSS });
    // Usamos promesa nativa en lugar de waitForTimeout por buenas prácticas
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
}

// =====================================================================
// BLOQUE DE PRUEBAS
// =====================================================================
test.describe(`Validación de migración`, () => {
    test.setTimeout(90000); 
    test.beforeEach(async ({ context }) => {
        await context.clearCookies();
        await context.clearPermissions();
    });
    // Si está vacío, registramos un test que falle claramente para evitar "No tests found"
    if (urlData.length === 0) {
        test('Fallo: No hay URLs para probar (ejecuta el crawler primero)', () => {
            throw new Error('El archivo data/urls.json está vacío. Ejecuta el crawler antes de correr las pruebas visuales.');
        });
    }
    for (const item of urlData) {
        test(`Comparar visualmente en: ${item.url} (${item.path}${item.search})`, async ({ page }, testInfo) => {

            // 1. Definir urls Original y Nuevo, y carpeta de evidencia
            const urlOriginal = `${BASE_URL_ORIGINAL}${item.path}${item.search || ''}`;
            const urlNuevo = `${BASE_URL_NUEVO}${item.path}${item.search || ''}`;
            const folderNombre = obtenerNombreArchivo(item);
            const evidenciaDir = path.join(visualDir, folderNombre);

            let screenshotOriginal;
            let screenshotNuevo;

            // 2. Cargar sitio Original y tomar captura
            await test.step('Preparar y Tomar captura de pantalla del sitio original', async () => {
                await preparePageForCapture(page, urlOriginal);
                const locatorOriginal = page.locator(item.selector);

                // <! Omitir la prueba si no existe o no es visible el selector (ej. sin <main>) -->
                const isVisible = await locatorOriginal.isVisible({ timeout: 5000 }).catch(() => false);
                if (!isVisible) {
                    test.skip(true, `El elemento '${item.selector}' no es visible o no existe en esta página.`);
                    return;
                }
                await expandCollapsedElements(page);
                await page.waitForTimeout(300);
                screenshotOriginal = await locatorOriginal.screenshot({
                    animations: 'disabled'
                });
                // Validación defensiva del buffer
                if (!screenshotOriginal || screenshotOriginal.length < 100) {
                    throw new Error('La captura de pantalla original está corrupta o vacía (fallo transitorio del navegador).');
                }
                fs.mkdirSync(evidenciaDir, { recursive: true });
                const suffix = testInfo.retry > 0 ? `-Retry-${testInfo.retry}` : '';
                fs.writeFileSync(path.join(evidenciaDir, `original${suffix}.png`), screenshotOriginal);
            });

            // 3. Tomar captura de pantalla del sitio nuevo 
            await test.step('Preparar y Tomar captura de pantalla del sitio Nuevo', async () => {
                await preparePageForCapture(page, urlNuevo);
                const locatorNuevo = page.locator(item.selector);
                
                // <!-- Omitir la prueba si no existe o no es visible el selector (ej. sin <main>) -->
                const isVisible = await locatorNuevo.isVisible({ timeout: 5000 }).catch(() => false);
                if (!isVisible) {
                    test.skip(true, `El elemento '${item.selector}' no es visible o no existe en esta página.`);
                    return;
                }
                await expandCollapsedElements(page);
                await page.waitForTimeout(300); 
                screenshotNuevo = await locatorNuevo.screenshot({
                    animations: 'disabled'
                });
                // Validación defensiva del buffer
                if (!screenshotNuevo || screenshotNuevo.length < 100) {
                    throw new Error('La captura de pantalla nueva está corrupta o vacía (fallo transitorio del navegador).');
                }
                const suffix = testInfo.retry > 0 ? `-Retry-${testInfo.retry}` : '';
                fs.writeFileSync(path.join(evidenciaDir, `nuevo${suffix}.png`), screenshotNuevo);
            });

            // 6. Comparar capturas de pantalla
            await test.step('Validación visual entre sitio original y sitio nuevo', async () => {
                let imgOriginal, imgNuevo;
                try{
                    imgOriginal = PNG.sync.read(screenshotOriginal);
                    imgNuevo = PNG.sync.read(screenshotNuevo);
                }catch(e){
                    throw new Error(`Error al procesar la imagen (buffer corrupto): ${e.message}. Esto es un fallo transitorio del navegador.`);
                }

                // Validacion estricta de dimensiones para detectar capturas inestables
                if (imgOriginal.width !== imgNuevo.width || imgOriginal.height !== imgNuevo.height) {
                    throw new Error(
                        `Las imágenes tienen dimensiones diferentes (Captura inestable).\n` +
                        `Original: ${imgOriginal.width}x${imgOriginal.height}\n` +
                        `Nuevo: ${imgNuevo.width}x${imgNuevo.height}\n` +
                        `URL: ${urlOriginal}`
                    );
                }
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
                const porcentajeDiferencia = totalPixeles > 0 ? (diferencias / totalPixeles) * 100 : 0;

                console.log(`\n📊 ${item.path}`);
                console.log(`   Dimensiones: ${imgOriginal.width}x${imgOriginal.height}`);
                console.log(`   Diferencia visual: ${porcentajeDiferencia.toFixed(4)}%`);

                if (diferencias > 0) {
                    const diffBuffer = PNG.sync.write(diff);
                    const suffix = testInfo.retry > 0 ? `-Retry-${testInfo.retry}` : '';
                    fs.writeFileSync(path.join(evidenciaDir, `diff${suffix}.png`), diffBuffer);

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