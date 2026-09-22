import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

import { JuejinAdapter } from '../src/juejin/adapter';
import { chromium } from 'playwright';

describe('JuejinAdapter', () => {
  const validConfig = { sessionToken: 'valid_session_token_123' };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('isReady', () => {
    it('returns true with sessionToken', async () => {
      const adapter = new JuejinAdapter(validConfig);
      expect(await adapter.isReady()).toBe(true);
    });

    it('returns false without sessionToken', async () => {
      const adapter = new JuejinAdapter({});
      expect(await adapter.isReady()).toBe(false);
    });

    it('returns false with empty sessionToken', async () => {
      const adapter = new JuejinAdapter({ sessionToken: '' });
      expect(await adapter.isReady()).toBe(false);
    });
  });

  describe('adaptContent', () => {
    it('passes through unchanged', async () => {
      const adapter = new JuejinAdapter(validConfig);
      const ctx = { title: 'T', markdown: 'M', tags: ['t'] };
      const result = await adapter.adaptContent(ctx);
      expect(result).toEqual(ctx);
    });
  });

  describe('publish', () => {
    it('returns success with isAwaitingUser and draft URL', async () => {
      const titleInput = { fill: vi.fn().mockResolvedValue(undefined) };
      const mockPage = {
        $: vi.fn().mockResolvedValue({}),
        waitForSelector: vi.fn().mockImplementation((selector: string) =>
          Promise.resolve(selector === 'input.title-input' ? titleInput : {}),
        ),
        click: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://juejin.cn/editor/drafts/abc123'),
        goto: vi.fn().mockResolvedValue(undefined),
        keyboard: { press: vi.fn().mockResolvedValue(undefined) },
      };

      const mockContext = {
        addInitScript: vi.fn().mockResolvedValue(undefined),
        addCookies: vi.fn().mockResolvedValue(undefined),
        newPage: vi.fn().mockResolvedValue(mockPage),
      };

      const mockBrowser = {
        newContext: vi.fn().mockResolvedValue(mockContext),
        close: vi.fn().mockResolvedValue(undefined),
      };

      (chromium.launch as any).mockResolvedValue(mockBrowser);

      const adapter = new JuejinAdapter(validConfig);
      const result = await adapter.publish({
        title: 'My Article',
        markdown: '# Hello',
        tags: ['test'],
      });

      expect(result.success).toBe(true);
      expect(result.isAwaitingUser).toBe(true);
      expect(result.remoteId).toBe('abc123');
      expect(result.remoteUrl).toContain('juejin.cn');
      expect(result.browserAssistData).toBeDefined();
      expect(result.browserAssistData.draftUrl).toContain('abc123');
    });

    it('handles login failure when title input is missing', async () => {
      const mockPage = {
        $: vi.fn().mockResolvedValue(null),
        waitForSelector: vi.fn().mockResolvedValue(null),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://juejin.cn/login'),
        content: vi.fn().mockResolvedValue('<html>login</html>'),
      };

      const mockContext = {
        addInitScript: vi.fn().mockResolvedValue(undefined),
        addCookies: vi.fn().mockResolvedValue(undefined),
        newPage: vi.fn().mockResolvedValue(mockPage),
      };

      const mockBrowser = {
        newContext: vi.fn().mockResolvedValue(mockContext),
        close: vi.fn().mockResolvedValue(undefined),
      };

      (chromium.launch as any).mockResolvedValue(mockBrowser);

      const adapter = new JuejinAdapter(validConfig);
      const result = await adapter.publish({
        title: 'T', markdown: 'M', tags: [],
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Failed to login');
      expect(result.errorCode).toBe('JUEJIN_PLAYWRIGHT_ERROR');
    });

    it('handles Playwright errors gracefully', async () => {
      (chromium.launch as any).mockRejectedValue(new Error('Browser crashed'));

      const adapter = new JuejinAdapter(validConfig);
      const result = await adapter.publish({
        title: 'T', markdown: 'M', tags: [],
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('JUEJIN_PLAYWRIGHT_ERROR');
    });
  });
});
