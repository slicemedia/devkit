export type EventListener<Payload> = (payload: Payload) => void;

export interface Emitter<Events extends object> {
  on<EventName extends keyof Events>(
    event: EventName,
    listener: EventListener<Events[EventName]>,
  ): () => void;
  once<EventName extends keyof Events>(
    event: EventName,
    listener: EventListener<Events[EventName]>,
  ): () => void;
  off<EventName extends keyof Events>(
    event: EventName,
    listener: EventListener<Events[EventName]>,
  ): void;
  emit<EventName extends keyof Events>(event: EventName, payload: Events[EventName]): void;
  clear<EventName extends keyof Events>(event?: EventName): void;
  listenerCount<EventName extends keyof Events>(event: EventName): number;
}

type UntypedListener = (payload: unknown) => void;

/**
 * Creates a small synchronous event emitter. Listener collections are snapshotted before emission,
 * so listeners can safely add or remove subscriptions from inside a callback.
 */
export function createEmitter<Events extends object>(): Emitter<Events> {
  const listeners = new Map<keyof Events, Set<UntypedListener>>();

  const on: Emitter<Events>["on"] = (event, listener) => {
    let eventListeners = listeners.get(event);
    if (!eventListeners) {
      eventListeners = new Set();
      listeners.set(event, eventListeners);
    }

    const untypedListener = listener as UntypedListener;
    eventListeners.add(untypedListener);

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      eventListeners.delete(untypedListener);
      if (eventListeners.size === 0) listeners.delete(event);
    };
  };

  const off: Emitter<Events>["off"] = (event, listener) => {
    const eventListeners = listeners.get(event);
    if (!eventListeners) return;
    eventListeners.delete(listener as UntypedListener);
    if (eventListeners.size === 0) listeners.delete(event);
  };

  const once: Emitter<Events>["once"] = (event, listener) => {
    const unsubscribe = on(event, (payload) => {
      unsubscribe();
      listener(payload);
    });
    return unsubscribe;
  };

  const emit: Emitter<Events>["emit"] = (event, payload) => {
    const eventListeners = listeners.get(event);
    if (!eventListeners) return;
    for (const listener of [...eventListeners]) listener(payload);
  };

  const clear: Emitter<Events>["clear"] = (event) => {
    if (event === undefined) listeners.clear();
    else listeners.delete(event);
  };

  return {
    on,
    once,
    off,
    emit,
    clear,
    listenerCount: (event) => listeners.get(event)?.size ?? 0,
  };
}
