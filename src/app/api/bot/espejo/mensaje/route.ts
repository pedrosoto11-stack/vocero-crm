import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { espejoPhone, registrarMensajeEspejo } from "@/server/bot/espejo";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  phone: z.string().min(5).refine((v) => espejoPhone(v).length >= 8, "Teléfono inválido"),
  name: z.string().max(120).nullable().optional(),
  direction: z.enum(["in", "out"]),
  text: z.string().min(1).max(8000),
  /** Id del mensaje en el cerebro externo: reintentar con el mismo id no duplica. */
  externalId: z.string().min(1).max(200),
  /** ISO 8601 o epoch (segundos o milisegundos). Por defecto, ahora. */
  at: z.union([z.string(), z.number()]).optional(),
  origin: z.enum(["ai", "manual"]).optional(),
});

/**
 * Modo espejo: registra en la bandeja un mensaje que el cerebro externo ya
 * recibió o ya envió por su cuenta. No sale nada por Meta y el agente
 * in-process no se despierta. Idempotente por `externalId`.
 */
export async function POST(req: Request) {
  const denied = requireBotKey(req);
  if (denied) return denied;

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const result = await registrarMensajeEspejo({ organizationId, ...body.data });
  return Response.json(result, { status: result.duplicate ? 200 : 201 });
}
