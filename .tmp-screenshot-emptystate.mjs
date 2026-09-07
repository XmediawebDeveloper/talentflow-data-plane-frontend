import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

// Light mode
await page.goto('http://localhost:3000/tmp-modal-preview', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: 'C:\\Users\\HK-TAM~1\\AppData\\Local\\Temp\\claude\\D--TalentFlow-talentflow-data-plane-frontend\\75522295-5571-4149-b9de-68d44e457dfc\\scratchpad\\emptystate-light.png' });

// Dark mode
await page.evaluate(() => localStorage.setItem('theme', 'dark'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: 'C:\\Users\\HK-TAM~1\\AppData\\Local\\Temp\\claude\\D--TalentFlow-talentflow-data-plane-frontend\\75522295-5571-4149-b9de-68d44e457dfc\\scratchpad\\emptystate-dark.png' });

console.log('Console errors:', errors);
await browser.close();
