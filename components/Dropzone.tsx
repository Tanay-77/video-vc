'use client';

import React, { useState, useRef } from 'react';
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
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg p-5 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>Clip Upload &amp; Media Bin</span>
            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
              {mediaItems.length} item{mediaItems.length !== 1 ? 's' : ''}
            </span>
          </h3>
          <p className="text-xs text-slate-400">
            Accepts <strong>.mp4</strong>, <strong>.mp3</strong>, and <strong>.wav</strong>. Stored directly in IndexedDB.
          </p>
        </div>

        {onBuildTimeline && mediaItems.length > 0 && (
          <button
            type="button"
            onClick={() => onBuildTimeline(mediaItems)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition shadow-sm flex items-center gap-1.5"
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
            ? 'border-indigo-500 bg-indigo-950/30 text-indigo-300'
            : 'border-slate-700 hover:border-slate-600 bg-slate-950/60 text-slate-400'
        }`}
      >
        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 text-xl font-bold">
            {isProcessing ? '⏳' : '📥'}
          </div>
          <div className="text-xs sm:text-sm font-medium text-slate-200">
            {isProcessing ? (
              <span>Reading metadata &amp; saving to IndexedDB...</span>
            ) : (
              <span>Drag &amp; drop video (.mp4) and audio (.mp3, .wav) files here</span>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            or <span className="text-indigo-400 underline">browse files from your device</span> (reads duration via loadedmetadata)
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs text-indigo-300">
          {statusMessage}
        </div>
      )}

      {/* Media Bin List */}
      <div className="space-y-2 pt-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
          Media Bin ({mediaItems.length})
        </span>

        {mediaItems.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs italic bg-slate-950/40 rounded-lg border border-slate-800/60">
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
                  className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 flex flex-col justify-between space-y-2 hover:border-slate-700 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-1.5 truncate">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                          isAudio
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/80'
                            : 'bg-blue-950 text-blue-300 border border-blue-800/80'
                        }`}
                      >
                        {isAudio ? 'A1 Audio' : 'V1 Video'}
                      </span>
                      <span className="font-medium text-slate-200 text-xs truncate" title={item.name}>
                        {item.name}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-slate-300 shrink-0">
                      {item.duration.toFixed(1)}s
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-900">
                    <div className="flex items-center gap-2">
                      <span>{formatSize(item.size)}</span>
                      <span className="text-slate-600 text-[10px]">id: {item.id.slice(0, 8)}</span>
                    </div>

                    {onAddMediaToTimeline && (
                      <button
                        type="button"
                        onClick={() => onAddMediaToTimeline(item)}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-semibold transition flex items-center gap-1 shadow-sm shrink-0"
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

