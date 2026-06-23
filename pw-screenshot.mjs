const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:8082', { waitUntil: 'networkidle', timeout: 15000 });
  await page.screenshot({ path: 'screenshot-signin.png' });
  await browser.close();
  console.log('done');
})();
