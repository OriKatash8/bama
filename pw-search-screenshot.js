const { chromium } = require('C:\\Users\\Orika\\AppData\\Local\\npm-cache\\_npx\\e41f203b7505f1fb\\node_modules\\playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:8082', { waitUntil: 'networkidle', timeout: 20000 });

  // Log in
  await page.fill('input[placeholder="Email"]', 'orikatash8@gmail.com');
  await page.fill('input[placeholder="Password"]', process.env.PW_PASS || '');
  await page.click('text=Sign In');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'screenshot-after-login.png' });

  await browser.close();
  console.log('done');
})();
