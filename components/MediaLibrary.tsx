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
    <div className="bg-[#161a20] border border-[#262b33] rounded-2xl overflow-hidden p-4 space-y-3">
      <div className="flex items-center justify-between pb-3 border-b border-[#262b33]">
        <div>
          <h3 className="font-semibold text-[#e6e8eb] text-sm flex items-center gap-2">
            <span>Media Pool</span>
            <span className="text-[11px] bg-[#20252e] text-[#8b93a1] px-2 py-0.5 rounded-full font-mono border border-[#262b33]">
              IndexedDB ({media.length})
            </span>
          </h3>
          <p className="text-[11px] text-[#8b93a1]">Binary assets kept locally in IndexedDB &amp; shared across tabs</p>
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
            className="px-3.5 py-1.5 bg-[#5b8def] hover:bg-[#6c9bf5] disabled:bg-[#20252e] text-[#0f1115] text-xs font-semibold rounded-full transition flex items-center gap-1.5"
          >
            {isUploading ? (
              <>
                <span className="w-3 h-3 border-2 border-[#0f1115] border-t-transparent rounded-full animate-spin"></span>
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
        <div className="mb-3 p-2 text-xs bg-[#c9605f]/12 border border-[#c9605f]/40 rounded text-[#c9605f]">
          {errorMsg}
        </div>
      )}

      {/* Video Preview Modal if active */}
      {previewUrl && (
        <div className="mb-4 p-3 bg-[#0f1115] rounded-xl border border-[#262b33]">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#262b33]">
            <span className="text-xs font-semibold text-[#e6e8eb] truncate">Preview: {previewMediaName}</span>
            <button
              onClick={() => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
              }}
              className="text-xs text-[#8b93a1] hover:text-[#e6e8eb] flex items-center gap-1"
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
        <div className="text-center py-6 text-[#8b93a1] text-xs">
          No media files uploaded yet. Click &quot;Upload Media&quot; to add video/audio files directly to IndexedDB.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
          {media.map((item) => (
            <div
              key={item.id}
              className="p-2.5 rounded-xl bg-[#0f1115] border border-[#262b33] hover:border-[#38414e] transition flex flex-col justify-between text-xs space-y-2"
            >
              <div className="flex items-start justify-between gap-1">
                <span className="font-medium text-[#e6e8eb] truncate block" title={item.name}>
                  {item.name}
                </span>
                <span className="text-[10px] text-[#8b93a1] font-mono shrink-0">
                  {item.duration.toFixed(1)}s
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#8b93a1]">
                <span className="font-mono">{formatBytes(item.size)}</span>
                <span className="text-[10px] text-[#8b93a1] font-mono">id: {item.id.slice(0, 6)}</span>
              </div>

              <div className="flex items-center gap-1.5 pt-1 border-t border-[#262b33]">
                <button
                  type="button"
                  onClick={() => handlePreview(item)}
                  className="px-2 py-1 text-[11px] bg-transparent hover:bg-[#202630] text-[#8b93a1] hover:text-[#e6e8eb] rounded border border-[#262b33] transition"
                >
                  Play
                </button>
                {onInsertToTimeline && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleQuickInsert(item, 'V1')}
                      className="px-2 py-1 text-[11px] bg-transparent hover:bg-[#202630] text-[#8b93a1] hover:text-[#e6e8eb] rounded border border-[#262b33] transition"
                      title="Insert to primary track V1"
                    >
                      + V1
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickInsert(item, 'V2')}
                      className="px-2 py-1 text-[11px] bg-transparent hover:bg-[#202630] text-[#8b93a1] hover:text-[#e6e8eb] rounded border border-[#262b33] transition"
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

