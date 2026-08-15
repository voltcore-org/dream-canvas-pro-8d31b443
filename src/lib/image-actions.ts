export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function copyBlob(blob: Blob) {
  if (!("clipboard" in navigator) || !("write" in navigator.clipboard)) {
    throw new Error("Clipboard images are not supported here — use Save instead");
  }
  const png = blob.type === "image/png" ? blob : new Blob([await blob.arrayBuffer()], { type: "image/png" });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

export function safeFileName(prompt: string) {
  const slug =
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "image";
  return `${slug}-${Date.now().toString(36)}.png`;
}