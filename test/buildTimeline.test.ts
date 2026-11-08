import { describe, it, expect } from 'vitest';
import { buildTimeline, buildPlaceholderSampleTimeline } from '../lib/buildTimeline';
import { MediaItem } from '../lib/types';

describe('lib/buildTimeline.ts', () => {
  it('places uploaded videos one after another on track V1 (each start = end of the previous clip)', () => {
    const videos: MediaItem[] = [
      { id: 'm-vid-1', name: 'intro.mp4', duration: 5.5, size: 5000000 },
      { id: 'm-vid-2', name: 'action.mp4', duration: 8.0, size: 8000000 },
      { id: 'm-vid-3', name: 'outro.mp4', duration: 4.2, size: 4000000 },
    ];

    const timeline = buildTimeline(videos);

    expect(timeline.clips.length).toBe(3);

    // First video starts at 0
    expect(timeline.clips[0].track).toBe('V1');
    expect(timeline.clips[0].start).toBe(0);
    expect(timeline.clips[0].dur).toBe(5.5);
    expect(timeline.clips[0].sourceIn).toBe(0);
    expect(timeline.clips[0].sourceOut).toBe(5.5);
    expect(timeline.clips[0].speed).toBe(1);
    expect(timeline.clips[0].mediaId).toBe('m-vid-1');

    // Second video starts at end of first clip (5.5s)
    expect(timeline.clips[1].track).toBe('V1');
    expect(timeline.clips[1].start).toBe(5.5);
    expect(timeline.clips[1].dur).toBe(8.0);
    expect(timeline.clips[1].sourceIn).toBe(0);
    expect(timeline.clips[1].sourceOut).toBe(8.0);
    expect(timeline.clips[1].speed).toBe(1);
    expect(timeline.clips[1].mediaId).toBe('m-vid-2');

    // Third video starts at 5.5 + 8.0 = 13.5s
    expect(timeline.clips[2].track).toBe('V1');
    expect(timeline.clips[2].start).toBe(13.5);
    expect(timeline.clips[2].dur).toBe(4.2);
    expect(timeline.clips[2].sourceIn).toBe(0);
    expect(timeline.clips[2].sourceOut).toBe(4.2);
    expect(timeline.clips[2].speed).toBe(1);
    expect(timeline.clips[2].mediaId).toBe('m-vid-3');

    // Fresh uuids
    const ids = new Set(timeline.clips.map((c) => c.id));
    expect(ids.size).toBe(3);
  });

  it('places audio files on A1 starting at 0', () => {
    const audio: MediaItem[] = [
      { id: 'm-aud-1', name: 'bgm.mp3', duration: 12.0, size: 2000000 },
      { id: 'm-aud-2', name: 'soundfx.wav', duration: 3.5, size: 1000000 },
    ];

    const timeline = buildTimeline(audio);

    expect(timeline.clips.length).toBe(2);

    expect(timeline.clips[0].track).toBe('A1');
    expect(timeline.clips[0].start).toBe(0);
    expect(timeline.clips[0].dur).toBe(12.0);
    expect(timeline.clips[0].sourceIn).toBe(0);
    expect(timeline.clips[0].sourceOut).toBe(12.0);
    expect(timeline.clips[0].speed).toBe(1);
    expect(timeline.clips[0].mediaId).toBe('m-aud-1');

    expect(timeline.clips[1].track).toBe('A1');
    expect(timeline.clips[1].start).toBe(12.0);
    expect(timeline.clips[1].dur).toBe(3.5);
    expect(timeline.clips[1].sourceIn).toBe(0);
    expect(timeline.clips[1].sourceOut).toBe(3.5);
    expect(timeline.clips[1].speed).toBe(1);
    expect(timeline.clips[1].mediaId).toBe('m-aud-2');
  });

  it('handles mixed video and audio uploads on separate tracks (V1 and A1)', () => {
    const mixed: MediaItem[] = [
      { id: 'v1', name: 'clip_a.mp4', duration: 10.0, size: 5000000 },
      { id: 'a1', name: 'audio_track.mp3', duration: 15.0, size: 3000000 },
      { id: 'v2', name: 'clip_b.mp4', duration: 6.0, size: 4000000 },
    ];

    const timeline = buildTimeline(mixed);

    expect(timeline.clips.length).toBe(3);

    const v1Clips = timeline.clips.filter((c) => c.track === 'V1');
    const a1Clips = timeline.clips.filter((c) => c.track === 'A1');

    expect(v1Clips.length).toBe(2);
    expect(a1Clips.length).toBe(1);

    expect(v1Clips[0].start).toBe(0);
    expect(v1Clips[0].dur).toBe(10.0);

    expect(v1Clips[1].start).toBe(10.0);
    expect(v1Clips[1].dur).toBe(6.0);

    expect(a1Clips[0].start).toBe(0);
    expect(a1Clips[0].dur).toBe(15.0);
  });

  it('buildPlaceholderSampleTimeline returns exactly 6 placeholder clips with no media', () => {
    const sample = buildPlaceholderSampleTimeline();

    expect(sample.clips.length).toBe(6);

    for (const clip of sample.clips) {
      expect(clip.mediaId).toBeNull();
      expect(typeof clip.id).toBe('string');
      expect(typeof clip.name).toBe('string');
      expect(typeof clip.start).toBe('number');
      expect(typeof clip.dur).toBe('number');
      expect(clip.dur).toBeGreaterThan(0);
      expect(clip.speed).toBe(1);
    }

    const v1Count = sample.clips.filter((c) => c.track === 'V1').length;
    const a1Count = sample.clips.filter((c) => c.track === 'A1').length;

    expect(v1Count).toBe(4);
    expect(a1Count).toBe(2);
  });
});
