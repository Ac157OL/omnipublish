import { PlatformAdapter, PublishContext, PublishResult } from "../core/types";
import { chromium, BrowserContext, Page } from "playwright";

export interface XiaohongshuAdapterConfig {
  sessionToken?: string;
  headless?: boolean;
}

export class XiaohongshuAdapter implements PlatformAdapter {
  platformCode = "xiaohongshu";
  name = "小红书 (Xiaohongshu)";

  private sessionToken: string;
  private headless: boolean;

  constructor(config: XiaohongshuAdapterConfig = {}) {
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
        args: ['--disable-blink-features=AutomationControlled']
      });
      browserContext = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      await browserContext.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      // Check if sessionToken is a JSON array of cookies (new method) or a raw string
      let cookiesToInject: any[] = [];
      if (this.sessionToken.startsWith('[')) {
        try {
          cookiesToInject = JSON.parse(this.sessionToken);
        } catch (e) {
          console.error("Failed to parse Xiaohongshu cookies array", e);
        }
      } else if (this.sessionToken.includes('=')) {
        cookiesToInject = this.sessionToken.split(';').map(pair => {
          const [name, ...rest] = pair.trim().split('=');
          return {
            name: name.trim(),
            value: rest.join('=').trim(),
            domain: '.xiaohongshu.com',
            path: '/'
          };
        }).filter(c => c.name);
      }

      if (cookiesToInject.length > 0) {
        await browserContext.addCookies(cookiesToInject);
      } else if (this.sessionToken) {
        // Set Xiaohongshu session cookie legacy method
        await browserContext.addCookies([
          {
            name: "web_session",
            value: this.sessionToken,
            domain: ".xiaohongshu.com",
            path: "/",
            httpOnly: true,
            secure: true,
            sameSite: "Lax"
          }
        ]);
      }

      page = await browserContext.newPage();

      // Navigate to creator studio
      await page.goto("https://creator.xiaohongshu.com/publish/publish", { waitUntil: "domcontentloaded", timeout: 60000 });

      // Check if logged in by looking for a specific element
      const uploadContainer = await page.waitForSelector('.upload-container, .publish-container, .creator-main', { timeout: 60000 }).catch(() => null);
      if (!uploadContainer) {
         throw new Error("Failed to find Xiaohongshu editor container. Session token might be invalid or expired.");
      }

      // 0. Enter "Long Text" (写长文) mode
      // Wait a bit for the page to fully render tabs
      await page.waitForTimeout(5000);

      // Click '写长文'
      // Use force: true to bypass pointer-events interception by overlays or wrappers
      let longTextTab = await page.locator('.creator-main span:has-text("写长文"), .creator-main div:has-text("写长文"), .title:has-text("写长文")').first();

      if (await longTextTab.count() === 0) {
          // fallback search
          longTextTab = await page.locator('text="写长文"').first();
      }

      if (await longTextTab.count() > 0 && await longTextTab.isVisible()) {
         await longTextTab.click({ force: true });
         await page.waitForTimeout(3000);
      } else {
         console.warn("Xiaohongshu: Could not find '写长文' tab. Maybe it's already selected or the page hasn't loaded.");
      }

      // Click '新的创作'
      const newCreationBtn = await page.locator('button:has-text("新的创作"), .new-btn, .custom-button:has-text("新的创作")').first();
      if (await newCreationBtn.count() > 0 && await newCreationBtn.isVisible()) {
         await newCreationBtn.click({ force: true });
         await page.waitForTimeout(3000);
      } else {
         console.warn("Xiaohongshu: Could not find '新的创作' button.");
      }

      // 1. Fill title
      // Wait for title input to appear
      await page.waitForTimeout(5000); // Wait for the editor to load

      // Lock target frame to tiptap editor if exists
      let editorFrame = page as any;
      for (const f of page.frames()) {
         if (f.url().includes('long_text') || f.url().includes('article')) {
            editorFrame = f;
            break;
         }
      }

      const titleSelectors = ['textarea.d-text', 'input.d-text', 'input.c-input_inner', 'input[placeholder*="标题"]', '.title-input input', '.titleInput', 'textarea[placeholder*="标题"]'];
      let titleFilled = false;
      let targetFrame = editorFrame;

      for (const selector of titleSelectors) {
        let titleInput = await targetFrame.$(selector);
        if (!titleInput && targetFrame === page) {
           for (const frame of page.frames()) {
             titleInput = await frame.$(selector);
             if (titleInput) {
                targetFrame = frame;
                break;
             }
           }
        }
        if (titleInput) {
          await titleInput.fill(context.title);
          titleFilled = true;
          break;
        }
      }

      if (!titleFilled) {
        console.warn("Xiaohongshu: Could not find title input, skipping title.");
      }

      // 2. Fill content
      const contentSelectors = ['.post-content', '#post-textarea', 'div[contenteditable="true"]', '.editor-container', '.ql-editor'];
      let contentFilled = false;
      for (const selector of contentSelectors) {
        let contentInput = await targetFrame.$(selector);
        if (!contentInput && targetFrame === page) {
           // If we didn't find the frame in step 1, search all frames
           for (const frame of page.frames()) {
             contentInput = await frame.$(selector);
             if (contentInput) {
                targetFrame = frame;
                break;
             }
           }
        }

        if (contentInput) {
          await contentInput.click();
          // Clear existing and type new
          await page.keyboard.press('Control+A');
          await page.keyboard.press('Backspace');
          await page.waitForTimeout(500);

          // Use Playwright's native insertText which correctly triggers React/Vue input events
          await page.keyboard.insertText(context.markdown);
          contentFilled = true;
          break;
        }
      }
      if (!contentFilled) {
        console.warn("Xiaohongshu: Could not find content editor via selectors, trying fallback click.");
        // Try fallback to click the 'is-empty is-editor-empty' p tag
        let fallbackP = await targetFrame.$('.is-editor-empty, .ql-blank, .tiptap.ProseMirror, .tiptap p');
        if (!fallbackP) {
           for (const frame of page.frames()) {
              fallbackP = await frame.$('.is-editor-empty, .ql-blank, .tiptap.ProseMirror, .tiptap p');
              if (fallbackP) {
                 targetFrame = frame;
                 break;
              }
           }
        }
        if (fallbackP) {
           await fallbackP.click();
           await page.keyboard.press('Control+A');
           await page.keyboard.press('Backspace');
           await page.keyboard.insertText(context.markdown);

           // Trigger frameworks updates
           await page.keyboard.press('Enter');
           await page.keyboard.type(' ');
        }
      }

      // Wait a bit to ensure XHS auto-saves the draft and enables the Next button
      await page.waitForTimeout(3000);

      // 3. Click '一键排版' if exists, then '下一步' (Next Step)
      let layoutBtn = await targetFrame.locator('button:has-text("一键排版"), span:has-text("一键排版")').first();
      if (await layoutBtn.count() === 0) layoutBtn = await page.locator('button:has-text("一键排版"), span:has-text("一键排版")').first();

      if (await layoutBtn.count() > 0 && await layoutBtn.isVisible()) {
         await layoutBtn.click({ force: true });

         // Poll for "下一步" to appear
         for (let i = 0; i < 15; i++) {
             await page.waitForTimeout(1000);
             const hasNextBtn = await targetFrame.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button, .btn, span[class*="btn"]'));
                return btns.some(b => (b.textContent || "").trim().includes("下一步"));
             });
             if (hasNextBtn) break;
         }
      }

      let nextBtn = await targetFrame.locator('button:has-text("下一步"), span:has-text("下一步"), .next-btn').first();
      if (await nextBtn.count() === 0) nextBtn = await page.locator('button:has-text("下一步"), span:has-text("下一步"), .next-btn').first();

      if (await nextBtn.count() > 0 && await nextBtn.isVisible()) {
         await nextBtn.click({ force: true }).catch(() => null);
         await page.waitForTimeout(5000);

         // Check if transition happened
         let isStep2 = await page.locator('xhs-publish-btn, button:has-text("发布"), button:has-text("立即发布")').count() > 0;
         if (!isStep2) {
             for (const f of page.frames()) {
                 if (await f.locator('xhs-publish-btn, button:has-text("发布"), button:has-text("立即发布")').count() > 0) {
                     isStep2 = true;
                     break;
                 }
             }
         }

         if (!isStep2) {
             await nextBtn.evaluate((el: HTMLElement) => el.click()).catch(() => null);
             await page.waitForTimeout(5000);
         }
      }

      // We might need to re-find the iframe if clicking "下一步" changes the DOM structure completely
      // Wait extra time for the new step to render fully
      await page.waitForTimeout(5000);
      let step2Iframe = page.frames().find(f => f.url().includes('article') || f.url().includes('long_text') || f.url().includes('publish')) || page;

      try {
        await page.screenshot({ path: 'xhs_step2.png', fullPage: true });
        console.log("Saved screenshot to xhs_step2.png");
      } catch (e) {
        console.error("Screenshot failed:", e);
      }

      // 4. Upload Cover Image (Optional in Long Text mode, but good if we have one)
      // Wait a bit for the next step DOM to render
      await page.waitForTimeout(2000);

      let fileInput = null;
      for (const frame of page.frames()) {
         // Also match class "d-input" since it is used extensively
         fileInput = await frame.$('input.upload-input, input[type="file"], input[accept*="image"], .upload-wrapper input, .upload-btn input, input.d-input[type="file"]');
         if (fileInput) break;
      }

      if (!fileInput) {
         // Try finding by evaluating DOM if standard selector fails
         for (const frame of page.frames()) {
            fileInput = await frame.evaluateHandle(() => {
               const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
               return inputs.length > 0 ? inputs[0] : null;
            }).catch(() => null) as any;
            if (fileInput && await fileInput.asElement()) break;
         }
      }

      if (context.coverImageUrl) {
        try {
          const response = await fetch(context.coverImageUrl);
          const buffer = await response.arrayBuffer();

          if (fileInput && fileInput.setInputFiles) {
            await fileInput.setInputFiles({
              name: 'cover.jpg',
              mimeType: 'image/jpeg',
              buffer: Buffer.from(buffer)
            });
            await page.waitForTimeout(5000);
          } else {
            console.warn("Xiaohongshu: Could not find image upload input in step 2 across all frames.");
          }
        } catch (e) {
          console.error("Xiaohongshu: Failed to upload cover image", e);
        }
      }

      // 既然用户希望最后自己接管操作，我们在这里什么都不点，直接保留浏览器窗口。
      console.log("Xiaohongshu: 自动化流程已完成，保留浏览器窗口供用户手动接管发布/暂存。");

      // 在页面上注入一个非常显眼的浮层，告诉用户现在可以操作了
      await page.evaluate(() => {
        const div = document.createElement('div');
        div.style.position = 'fixed';
        div.style.top = '20px';
        div.style.left = '50%';
        div.style.transform = 'translateX(-50%)';
        div.style.backgroundColor = '#4ade80';
        div.style.color = '#000000';
        div.style.padding = '16px 32px';
        div.style.borderRadius = '8px';
        div.style.zIndex = '999999';
        div.style.fontSize = '20px';
        div.style.fontWeight = 'bold';
        div.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        div.innerHTML = '✅ 自动化填表完成！请核对内容后，<br/>手动点击下方的【发布】或【暂存】。<br/><span style="font-size: 16px; font-weight: normal;">您现在可以使用鼠标随意操作此窗口了！</span>';

        // 点击提示框即可将其关闭
        div.style.cursor = 'pointer';
        div.onclick = () => div.remove();

        document.body.appendChild(div);
      });

      // XHS 的当前网址，但注意用户需在弹出的真实浏览器窗口中操作，而不是自己另外开浏览器。
      let remoteUrl = page.url();
      let remoteId = `xhs_manual_${Date.now()}`;

      const result: PublishResult = {
        success: true,
        platform: this.platformCode,
        isAwaitingUser: true, // 提示用户去弹出的浏览器中自行发布
        remoteId,
        remoteUrl,
      };

      return result;

    } catch (error: any) {
      return {
        success: false,
        platform: this.platformCode,
        errorMessage: `Playwright automation failed: ${error.message}`,
        errorCode: "XHS_PLAYWRIGHT_ERROR"
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}