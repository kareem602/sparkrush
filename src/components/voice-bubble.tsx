import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

const SPEEDS = [1, 1.5, 2] as const;
type Speed = typeof SPEEDS[number];

export function VoiceBubble({ url, duration, mine }: { url: string; duration: number | null; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [length, setLength] = useState<number>(duration ?? 0);

  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    a.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    const onTime = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    const onMeta = () => { if (a.duration && isFinite(a.duration)) setLength(Math.round(a.duration)); };
    const onEnd = () => { setPlaying(false); setProgress(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => { a.removeEventListener("timeupdate", onTime); a.removeEventListener("loadedmetadata", onMeta); a.removeEventListener("ended", onEnd); };
  }, []);

  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };

  const cycleSpeed = () => {
    const i = SPEEDS.indexOf(speed);
    setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className={`flex items-center gap-2.5 min-w-[210px] max-w-[280px] py-1.5 ${mine ? "text-primary-foreground" : "text-foreground"}`}>
      <button type="button" onClick={toggle}
        className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center ${mine ? "bg-white/20 hover:bg-white/30" : "bg-primary text-primary-foreground"}`}
        aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
      </button>
      <div className="flex-1 flex items-center gap-1 h-5">
        {Array.from({ length: 22 }).map((_, i) => {
          const filled = progress * 22 > i;
          return (
            <span key={i}
              className={`flex-1 rounded-sm transition-colors ${filled ? (mine ? "bg-white" : "bg-primary") : (mine ? "bg-white/40" : "bg-muted-foreground/40")}`}
              style={{ height: `${30 + ((i * 17) % 70)}%` }} />
          );
        })}
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-[11px] tabular-nums opacity-80">{fmt(length)}</span>
        <button type="button" onClick={cycleSpeed}
          className={`text-[10px] font-bold px-1.5 rounded ${mine ? "bg-white/20" : "bg-muted"}`}>
          {speed}x
        </button>
      </div>
      <audio ref={audioRef} src={url} preload="metadata" />
    </div>
  );
}
