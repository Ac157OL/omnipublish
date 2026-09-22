import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@omnipublish/content-core', () => ({
  markdownToHtml: vi.fn(async (md: string) => `<p>${md}</p>`),
  parseMarkdown: vi.fn(() => ({ toString: () => 'markdown' })),
  extractImages: vi.fn(() => []),
  replaceImageUrls: vi.fn(),
}));

import { WechatAdapter } from '../src/wechat/adapter';

describe('WechatAdapter', () => {
  const validConfig = { appId: 'wx_test', appSecret: 'secret123' };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('isReady', () => {
    it('returns true when appId and appSecret are provided', async () => {
      const adapter = new WechatAdapter(validConfig);
      expect(await adapter.isReady()).toBe(true);
    });

    it('returns false when appId is empty', async () => {
      const adapter = new WechatAdapter({ appId: '', appSecret: 's' });
      expect(await adapter.isReady()).toBe(false);
    });

    it('returns false when appSecret is empty', async () => {
      const adapter = new WechatAdapter({ appId: 'id', appSecret: '' });
      expect(await adapter.isReady()).toBe(false);
    });

    it('returns false with empty config', async () => {
      const adapter = new WechatAdapter({});
      expect(await adapter.isReady()).toBe(false);
    });
  });

  describe('adaptContent', () => {
    it('converts markdown to HTML', async () => {
      const adapter = new WechatAdapter(validConfig);
      const result = await adapter.adaptContent({
        title: 'T', markdown: 'Hello', tags: [],
      });
      expect(result.html).toBe('<p>Hello</p>');
    });
  });

  describe('publish', () => {
    it('requires a cover image or existing thumbnail media id', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ access_token: 'test-token' }),
      });
      const adapter = new WechatAdapter({ appId: 'test', appSecret: 'x' });
      const result = await adapter.publish({ title: 'T', markdown: 'M', tags: [] });
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('封面图');
    });

    it('calls WeChat API and returns success', async () => {
      const mockTokenResponse = { access_token: 'abc_token' };
      const mockDraftResponse = { media_id: 'media_123' };
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ json: async () => mockTokenResponse })
        .mockResolvedValueOnce({ json: async () => mockDraftResponse });

      const adapter = new WechatAdapter({ appId: 'wx_success', appSecret: 'secret123' });
      const result = await adapter.publish({
        title: 'Test Title', markdown: '# Hello', tags: [],
        platformConfig: { thumb_media_id: 'thumb_123' },
      });

      expect(result.success).toBe(true);
      expect(result.remoteId).toBe('media_123');
      expect(result.remoteUrl).toContain('media_123');
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect((global.fetch as any).mock.calls[0][0]).toContain('cgi-bin/token');
      expect((global.fetch as any).mock.calls[1][0]).toContain('cgi-bin/draft/add');
    });

    it('handles token API error response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ errcode: 40001, errmsg: 'invalid credential' }),
      });

      const adapter = new WechatAdapter({ appId: 'wx_error', appSecret: 'secret123' });
      const result = await adapter.publish({
        title: 'T', markdown: 'M', tags: [],
        platformConfig: { thumb_media_id: 'thumb_123' },
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('WECHAT_TOKEN_INVALID');
      expect(result.errorMessage).toContain('invalid credential');
    });

    it('handles network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

      const adapter = new WechatAdapter(validConfig);
      const result = await adapter.publish({ title: 'T', markdown: 'M', tags: [] });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('WECHAT_NETWORK_ERROR');
    });
  });
});
