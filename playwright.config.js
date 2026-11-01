import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests', fullyParallel: true, workers: 4, retries: 0,
  use: { baseURL: 'http://127.0.0.1:4189', viewport: { width: 1280, height: 800 } },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
    // Firefox has no mobile context/CDP touch injection. Keep its matrix on desktop regressions.
    { name: 'firefox', use: { browserName: 'firefox' }, testIgnore: ['**/sliders.spec.js', '**/touch.spec.js', '**/loading.spec.js'] },
  ],
  webServer: { command: 'npm run dev -- --port 4189 --strictPort', url: 'http://127.0.0.1:4189/docs/', reuseExistingServer: false },
});
