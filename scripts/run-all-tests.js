const { spawnSync } = require('child_process');
const { getLocalDateTime } = require('../utils/dateTime');

// 1. Configuración inicial
const date = getLocalDateTime();
const reportDir = `playwright-report/${date}`;

console.log(`\n📁 Carpeta de ejecución: ${reportDir}\n`);

const env = {
    ...process.env,
    REPORT_DIR: reportDir
};

// =====================================================================
// PASO 1: Ejecutar Crawler (Solo una vez)
// =====================================================================
console.log('🕷️ 1. Ejecutando crawler para descubrir URLs...\n');
const crawl = spawnSync('node', ['scripts/crawl.js'], {
    stdio: 'inherit',
    env,
    shell: true
});

if (crawl.status !== 0) {
    console.error('\n❌ El crawler terminó con errores. Deteniendo la ejecución.');
    process.exit(crawl.status ?? 1);
}
console.log('✅ Crawler finalizado correctamente.\n');

// =====================================================================
// PASO 2: Ejecutar AMBOS tests en un solo comando de Playwright
// =====================================================================
console.log('🧪 2. Ejecutando validación de Textos y Visual (en secuencia)...\n');

const tests = spawnSync(
    'npx', 
    [
        'playwright', 
        'test', 
        'tests/content-diff.spec.js', 
        'tests/visual-diff.spec.js'
    ], 
    {
        stdio: 'inherit',
        env,
        shell: true
    }
);
// =====================================================================
// PASO 3: Resumen Final
// =====================================================================
console.log('\n=========================================');
console.log('📊 RESUMEN DE EJECUCIÓN');
console.log('=========================================');
console.log(`📁 Reporte HTML unificado: ${reportDir}/html/index.html`);
console.log(`📁 Evidencias de Texto:    ${reportDir}/Evidencias-Textos`);
console.log(`📁 Evidencias Visuales:    ${reportDir}/Evidencias-Capturas`);

if (tests.status === 0) {
    console.log('🎉 ¡Todas las validaciones pasaron exitosamente! (0 diferencias)');
} else {
    console.log('❌ Se detectaron inconsistencias en Texto o en Visual.');
    console.log('👉 Revisa los archivos diff.txt y diff.png en las carpetas de evidencias.');
    console.log('👉 El reporte HTML se ha abierto automáticamente en tu navegador.');
}
console.log('=========================================\n');

// Salimos con el código de error si algo falló (vital para CI/CD)
process.exit(tests.status ?? 1);