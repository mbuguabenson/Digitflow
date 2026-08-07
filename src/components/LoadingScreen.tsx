import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const [fadingOut, setFadingOut] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Animate progress 0-100% over 3 seconds
    const startTime = Date.now();
    const duration = 3200;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const percent = Math.min(100, Math.floor((elapsed / duration) * 100));
      setProgress(percent);
      if (percent < 100) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const contentTimer = setTimeout(() => setShowContent(true), 100);
    
    // Show loading screen for a minimum duration to enjoy the animation
    const timer = setTimeout(() => {
      setFadingOut(true);
      setTimeout(() => {
        onComplete();
      }, 1000); 
    }, 4000);

    return () => {
      clearTimeout(contentTimer);
      clearTimeout(timer);
    };
  }, []); // Remove onComplete from dependency array so it doesn't reset when App re-renders!

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-[#0b141e] text-slate-200 transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden font-sans',
        fadingOut ? 'opacity-0 scale-[1.03] pointer-events-none' : 'opacity-100 scale-100'
      )}
    >
      
      {/* Tech-vibe grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#111736_1px,transparent_1px),linear-gradient(to_bottom,#111736_1px,transparent_1px)] bg-[size:40px_40px] opacity-30" />
      
      {/* Main Container */}
      <div 
        className={cn(
          "relative flex flex-col items-center justify-center w-full max-w-xl p-8 z-10",
          "rounded-3xl border border-white/10 bg-gradient-to-br from-[#111736]/90 via-[#0b141e]/90 to-[#111736]/90 backdrop-blur-2xl shadow-[0_0_60px_-15px_rgba(59,130,246,0.2)]",
          "transition-all duration-1000 ease-out transform",
          showContent ? "translate-y-0 opacity-100 shadow-[0_0_80px_-15px_rgba(59,130,246,0.4)]" : "translate-y-8 opacity-0"
        )}
      >
        
        {/* Abstract Liquid/Glowing Core (Vibe: High-Tech Trading Engine) */}
        <div className="relative w-32 h-32 mb-8 flex items-center justify-center">
          {/* Glowing Aura */}
          <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-2xl animate-pulse" />
          <div className="absolute inset-0 bg-orange-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          
          {/* Liquid Morphing Shape */}
          <div className="relative w-20 h-20 bg-gradient-to-tr from-[#0b141e] via-blue-900 to-blue-500 border border-blue-400/50 shadow-[0_0_30px_rgba(59,130,246,0.5)] animate-[morph_4s_ease-in-out_infinite] flex items-center justify-center z-10 overflow-hidden">
             {/* Inner tech scanline */}
             <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(255,255,255,0.1)_50%)] bg-[length:100%_4px] animate-[scan_2s_linear_infinite]" />
             {/* Center dot */}
             <div className="w-3 h-3 bg-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,1)] animate-bounce" />
          </div>

          {/* Orbiting Ring */}
          <div className="absolute w-28 h-28 border border-white/5 rounded-full border-t-blue-500/80 border-r-orange-500/50 animate-spin" style={{ animationDuration: '3s' }} />
        </div>

        {/* Text Content */}
        <div className="flex flex-col gap-4 relative z-10 w-full text-center mb-10">
          <h1 className="text-4xl font-black tracking-tight text-white drop-shadow-md">
            Welcome to <span className="text-white">Digit</span><span className="text-orange-500 drop-shadow-[0_0_10px_rgba(249,115,22,0.8)]">Flow</span>
          </h1>
          <div className="h-[1px] w-16 bg-gradient-to-r from-transparent via-blue-500 to-transparent mx-auto" />
          <p className="text-[11px] font-bold text-blue-300/80 uppercase tracking-[0.25em] leading-relaxed">
            Advance trading engine and automation by profithub
          </p>
        </div>

        {/* Minimal Progress Bar with 0-100% Counter */}
        <div className="flex flex-col w-64 mb-12">
          <div className="flex justify-between items-end mb-2 px-1">
            <span className="text-[10px] text-blue-400/80 font-mono font-bold tracking-widest animate-pulse">INITIALIZING ENGINE</span>
            <span className="text-xs text-orange-400 font-mono font-bold drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]">
              {progress}%
            </span>
          </div>
          <div className="w-full h-[2px] bg-white/5 rounded-full overflow-hidden shadow-[0_0_15px_rgba(59,130,246,0.1)] relative">
            <div 
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-600 via-orange-500 to-blue-600 transition-all duration-[50ms] ease-linear"
              style={{ width: `${progress}%` }} 
            />
          </div>
        </div>

        {/* Contacts / Info Panel */}
        <div className="flex flex-col gap-3 w-full max-w-sm backdrop-blur-md bg-[#111736]/60 border border-white/5 p-5 rounded-lg shadow-2xl relative overflow-hidden group">
          {/* Subtle hover glow on card */}
          <div className="absolute inset-0 bg-gradient-to-b from-blue-500/0 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-500">WHATSAPP</span>
            <span className="text-orange-400 drop-shadow-[0_0_5px_rgba(249,115,22,0.5)]">+254796428848</span>
          </div>
          <div className="w-full h-[1px] bg-white/5" />
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-500">SOCIALS</span>
            <span className="text-blue-400 drop-shadow-[0_0_5px_rgba(59,130,246,0.5)]">@Digitflowtraders</span>
          </div>
          <div className="w-full h-[1px] bg-white/5" />
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-slate-500">NETWORK</span>
            <span className="text-slate-300">Instagram / Tiktok / Telegram</span>
          </div>
        </div>
        
        {/* Powered by */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full text-center">
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
            Powered by Deriv
          </p>
        </div>
      </div>
      
      <style>{`
        @keyframes morph {
          0% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
          50% { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
          100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
        }
        @keyframes scan {
          0% { background-position: 0 0; }
          100% { background-position: 0 100%; }
        }
      `}</style>
    </div>
  );
}
