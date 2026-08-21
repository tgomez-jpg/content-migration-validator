//scripts/crawl.js
require('dotenv').config();
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { normalizarUrl } = require('../utils/urlsNormalizaer');

const BASE_URL = process.env.BASE_URL_ORIGINAL || 'https://qa.demo.sev6.netcar.com.mx';
const BASE_ORIGIN = new URL(BASE_URL).origin;
const VISITED_URLS = new Set();
const PATHS_TO_TEST = [];
const URLS_RECHAZADAS = new Map();

function registrarUrlRechazada(url, motivo) {
    if (!URLS_RECHAZADAS.has(url)) {
        URLS_RECHAZADAS.set(url, motivo);
    }
}

async function crawl() {
    console.log(`🔍 Iniciando rastreo en: ${BASE_URL}`);
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const queue = [BASE_URL];

    while (queue.length > 0) {
        const url = queue.shift();
        const currentUrl = normalizarUrl(url);
        if (VISITED_URLS.has(currentUrl)) continue;
        VISITED_URLS.add(currentUrl);

        console.log(`  Rastreando: ${currentUrl}`);

        try {
            await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
            const parsedUrl = new URL(currentUrl);

            PATHS_TO_TEST.push({
                url: currentUrl, //`Página: ${parsedUrl.pathname}`,
                path: parsedUrl.pathname,
                search: parsedUrl.search,
                selector: 'main'
                //body para todo el sitio incluido header y footer, main para solo el contenido principal 
            });

            const links = await page.locator('a[href]').evaluateAll(elements =>
                elements.map(a => a.href)
            );

            for (const link of links) {
                try {
                    const urlObj = new URL(link, BASE_URL);
                    const normalizedUrl = normalizarUrl(urlObj.href);

                    // 1. Evitar URLs ya procesadas
                    if (VISITED_URLS.has(normalizedUrl)) {
                        continue;
                    }

                    // 2. Evitar URLs que ya están pendientes de procesar
                    if (queue.includes(normalizedUrl)) {
                        continue;
                    }

                    // 3. Excluir dominios externos
                    if (urlObj.origin !== BASE_ORIGIN) {
                        registrarUrlRechazada(normalizedUrl, 'Dominio externo');
                        continue;
                    }

                    // 4. Excluir archivos
                    if (/\.(pdf|jpg|png|zip|css|js)$/i.test(urlObj.pathname)) {
                        registrarUrlRechazada(normalizedUrl, 'Extensión de archivo excluida');
                        continue;
                    }

                    // 5. Excluir rutas /twitter
                    if (/\/twitter\/?$/i.test(urlObj.pathname)) {
                        registrarUrlRechazada(normalizedUrl, 'Ruta /twitter excluida');
                        continue;
                    }

                    // 6. URL válida → agregar a la cola
                    queue.push(normalizedUrl);
                } catch {
                    registrarUrlRechazada(link, 'URL inválida');
                    console.error(`❌ Error al procesar enlace: ${link}`);
                }
            }
        } catch {
            console.warn(`⚠️  No se pudo cargar: ${currentUrl}`);
        }


    }
    await browser.close();

    const dataDir = path.join(__dirname, '../data');

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const outputPath = path.join(dataDir, 'urls.json');
    const outputPathRechazadas = path.join(dataDir, 'urls_rechazadas.json');

    fs.writeFileSync(outputPath, JSON.stringify(PATHS_TO_TEST, null, 2));
    console.log(`\n✅ Rastreo finalizado. Se guardaron ${PATHS_TO_TEST.length} rutas en ${outputPath}`);

    fs.writeFileSync(outputPathRechazadas, JSON.stringify([...URLS_RECHAZADAS.entries()], null, 2));
    console.log(`🚫 URLs rechazadas: ${URLS_RECHAZADAS.size}. Se registraron en ${outputPathRechazadas}`);
    // if (URLS_RECHAZADAS.size > 0) {

    //     console.log('\n📋 Detalle de URLs rechazadas:\n');

    //     for (const [url, motivo] of URLS_RECHAZADAS) {
    //         console.log(`   - ${url}`);
    //         console.log(`     Motivo: ${motivo}`);
    //     }
    // }
}

crawl();

//module.exports = { crawl };

