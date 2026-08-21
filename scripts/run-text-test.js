const { spawnSync } = require('child_process');
const { getLocalDateTime } = require('../utils/dateTime');

const date = getLocalDateTime();
const reportDir = `playwright-report/${date}`;

console.log(`\n📁 Carpeta de ejecución: ${reportDir}\n`);

const env = {
    ...process.env,
    REPORT_DIR: reportDir
};

// 1. Ejecutar crawler
console.log('🕷️ Ejecutando crawler...\n');

const crawl = spawnSync(
    'node',
    ['scripts/crawl.js'],
    {
        stdio: 'inherit',
        env,
        shell: true
    }
);

if (crawl.status !== 0) {
    console.error('\n❌ El crawler terminó con errores.');
    process.exit(crawl.status ?? 1);
}

// 2. Ejecutar prueba de comparación de textos
console.log('🧪 Ejecutando comparación de textos...\n');

const tests = spawnSync(
    'npx',
    [
        'playwright',
        'test',
        'tests/content-diff.spec.js'
    ],
    {
        stdio: 'inherit',
        env,
        shell: true
    }
);
if (tests.error) {
    console.error('\n❌ Error al ejecutar Playwright:');
    console.error(tests.error);
    process.exit(tests.status ?? 1);
}

process.exit(tests.status ?? 1);