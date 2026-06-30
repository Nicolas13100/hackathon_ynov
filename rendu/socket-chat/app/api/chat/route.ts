import { NextRequest } from "next/server";
import { getInferenceConfig, streamChatCompletion, ChatMessage } from "@/lib/inference";

export const runtime = "nodejs";

// Définition des comportements de l'IA selon la version choisie
const SYSTEM_PROMPTS = {
  finance: "Tu es Phi-3.5-Financial, un expert financier de haut niveau. Tes réponses doivent être précises, analytiques et basées sur des concepts économiques concrets. Utilise un vocabulaire professionnel lié aux marchés, à l'investissement et à l'analyse financière.",
  medical: "Tu es Phi-3.5-Medical, un assistant médical virtuel. Tes réponses doivent être claires, empathiques et basées sur la science médicale (anatomie, biologie, prévention). Précise toujours que tu es une IA et recommande de consulter un professionnel de santé pour tout diagnostic."
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

  // 1. Détermination du persona (on sécurise avec un fallback sur "finance")
  const persona = body.persona === "medical" ? "medical" : "finance";

  // 2. Création du message système
  const systemMessage: ChatMessage = {
    role: "system",
    content: SYSTEM_PROMPTS[persona],
  };

  // 3. Injection du prompt système au tout début de l'historique
  const messagesWithSystem = [systemMessage, ...messages];

  const config = getInferenceConfig();

  try {
    // 4. On passe le nouvel array avec le contexte système à la couche d'inférence
    const stream = await streamChatCompletion(messagesWithSystem, config);

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