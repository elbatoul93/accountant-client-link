import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, PenTool } from "lucide-react";

interface Props {
  width?: number;
  height?: number;
  onChange?: (dataUrl: string | null) => void;
  t: (k: string) => string;
}

export const SignaturePad = ({ width = 520, height = 180, onChange, t }: Props) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    // Fit the container so the whole pad is reachable on narrow phones.
    const cssWidth = Math.min(width, canvas.parentElement?.clientWidth || width);
    canvas.width = cssWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = "100%";
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#0a3055";
  }, [width, height]);

  const pos = (e: PointerEvent | React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e as PointerEvent).clientX - r.left, y: (e as PointerEvent).clientY - r.top };
  };
  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    last.current = pos(e);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  };
  const end = () => {
    drawing.current = false;
    last.current = null;
    if (hasInk) onChange?.(ref.current!.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange?.(null);
  };

  return (
    <div className="space-y-2">
      <div className="rounded-md border-2 border-dashed border-primary/40 bg-card overflow-hidden">
        <canvas
          ref={ref}
          role="img"
          aria-label={t("sig_canvas_label")}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="block touch-none cursor-crosshair w-full"
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
          <PenTool className="h-3 w-3" /> {t("sig_hint")}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasInk}>
          <Eraser className="h-3.5 w-3.5" /> {t("sig_clear")}
        </Button>
      </div>
    </div>
  );
};
