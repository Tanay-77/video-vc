import { MediaItem, Timeline, Clip } from './types';

/**
 * Checks if a media item is an audio file based on extension
 */
export function isAudioMedia(item: MediaItem): boolean {
  const name = item.name.toLowerCase();
  return (
    name.endsWith('.mp3') ||
    name.endsWith('.wav') ||
    name.endsWith('.ogg') ||
    name.endsWith('.m4a') ||
    name.endsWith('.aac') ||
    name.endsWith('.flac')
  );
}

/**
 * Places the uploaded videos one after another on track V1 (each start = end of the previous clip)
 * and audio files on A1 starting at 0.
 * Every clip gets a fresh uuid, its mediaId, sourceIn 0, sourceOut = duration and speed 1.
 */
export function buildTimeline(items: MediaItem[]): Timeline {
  const clips: Clip[] = [];

  let currentVideoStart = 0;
  let currentAudioStart = 0;

  for (const item of items) {
    const isAudio = isAudioMedia(item);
    const clipId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `clip_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    if (isAudio) {
      clips.push({
        id: clipId,
        mediaId: item.id,
        track: 'A1',
        name: item.name,
        start: currentAudioStart,
        dur: item.duration,
        sourceIn: 0,
        sourceOut: item.duration,
        speed: 1,
      });
      currentAudioStart += item.duration;
    } else {
      clips.push({
        id: clipId,
        mediaId: item.id,
        track: 'V1',
        name: item.name,
        start: currentVideoStart,
        dur: item.duration,
        sourceIn: 0,
        sourceOut: item.duration,
        speed: 1,
      });
      currentVideoStart += item.duration;
    }
  }

  return { clips };
}

/**
 * Builds a timeline of 6 placeholder clips with no media (colored boxes only)
 */
export function buildPlaceholderSampleTimeline(): Timeline {
  const generateId = (prefix: string) =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  return {
    clips: [
      // 4 Video placeholder clips on V1
      {
        id: generateId('clip_placeholder_1'),
        mediaId: null,
        track: 'V1',
        name: 'Scene 1: Aerial City Skyline',
        start: 0,
        dur: 4,
        sourceIn: 0,
        sourceOut: 4,
        speed: 1,
      },
      {
        id: generateId('clip_placeholder_2'),
        mediaId: null,
        track: 'V1',
        name: 'Scene 2: Mountain Highway Drive',
        start: 4,
        dur: 5,
        sourceIn: 0,
        sourceOut: 5,
        speed: 1,
      },
      {
        id: generateId('clip_placeholder_3'),
        mediaId: null,
        track: 'V1',
        name: 'Scene 3: Golden Hour Coastline',
        start: 9,
        dur: 4,
        sourceIn: 0,
        sourceOut: 4,
        speed: 1,
      },
      {
        id: generateId('clip_placeholder_4'),
        mediaId: null,
        track: 'V1',
        name: 'Scene 4: Campfire Stargazing',
        start: 13,
        dur: 5,
        sourceIn: 0,
        sourceOut: 5,
        speed: 1,
      },
      // 2 Audio placeholder clips on A1
      {
        id: generateId('clip_placeholder_5'),
        mediaId: null,
        track: 'A1',
        name: 'Intro Track: Synthwave Bass',
        start: 0,
        dur: 9,
        sourceIn: 0,
        sourceOut: 9,
        speed: 1,
      },
      {
        id: generateId('clip_placeholder_6'),
        mediaId: null,
        track: 'A1',
        name: 'Outro Track: Acoustic Melodies',
        start: 9,
        dur: 9,
        sourceIn: 0,
        sourceOut: 9,
        speed: 1,
      },
    ],
  };
}

