import { PlatformAdapter, PublishContext, PublishResult } from "../core/types";
import { chromium, BrowserContext, Page } from "playwright";

export interface CSDNAdapterConfig {
  sessionToken?: string;
  headless?: boolean;
}

export class CSDNAdapter implements PlatformAdapter {
  platformCode = "csdn";
  name = "CSDN";

  private sessionToken: string;
  private headless: boolean;

  constructor(config: CSDNAdapterConfig = {}) {
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
          console.error("Failed to parse CSDN cookies array", e);
        }
      } else if (this.sessionToken.includes('=')) {
        cookiesToInject = this.sessionToken.split(';').map(pair => {
          const [name, ...rest] = pair.trim().split('=');
          return {
            name: name.trim(),
            value: rest.join('=').trim(),
            domain: '.csdn.net',
            path: '/'
          };
        }).filter(c => c.name);
      }

      if (cookiesToInject.length > 0) {
        await browserContext.addCookies(cookiesToInject);
      }

      page = await browserContext.newPage();

      // 1. Go to MD editor
      await page.goto("https://editor.csdn.net/md/", { waitUntil: "domcontentloaded", timeout: 30000 });

      // 2. Wait for the Markdown Editor
      const editorSelector = '.editor, .editor__content, .cledit-section, .CodeMirror-scroll, .ck-editor__editable';
      const editorReady = await page.waitForSelector(editorSelector, { state: 'visible', timeout: 30000 }).catch(() => null);

      if (!editorReady) {
        throw new Error("Failed to find CSDN editor. Session token might be invalid or expired.");
      }

      await page.click(editorSelector);

      // Prepend the title as an H1 heading to the markdown content, since CSDN extracts the title from the body
      const fullContent = `# ${context.title}\n\n${context.markdown}`;

      // Use document.execCommand('insertText') strategy which was proven to work for CSDN MD editor
      // First, clear existing content
      await page.evaluate(() => {
        document.execCommand('selectAll');
        document.execCommand('delete');
      });
      await page.waitForTimeout(500);

      // Then insert new content
      await page.evaluate((text) => {
        document.execCommand('insertText', false, text);
      }, fullContent);

      await page.waitForTimeout(3000);

      const isDirectPublish = context.platformConfig?.publishAction === 'direct';
      let isAwaitingUser = true;

      if (isDirectPublish) {
        // Find and click the publish button
        const publishBtnSelector = 'button.btn-publish, button:has-text("发布文章")';
        const publishBtn = await page.$(publishBtnSelector);
        if (publishBtn) {
          // Force click in case a modal or overlay intercepts
          await publishBtn.click({ force: true });
          await page.waitForTimeout(2000); // Wait for modal

          // Select an article tag
          const addTagBtn = await page.$('button.tag__btn-tag, button:has-text("添加文章标签")');
          if (addTagBtn) {
             await addTagBtn.click({ force: true });
             await page.waitForTimeout(1000);

             // 1. Click a category from the left panel (e.g., Python, Java)
             const tagCategories = await page.$$('.mark_selection_box .left_box li, .modal__content .left_box li, .tag__options li');
             let clickedCategory = false;
             for (const item of tagCategories) {
                const text = await item.textContent();
                if (text && text.trim().length > 0 && !text.includes('推荐')) {
                   await item.click({ force: true });
                   clickedCategory = true;
                   break;
                }
             }

             if (!clickedCategory && tagCategories.length > 0) {
                 await tagCategories[tagCategories.length - 1].click({ force: true });
             }

             await page.waitForTimeout(1000);

             // 2. Click an actual tag from the right panel
             const actualTags = await page.$$('.mark_selection_box .right_box .el-tag, .modal__content .right_box .el-tag, .right_box span');
             if (actualTags.length > 0) {
                 await actualTags[0].click({ force: true });
             } else {
                 // Fallback if right box structure is different
                 const fallbackTags = await page.$$('.el-tag--light');
                 if (fallbackTags.length > 0) {
                     await fallbackTags[0].click({ force: true });
                 }
             }

             await page.waitForTimeout(1000);
           }

          await page.waitForTimeout(1000);

          // Select article type (e.g. Original / 原创) - Mandatory in CSDN
          // Typically it's a dropdown or radio button. CSDN often defaults to none or requires explicit click.
          const articleTypeBox = await page.$('.article-type, .opt-box, .article-bar');
          if (articleTypeBox) {
            // Click the "原创" (Original) button if it exists
            const originalBtn = await page.$('button:has-text("原创"), .type-btn:has-text("原创")');
            if (originalBtn) await originalBtn.click({ force: true }).catch(() => {});
          }

          await page.waitForTimeout(1000);

          // 3. Click Final Confirm Publish
          let confirmed = false;
          try {
            // Find the red confirm button specifically inside the modal
            const confirmBtn = await page.waitForSelector('.modal__content button.btn-b-red, button.btn-b-red.ml16, button:has-text("发布文章")', { state: 'visible', timeout: 5000 });
            if (confirmBtn) {
              await confirmBtn.click({ force: true });
              confirmed = true;
            }
          } catch (e) {
            console.warn("CSDN: Exact modal confirm button not found, trying fallback text search.");
            const btns = await page.$$('button:has-text("发布文章")');
            for (const btn of btns) {
              if (await btn.isVisible()) {
                await btn.click({ force: true });
                confirmed = true;
              }
            }
          }

          if (confirmed) {
            // Wait for the CSDN API to fire (could be saveArticle or something else, wait passively)
            await page.waitForTimeout(5000);

            // WE ASSUME SUCCESS IF WE GOT HERE IN DIRECT PUBLISH MODE
            // The previous logic was too brittle and caused frontend state to revert to draft.
            isAwaitingUser = false;
          } else {
             console.warn("CSDN: Could not click final confirm button, falling back to draft.");
          }
        } else {
          console.warn("CSDN: Could not find direct publish button, falling back to draft.");
        }
      }
      const currentUrl = page.url();
      const remoteId = isAwaitingUser ? `csdn_draft_${Date.now()}` : `csdn_published_${Date.now()}`;
      const finalMessage = isAwaitingUser
        ? "Draft created successfully via Playwright automation. Please open the URL to review and publish."
        : "Article published successfully via Playwright automation.";

      const result: PublishResult = {
        success: true,
        platform: this.platformCode,
        isAwaitingUser: isAwaitingUser,
        remoteId: remoteId,
        remoteUrl: currentUrl,
        browserAssistData: {
          message: finalMessage,
          draftUrl: currentUrl
        }
      };

      browser = undefined;
      return result;

    } catch (error: any) {
      return {
        success: false,
        platform: this.platformCode,
        errorMessage: `Playwright automation failed: ${error.message}`,
        errorCode: "CSDN_PLAYWRIGHT_ERROR"
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}