import { useEffect, useRef } from "react";

function cssColor(el: HTMLElement, name: string, fallback: string) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function withAlpha(color: string, alpha: number) {
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
    const hex =
      color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

function downsample(samples: number[], bars: number): number[] {
  if (!samples.length) return Array.from({ length: bars }, () => 0.04);
  if (samples.length <= bars) {
    const pad = Array.from({ length: bars - samples.length }, () => 0.04);
    return [...pad, ...samples];
  }
  const out: number[] = [];
  const step = samples.length / bars;
  for (let i = 0; i < bars; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let peak = 0;
    let sum = 0;
    for (let j = start; j < end; j++) {
      peak = Math.max(peak, samples[j] ?? 0);
      sum += samples[j] ?? 0;
    }
    const n = Math.max(1, end - start);
    out.push(Math.min(1, peak * 0.72 + (sum / n) * 0.28));
  }
  return out;
}

export function Waveform({
  samples,
  live = false,
  compact = false,
}: {
  samples: number[];
  live?: boolean;
  compact?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const fg = cssColor(parent, "--color-foreground", "#f0f0f0");
      const liveC = cssColor(parent, "--color-primary", "#f54e00");
      const muted = cssColor(parent, "--color-subtle", "#888888");
      const mid = h / 2;

      const bars = Math.max(24, Math.floor(w / (compact ? 5 : 7)));
      const vis = downsample(samples, bars);
      const gap = compact ? 1.2 : 1.6;
      const barW = Math.max(1.5, (w - gap * (bars - 1)) / bars);

      vis.forEach((v, i) => {
        const amp = Math.max(2, v * (h * (live ? 0.46 : 0.4)));
        const x = i * (barW + gap);
        const y = mid - amp;
        const radius = Math.min(barW / 2, 2);
        ctx.fillStyle = live ? withAlpha(liveC, 0.18 + v * 0.55) : withAlpha(fg, 0.18 + v * 0.4);
        roundRect(ctx, x, y, barW, amp * 2, radius);
        ctx.fill();
        if (live && v > 0.08) {
          ctx.fillStyle = withAlpha(liveC, 0.9);
          roundRect(ctx, x, mid - Math.max(2, amp * 0.18), barW, Math.max(3, amp * 0.36), radius);
          ctx.fill();
        }
      });

      if (live) {
        ctx.fillStyle = liveC;
        ctx.beginPath();
        ctx.arc(w - 7, 8, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!compact && vis.length > 8) {
        ctx.fillStyle = muted;
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        const secs = Math.floor(samples.length / 18);
        ctx.fillText(`${Math.max(0, secs)}s`, 6, h - 4);
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [samples, live, compact]);

  return <canvas ref={ref} className="talkai-waveform block h-full w-full" />;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function Overview({ samples }: { samples: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const fg = cssColor(parent, "--color-foreground", "#f0f0f0");
    const liveC = cssColor(parent, "--color-primary", "#f54e00");
    const vis = downsample(samples, Math.max(48, Math.floor(w / 3)));
    const barW = Math.max(1, w / vis.length);
    vis.forEach((v, i) => {
      const bh = Math.max(1, v * (h - 2));
      ctx.fillStyle = withAlpha(fg, 0.45);
      ctx.fillRect(i * barW, h - bh, Math.max(barW - 0.5, 0.6), bh);
    });
    ctx.fillStyle = liveC;
    ctx.fillRect(Math.min(w - 2, vis.length * barW), 0, 2, h);
  }, [samples]);
  return <canvas ref={ref} className="talkai-waveform-overview block h-full w-full" />;
}
