import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Images, ImageUp, Loader2, MessagesSquare, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ImageTile } from "@/components/ImageTile";
import {
  addImage,
  createChat,
  dataUrlToBlob,
  deleteChat,
  deleteImage,
  listChats,
  listImages,
  newId,
  touchChat,
  type Chat,
  type StoredImage,
} from "@/lib/gallery-db";
import { editImage, generateImage } from "@/lib/streamImage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GPT2 Images — Create images from text or a photo" },
      {
        name: "description",
        content:
          "Your private image studio: generate multiple images from a prompt or a reference photo, and keep each run in its own clean chat.",
      },
      { property: "og:title", content: "GPT2 Images — Create images from text or a photo" },
      {
        property: "og:description",
        content: "Generate multiple images per prompt, remix references, download or copy instantly.",
      },
    ],
  }),
  component: Studio,
});

const SIZES = [
  { label: "1:1", value: "1024x1024" },
  { label: "3:4", value: "1024x1536" },
  { label: "4:3", value: "1536x1024" },
];
const QUALITIES = [
  { label: "Fast", value: "low" },
  { label: "Balanced", value: "medium" },
  { label: "Max", value: "high" },
];
const CROWDED_AT = 24;

type Pending = { id: string; src: string | null; isFinal: boolean; error?: string };
type Reference = { id: string; blob: Blob; url: string };

