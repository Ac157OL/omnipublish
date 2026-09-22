import { PlatformAdapter, PublishContext, PublishResult } from "../core/types";
import { chromium, BrowserContext, Page } from "playwright";

export interface ZhihuAdapterConfig {
  sessionToken?: string;
  headless?: boolean;
}

export class ZhihuAdapter implements PlatformAdapter {
  platformCode = "zhihu";
  name = "知乎 (Zhihu)";

  private sessionToken: string;
  private headless: boolean;

  constructor(config: ZhihuAdapterConfig = {}) {
    this.sessionToken = config.sessionToken || "";
    this.headless = config.headless ?? true;
  }

  async isReady(): Promise<boolean> {
    return !!this.sessionToken;
  }

  async adaptContent(context: PublishContext): Promise<PublishContext> {
    return context;
  }

  async publish(context: PublishContext): Promise<PublishResult> {
    let browser;
    let browserContext: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      browser = await chromium.launch({
        headless: this.headless,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox']
      });
      browserContext = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      await browserContext.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      let cookiesToInject: any[] = [];
      if (this.sessionToken.startsWith('[')) {
        try {
          cookiesToInject = JSON.parse(this.sessionToken);
        } catch (e) {
          console.error("Failed to parse Zhihu cookies array", e);
        }
      } else if (this.sessionToken.includes('=')) {
        cookiesToInject = this.sessionToken.split(';').map(pair => {
          const [name, ...rest] = pair.trim().split('=');
          return {
            name: name.trim(),
            value: rest.join('=').trim(),
            domain: '.zhihu.com',
            path: '/'
          };
        }).filter(c => c.name);
      }

      if (cookiesToInject.length > 0) {
        await browserContext.addCookies(cookiesToInject);
      }

      page = await browserContext.newPage();
      await page.goto("https://zhuanlan.zhihu.com/write", { waitUntil: "domcontentloaded", timeout: 30000 });

      // Check if we are logged in
      const titleInput = await page.waitForSelector('textarea.Input, input[placeholder*="标题"]', { timeout: 15000 }).catch(() => null);
      if (!titleInput) {
        throw new Error("Failed to find Zhihu editor. Session token might be invalid or expired.");
      }

      // Fill title
      await titleInput.fill(context.title);

      // Zhihu uses Draft.js. Using page.fill directly will break its internal state.
      // We need to focus, select all, and use clipboard paste.
      const editorSelector = '.public-DraftEditor-content';
      await page.waitForSelector(editorSelector, { state: 'visible' });
      await page.click(editorSelector);
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');

      // Use clipboard injection
      await page.evaluate((text) => {
         const textArea = document.createElement("textarea");
         textArea.value = text;
         document.body.appendChild(textArea);
         textArea.select();
         document.execCommand("copy");
         document.body.removeChild(textArea);
      }, context.markdown);

      await page.click(editorSelector);
      await page.keyboard.press('Control+V');

      await page.waitForTimeout(3000);

      const isDirectPublish = context.platformConfig?.publishAction === 'direct';
      let isAwaitingUser = true;
      let remoteUrl = page.url();
      let remoteId = `zhihu_draft_${Date.now()}`;

      if (isDirectPublish) {
        // Wait for the first publish button to appear
        const publishBtnSelector = 'button:has-text("发布"), button:has-text("发 布")';
        await page.waitForSelector(publishBtnSelector, { state: 'visible', timeout: 10000 }).catch(() => null);

        const allBtns = await page.locator(publishBtnSelector).all();
        let firstBtn = null;
        for (const btn of allBtns) {
           if (await btn.isVisible()) {
               firstBtn = btn;
               break;
           }
        }

        if (firstBtn) {
          const publishPromise = page.waitForResponse(response =>
            response.url().includes('/api/v4/content/publish') && response.status() === 200
          , { timeout: 15000 }).catch(() => null);

          await firstBtn.click();

          // Wait for the popover/modal to appear
          await page.waitForTimeout(2000);

          // Now there might be a second "发布" button in the popover.
          // We find all visible ones and click the last one (which is usually the one in the popover)
          const newAllBtns = await page.locator(publishBtnSelector).all();
          const visibleBtns = [];
          for (const btn of newAllBtns) {
             if (await btn.isVisible()) visibleBtns.push(btn);
          }

          if (visibleBtns.length > 1) {
             await visibleBtns[visibleBtns.length - 1].click();
          } else if (visibleBtns.length === 1) {
             // Maybe it didn't open a popover, or it's the only one. We already clicked it, but let's click again just in case
             await visibleBtns[0].click();
          }

          const publishResponse = await publishPromise;
          if (publishResponse) {
            try {
              const respJson = await publishResponse.json();
              if (respJson && respJson.id) {
                 remoteId = respJson.id.toString();
              }
            } catch (e) {
               console.warn("Zhihu: Could not parse publish response", e);
            }
            // Wait for navigation to article page
            await page.waitForNavigation({ url: '**/p/**', timeout: 10000 }).catch(() => null);
            remoteUrl = page.url();
            isAwaitingUser = false;
          } else {
            console.warn("Zhihu: Direct publish timeout or failed, falling back to draft.");
            remoteUrl = page.url();
          }
        } else {
          console.warn("Zhihu: Could not find direct publish button, falling back to draft.");
        }
      } else {
        // Draft logic: wait for draft auto-save
        await page.waitForResponse(response =>
          response.url().includes('drafts') && response.status() === 200
        , { timeout: 10000 }).catch(() => null);
        remoteUrl = page.url();
      }

      const result: PublishResult = {
        success: true,
        platform: this.platformCode,
        isAwaitingUser,
        remoteId,
        remoteUrl,
        browserAssistData: isAwaitingUser ? {
          message: "草稿已生成，请在弹出的浏览器中确认并手动发布。",
          draftUrl: remoteUrl
        } : undefined
      };

      browser = undefined;
      return result;

    } catch (error: any) {
      return {
        success: false,
        platform: this.platformCode,
        errorMessage: `Playwright automation failed: ${error.message}`,
        errorCode: "ZHIHU_PLAYWRIGHT_ERROR"
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}