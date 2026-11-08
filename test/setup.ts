import 'fake-indexeddb/auto';

// Polyfill BroadcastChannel if not available in jsdom
if (typeof globalThis.BroadcastChannel === 'undefined') {
  class MockBroadcastChannel {
    name: string;
    onmessage: ((ev: MessageEvent) => any) | null = null;
    private static channels = new Map<string, Set<MockBroadcastChannel>>();

    constructor(name: string) {
      this.name = name;
      if (!MockBroadcastChannel.channels.has(name)) {
        MockBroadcastChannel.channels.set(name, new Set());
      }
      MockBroadcastChannel.channels.get(name)!.add(this);
    }

    postMessage(data: any): void {
      const peers = MockBroadcastChannel.channels.get(this.name);
      if (peers) {
        peers.forEach((peer) => {
          if (peer !== this && peer.onmessage) {
            peer.onmessage(new MessageEvent('message', { data }));
          }
        });
      }
    }

    close(): void {
      const peers = MockBroadcastChannel.channels.get(this.name);
      if (peers) {
        peers.delete(this);
      }
    }
  }

  (globalThis as any).BroadcastChannel = MockBroadcastChannel;
}
