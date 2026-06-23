import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });
  
  const page = (await browser.pages())[0];
  
  const logs = [];

  page.on('request', request => {
    if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
      const data = {
        url: request.url(),
        method: request.method(),
        postData: request.postData()
      };
      
      // Only log requests sent to BML API endpoints to avoid noise
      if (data.url.includes('bankofmaldives.com.mv')) {
        logs.push(data);
        console.log(`[Network Recorded] ${data.method} ${data.url}`);
        fs.writeFileSync('bml_network_logs.json', JSON.stringify(logs, null, 2));
      }
    }
  });

  console.log("Opening BML login page...");
  await page.goto('https://www.bankofmaldives.com.mv/internetbanking', { waitUntil: 'networkidle2' });
  
  console.log("===============================================================");
  console.log("👉 BROWSER READY! Please log in manually in the opened Chrome window.");
  console.log("👉 Go through the OTP and Profile selection.");
  console.log("👉 Once you are fully on the dashboard, CLOSE the browser window.");
  console.log("===============================================================");
  
  // Wait for the user to close the browser
  await new Promise(resolve => browser.on('disconnected', resolve));
  
  console.log("Browser closed! Recording complete.");
  process.exit(0);
})();
