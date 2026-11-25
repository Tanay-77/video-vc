// All times are in seconds

export interface MediaItem {
  id: string;
  name: string;
  duration: number; // in seconds
  size: number; // in bytes
}

export type TrackType = 'V2' | 'V1' | 'A1' | 'CC';

export interface Clip {
  id: string; // uuid, permanent
  mediaId: string | null;
  track: TrackType;
  name: string;
  start: number; // timeline start in seconds
  dur: number; // timeline duration in seconds
  sourceIn: number; // source in-point in seconds
  sourceOut: number; // source out-point in seconds
  speed: number; // 1.0 = normal speed
}

export interface Timeline {
  clips: Clip[];
}

export interface Snapshot {
  id: string;
  parentId: string | null;
  author: string;
  message: string;
  createdAt: string; // ISO string
  timeline: Timeline;
}

export interface Variation {
  id: string;
  name: string;
  author: string;
  baseSnapshotId: string;
  timeline: Timeline;
  status: 'editing' | 'in-review' | 'combined';
}

export interface ReviewRequest {
  id: string;
  variationId: string;
  baseSnapshotId: string;
  message: string;
  status: 'open' | 'combined' | 'changes-requested';
  note?: string;
}

export interface Project {
  id: string;
  name: string;
  media: MediaItem[];
  snapshots: Snapshot[];
  variations: Variation[];
  reviews: ReviewRequest[];
  masterDraft?: Timeline | null; // Lead's uncommitted working cut (draft before publishing to Main)
}