function Studio() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [images, setImages] = useState<StoredImage[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(2);
  const [size, setSize] = useState(SIZES[0]!.value);
  const [quality, setQuality] = useState("low");
  const [refs, setRefs] = useState<Reference[]>([]);
  const [busy, setBusy] = useState(false);
  const [showChats, setShowChats] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const feedEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      let all = await listChats();
      if (all.length === 0) {
        await createChat("Session 1");
        all = await listChats();
      }
      setChats(all);
      const saved = localStorage.getItem("gpt2-active-chat");
      const next = all.find((chat) => chat.id === saved) ?? all[0]!;
      setActiveId(next.id);
    })().catch(() => toast.error("Could not open local storage"));
  }, []);

  useEffect(() => {
    if (!activeId) return;
    localStorage.setItem("gpt2-active-chat", activeId);
    listImages(activeId).then(setImages).catch(() => setImages([]));
  }, [activeId]);

  useEffect(() => {
    feedEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [images.length, pending.length]);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeId) ?? null,
    [chats, activeId],
  );

  const refreshChats = useCallback(async () => setChats(await listChats()), []);

  const startNewChat = useCallback(async () => {
    const chat = await createChat(`Session ${chats.length + 1}`);
    await refreshChats();
    setActiveId(chat.id);
    setPending([]);
    setShowChats(false);
    toast.success("Clean image chat started");
  }, [chats.length, refreshChats]);

  const onPickFiles = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files)
      .slice(0, 4 - refs.length)
      .map((file) => ({ id: newId(), blob: file, url: URL.createObjectURL(file) }));
    setRefs((current) => [...current, ...next]);
  };

  const addReferenceFromImage = (image: StoredImage) => {
    setRefs((current) =>
      current.length >= 4
        ? current
        : [...current, { id: newId(), blob: image.blob, url: URL.createObjectURL(image.blob) }],
    );
    setPrompt((current) => current || "Reimagine this image ");
    toast.success("Added as reference");
  };

  const removeImage = async (id: string) => {
    await deleteImage(id);
    setImages((current) => current.filter((image) => image.id !== id));
  };

  const run = async () => {
    const text = prompt.trim();
    if (!text || !activeId) {
      toast.error("Describe the image you want first");
      return;
    }
    const chatId = activeId;
    const slots: Pending[] = Array.from({ length: count }, () => ({
      id: newId(),
      src: null,
      isFinal: false,
    }));
    setPending(slots);
    setBusy(true);

    const references = refs.map((reference) => reference.blob);

    await Promise.all(
      slots.map(async (slot) => {
        const onFrame = (dataUrl: string, isFinal: boolean) =>
          setPending((current) =>
            current.map((item) => (item.id === slot.id ? { ...item, src: dataUrl, isFinal } : item)),
          );
        try {
          if (references.length > 0) {
            await editImage(references, text, { size, quality }, onFrame);
          } else {
            await generateImage(text, { size, quality }, onFrame);
          }
          const finalSrc = await new Promise<string | null>((resolve) =>
            setPending((current) => {
              resolve(current.find((item) => item.id === slot.id)?.src ?? null);
              return current;
            }),
          );
          if (!finalSrc) throw new Error("No image returned");
          const stored: StoredImage = {
            id: newId(),
            chatId,
            prompt: text,
            size,
            blob: await dataUrlToBlob(finalSrc),
            fromReference: references.length > 0,
            createdAt: Date.now(),
          };
          await addImage(stored);
          setImages((current) => (chatId === activeId ? [...current, stored] : current));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Generation failed";
          toast.error(message.slice(0, 180));
          setPending((current) =>
            current.map((item) => (item.id === slot.id ? { ...item, error: message } : item)),
          );
        } finally {
          setPending((current) => current.filter((item) => item.id !== slot.id || item.error));
        }
      }),
    );

    await touchChat(chatId, text.slice(0, 32));
    await refreshChats();
    setBusy(false);
  };

  const crowded = images.length >= CROWDED_AT;

  return (
    <main className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 px-4 pb-3 pt-safe backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold text-signal">GPT2 Images</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {activeChat?.title ?? "Loading"} · {images.length} images
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/library"
              className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-foreground"
              aria-label="Image storage"
            >
              <Images className="size-5" />
            </Link>
            <button
              onClick={() => setShowChats(true)}
              className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-foreground"
              aria-label="Image chats"
            >
              <MessagesSquare className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <section className="flex-1 space-y-4 px-4 py-4">
        {crowded ? (
          <div className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-card p-3">
            <Sparkles className="size-5 shrink-0 text-primary" />
            <p className="flex-1 text-xs text-muted-foreground">
              This chat is getting crowded ({images.length} images). Start a clean one?
            </p>
            <button
              onClick={startNewChat}
              className="rounded-xl bg-signal px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              New
            </button>
          </div>
        ) : null}

        {images.length === 0 && pending.length === 0 ? (
          <div className="surface-panel mt-6 rounded-3xl p-6 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-signal">
              <Sparkles className="size-6 text-primary-foreground" />
            </div>
            <h2 className="mt-4 font-display text-xl font-bold">Make something</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Type a prompt, or attach a photo to generate variations from it. Everything you make is
              stored on this device and stays downloadable.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          {images.map((image) => (
            <ImageTile
              key={image.id}
              image={image}
              onDelete={removeImage}
              onReuse={addReferenceFromImage}
            />
          ))}
          {pending.map((slot) => (
            <div
              key={slot.id}
              className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-border bg-card"
            >
              {slot.src ? (
                <img
                  src={slot.src}
                  alt="Generating"
                  className={
                    slot.isFinal
                      ? "size-full object-cover blur-0 transition-[filter] duration-500"
                      : "size-full object-cover blur-xl transition-[filter] duration-500"
                  }
                />
              ) : (
                <Loader2 className="size-6 animate-spin text-primary" />
              )}
            </div>
          ))}
        </div>
        <div ref={feedEnd} />
      </section>

      <footer className="sticky bottom-0 z-20 border-t border-border bg-background/90 px-4 pb-safe pt-3 backdrop-blur-xl">
        {refs.length > 0 ? (
          <div className="mb-2 flex gap-2 overflow-x-auto">
            {refs.map((reference) => (
              <div key={reference.id} className="relative shrink-0">
                <img
                  src={reference.url}
                  alt="Reference"
                  className="size-16 rounded-xl border border-border object-cover"
                />
                <button
                  onClick={() => setRefs((current) => current.filter((r) => r.id !== reference.id))}
                  className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full border border-border bg-card"
                  aria-label="Remove reference"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="surface-panel flex items-end gap-2 rounded-2xl p-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"
            aria-label="Attach reference image"
          >
            <ImageUp className="size-5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              onPickFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={2}
            placeholder={refs.length ? "How should the photo change?" : "Describe your image…"}
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent py-2 text-base text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={run}
            disabled={busy}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-signal text-primary-foreground disabled:opacity-50"
            aria-label="Generate"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
          </button>
        </div>

        <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1 text-[11px]">
          <Pills
            options={[1, 2, 3, 4].map((n) => ({ label: `${n}×`, value: String(n) }))}
            value={String(count)}
            onChange={(value) => setCount(Number(value))}
          />
          <Pills options={SIZES} value={size} onChange={setSize} />
          <Pills options={QUALITIES} value={quality} onChange={setQuality} />
        </div>
      </footer>

      {showChats ? (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-background/70 backdrop-blur-sm">
          <button className="flex-1" onClick={() => setShowChats(false)} aria-label="Close" />
          <div className="surface-panel max-h-[70vh] overflow-y-auto rounded-t-3xl p-4 pb-safe">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold">Image chats</h2>
              <button
                onClick={startNewChat}
                className="flex items-center gap-1 rounded-xl bg-signal px-3 py-2 text-xs font-semibold text-primary-foreground"
              >
                <Plus className="size-4" /> New chat
              </button>
            </div>
            <ul className="mt-3 space-y-2">
              {chats.map((chat) => (
                <li
                  key={chat.id}
                  className={`flex items-center gap-2 rounded-2xl border p-3 ${
                    chat.id === activeId ? "border-primary/50 bg-secondary" : "border-border bg-card"
                  }`}
                >
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setActiveId(chat.id);
                      setPending([]);
                      setShowChats(false);
                    }}
                  >
                    <p className="truncate text-sm font-medium">{chat.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(chat.updatedAt).toLocaleString()}
                    </p>
                  </button>
                  <button
                    aria-label="Delete chat"
                    className="flex size-9 items-center justify-center rounded-xl text-muted-foreground"
                    onClick={async () => {
                      await deleteChat(chat.id);
                      const all = await listChats();
                      setChats(all);
                      if (chat.id === activeId) {
                        const next = all[0] ?? (await createChat("Session 1"));
                        setChats(await listChats());
                        setActiveId(next.id);
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Pills({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1 rounded-xl border border-border bg-card p-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-8 rounded-lg px-2.5 font-medium ${
            option.value === value
              ? "bg-signal text-primary-foreground"
              : "text-muted-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}