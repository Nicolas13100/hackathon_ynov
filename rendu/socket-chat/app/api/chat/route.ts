import { NextRequest } from "next/server";
import { getInferenceConfig, streamChatCompletion, ChatMessage } from "@/lib/inference";
import { appendMessages } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { messages?: ChatMessage[]; conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requete invalide (JSON attendu)." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const messages = body.messages;
  const conversationId = body.conversationId;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "Le champ 'messages' est requis." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const config = getInferenceConfig();

  // On sauvegarde le dernier message utilisateur tout de suite (avant meme
  // d'avoir la reponse), comme ca rien n'est perdu meme si le stream coupe.
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (conversationId && lastUserMessage) {
    await appendMessages(conversationId, [lastUserMessage]).catch(() => null);
  }

  try {
    const upstream = await streamChatCompletion(messages, config);

    // On intercepte le flux pour accumuler la reponse complete et la
    // sauvegarder une fois le streaming termine, tout en relayant chaque
    // chunk au navigateur sans latence supplementaire.
    let fullResponse = "";
    const decoder = new TextDecoder();

    const tappedStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullResponse += decoder.decode(value, { stream: true });
          controller.enqueue(value);
        }
        controller.close();

        if (conversationId && fullResponse.trim()) {
          await appendMessages(conversationId, [
            { role: "assistant", content: fullResponse },
          ]).catch(() => null);
        }
      },
    });

    return new Response(tappedStream, {
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
