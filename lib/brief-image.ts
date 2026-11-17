import { briefSections, type BarberBrief } from "./brief";

const IVORY = "#f4efe6";
const ONYX = "#0b0b0c";
const MUTED = "#6b665f";
const CRIMSON = "#dc143c";

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws the Barber Brief as a shareable PNG: 1080x1350 (feed) or 1080x1920 (story). */
export async function briefToPng(brief: BarberBrief, opts: { story?: boolean; photo?: Blob | null }): Promise<Blob> {
  const W = 1080;
  const H = opts.story ? 1920 : 1350;
  const root = getComputedStyle(document.documentElement);
  const serif = `${root.getPropertyValue("--font-instrument-serif") || "Georgia"}, serif`;
  const sans = `${root.getPropertyValue("--font-inter") || "system-ui"}, sans-serif`;
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = ONYX;
  ctx.fillRect(0, 0, W, H);

  const pad = 56;
  const cardY = opts.story ? 220 : pad;
  const cardH = opts.story ? H - 440 : H - pad * 2;
  ctx.fillStyle = IVORY;
  ctx.beginPath();
  ctx.roundRect(pad, cardY, W - pad * 2, cardH, 28);
  ctx.fill();

  const x = pad + 56;
  const width = W - (pad + 56) * 2;
  let y = cardY + 92;
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = CRIMSON;
  ctx.font = `600 22px ${sans}`;
  ctx.fillText("BARBER BRIEF", x, y);
  y += 84;

  let textWidth = width;
  if (opts.photo) {
    const bitmap = await createImageBitmap(opts.photo);
    const size = 220;
    const side = Math.min(bitmap.width, bitmap.height);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x + width - size, cardY + 56, size, size, 20);
    ctx.clip();
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, x + width - size, cardY + 56, size, size);
    ctx.restore();
    bitmap.close();
    textWidth = width - size - 32;
  }

  ctx.fillStyle = ONYX;
  ctx.font = `76px ${serif}`;
  for (const l of wrap(ctx, brief.styleName, textWidth).slice(0, 2)) {
    ctx.fillText(l, x, y);
    y += 80;
  }
  y = Math.max(y, cardY + (opts.photo ? 320 : 0)) + 8;

  const rows: [string, string][] = briefSections.map((s) => [s.label, brief[s.key]] as [string, string]).filter(([, v]) => v);
  if (brief.askYourBarber.length) rows.push(["Ask your barber", brief.askYourBarber.map((q) => `• ${q}`).join("  ")]);
  const bottom = cardY + cardH - 96;
  for (const [label, value] of rows) {
    if (y > bottom - 80) break;
    ctx.strokeStyle = "#d8d2c6";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();
    y += 44;
    ctx.fillStyle = MUTED;
    ctx.font = `600 20px ${sans}`;
    ctx.fillText(label.toUpperCase(), x, y);
    ctx.fillStyle = ONYX;
    ctx.font = `28px ${sans}`;
    const lines = wrap(ctx, value, width - 260);
    lines.forEach((l, i) => {
      if (y + i * 38 < bottom) ctx.fillText(l, x + 260, y + i * 38);
    });
    y += Math.max(1, lines.length) * 38 + 14;
  }

  ctx.fillStyle = MUTED;
  ctx.font = `30px ${serif}`;
  ctx.fillText("made with Hairpin", x, cardY + cardH - 48);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/png"));
}

/** Shares through the system share sheet where available, otherwise downloads. */
export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
