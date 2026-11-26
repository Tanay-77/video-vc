'use client';

import React, { useState, useRef } from 'react';
import { Plus, X, UploadCloud } from 'lucide-react';
import { MediaItem, Clip, TrackType } from '../lib/types';
import { saveMedia, getMediaUrl } from '../lib/media';

interface MediaLibraryProps {
  media: MediaItem[];
  onMediaAdded: (newItem: MediaItem) => void;
  onInsertToTimeline?: (clip: Clip) => void;
}

export function MediaLibrary({ media, onMediaAdded, onInsertToTimeline }: MediaLibraryProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMediaName, setPreviewMediaName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setErrorMsg(null);
      const mediaItem = await saveMedia(file);
      onMediaAdded(mediaItem);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      console.error('Failed to save media:', err);
      setErrorMsg(err?.message || 'Failed to save media in IndexedDB');
    } finally {
      setIsUploading(false);
    }
  };

  const handlePreview = async (item: MediaItem) => {
    try {
      setErrorMsg(null);
      const url = await getMediaUrl(item.id);
      setPreviewUrl(url);
      setPreviewMediaName(item.name);
    } catch (err: any) {
      console.error('Preview error:', err);
      setErrorMsg(`Could not load media from IndexedDB: ${err?.message || 'File not stored locally'}`);
    }
  };

  const handleQuickInsert = (item: MediaItem, track: TrackType = 'V1') => {
    if (!onInsertToTimeline) return;
    const newClip: Clip = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `clip_${Date.now()}`,
      mediaId: item.id,
      name: item.name.replace(/\.[^/.]+$/, ''),
      track,
      start: 0,
      dur: Math.min(item.duration, 5.0),
      sourceIn: 0,
      sourceOut: Math.min(item.duration, 5.0),
      speed: 1.0,
    };
    onInsertToTimeline(newClip);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg p-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
        <div>
          <h3 className="font-semibold text-slate-200 text-sm flex items-center gap-2">
            <span>Media Pool</span>
            <span className="text-[11px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
              IndexedDB ({media.length})
            </span>
          </h3>
          <p className="text-[11px] text-slate-400">Binary assets kept locally in IndexedDB &amp; shared across tabs</p>
        </div>

        <div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="video/*,audio/*"
            className="hidden"
          />
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 text-white text-xs font-medium rounded-lg transition shadow-sm flex items-center gap-1.5"
          >
            {isUploading ? (
              <>
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Saving to DB...</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload Media</span>
              </>
            )}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-3 p-2 text-xs bg-amber-950/60 border border-amber-800/60 rounded text-amber-300">
          {errorMsg}
        </div>
      )}

      {/* Video Preview Modal if active */}
      {previewUrl && (
        <div className="mb-4 p-3 bg-slate-950 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="text-xs font-semibold text-slate-300 truncate">Preview: {previewMediaName}</span>
            <button
              onClick={() => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
              }}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close</span>
            </button>
          </div>
          <video src={previewUrl} controls className="w-full max-h-56 rounded bg-black object-contain" />
        </div>
      )}

      {/* Media Items Grid */}
      {media.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-xs">
          No media files uploaded yet. Click &quot;Upload Media&quot; to add video/audio files directly to IndexedDB.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
          {media.map((item) => (
            <div
              key={item.id}
              className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition flex flex-col justify-between text-xs space-y-2"
            >
              <div className="flex items-start justify-between gap-1">
                <span className="font-medium text-slate-200 truncate block" title={item.name}>
                  {item.name}
                </span>
                <span className="text-[10px] text-slate-400 font-mono shrink-0">
                  {item.duration.toFixed(1)}s
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-mono">{formatBytes(item.size)}</span>
                <span className="text-[10px] text-slate-500 font-mono">id: {item.id.slice(0, 6)}</span>
              </div>

              <div className="flex items-center gap-1.5 pt-1 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => handlePreview(item)}
                  className="px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
                >
                  Play
                </button>
                {onInsertToTimeline && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleQuickInsert(item, 'V1')}
                      className="px-2 py-1 text-[11px] bg-blue-900/60 hover:bg-blue-800 text-blue-300 rounded border border-blue-800/50 transition"
                      title="Insert to primary track V1"
                    >
                      + V1
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickInsert(item, 'V2')}
                      className="px-2 py-1 text-[11px] bg-purple-900/60 hover:bg-purple-800 text-purple-300 rounded border border-purple-800/50 transition"
                      title="Insert to overlay track V2"
                    >
                      + V2
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

