import VideoPlayer from '../components/VideoPlayer';

export default function WatchPage() {
  return (
    <div className="fixed inset-0 bg-[#0a0a0b] flex">
      {/* Main Stage */}
      <main className="flex-1 relative">
        <VideoPlayer src="/demo.mp4" />
        
        {/* Floating Back Button */}
        <a href="/" className="absolute top-6 left-6 w-10 h-10 flex items-center justify-center bg-black/50 backdrop-blur-md rounded-full border border-white/10 text-white/70 hover:text-white transition z-50">
          ←
        </a>
      </main>

      {/* Sidebar Queue */}
      <aside className="w-[320px] border-l border-white/5 bg-[#0e0e10] flex flex-col">
        <div className="p-4 border-b border-white/5">
          <h2 className="text-sm font-medium text-white/50 tracking-wider uppercase">Up Next</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {/* Mock Queue Items */}
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="group flex gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition">
              <div className="w-24 h-14 bg-white/5 rounded-md relative overflow-hidden">
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition" />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <h3 className="text-sm text-white/90 font-medium truncate">Recommended Video {i}</h3>
                <p className="text-xs text-white/50">Channel Name</p>
              </div>
            </div>
          ))}
        </div>

        {/* Smart Search Input */}
        <div className="p-4 border-t border-white/5">
          <input 
            type="text" 
            placeholder="Smart Search..." 
            className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition"
          />
        </div>
      </aside>
    </div>
  );
}
