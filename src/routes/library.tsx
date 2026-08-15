import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Images } from "lucide-react";
import { toast } from "sonner";

import { ImageTile } from "@/components/ImageTile";
import { deleteImage, listAllImages, type StoredImage } from "@/lib/gallery-db";
import { downloadBlob, safeFileName } from "@/lib/image-actions";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Image Storage — GPT2 Images" },
      {
        name: "description",
        content:
          "Every image you generated, stored privately on your device and ready to download or copy.",
      },
      { property: "og:title", content: "Image Storage — GPT2 Images" },
      {
        property: "og:description",
        content: "Browse, download and copy your full image history.",
      },
    ],
  }),
  component: Library,
});

function Library() {
  const [images, setImages] = useState<StoredImage[]>([]);

  useEffect(() => {
    listAllImages().then(setImages).catch(() => setImages([]));
  }, []);

  const remove = async (id: string) => {
    await deleteImage(id);
    setImages((current) => current.filter((image) => image.id !== id));
  };

  const saveAll = () => {
    images.forEach((image, index) =>
      setTimeout(() => downloadBlob(image.blob, safeFileName(image.prompt)), index * 350),
    );
    toast.success(`Saving ${images.length} images`);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-background">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/85 px-4 pb-3 pt-safe backdrop-blur-xl">
        <Link
          to="/"
          className="flex size-10 items-center justify-center rounded-xl border border-border bg-card"
          aria-label="Back to studio"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-bold">Image storage</h1>
          <p className="text-[11px] text-muted-foreground">{images.length} images on this device</p>
        </div>
        {images.length > 0 ? (
          <button
            onClick={saveAll}
            className="flex size-10 items-center justify-center rounded-xl bg-signal text-primary-foreground"
            aria-label="Download all"
          >
            <Download className="size-5" />
          </button>
        ) : null}
      </header>

      <section className="flex-1 px-4 py-4">
        {images.length === 0 ? (
          <div className="surface-panel mt-8 rounded-3xl p-8 text-center">
            <Images className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing stored yet. Generate an image and it lands here automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {images.map((image) => (
              <ImageTile key={image.id} image={image} onDelete={remove} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}