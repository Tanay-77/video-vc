import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveProject, loadProject, listProjects, deleteProject } from '../lib/store';
import { Project } from '../lib/types';
import * as sync from '../lib/sync';

describe('lib/store.ts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const mockProject: Project = {
    id: 'test-proj-1',
    name: 'Test Project',
    media: [
      { id: 'm1', name: 'clip1.mp4', duration: 12.0, size: 1048576 }
    ],
    snapshots: [
      {
        id: 's1',
        parentId: null,
        author: 'Alex',
        message: 'Initial cut',
        createdAt: '2026-01-01T00:00:00.000Z',
        timeline: {
          clips: [
            {
              id: 'c1',
              mediaId: 'm1',
              track: 'V1',
              name: 'Intro Shot',
              start: 0,
              dur: 5.0,
              sourceIn: 0,
              sourceOut: 5.0,
              speed: 1.0,
            }
          ]
        }
      }
    ],
    variations: [
      {
        id: 'var1',
        name: 'Action Cut',
        author: 'Jordan',
        baseSnapshotId: 's1',
        status: 'editing',
        timeline: { clips: [] }
      }
    ],
    reviews: [
      {
        id: 'rev1',
        variationId: 'var1',
        baseSnapshotId: 's1',
        message: 'Check out the new cut',
        status: 'open'
      }
    ]
  };

  it('saves and loads a project keyed by project id in localStorage', () => {
    const notifySpy = vi.spyOn(sync, 'notifyProjectSaved');

    saveProject(mockProject);

    // Verify localStorage key
    const raw = localStorage.getItem(`video_vc_project_${mockProject.id}`);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.id).toBe('test-proj-1');
    expect(parsed.name).toBe('Test Project');
    expect(parsed.snapshots.length).toBe(1);

    // Verify loadProject returns the stored object
    const loaded = loadProject('test-proj-1');
    expect(loaded).toEqual(mockProject);

    // Verify notifyProjectSaved was called with the project ID
    expect(notifySpy).toHaveBeenCalledWith('test-proj-1');
  });

  it('returns null when loading a non-existent project', () => {
    const result = loadProject('non-existent-id');
    expect(result).toBeNull();
  });

  it('lists stored projects and deletes projects correctly', () => {
    const p1 = { ...mockProject, id: 'proj-a', name: 'Alpha' };
    const p2 = { ...mockProject, id: 'proj-b', name: 'Beta' };

    saveProject(p1);
    saveProject(p2);

    const list = listProjects();
    expect(list.some(p => p.id === 'proj-a')).toBe(true);
    expect(list.some(p => p.id === 'proj-b')).toBe(true);

    deleteProject('proj-a');
    expect(loadProject('proj-a')).toBeNull();
    expect(loadProject('proj-b')).not.toBeNull();
  });
});

