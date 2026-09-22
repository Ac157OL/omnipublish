import { describe, it, expect } from 'vitest';
import { MockPlatformAdapter, type PlatformAdapter, type PublishContext } from '../src';

function getTestContext(): PublishContext {
  return {
    title: 'Test Article',
    markdown: '# Hello\n\nThis is a test.',
    tags: ['test'],
  };
}

function runContractTests(label: string, adapter: PlatformAdapter) {
  describe(`${label} - contract`, () => {
    it('has a platformCode string', () => {
      expect(typeof adapter.platformCode).toBe('string');
      expect(adapter.platformCode.length).toBeGreaterThan(0);
    });

    it('has a name string', () => {
      expect(typeof adapter.name).toBe('string');
      expect(adapter.name.length).toBeGreaterThan(0);
    });

    it('isReady returns a boolean', async () => {
      const ready = await adapter.isReady();
      expect(typeof ready).toBe('boolean');
    });

    it('adaptContent returns a PublishContext with same structure', async () => {
      const ctx = getTestContext();
      const result = await adapter.adaptContent(ctx);
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('markdown');
      expect(result).toHaveProperty('tags');
      expect(typeof result.title).toBe('string');
    });

    it('publish returns a PublishResult with required fields', async () => {
      const ctx = getTestContext();
      const result = await adapter.publish(ctx);
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('platform');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.platform).toBe('string');
    });
  });
}

describe('PlatformAdapter Contract Compliance', () => {
  runContractTests('MockPlatformAdapter', new MockPlatformAdapter());
});
