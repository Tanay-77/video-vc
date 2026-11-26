'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Music, Square } from 'lucide-react';
import { Timeline, Clip } from '../lib/types';
import { getMediaUrl } from '../lib/media';

export interface PlayerViewProps {
  timeline: Timeline;
  time?: number;
  onTime?: (t: number) => void;
}

// Colors for placeholder clips with no media
const PLACEHOLDER_COLORS = [
  'bg-indigo-900 border-indigo-500 text-indigo-200',
  'bg-emerald-900 border-emerald-500 text-emerald-200',
  'bg-amber-900 border-amber-500 text-amber-200',
  'bg-rose-900 border-rose-500 text-rose-200',
  'bg-purple-900 border-purple-500 text-purple-200',
  'bg-cyan-900 border-cyan-500 text-cyan-200',
];

export function PlayerView({ timeline, time: propTime, onTime }: PlayerViewProps) {
  const [localTime, setLocalTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isVideoMuted, setIsVideoMuted] = useState<boolean>(true); // Default muted as music sits on top
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [currentV1Src, setCurrentV1Src] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Determine effective playhead time
  const currentTime = propTime !== undefined ? propTime : localTime;

  const updateTime = (t: number) => {
    const clamped = Math.max(0, Math.min(totalDuration, t));
    if (onTime) {
      onTime(clamped);
    } else {
      setLocalTime(clamped);
    }
  };

  // Calculate timeline max duration
  const totalDuration = useMemo(() => {
    if (!timeline.clips || timeline.clips.length === 0) return 10;
    return Math.max(
      1,
      ...timeline.clips.map((c) => c.start + c.dur)
    );
  }, [timeline.clips]);

  // Preload / resolve blob URLs for media in timeline
  useEffect(() => {
    let isMounted = true;

    async function loadUrls() {
      const urls: Record<string, string> = {};
      for (const clip of timeline.clips) {
        if (clip.mediaId && !urls[clip.mediaId]) {
          try {
            const url = await getMediaUrl(clip.mediaId);
            if (isMounted) urls[clip.mediaId] = url;
          } catch {
            // Media not yet in IndexedDB or placeholder
          }
        }
      }
      if (isMounted) {
        setMediaUrls((prev) => ({ ...prev, ...urls }));
      }
    }

    loadUrls();
    return () => {
      isMounted = false;
    };
  }, [timeline.clips]);

  // Master playback timer
  useEffect(() => {
    if (!isPlaying) return;

    let lastTick = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      const dt = (now - lastTick) / 1000;
      lastTick = now;

      const next = currentTime + dt;
      if (next >= totalDuration) {
        updateTime(0);
        setIsPlaying(false);
      } else {
        updateTime(next);
      }
    }, 40);

    return () => clearInterval(interval);
  }, [isPlaying, currentTime, totalDuration]);

  // Find V1 clip covering current time t
  const currentV1Clip = useMemo(() => {
    return timeline.clips.find(
      (c) => c.track === 'V1' && currentTime >= c.start && currentTime < c.start + c.dur
    ) || null;
  }, [timeline.clips, currentTime]);

  // Synchronize V1 Video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!currentV1Clip || !currentV1Clip.mediaId) {
      // In a gap or placeholder clip: pause video element
      if (!video.paused) {
        video.pause();
      }
      return;
    }

    const clipUrl = mediaUrls[currentV1Clip.mediaId];
    if (!clipUrl) {
      if (!video.paused) video.pause();
      return;
    }

    // Set source if changed
    if (currentV1Src !== clipUrl) {
      video.src = clipUrl;
      setCurrentV1Src(clipUrl);
    }

    // Calculate target source time: sourceIn + (t - start) * speed
    const targetSourceTime =
      currentV1Clip.sourceIn + (currentTime - currentV1Clip.start) * currentV1Clip.speed;

    // Seek if drift > 0.25s
    if (Math.abs(video.currentTime - targetSourceTime) > 0.25) {
      video.currentTime = targetSourceTime;
    }

    video.playbackRate = currentV1Clip.speed;
    video.muted = isVideoMuted;

    if (isPlaying) {
      if (video.paused) {
        video.play().catch(() => {});
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
    }
  }, [currentV1Clip, currentTime, isPlaying, isVideoMuted, mediaUrls, currentV1Src]);

  // Filter A1 audio clips
  const a1Clips = useMemo(() => {
    return timeline.clips.filter((c) => c.track === 'A1');
  }, [timeline.clips]);

  // Synchronize A1 Audio elements
  // "Also play the A1 audio clips: use one audio element per clip,
  // start it when the playhead enters the clip (seek to sourceIn + (t - start) * speed),
  // stop it when the clip ends, and pause it with the video."
  useEffect(() => {
    a1Clips.forEach((clip) => {
      const audio = audioRefs.current.get(clip.id);
      if (!audio) return;

      const inClip = currentTime >= clip.start && currentTime < clip.start + clip.dur;
      const targetSourceTime = clip.sourceIn + (currentTime - clip.start) * clip.speed;

      if (inClip) {
        audio.playbackRate = clip.speed;

        // Ensure source is loaded
        const clipUrl = clip.mediaId ? mediaUrls[clip.mediaId] : null;
        if (clipUrl && audio.src !== clipUrl) {
          audio.src = clipUrl;
        }

        if (isPlaying) {
          if (Math.abs(audio.currentTime - targetSourceTime) > 0.25) {
            audio.currentTime = targetSourceTime;
          }
          if (audio.paused) {
            audio.play().catch(() => {});
          }
        } else {
          // Pause with the video
          if (!audio.paused) {
            audio.pause();
          }
          if (Math.abs(audio.currentTime - targetSourceTime) > 0.1) {
            audio.currentTime = targetSourceTime;
          }
        }
      } else {
        // Playhead outside clip: stop audio
        if (!audio.paused) {
          audio.pause();
        }
        audio.currentTime = clip.sourceIn;
      }
    });
  }, [a1Clips, currentTime, isPlaying, mediaUrls]);

  // Format seconds to mm:ss.s
  const formatTimecode = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
  };

  // Find index for placeholder color
  const placeholderColorIndex = currentV1Clip
    ? Math.abs(currentV1Clip.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) %
      PLACEHOLDER_COLORS.length
    : 0;

  return (
    <div className="bg-[#131317] border border-[#22222a] rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Video Preview Frame */}
      <div className="relative aspect-video w-full bg-[#0a0a0d] flex items-center justify-center overflow-hidden border-b border-[#22222a]">
        {/* Hidden / Managed audio elements for each A1 clip */}
        {a1Clips.map((clip) => (
          <audio
            key={clip.id}
            ref={(el) => {
              if (el) audioRefs.current.set(clip.id, el);
              else audioRefs.current.delete(clip.id);
            }}
            src={clip.mediaId ? mediaUrls[clip.mediaId] : undefined}
            preload="auto"
          />
        ))}

        {/* Video Element for V1 Track */}
        <video
          ref={videoRef}
          playsInline
          preload="auto"
          className={`w-full h-full object-contain ${
            currentV1Clip && currentV1Clip.mediaId ? 'block' : 'hidden'
          }`}
        />

        {/* Placeholder Box when clip has no mediaId (e.g. sample project colored box) */}
        {currentV1Clip && !currentV1Clip.mediaId && (
          <div
            className={`w-4/5 h-3/5 rounded-2xl border-2 flex flex-col items-center justify-center p-6 text-center shadow-2xl transition-all ${PLACEHOLDER_COLORS[placeholderColorIndex]}`}
          >
            <span className="text-[11px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-black/40 mb-2">
              V1 Placeholder Clip
            </span>
            <h4 className="text-lg sm:text-xl font-bold truncate max-w-full">
              {currentV1Clip.name}
            </h4>
            <div className="text-xs font-mono opacity-80 mt-2">
              {(currentTime - currentV1Clip.start).toFixed(1)}s / {currentV1Clip.dur.toFixed(1)}s
            </div>
          </div>
        )}

        {/* Black Frame in Gaps */}
        {!currentV1Clip && (
          <div className="flex flex-col items-center justify-center space-y-2 select-none text-zinc-600">
            <div className="w-8 h-8 rounded-full border border-zinc-800 flex items-center justify-center text-xs">
              <Square className="w-2.5 h-2.5 fill-current" />
            </div>
            <span className="text-xs font-mono uppercase tracking-widest">
              Black Frame (Gap)
            </span>
          </div>
        )}

        {/* Live HUD Overlay */}
        <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
          <span className="px-2.5 py-1 bg-[#101014]/80 backdrop-blur-md rounded-full text-[11px] font-mono text-zinc-200 border border-white/10">
            {formatTimecode(currentTime)} / {formatTimecode(totalDuration)}
          </span>
          {currentV1Clip && (
            <span className="px-2.5 py-1 bg-[#1f883d]/20 text-emerald-300 backdrop-blur-md rounded-full text-[10px] font-mono border border-emerald-500/40">
              V1: {currentV1Clip.name}
            </span>
          )}
          {a1Clips.some((c) => currentTime >= c.start && currentTime < c.start + c.dur) && (
            <span className="px-2.5 py-1 bg-[#0284c7]/20 text-sky-300 backdrop-blur-md rounded-full text-[10px] font-mono border border-sky-500/40 flex items-center gap-1">
              <Music className="w-3 h-3" />
              <span>A1 Playing</span>
            </span>
          )}
        </div>

        {/* Apple Pro Floating Duration Tag */}
        {currentV1Clip && (
          <div className="absolute top-3 right-3 pointer-events-none">
            <span className="px-3 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-xs font-medium text-zinc-200 shadow-md">
              Selected: {currentV1Clip.dur.toFixed(1)}s
            </span>
          </div>
        )}
      </div>

      {/* Playback Controls & Scrubber */}
      <div className="p-3.5 bg-[#0d0d10] space-y-3">
        {/* Scrubber Bar */}
        <div className="flex items-center space-x-3">
          <input
            type="range"
            min={0}
            max={totalDuration}
            step={0.05}
            value={currentTime}
            onChange={(e) => updateTime(parseFloat(e.target.value) || 0)}
            className="flex-1 accent-[#0071e3] cursor-pointer h-1.5 bg-[#202028] rounded-full appearance-none"
          />
          <span className="text-xs font-mono text-zinc-400 w-16 text-right">
            {currentTime.toFixed(1)}s
          </span>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
          <div className="flex items-center space-x-2">
            {/* Play / Pause button */}
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-4 py-1.5 bg-[#0071e3] hover:bg-[#0077ed] text-white font-medium rounded-full text-xs transition shadow-[0_0_12px_rgba(0,113,227,0.35)] flex items-center gap-1.5"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            {/* Stop / Return to start */}
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                updateTime(0);
              }}
              className="px-3 py-1.5 bg-[#18181f] hover:bg-[#22222a] text-zinc-300 rounded-full text-xs transition border border-[#2a2a36] flex items-center gap-1"
              title="Return to start"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>

            {/* Video sound mute button */}
            <button
              type="button"
              onClick={() => setIsVideoMuted(!isVideoMuted)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition border flex items-center gap-1.5 ${
                isVideoMuted
                  ? 'bg-amber-950/40 border-amber-500/40 text-amber-300 hover:bg-amber-950/60'
                  : 'bg-[#18181f] border-[#2a2a36] text-zinc-300 hover:bg-[#22222a]'
              }`}
              title="Toggle video track sound (music sits on top)"
            >
              {isVideoMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>{isVideoMuted ? 'Video Audio: Muted' : 'Video Audio: On'}</span>
            </button>
          </div>

          <div className="text-[11px] text-zinc-500 font-mono">
            {a1Clips.length} A1 audio clip{a1Clips.length !== 1 ? 's' : ''} &bull; {timeline.clips.length} total clip{timeline.clips.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  );
}

