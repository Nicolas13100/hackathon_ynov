import { getInferenceConfig, checkInferenceHealth } from "@/lib/inference";

export const runtime = "nodejs";

export async function GET() {
  const config = getInferenceConfig();
  const ok = await checkInferenceHealth(config);
  return Response.json({
    ok,
    type: config.type,
    baseUrl: config.baseUrl,
    model: config.model,
  });
}
