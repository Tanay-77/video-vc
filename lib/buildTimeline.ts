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
    const clipId = `clip_${item.id}_${clips.length}`;

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

