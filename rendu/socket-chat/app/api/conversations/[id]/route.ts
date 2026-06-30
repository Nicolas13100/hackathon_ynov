import { NextRequest } from "next/server";
import { getConversation, deleteConversation, renameConversation } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conv = await getConversation(id);
  if (!conv) {
    return Response.json({ error: "Conversation introuvable." }, { status: 404 });
  }
  return Response.json({ conversation: conv });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body.title) {
    return Response.json({ error: "Le champ 'title' est requis." }, { status: 400 });
  }
  const conv = await renameConversation(id, body.title);
  if (!conv) {
    return Response.json({ error: "Conversation introuvable." }, { status: 404 });
  }
  return Response.json({ conversation: conv });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await deleteConversation(id);
  if (!ok) {
    return Response.json({ error: "Conversation introuvable." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
