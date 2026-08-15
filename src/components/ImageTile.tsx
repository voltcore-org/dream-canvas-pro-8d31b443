import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Shuffle, Sparkle, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { copyBlob, downloadBlob, safeFileName } from "@/lib/image-actions";
import type { StoredImage } from "@/lib/gallery-db";

export function ImageTile({
  image,
  onDelete,
  onReuse,
  onRefine,
  refining,
}: {
  image: StoredImage;
  onDelete?: (id: string) => void;
  onReuse?: (image: StoredImage) => void;
  onRefine?: (image: StoredImage, mode: "upscale" | "variations") => void;
  refining?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const url = useMemo(() => URL.createObjectURL(image.blob), [image.blob]);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const save = () => {
    downloadBlob(image.blob, safeFileName(image.prompt));
    toast.success("Image saved");
  };

  const copy = async () => {
    try {
      await copyBlob(image.blob);
      toast.success("Copied to clipboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Copy failed");
    }
  };

  return (
    <>
      <figure className="group relative overflow-hidden rounded-2xl border border-border bg-card">
        <button type="button" onClick={() => setOpen(true)} className="block w-full">
          <img
            src={url}
            alt={image.prompt}
            loading="lazy"
            className="aspect-square w-full object-cover"
          />
        </button>
        <div className="flex items-center gap-1 border-t border-border bg-card/80 p-1.5 backdrop-blur">
          <TileAction label="Save" icon={<Download className="size-4" />} onClick={save} />
          <TileAction label="Copy" icon={<Copy className="size-4" />} onClick={copy} />
          {onReuse ? (
            <TileAction
              label="Remix"
              icon={<Wand2 className="size-4" />}
              onClick={() => onReuse(image)}
            />
          ) : null}
          {onDelete ? (
            <TileAction
              label=""
              icon={<Trash2 className="size-4" />}
              onClick={() => onDelete(image.id)}
            />
          ) : null}
        </div>
        {onRefine ? (
          <div className="flex items-center gap-1 border-t border-border bg-card/60 p-1.5">
            <TileAction
              label="Upscale"
              icon={<Sparkle className="size-4" />}
              disabled={refining}
              onClick={() => onRefine(image, "upscale")}
            />
            <TileAction
              label="Variations"
              icon={<Shuffle className="size-4" />}
              disabled={refining}
              onClick={() => onRefine(image, "variations")}
            />
          </div>
        ) : null}
      </figure>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4 pt-safe backdrop-blur-xl"
          onClick={() => setOpen(false)}
        >
          <div className="flex flex-1 items-center justify-center">
            <img src={url} alt={image.prompt} className="max-h-full w-full rounded-2xl object-contain" />
          </div>
          <p className="mt-3 line-clamp-3 text-xs text-muted-foreground">{image.prompt}</p>
          {onRefine ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                disabled={refining}
                onClick={(event) => {
                  event.stopPropagation();
                  onRefine(image, "upscale");
                  setOpen(false);
                }}
                className="rounded-xl border border-border bg-card py-3 text-sm font-semibold text-foreground disabled:opacity-50"
              >
                Upscale
              </button>
              <button
                disabled={refining}
                onClick={(event) => {
                  event.stopPropagation();
                  onRefine(image, "variations");
                  setOpen(false);
                }}
                className="rounded-xl border border-border bg-card py-3 text-sm font-semibold text-foreground disabled:opacity-50"
              >
                Variations
              </button>
            </div>
          ) : null}
          <div className="mt-2 grid grid-cols-2 gap-2 pb-safe">
            <button
              onClick={(event) => {
                event.stopPropagation();
                save();
              }}
              className="rounded-xl bg-signal py-3 text-sm font-semibold text-primary-foreground"
            >
              Download
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                void copy();
              }}
              className="rounded-xl border border-border bg-card py-3 text-sm font-semibold text-foreground"
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function TileAction({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-9 flex-1 items-center justify-center gap-1 rounded-xl text-[11px] font-medium text-muted-foreground transition-colors active:bg-secondary active:text-foreground disabled:opacity-40"
    >
      {icon}
      {label ? <span>{label}</span> : null}
    </button>
  );
}