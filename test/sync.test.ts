import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CHANNEL_NAME, notifyProjectSaved } from '../lib/sync';
import { saveProject } from '../lib/store';
import { Project } from '../lib/types';

describe('lib/sync.ts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('uses BroadcastChannel named video-vc', () => {
    expect(CHANNEL_NAME).toBe('video-vc');
  });

  it('broadcasts { projectId } across tabs on every project save', async () => {
    const receivedMessages: any[] = [];
    const testChannel = new BroadcastChannel(CHANNEL_NAME);
    testChannel.onmessage = (event) => {
      receivedMessages.push(event.data);
    };

    const project: Project = {
      id: 'proj-sync-test',
      name: 'Sync Test',
      media: [],
      snapshots: [],
      variations: [],
      reviews: [],
    };

    saveProject(project);

    // Give broadcast microtask a tick
    await new Promise((r) => setTimeout(r, 50));

    expect(receivedMessages).toContainEqual({ projectId: 'proj-sync-test' });
    testChannel.close();
  });

  it('notifyProjectSaved posts to the video-vc channel', async () => {
    const receivedMessages: any[] = [];
    const testChannel = new BroadcastChannel(CHANNEL_NAME);
    testChannel.onmessage = (event) => {
      receivedMessages.push(event.data);
    };

    notifyProjectSaved('sample-id-123');

    await new Promise((r) => setTimeout(r, 50));
    expect(receivedMessages).toContainEqual({ projectId: 'sample-id-123' });
    testChannel.close();
  });
});
