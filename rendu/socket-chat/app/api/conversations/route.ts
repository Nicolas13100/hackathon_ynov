import { NextRequest } from "next/server";
import { listConversations, createConversation } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const conversations = await listConversations();
  return Response.json({ conversations });
}

export async function POST(req: NextRequest) {
  let body: { title?: string } = {};
  try {
    body = await req.json();
  } catch {
    // corps vide accepte, titre par defaut
  }
  const conv = await createConversation(body.title || "Nouvelle conversation");
  return Response.json({ conversation: conv });
}
