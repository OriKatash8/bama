const { chromium } = require('C:\\Users\\Orika\\AppData\\Local\\npm-cache\\_npx\\e41f203b7505f1fb\\node_modules\\playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:8082', { waitUntil: 'networkidle', timeout: 15000 });
  await page.click('text=Register');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'screenshot-register-new.png' });
  await browser.close();
  console.log('done');
})();
