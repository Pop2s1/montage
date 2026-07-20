import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import type { SilenceRange } from "@/types/domain";

export interface ProbeResult {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  codec?: string;
}

export function runCommand(
  cmd: string,
  args: string[],
  opts?: { cwd?: string },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

export async function probeVideo(filePath: string): Promise<ProbeResult> {
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);

  const data = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      codec_name?: string;
    }>;
  };

  const video = data.streams?.find((s) => s.codec_type === "video");
  const durationSec = parseFloat(data.format?.duration ?? "0") || 0;
  const fps = parseFps(video?.avg_frame_rate ?? "30/1");

  return {
    durationSec,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps,
    codec: video?.codec_name,
  };
}

function parseFps(rate: string): number {
  const [a, b] = rate.split("/").map(Number);
  if (!a) return 30;
  if (!b) return a;
  return a / b;
}

export async function generateThumbnail(
  videoPath: string,
  outputPath: string,
  atSec = 1,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await runCommand("ffmpeg", [
    "-y",
    "-ss",
    String(Math.max(0, atSec)),
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    outputPath,
  ]);
}

/**
 * Silence detection via ffmpeg silencedetect filter.
 */
export async function detectSilences(
  videoPath: string,
  noiseDb = -35,
  minDuration = 0.4,
): Promise<SilenceRange[]> {
  try {
    const { stderr } = await runCommand("ffmpeg", [
      "-i",
      videoPath,
      "-af",
      `silencedetect=noise=${noiseDb}dB:d=${minDuration}`,
      "-f",
      "null",
      "-",
    ]);
    return parseSilenceLog(stderr);
  } catch (err) {
    // ffmpeg writes silencedetect to stderr and may still "fail" on null mux; parse anyway
    const message = err instanceof Error ? err.message : String(err);
    return parseSilenceLog(message);
  }
}

export function parseSilenceLog(log: string): SilenceRange[] {
  const starts: number[] = [];
  const ranges: SilenceRange[] = [];
  const startRe = /silence_start:\s*([0-9.]+)/g;
  const endRe = /silence_end:\s*([0-9.]+)/g;

  let m: RegExpExecArray | null;
  while ((m = startRe.exec(log))) starts.push(parseFloat(m[1]!));

  const ends: number[] = [];
  while ((m = endRe.exec(log))) ends.push(parseFloat(m[1]!));

  const n = Math.min(starts.length, ends.length);
  for (let i = 0; i < n; i++) {
    const start = starts[i]!;
    const end = ends[i]!;
    if (end > start) ranges.push({ start, end });
  }
  return ranges;
}

/**
 * Scene cut detection via select/scene filter.
 */
export async function detectSceneCuts(videoPath: string, threshold = 0.35): Promise<number[]> {
  try {
    const { stderr } = await runCommand("ffmpeg", [
      "-i",
      videoPath,
      "-filter:v",
      `select='gt(scene,${threshold})',showinfo`,
      "-f",
      "null",
      "-",
    ]);
    return parseSceneLog(stderr);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return parseSceneLog(message);
  }
}

export function parseSceneLog(log: string): number[] {
  const pts: number[] = [];
  const re = /pts_time:([0-9.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(log))) {
    pts.push(parseFloat(m[1]!));
  }
  return [0, ...pts].filter((v, i, arr) => i === 0 || v - arr[i - 1]! > 0.2);
}

export interface CutSpec {
  inputPath: string;
  startSec: number;
  endSec: number;
}

/**
 * Assemble segments into a vertical (or custom) MP4 with optional burned subtitles.
 */
export async function exportTimeline(options: {
  cuts: CutSpec[];
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  subtitleAssPath?: string;
  onProgress?: (pct: number) => void;
}): Promise<void> {
  const { cuts, outputPath, width, height, fps, subtitleAssPath, onProgress } = options;
  if (cuts.length === 0) throw new Error("No cuts to export");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const workDir = path.join(path.dirname(outputPath), `work-${Date.now()}`);
  await fs.mkdir(workDir, { recursive: true });

  try {
    const parts: string[] = [];
    for (let i = 0; i < cuts.length; i++) {
      const cut = cuts[i]!;
      const part = path.join(workDir, `part-${i.toString().padStart(3, "0")}.mp4`);
      const dur = Math.max(0.1, cut.endSec - cut.startSec);
      await runCommand("ffmpeg", [
        "-y",
        "-ss",
        String(cut.startSec),
        "-i",
        cut.inputPath,
        "-t",
        String(dur),
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps}`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        part,
      ]);
      parts.push(part);
      onProgress?.(Math.round(((i + 1) / (cuts.length + 1)) * 80));
    }

    const listFile = path.join(workDir, "list.txt");
    await fs.writeFile(
      listFile,
      parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
    );

    const concatPath = path.join(workDir, "concat.mp4");
    await runCommand("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-c",
      "copy",
      concatPath,
    ]);

    if (subtitleAssPath) {
      // Escape path for ffmpeg subtitles filter (Windows/Unix)
      const escaped = subtitleAssPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
      await runCommand("ffmpeg", [
        "-y",
        "-i",
        concatPath,
        "-vf",
        `ass='${escaped}'`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        outputPath,
      ]);
    } else {
      await fs.copyFile(concatPath, outputPath);
    }
    onProgress?.(100);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function buildAssSubtitles(
  cues: Array<{ startSec: number; endSec: number; text: string }>,
  style: string,
  playResX: number,
  playResY: number,
): string {
  const fontSize = Math.round(playResY * 0.045);
  const primary =
    style === "neon_pop" ? "&H0000FFFF" : style === "minimal_white" ? "&H00FFFFFF" : "&H00FFFFFF";
  const outline = style === "caption_box" ? 0 : 3;
  const borderStyle = style === "caption_box" ? 3 : 1;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial Black,${fontSize},${primary},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,${borderStyle},${outline},1,2,80,80,${Math.round(playResY * 0.12)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = cues
    .map((c) => {
      const text = c.text.replace(/\n/g, "\\N").replace(/,/g, "");
      return `Dialogue: 0,${toAssTime(c.startSec)},${toAssTime(c.endSec)},Default,,0,0,0,,${text}`;
    })
    .join("\n");

  return header + events + "\n";
}

function toAssTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs
    .toString()
    .padStart(2, "0")}`;
}
