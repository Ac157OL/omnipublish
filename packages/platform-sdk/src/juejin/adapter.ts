import { PlatformAdapter, PublishContext, PublishResult } from "../core/types";
import { chromium, BrowserContext, Page } from "playwright";

export interface JuejinAdapterConfig {
  sessionToken?: string;
  headless?: boolean;
}

export class JuejinAdapter implements PlatformAdapter {
  platformCode = "juejin";
  name = "掘金 (Juejin)";

  private sessionToken: string;
  private headless: boolean;

  constructor(config: JuejinAdapterConfig = {}) {
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
      // For Juejin, we must bypass their headless detection entirely by not using headless mode on Linux
        // if headless is requested, we try to use a minimal virtual framebuffer approach or just run headed
        browser = await chromium.launch({
          headless: false, // Juejin aggressively blocks headless Chromium. We MUST run headed.
          args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certifcate-errors',
            '--ignore-certifcate-errors-spki-list',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
          ]
        });
      browserContext = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          extraHTTPHeaders: {
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-User': '?1',
            'Sec-Fetch-Dest': 'document',
            'Upgrade-Insecure-Requests': '1'
          }
        });
      await browserContext.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
          // Overwrite the 'languages' property to use a custom getter
          Object.defineProperty(navigator, 'languages', {
            get: () => ['zh-CN', 'zh', 'en'],
          });
          // Overwrite the 'plugins' property to use a custom getter
          Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3],
          });
        });

      // Check if sessionToken is a JSON array of cookies (new method) or a raw string
      let cookiesToInject: any[] = [];
      if (this.sessionToken.startsWith('[')) {
        try {
          cookiesToInject = JSON.parse(this.sessionToken);
        } catch (e) {
          console.error("Failed to parse Juejin cookies array", e);
        }
      } else if (this.sessionToken.includes('=')) {
        cookiesToInject = this.sessionToken.split(';').map(pair => {
          const [name, ...rest] = pair.trim().split('=');
          return {
            name: name.trim(),
            value: rest.join('=').trim(),
            domain: '.juejin.cn',
            path: '/'
          };
        }).filter(c => c.name);
      }

      if (cookiesToInject.length > 0) {
        await browserContext.addCookies(cookiesToInject);
      } else if (this.sessionToken) {
        // Set Juejin session cookie legacy method
        await browserContext.addCookies([
          {
            name: "sessionid",
            value: this.sessionToken,
            domain: ".juejin.cn",
            path: "/",
            httpOnly: true,
            secure: true,
            sameSite: "Lax"
          }
        ]);
      }

      page = await browserContext.newPage();

      // Navigate to the editor draft page
        await page.goto("https://juejin.cn", { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(2000); // Wait a bit on homepage to establish session

        await page.goto("https://juejin.cn/editor/drafts/new", { waitUntil: "domcontentloaded", timeout: 30000 });

      // Check if we are logged in by checking if the title input exists.
        // If we got redirected to login, the title input won't be there.
        const titleInput = await page.waitForSelector('input.title-input', { timeout: 15000 }).catch(() => null);
        if (!titleInput) {
          console.error("Juejin current URL on failed login:", page.url());
          const content = await page.content();
          console.error("Juejin page snippet:", content.substring(0, 500));
          throw new Error("Failed to login to Juejin. Session token might be invalid or expired. URL: " + page.url());
        }

      // Fill Title
      await titleInput.fill(context.title);

      let processedMarkdown = context.markdown;

      // ---------------------------------------------------------
      // JUEJIN IMAGE UPLOAD INTERCEPTION
      // ---------------------------------------------------------
      // We will parse the markdown for images, trigger the file chooser,
      // upload the images, and replace the markdown content with the new URLs.

      const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
      let match;
      const imagesToUpload = [];

      while ((match = imageRegex.exec(processedMarkdown)) !== null) {
        imagesToUpload.push({
          fullMatch: match[0],
          alt: match[1],
          url: match[2]
        });
      }

      if (imagesToUpload.length > 0) {
         console.log(`Juejin: Found ${imagesToUpload.length} images to upload.`);
         // In a real scenario, we would download external URLs to local temp files first.
         // For now, we will rely on Juejin's auto-fetch for public URLs.
         // If Juejin fails to fetch them, we'll need to implement the local download + upload via filechooser.
         // Since we don't have the local download logic here yet, we will just paste the markdown
         // and let Juejin try to fetch them. If it's a local file (e.g. from MinIO), it must be public.
      }

      // Fill Markdown Content
      // Juejin uses ByteMD. We need to focus the editor and paste the content
      // to trigger the internal state updates properly.
      const editorSelector = '.bytemd-editor .CodeMirror-scroll';
      await page.waitForSelector(editorSelector, { state: 'visible' });
      await page.click(editorSelector);

      // Use standard clipboard copy-paste to safely trigger ByteMD internal states
      await page.evaluate((text) => {
         // Create a temporary textarea to hold the text
         const textArea = document.createElement("textarea");
         textArea.value = text;
         document.body.appendChild(textArea);
         textArea.select();
         document.execCommand("copy");
         document.body.removeChild(textArea);
      }, context.markdown);

      // Focus again and paste
      await page.click(editorSelector);
      await page.keyboard.press('Control+V');

      // Wait a bit for the auto-save or processing
      await page.waitForTimeout(3000);

      // Extract the draft ID from the URL
      const currentUrl = page.url();
      const draftMatch = currentUrl.match(/drafts\/([a-zA-Z0-9]+)/);
      const draftId = draftMatch ? draftMatch[1] : `juejin_draft_${Date.now()}`;

      const isDirectPublish = context.platformConfig?.publishAction === 'direct';
      let isAwaitingUser = true;

      if (isDirectPublish) {
        // Find and click the first publish button (top right)
        const publishBtnSelectors = ['button:has-text("发布")', '.xitu-btn:not(.btn-drafts)'];
        let publishBtnClicked = false;

        for (const selector of publishBtnSelectors) {
          const btns = await page.$$(selector);
          for (const btn of btns) {
             const text = await btn.textContent();
             if (text && text.trim() === '发布') {
                await btn.click();
                publishBtnClicked = true;
                break;
             }
          }
          if (publishBtnClicked) break;
        }

        if (publishBtnClicked) {
          await page.waitForTimeout(1500); // Wait for the panel to pop up

          // Juejin requires selecting a category before publishing
          const categorySelector = '.category-list .item';
          const activeCategory = await page.$('.category-list .item.active');
          if (!activeCategory) {
            const firstCategory = await page.$(categorySelector);
            if (firstCategory) await firstCategory.click();
            await page.waitForTimeout(500);
          }

          // Juejin requires selecting a tag
          // The tag input is inside .byte-select
          const tagSelector = '.byte-select__placeholder';
          const hasTags = await page.$('.byte-select-tag');
          if (!hasTags) {
             const tagInput = await page.$(tagSelector);
             if (tagInput) {
                await tagInput.click();
                await page.waitForTimeout(500);
                // Click the first available option
                const firstOption = await page.$('.byte-select-option');
                if (firstOption) await firstOption.click();
                await page.waitForTimeout(500);
             }
          }

          // Juejin requires a summary of at least 50 chars if not generated automatically
          const summaryTextarea = await page.$('textarea.byte-input__textarea');
          if (summaryTextarea) {
             const val = await summaryTextarea.inputValue();
             if (!val || val.length < 50) {
                 // Auto fill summary with markdown content
                 let summary = context.markdown.replace(/[\#\*\`\[\]\(\)\!]/g, '').replace(/\n/g, '').slice(0, 100).trim();
                 if (summary.length < 50) {
                    summary = summary.padEnd(50, '。');
                 }
                 await summaryTextarea.fill(summary);
                 await page.waitForTimeout(500);
             }
          }

          // Now click the final "确定并发布" button in the popup
          const confirmBtnSelectors = ['button.ui-btn.primary', 'button:has-text("确定并发布")'];
          let confirmed = false;
          for (const sel of confirmBtnSelectors) {
            const btns = await page.$$(sel);
            for (const btn of btns) {
              const text = await btn.textContent();
              if (text && text.trim() === '确定并发布') {
                await btn.click();
                confirmed = true;
                break;
              }
            }
            if (confirmed) break;
          }

          if (confirmed) {
            // In Juejin, direct publish is a complex process and sometimes it intercepts.
            // We wait for the /article/publish endpoint to fire
            try {
               await page.waitForResponse(response => response.url().includes('/article/publish') && response.request().method() === 'POST', { timeout: 10000 });
               isAwaitingUser = false;

               // Sometimes Juejin navigates away very quickly after successful publish.
               // We just assume success here and wait a moment for any navigation to settle.
               await page.waitForTimeout(2000);
            } catch (e) {
               console.warn("Juejin: Did not intercept /article/publish response, it might have failed validation.");
            }
          } else {
             console.warn("Juejin: Could not find final confirm publish button.");
          }
        } else {
          console.warn("Juejin: Could not find initial direct publish button, falling back to draft.");
        }
      }

      const result: PublishResult = {
        success: true,
        platform: this.platformCode,
        isAwaitingUser,
        remoteId: draftId,
        remoteUrl: currentUrl,
        browserAssistData: {
          message: isAwaitingUser ? "草稿已生成，请点击 URL 前往发布。" : "已尝试自动点击发布按钮。",
          draftUrl: currentUrl
        }
      };

      return result;

    } catch (error: any) {
      return {
        success: false,
        platform: this.platformCode,
        errorMessage: `Playwright automation failed: ${error.message}`,
        errorCode: "JUEJIN_PLAYWRIGHT_ERROR"
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}
