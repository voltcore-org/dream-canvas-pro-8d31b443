import { openDB, type IDBPDatabase } from "idb";

export type Chat = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type StoredImage = {
  id: string;
  chatId: string;
  prompt: string;
  size: string;
  blob: Blob;
  fromReference: boolean;
  createdAt: number;
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB("gpt2-images", 1, {
      upgrade(database) {
        const chats = database.createObjectStore("chats", { keyPath: "id" });
        chats.createIndex("updatedAt", "updatedAt");
        const images = database.createObjectStore("images", { keyPath: "id" });
        images.createIndex("chatId", "chatId");
        images.createIndex("createdAt", "createdAt");
      },
    });
  }
  return dbPromise;
}

export const newId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export async function listChats(): Promise<Chat[]> {
  const all = (await (await db()).getAll("chats")) as Chat[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createChat(title = "New session"): Promise<Chat> {
  const chat: Chat = { id: newId(), title, createdAt: Date.now(), updatedAt: Date.now() };
  await (await db()).put("chats", chat);
  return chat;
}

export async function touchChat(id: string, title?: string) {
  const database = await db();
  const chat = (await database.get("chats", id)) as Chat | undefined;
  if (!chat) return;
  await database.put("chats", {
    ...chat,
    updatedAt: Date.now(),
    title: title && chat.title === "New session" ? title : chat.title,
  });
}

export async function renameChat(id: string, title: string) {
  const database = await db();
  const chat = (await database.get("chats", id)) as Chat | undefined;
  if (!chat) return;
  await database.put("chats", { ...chat, title, updatedAt: Date.now() });
}

export async function deleteChat(id: string) {
  const database = await db();
  const images = (await database.getAllFromIndex("images", "chatId", id)) as StoredImage[];
  await Promise.all(images.map((image) => database.delete("images", image.id)));
  await database.delete("chats", id);
}

export async function addImage(image: StoredImage) {
  await (await db()).put("images", image);
}

export async function deleteImage(id: string) {
  await (await db()).delete("images", id);
}

export async function listImages(chatId: string): Promise<StoredImage[]> {
  const images = (await (await db()).getAllFromIndex("images", "chatId", chatId)) as StoredImage[];
  return images.sort((a, b) => a.createdAt - b.createdAt);
}

export async function listAllImages(): Promise<StoredImage[]> {
  const images = (await (await db()).getAll("images")) as StoredImage[];
  return images.sort((a, b) => b.createdAt - a.createdAt);
}

export async function countImages(chatId: string): Promise<number> {
  return (await db()).countFromIndex("images", "chatId", chatId);
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}