import { Worker } from 'bullmq';
import { connection } from '@omnipublish/queue';
import { encryptCredentials, prisma } from '@omnipublish/db';
import { chromium } from 'playwright';

export const bindWorker = new Worker('bind-account', async (job) => {
  const { platformAccountId, platform } = job.data;
  console.log(`[BindWorker] Starting bind process for platform ${platform} (Account ID: ${platformAccountId})`);

  let browser;
  try {
    // Launch non-headless browser to let the user login/scan QR code
    browser = await chromium.launch({
      headless: false,
      args: ['--disable-blink-features=AutomationControlled']
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    const page = await context.newPage();

    const waitForCookie = async (cookieNames: string[], timeout = 300000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        try {
          if (page.isClosed()) throw new Error("Page closed by user before login completed");
          const cookies = await context.cookies();
          if (cookies.some(c => cookieNames.includes(c.name))) {
            return true;
          }
          await page.waitForTimeout(1000);
        } catch (e: any) {
          if (e.message.includes("Page closed")) throw e;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      throw new Error(`Timeout waiting for cookies: ${cookieNames.join(', ')}`);
    };

    let sessionToken = "";

    if (platform === 'juejin') {
      await page.goto('https://juejin.cn', { waitUntil: 'domcontentloaded' });
      console.log(`[BindWorker] Waiting for user to login to Juejin...`);
      await waitForCookie(['sessionid']);
      const cookies = await context.cookies();
      sessionToken = JSON.stringify(cookies); // Save all cookies as a JSON array
    } else if (platform === 'xiaohongshu') {
      await page.goto('https://creator.xiaohongshu.com', { waitUntil: 'domcontentloaded' });
      console.log(`[BindWorker] Waiting for user to login to Xiaohongshu...`);
      // Wait for URL to change to the logged-in home page
      await page.waitForURL('**/new/home**', { timeout: 300000 }); // Wait up to 5 minutes
      const cookies = await context.cookies();
      sessionToken = JSON.stringify(cookies); // Save all cookies as a JSON array
    } else if (platform === 'zhihu') {
      await page.goto('https://www.zhihu.com/signin', { waitUntil: 'domcontentloaded' });
      console.log(`[BindWorker] Waiting for user to login to Zhihu...`);
      await waitForCookie(['z_c0']);
      const cookies = await context.cookies();
      sessionToken = JSON.stringify(cookies);
    } else if (platform === 'csdn') {
      await page.goto('https://passport.csdn.net/login', { waitUntil: 'domcontentloaded' });
      console.log(`[BindWorker] Waiting for user to login to CSDN...`);
      await waitForCookie(['UserToken']);
      const cookies = await context.cookies();
      sessionToken = JSON.stringify(cookies);
    }

    if (sessionToken) {
      console.log(`[BindWorker] Successfully extracted session token for ${platform}`);
      await prisma.platformAccount.update({
        where: { id: platformAccountId },
        data: {
          encryptedCredentials: encryptCredentials({ sessionToken }),
          status: 'active'
        }
      });
    } else {
      throw new Error("Failed to extract session token");
    }

  } catch (error: any) {
    console.error(`[BindWorker] Bind failed: ${error.message}`);
    await prisma.platformAccount.update({
      where: { id: platformAccountId },
      data: { status: 'error' }
    });
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}, { connection });

bindWorker.on('completed', job => {
  console.log(`[BindWorker] Job ${job.id} completed successfully`);
});

bindWorker.on('failed', (job, err) => {
  console.error(`[BindWorker] Job ${job?.id} failed: ${err.message}`);
});
