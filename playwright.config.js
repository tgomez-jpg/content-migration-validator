const { defineConfig, devices } = require('@playwright/test');
const reportDir = process.env.REPORT_DIR || 'playwright-report/default';

module.exports = defineConfig({
    testDir: './tests',
    timeout: 90 * 1000,
    fullyParallel: true,
    retries: 1,
    workers: 4,
    reporter: [
        ['html', { 
            outputFolder: `${reportDir}/html`,
            open: 'on-failure' 
        }], 
        ['json', {
            outputFile: `${reportDir}/results.json`
        }],
        ['list']
    ],
    outputDir: `${reportDir}/test-results`,

    use: {
        screenshot: 'only-on-failure',
        //video: 'retain-on-failure',
        //trace: 'retain-on-failure',
        actionTimeout: 10 * 1000,
        navigationTimeout: 15 * 1000,
    },
    projects: [
        {
            name: 'chromium',
            use: { 
                ...devices['Desktop Chrome'], 
                viewport: { 
                    width: 1920, height: 1080 
                } 
            },
        },
    ],
});