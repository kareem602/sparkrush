import { useEffect, useRef, useState } from "react";
import { Mic, Trash2, Send, Square } from "lucide-react";

const MAX_SECONDS = 120;

type Props = {
  onCancel: () => void;
  onSend: (blob: Blob, duration: number) => void;
};

export function VoiceRecorder({ onCancel, onSend }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAt = useRef<number>(0);

  const stopTimer = () => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const b = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setBlob(b);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRef.current = mr;
      startedAt.current = Date.now();
      mr.start();
      setRecording(true);
      setSeconds(0);
      tickRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedAt.current) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS) stop();
      }, 200);
    } catch {
      setError("Microphone permission denied");
    }
  };

  const stop = () => {
    stopTimer();
    if (mediaRef.current && mediaRef.current.state !== "inactive") mediaRef.current.stop();
    setRecording(false);
  };

  const cancel = () => {
    stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setBlob(null);
    onCancel();
  };

  useEffect(() => { start(); return () => { stop(); streamRef.current?.getTracks().forEach((t) => t.stop()); }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (error) return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-card border border-border rounded-full">
      <span className="text-sm text-destructive">{error}</span>
      <button type="button" onClick={onCancel} className="text-sm text-primary font-medium">Close</button>
    </div>
  );

  return (
    <div className="flex items-center gap-2 px-3 h-11 bg-card border border-border rounded-full">
      <button type="button" onClick={cancel} className="text-muted-foreground hover:text-destructive p-1" aria-label="Cancel">
        <Trash2 className="h-4 w-4" />
      </button>
      <div className="flex-1 flex items-center gap-2">
        {recording ? (
          <>
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            <div className="flex-1 flex items-end gap-0.5 h-5">
              {Array.from({ length: 18 }).map((_, i) => (
                <span key={i} className="flex-1 bg-primary/70 rounded-sm animate-pulse"
                  style={{ height: `${20 + ((i * 7 + seconds * 13) % 80)}%`, animationDelay: `${i * 60}ms` }} />
              ))}
            </div>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Voice note ready</span>
        )}
        <span className="text-xs tabular-nums text-muted-foreground">{fmt(seconds)} / {fmt(MAX_SECONDS)}</span>
      </div>
      {recording ? (
        <button type="button" onClick={stop} className="h-9 w-9 rounded-full bg-destructive text-white flex items-center justify-center" aria-label="Stop">
          <Square className="h-4 w-4 fill-current" />
        </button>
      ) : (
        <button type="button" onClick={() => blob && onSend(blob, Math.max(1, seconds))}
          className="h-9 w-9 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center" aria-label="Send">
          <Send className="h-4 w-4" />
        </button>
      )}
      {!recording && !blob && (
        <button type="button" onClick={start} className="text-muted-foreground p-1" aria-label="Record again">
          <Mic className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
