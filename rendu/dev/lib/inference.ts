// lib/inference.ts
//
// Couche d'abstraction entre le front et le serveur d'inference choisi
// par l'equipe INFRA. Le reste de l'appli (UI, route /api/chat) ne parle
// JAMAIS directement a Ollama / Triton / au serveur maison : tout passe
// par les fonctions ci-dessous.
//
// Quand l'INFRA confirme son choix definitif, il n'y a normalement RIEN
// a changer dans ce fichier : il suffit de poser les bonnes variables
// d'env (INFERENCE_TYPE, INFERENCE_URL, MODEL_NAME) dans .env.local.
// Si le serveur maison expose un format de payload different, c'est
// uniquement la branche "custom" ci-dessous qu'il faut adapter.

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface InferenceConfig {
  type: "ollama" | "triton" | "custom";
  baseUrl: string;
  model: string;
}

export function getInferenceConfig(): InferenceConfig {
  const type = (process.env.INFERENCE_TYPE || "ollama") as InferenceConfig["type"];
  const baseUrl = process.env.INFERENCE_URL || "http://ollama:11434";
  const model = process.env.MODEL_NAME || "phi3.5-financial";
  return { type, baseUrl, model };
}

/**
 * Lance une requete de chat en streaming vers le backend configure et
 * renvoie un ReadableStream de texte brut (tokens deja extraits), pret
 * a etre relaye tel quel au navigateur.
 */
export async function streamChatCompletion(
  messages: ChatMessage[],
  config: InferenceConfig
): Promise<ReadableStream<Uint8Array>> {
  switch (config.type) {
    case "ollama":
      return streamFromOllama(messages, config);
    case "triton":
      return streamFromTriton(messages, config);
    case "custom":
      return streamFromCustom(messages, config);
    default:
      throw new Error(`Type d'inference inconnu: ${config.type}`);
  }
}

// ---------------------------------------------------------------------
// OLLAMA  (http://localhost:11434/api/chat)
// Format : POST { model, messages, stream: true }
// Reponse : flux de lignes JSON, chacune { message: { content }, done }
// ---------------------------------------------------------------------
async function streamFromOllama(
  messages: ChatMessage[],
  config: InferenceConfig
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${config.baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama a repondu ${res.status}: ${await safeText(res)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          const token = json?.message?.content;
          if (token) controller.enqueue(encoder.encode(token));
        } catch {
          // ligne partielle ou non-JSON, on ignore
        }
      }
    },
  });
}

// ---------------------------------------------------------------------
// TRITON  (http://localhost:8000)
// A adapter selon le backend Triton utilise (TensorRT-LLM, vLLM backend,
// python backend custom...). Exemple generique pour un endpoint
// "generate_stream" type Triton + vLLM backend.
// ---------------------------------------------------------------------
async function streamFromTriton(
  messages: ChatMessage[],
  config: InferenceConfig
): Promise<ReadableStream<Uint8Array>> {
  const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n");

  const res = await fetch(`${config.baseUrl}/v2/models/${config.model}/generate_stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text_input: prompt,
      stream: true,
      parameters: { max_tokens: 1024 },
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Triton a repondu ${res.status}: ${await safeText(res)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const evt of events) {
        const dataLine = evt.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        try {
          const json = JSON.parse(dataLine.replace("data:", "").trim());
          const token = json?.text_output;
          if (token) controller.enqueue(encoder.encode(token));
        } catch {
          // ignore
        }
      }
    },
  });
}

// ---------------------------------------------------------------------
// SERVEUR MAISON
// Placeholder : a remplacer par le contrat reel une fois communique par
// l'equipe INFRA (URL + format de payload + format de stream).
// Par defaut on suppose un endpoint compatible OpenAI
// (POST /v1/chat/completions, stream SSE "data: {...}").
// ---------------------------------------------------------------------
async function streamFromCustom(
  messages: ChatMessage[],
  config: InferenceConfig
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Serveur maison a repondu ${res.status}: ${await safeText(res)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.replace("data:", "").trim();
        if (payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const token = json?.choices?.[0]?.delta?.content;
          if (token) controller.enqueue(encoder.encode(token));
        } catch {
          // ignore
        }
      }
    },
  });
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "(pas de details)";
  }
}

/** Petit ping pour verifier que le backend configure repond. */
export async function checkInferenceHealth(config: InferenceConfig): Promise<boolean> {
  try {
    if (config.type === "ollama") {
      const res = await fetch(`${config.baseUrl}/api/tags`, { cache: "no-store" });
      return res.ok;
    }
    if (config.type === "triton") {
      const res = await fetch(`${config.baseUrl}/v2/health/ready`, { cache: "no-store" });
      return res.ok;
    }
    const res = await fetch(`${config.baseUrl}`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
