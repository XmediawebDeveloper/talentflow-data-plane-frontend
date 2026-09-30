const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:\\Users\\xmedia\\AppData\\Local\\Temp\\claude\\C--Users-xmedia-Desktop-Deepak-projects-talentflow-data-plane-frontend\\30b61e07-d70b-457b-bc55-029dbf3ff666\\scratchpad\\01-landing.png' });
  console.log('URL after load:', page.url());
  console.log('Title:', await page.title());

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
