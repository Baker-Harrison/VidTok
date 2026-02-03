'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Maximize, Volume2, VolumeX, SkipForward, SkipBack } from 'lucide-react';

export default function VideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') togglePlay();
      if (e.key === 'f') toggleFullscreen();
      if (e.key === 'm') toggleMute();
      if (e.key === 'l') skip(10);
      if (e.key === 'j') skip(-10);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const togglePlay = () => {
    if (videoRef.current?.paused) {
      videoRef.current.play();
      setPlaying(true);
    } else {
      videoRef.current?.pause();
      setPlaying(false);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setMuted(videoRef.current.muted);
    }
  };

  const skip = (time: number) => {
    if (videoRef.current) videoRef.current.currentTime += time;
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      videoRef.current?.parentElement?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const p = (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setProgress(p);
    }
  };

  return (
    <div 
      className="relative w-full h-full bg-black group overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <video 
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onClick={togglePlay}
      />
      
      {/* Glassmorphic Controls Overlay */}
      <div className={`absolute bottom-0 left-0 right-0 p-6 transition-opacity duration-300 ${hovered || !playing ? 'opacity-100' : 'opacity-0'}`}>
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl">
          {/* Progress Bar */}
          <div className="w-full h-1 bg-white/20 rounded-full mb-4 cursor-pointer">
            <div 
              className="h-full bg-blue-500 rounded-full transition-all duration-100" 
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => skip(-10)} className="text-white/80 hover:text-white transition"><SkipBack size={20} /></button>
              <button 
                onClick={togglePlay}
                className="w-12 h-12 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition"
              >
                {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
              </button>
              <button onClick={() => skip(10)} className="text-white/80 hover:text-white transition"><SkipForward size={20} /></button>
            </div>

            <div className="flex items-center gap-4">
              <button onClick={toggleMute} className="text-white/80 hover:text-white transition">
                {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <button onClick={toggleFullscreen} className="text-white/80 hover:text-white transition">
                <Maximize size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
