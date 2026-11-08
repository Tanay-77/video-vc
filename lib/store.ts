import { Project } from './types';
import { notifyProjectSaved } from './sync';

const PROJECT_PREFIX = 'video_vc_project_';
const PROJECT_INDEX_KEY = 'video_vc_project_index';

function getStorageKey(id: string): string {
  return `${PROJECT_PREFIX}${id}`;
}

export function saveProject(project: Project): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }

  try {
    const key = getStorageKey(project.id);
    localStorage.setItem(key, JSON.stringify(project));

    // Maintain an index of project IDs for project browsing
    const indexRaw = localStorage.getItem(PROJECT_INDEX_KEY);
    let index: string[] = [];
    if (indexRaw) {
      try {
        index = JSON.parse(indexRaw);
      } catch {
        index = [];
      }
    }
    if (!index.includes(project.id)) {
      index.push(project.id);
      localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(index));
    }

    // Broadcast change across tabs
    notifyProjectSaved(project.id);
  } catch (err) {
    console.error('Error saving project to localStorage:', err);
  }
}

export function loadProject(id: string): Project | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }

  try {
    const raw = localStorage.getItem(getStorageKey(id));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Project;
  } catch (err) {
    console.error(`Error loading project ${id} from localStorage:`, err);
    return null;
  }
}

export function listProjects(): Project[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return [];
  }

  const projects: Project[] = [];
  try {
    const indexRaw = localStorage.getItem(PROJECT_INDEX_KEY);
    const ids: string[] = indexRaw ? JSON.parse(indexRaw) : [];

    for (const id of ids) {
      const p = loadProject(id);
      if (p) {
        projects.push(p);
      }
    }

    // Also scan all localStorage keys starting with PROJECT_PREFIX in case index was wiped
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PROJECT_PREFIX)) {
        const id = key.substring(PROJECT_PREFIX.length);
        if (!projects.some((p) => p.id === id)) {
          const p = loadProject(id);
          if (p) {
            projects.push(p);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error listing projects:', err);
  }

  return projects;
}

export function deleteProject(id: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.removeItem(getStorageKey(id));
    const indexRaw = localStorage.getItem(PROJECT_INDEX_KEY);
    if (indexRaw) {
      const ids: string[] = JSON.parse(indexRaw);
      const filtered = ids.filter((item) => item !== id);
      localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(filtered));
    }
    notifyProjectSaved(id);
  } catch (err) {
    console.error('Error deleting project:', err);
  }
}
