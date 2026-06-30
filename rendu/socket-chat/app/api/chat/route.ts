import { NextRequest } from "next/server";
import { getInferenceConfig, streamChatCompletion, ChatMessage } from "@/lib/inference";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requete invalide (JSON attendu)." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "Le champ 'messages' est requis." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const config = getInferenceConfig();

  try {
    const stream = await streamChatCompletion(messages, config);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue cote serveur d'inference.";
    return new Response(
      JSON.stringify({
        error: `Impossible de joindre le serveur d'inference (${config.type} @ ${config.baseUrl}).`,
        detail: message,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
