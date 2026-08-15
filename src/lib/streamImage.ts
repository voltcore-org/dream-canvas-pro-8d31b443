import { createParser } from "eventsource-parser";
import { flushSync } from "react-dom";

type Frame = (dataUrl: string, isFinal: boolean) => void;

async function readStream(res: Response, onFrame: Frame) {
  let sawCompleted = false;
  let sawAnyEvent = false;
  let streamError: string | undefined;

  const parser = createParser({
    onEvent(event) {
      let payload: any;
      try {
        payload = JSON.parse(event.data);
      } catch {
        /* ignore */
      }
      if (event.event === "error" || payload?.type === "error") {
        sawAnyEvent = true;
        streamError = payload?.error?.message ?? "Image generation failed";
        return;
      }
      if (
        event.event !== "image_generation.partial_image" &&
        event.event !== "image_generation.completed" &&
        event.event !== "image_edit.partial_image" &&
        event.event !== "image_edit.completed"
      )
        return;
      if (!payload?.b64_json) return;
      sawAnyEvent = true;
      const isFinal =
        event.event === "image_generation.completed" || event.event === "image_edit.completed";
      flushSync(() => {
        onFrame(`data:image/png;base64,${payload.b64_json}`, isFinal);
      });
      if (isFinal) sawCompleted = true;
    },
  });

  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.feed(value);
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  if (streamError) throw new Error(streamError);
  return { sawAnyEvent, sawCompleted };
}

export async function generateImage(
  prompt: string,
  opts: { size?: string; quality?: string },
  onFrame: Frame,
): Promise<void> {
  const post = (stream: boolean) =>
    fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, ...opts, stream }),
    });

  const res = await post(true);
  if (!res.ok || !res.body) {
    throw new Error(await res.text().catch(() => `Request failed (${res.status})`));
  }
  const { sawAnyEvent, sawCompleted } = await readStream(res, onFrame);
  if (!sawAnyEvent) {
    const replay = await post(false);
    if (!replay.ok) throw new Error(await replay.text().catch(() => "Image generation failed"));
    const json = (await replay.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image generation returned no image");
    onFrame(`data:image/png;base64,${b64}`, true);
    return;
  }
  if (!sawCompleted) throw new Error("Image stream ended early");
}

export async function editImage(
  files: Blob[],
  prompt: string,
  opts: { size?: string; quality?: string },
  onFrame: Frame,
): Promise<void> {
  const build = (stream: boolean) => {
    const fd = new FormData();
    const first = files[0];
    if (files.length === 1 && first) {
      fd.append("image", first, "source.png");
    } else {
      files.forEach((f, i) => fd.append("image[]", f, `source-${i}.png`));
    }
    fd.append("prompt", prompt);
    if (opts.size) fd.append("size", opts.size);
    if (opts.quality) fd.append("quality", opts.quality);
    if (!stream) fd.append("stream", "false");
    return fd;
  };

  const res = await fetch("/api/edit-image", { method: "POST", body: build(true) });
  if (!res.ok || !res.body) {
    throw new Error(await res.text().catch(() => `Request failed (${res.status})`));
  }
  const { sawAnyEvent, sawCompleted } = await readStream(res, onFrame);
  if (!sawAnyEvent) {
    const replay = await fetch("/api/edit-image", { method: "POST", body: build(false) });
    if (!replay.ok) throw new Error(await replay.text().catch(() => "Image edit failed"));
    const json = (await replay.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image edit returned no image");
    onFrame(`data:image/png;base64,${b64}`, true);
    return;
  }
  if (!sawCompleted) throw new Error("Image stream ended early");
}