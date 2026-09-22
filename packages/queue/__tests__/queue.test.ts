import { describe, it, expect } from 'vitest';
import { PUBLISH_QUEUE_NAME, Worker, QueueEvents } from '../src';

describe('queue constants', () => {
  it('PUBLISH_QUEUE_NAME has correct value', () => {
    expect(PUBLISH_QUEUE_NAME).toBe('publish-queue');
  });

  it('exports Worker class', () => {
    expect(Worker).toBeDefined();
    expect(typeof Worker).toBe('function');
  });

  it('exports QueueEvents class', () => {
    expect(QueueEvents).toBeDefined();
    expect(typeof QueueEvents).toBe('function');
  });
});
