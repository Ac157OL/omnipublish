import type { PlatformAdapter, PublishContext, PublishResult } from './types';

export class MockPlatformAdapter implements PlatformAdapter {
  platformCode = 'mock';
  name = 'Mock Platform';

  async isReady(): Promise<boolean> {
    return true;
  }

  async adaptContent(context: PublishContext): Promise<PublishContext> {
    return context;
  }

  async publish(context: PublishContext): Promise<PublishResult> {
    return {
      success: true,
      platform: this.platformCode,
      remoteId: `mock-${context.title.length}`,
      remoteUrl: 'https://example.invalid/mock-publication',
    };
  }
}
