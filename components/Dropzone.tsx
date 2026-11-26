'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, Loader2, Plus, ArrowRight } from 'lucide-react';
import { MediaItem } from '../lib/types';
import { saveMedia, readMediaDuration } from '../lib/media';

interface DropzoneProps {
  mediaItems: MediaItem[];
  onMediaAdded: (items: MediaItem[]) => void;
  onBuildTimeline?: (items: MediaItem[]) => void;
  onAddMediaToTimeline?: (item: MediaItem) => void;
}

export function Dropzone({
  mediaItems,
  onMediaAdded,
  onBuildTimeline,
  onAddMediaToTimeline,
}: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter allowed files (.mp4, .mp3, .wav)
  const isAllowedFile = (file: File) => {
    const name = file.name.toLowerCase();
    return (
      name.endsWith('.mp4') ||
      name.endsWith('.mp3') ||
      name.endsWith('.wav') ||
      file.type === 'video/mp4' ||
      file.type === 'audio/mpeg' ||
      file.type === 'audio/wav' ||
      file.type === 'audio/x-wav'
    );
  };

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(isAllowedFile);

    if (files.length === 0) {
      setStatusMessage('Please upload only .mp4, .mp3, or .wav files.');
      return;
    }

    setIsProcessing(true);
    setStatusMessage(`Processing ${files.length} file(s)...`);

    try {
      const savedItems: MediaItem[] = [];

      for (const file of files) {
        // Read duration from hidden video/audio element (loadedmetadata)
        const duration = await readMediaDuration(file, file.name);

        // Save in IndexedDB directly
        const mediaItem = await saveMedia(file, duration);
        savedItems.push(mediaItem);
      }

      onMediaAdded(savedItems);
      setStatusMessage(`Successfully uploaded ${savedItems.length} file(s) into IndexedDB.`);
    } catch (err: any) {
      console.error('Error uploading media files:', err);
      setStatusMessage(`Upload error: ${err?.message || 'Failed to save in IndexedDB'}`);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="bg-[#131317] border border-[#22222a] rounded-2xl overflow-hidden shadow-xl p-5 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-[#22222a]">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>Clip Upload &amp; Media Bin</span>
            <span className="text-xs bg-[#1f1f28] text-zinc-300 border border-[#2a2a36] px-2.5 py-0.5 rounded-full font-mono">
              {mediaItems.length} item{mediaItems.length !== 1 ? 's' : ''}
            </span>
          </h3>
          <p className="text-xs text-zinc-400">
            Accepts <strong>.mp4</strong>, <strong>.mp3</strong>, and <strong>.wav</strong>. Stored directly in IndexedDB.
          </p>
        </div>

        {onBuildTimeline && mediaItems.length > 0 && (
          <button
            type="button"
            onClick={() => onBuildTimeline(mediaItems)}
            className="px-3.5 py-1.5 bg-[#0071e3] hover:bg-[#0077ed] text-white text-xs font-medium rounded-full transition shadow-sm flex items-center gap-1.5"
            title="Auto-sequence video files onto V1 and audio onto A1"
          >
            <span>Auto-Build Timeline &rarr;</span>
          </button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
        multiple
        accept=".mp4,.mp3,.wav,video/mp4,audio/mpeg,audio/wav,audio/x-wav"
        className="hidden"
      />

      {/* Dropzone area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-[#0071e3] bg-[#0071e3]/10 text-blue-300'
            : 'border-[#282834] hover:border-[#3a3a4c] bg-[#0d0d10]/70 text-zinc-400'
        }`}
      >
        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-[#1a1a24] border border-[#282836] flex items-center justify-center text-zinc-300">
            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin text-[#0071e3]" /> : <UploadCloud className="w-5 h-5 text-zinc-300" />}
          </div>
          <div className="text-xs sm:text-sm font-medium text-zinc-200">
            {isProcessing ? (
              <span>Reading metadata &amp; saving to IndexedDB...</span>
            ) : (
              <span>Drag &amp; drop video (.mp4) and audio (.mp3, .wav) files here</span>
            )}
          </div>
          <p className="text-[11px] text-zinc-500">
            or <span className="text-[#0071e3] hover:underline">browse files from your device</span> (reads duration via loadedmetadata)
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className="p-2.5 rounded-lg bg-[#0e0e12] border border-[#242430] text-xs text-blue-300">
          {statusMessage}
        </div>
      )}

      {/* Media Bin List */}
      <div className="space-y-2 pt-2">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
          Media Bin ({mediaItems.length})
        </span>

        {mediaItems.length === 0 ? (
          <div className="text-center py-6 text-zinc-500 text-xs italic bg-[#0e0e12] rounded-xl border border-[#22222a]">
            Media bin is empty. Drop .mp4, .mp3 or .wav files above.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
            {mediaItems.map((item) => {
              const isAudio =
                item.name.toLowerCase().endsWith('.mp3') ||
                item.name.toLowerCase().endsWith('.wav');

              return (
                <div
                  key={item.id}
                  className="p-3 bg-[#18181f] rounded-xl border border-[#242430] flex flex-col justify-between space-y-2 hover:border-[#363646] transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-1.5 truncate">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                          isAudio
                            ? 'bg-sky-950/70 text-sky-300 border border-sky-600/60'
                            : 'bg-emerald-950/70 text-emerald-300 border border-emerald-600/60'
                        }`}
                      >
                        {isAudio ? 'A1 Audio' : 'V1 Video'}
                      </span>
                      <span className="font-medium text-zinc-200 text-xs truncate" title={item.name}>
                        {item.name}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-zinc-300 shrink-0">
                      {item.duration.toFixed(1)}s
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono pt-1 border-t border-[#22222c]">
                    <div className="flex items-center gap-2">
                      <span>{formatSize(item.size)}</span>
                      <span className="text-zinc-600 text-[10px]">id: {item.id.slice(0, 8)}</span>
                    </div>

                    {onAddMediaToTimeline && (
                      <button
                        type="button"
                        onClick={() => onAddMediaToTimeline(item)}
                        className="px-2.5 py-1 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg text-[11px] font-medium transition flex items-center gap-1 shadow-sm shrink-0"
                        title={`Directly add "${item.name}" (${item.duration.toFixed(1)}s) to timeline with full duration`}
                      >
                        <span>+ Add to Timeline</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

