import { NextRequest } from "next/server";
import { getInferenceConfig, streamChatCompletion, ChatMessage } from "@/lib/inference";

export const runtime = "nodejs";

const OLLAMA_MODELS: Record<string, string> = {
  finance: "techcorp-financial-audited", // Remplace par le nom exact de ton modèle finance
  medical: "techcorp-medical",   // Remplace par le nom exact de ton modèle médical
};

export async function POST(req: NextRequest) {
  let body: { messages?: ChatMessage[]; persona?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requête invalide (JSON attendu)." }), {
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

  // 1. Récupérer le choix (fallback sur "finance" par sécurité)
  const persona = body.persona === "medical" ? "medical" : "finance";

  // 2. Récupérer le nom du modèle Ollama correspondant
  const targetModel = OLLAMA_MODELS[persona];

  // 3. Récupérer la configuration de base
  const baseConfig = getInferenceConfig();

  // 4. Surcharger UNIQUEMENT le modèle dans la configuration
  const config = {
    ...baseConfig,
    model: targetModel
  };

  try {
    // 5. On passe les messages TELS QUELS (sans prompt système ajouté)
    // et la nouvelle configuration ciblée
    const stream = await streamChatCompletion(messages, config);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue côté serveur d'inférence.";
    return new Response(
        JSON.stringify({
          error: `Impossible de joindre le serveur d'inférence (${config.type} @ ${config.baseUrl}).`,
          detail: message,
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}