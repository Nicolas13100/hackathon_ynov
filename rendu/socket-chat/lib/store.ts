// lib/store.ts
//
// Persistance des conversations sous forme de fichiers JSON, un fichier
// par conversation, dans un dossier qu'on monte en volume Docker
// (DATA_DIR, par defaut /data). Pas besoin d'une vraie base de donnees
// pour ce cas d'usage : c'est simple, lisible, et suffisant pour un
// usage mono-instance.

import { promises as fs } from "fs";
import path from "path";
import type { ChatMessage } from "./inference";

export interface StoredMessage extends ChatMessage {
  id: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = process.env.DATA_DIR || "/data";
const CONVERSATIONS_DIR = path.join(DATA_DIR, "conversations");

async function ensureDir() {
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
}

function filePath(id: string): string {
  // securise contre les path traversal (id ne doit etre que alphanumerique)
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(CONVERSATIONS_DIR, `${safeId}.json`);
}

export function newId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  await ensureDir();
  const files = await fs.readdir(CONVERSATIONS_DIR);
  const summaries: ConversationSummary[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(CONVERSATIONS_DIR, file), "utf-8");
      const conv: Conversation = JSON.parse(raw);
      summaries.push({
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      });
    } catch {
      // fichier corrompu ou illisible, on l'ignore
    }
  }

  return summaries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getConversation(id: string): Promise<Conversation | null> {
  await ensureDir();
  try {
    const raw = await fs.readFile(filePath(id), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function createConversation(title: string): Promise<Conversation> {
  await ensureDir();
  const now = new Date().toISOString();
  const conv: Conversation = {
    id: newId(),
    title: title.slice(0, 80) || "Nouvelle conversation",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  await fs.writeFile(filePath(conv.id), JSON.stringify(conv, null, 2), "utf-8");
  return conv;
}

export async function saveConversation(conv: Conversation): Promise<void> {
  await ensureDir();
  conv.updatedAt = new Date().toISOString();
  await fs.writeFile(filePath(conv.id), JSON.stringify(conv, null, 2), "utf-8");
}

export async function appendMessages(
  id: string,
  newMessages: Omit<StoredMessage, "id" | "createdAt">[]
): Promise<Conversation | null> {
  const conv = await getConversation(id);
  if (!conv) return null;

  const now = new Date().toISOString();
  for (const m of newMessages) {
    conv.messages.push({
      ...m,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
    });
  }

  // Si c'est le tout premier message utilisateur, on s'en sert pour titrer
  // automatiquement la conversation (comme ChatGPT).
  if (conv.title === "Nouvelle conversation") {
    const firstUser = conv.messages.find((m) => m.role === "user");
    if (firstUser) {
      conv.title = firstUser.content.slice(0, 60) || conv.title;
    }
  }

  await saveConversation(conv);
  return conv;
}

export async function deleteConversation(id: string): Promise<boolean> {
  await ensureDir();
  try {
    await fs.unlink(filePath(id));
    return true;
  } catch {
    return false;
  }
}

export async function renameConversation(id: string, title: string): Promise<Conversation | null> {
  const conv = await getConversation(id);
  if (!conv) return null;
  conv.title = title.slice(0, 80) || conv.title;
  await saveConversation(conv);
  return conv;
}
