const { chromium } = require('C:\\Users\\Orika\\AppData\\Local\\npm-cache\\_npx\\e41f203b7505f1fb\\node_modules\\playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('file:///C:/Users/Orika/projects/bama/search-preview.html');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshot-search-preview.png' });
  await browser.close();
  console.log('done');
})();
