'use client';

import { useState, useEffect, useCallback } from 'react';
import { Project } from './types';
import { loadProject, saveProject } from './store';

export const CHANNEL_NAME = 'video-vc';

export interface SyncMessage {
  projectId: string;
}

// Function to post a message to the BroadcastChannel
export function notifyProjectSaved(projectId: string): void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return;
  }
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ projectId });
    channel.close();
  } catch (err) {
    console.warn('Failed to broadcast project update:', err);
  }
}

/**
 * React hook that loads a project and automatically reloads
 * whenever a message is heard on the 'video-vc' BroadcastChannel.
 */
export function useProject(id: string) {
  const [project, setProjectState] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const reload = useCallback(() => {
    if (!id) return;
    const current = loadProject(id);
    setProjectState(current);
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    reload();

    if (typeof window === 'undefined') return;

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = (event: MessageEvent<SyncMessage>) => {
          if (event.data && event.data.projectId === id) {
            reload();
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel creation failed:', e);
      }
    }

    // Storage event fallback for cross-tab sync
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key.includes(id)) {
        reload();
      }
    };

    window.addEventListener('storage', handleStorage);

    return () => {
      if (channel) {
        channel.close();
      }
      window.removeEventListener('storage', handleStorage);
    };
  }, [id, reload]);

  const updateProject = useCallback((updated: Project) => {
    saveProject(updated);
    setProjectState(updated);
  }, []);

  return { project, setProject: updateProject, reload, isLoading };
}
