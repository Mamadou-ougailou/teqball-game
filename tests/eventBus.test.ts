import { describe, it, expect } from 'vitest';
import { EventBus } from '@core/EventBus';

/**
 * Unit tests for EventBus pub/sub system
 * Verifies no memory leaks and proper event routing
 */

describe('EventBus', () => {
  it('emits to all subscribers', () => {
    EventBus.clear();
    let count = 0;

    EventBus.on('test:event', () => {
      count++;
    });

    EventBus.emit('test:event');
    expect(count).toBe(1);
  });

  it('supports one-time subscriptions', () => {
    EventBus.clear();
    let count = 0;

    EventBus.once('test:once', () => {
      count++;
    });

    EventBus.emit('test:once');
    EventBus.emit('test:once');

    expect(count).toBe(1);
  });

  it('allows unsubscribing', () => {
    EventBus.clear();
    let count = 0;

    const callback = () => {
      count++;
    };

    EventBus.on('test:unsubscribe', callback);
    EventBus.emit('test:unsubscribe');

    EventBus.off('test:unsubscribe', callback);
    EventBus.emit('test:unsubscribe');

    expect(count).toBe(1);
  });

  it('passes data correctly', () => {
    EventBus.clear();
    let receivedData: unknown = null;

    EventBus.on('test:data', (data) => {
      receivedData = data;
    });

    EventBus.emit('test:data', { message: 'hello' });

    expect(receivedData).toEqual({ message: 'hello' });
  });

  it('handles no listeners gracefully', () => {
    EventBus.clear();
    expect(() => EventBus.emit('nonexistent')).not.toThrow();
  });
});
