/**
 * EventBus: Central pub/sub system
 * All systems communicate through this to avoid tight coupling
 * Usage:
 *   EventBus.on('ball:kicked', (data) => console.log(data))
 *   EventBus.emit('ball:kicked', { power: 100 })
 *   EventBus.off('ball:kicked', callback)
 */

type EventCallback<T = unknown> = (data: T) => void;

interface EventListener<T = unknown> {
  callback: EventCallback<T>;
  once: boolean;
}

export class EventBus {
  private static events: Map<string, EventListener[]> = new Map();

  /**
   * Subscribe to an event
   */
  public static on<T = unknown>(eventName: string, callback: EventCallback<T>): void {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, []);
    }
    this.events.get(eventName)!.push({ callback: callback as EventCallback, once: false });
  }

  /**
   * Subscribe to an event that fires only once
   */
  public static once<T = unknown>(eventName: string, callback: EventCallback<T>): void {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, []);
    }
    this.events.get(eventName)!.push({ callback: callback as EventCallback, once: true });
  }

  /**
   * Emit an event to all subscribers
   */
  public static emit<T = unknown>(eventName: string, data?: T): void {
    if (!this.events.has(eventName)) {
      return;
    }

    const listeners = this.events.get(eventName)!;
    const listenersToRemove: number[] = [];

    listeners.forEach((listener, index) => {
      try {
        listener.callback(data);
        if (listener.once) {
          listenersToRemove.push(index);
        }
      } catch (error) {
        console.error(`Error in event listener for '${eventName}':`, error);
      }
    });

    // Remove one-time listeners in reverse order to avoid index issues
    for (let i = listenersToRemove.length - 1; i >= 0; i--) {
      listeners.splice(listenersToRemove[i], 1);
    }
  }

  /**
   * Unsubscribe from an event
   */
  public static off(eventName: string, callback: EventCallback): void {
    if (!this.events.has(eventName)) {
      return;
    }

    const listeners = this.events.get(eventName)!;
    const index = listeners.findIndex((listener) => listener.callback === callback);

    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }

  /**
   * Remove all listeners for an event (or all events if name not provided)
   */
  public static clear(eventName?: string): void {
    if (eventName) {
      this.events.delete(eventName);
    } else {
      this.events.clear();
    }
  }

  /**
   * Get count of listeners (for debugging)
   */
  public static getListenerCount(eventName: string): number {
    return this.events.get(eventName)?.length ?? 0;
  }
}
