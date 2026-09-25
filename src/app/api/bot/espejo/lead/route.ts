import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { actualizarLeadEspejo, espejoPhone } from "@/server/bot/espejo";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  phone: z.string().min(5).refine((v) => espejoPhone(v).length >= 8, "Teléfono inválido"),
  nombre: z.string().max(120).nullable().optional(),
  // Claves libres, como PUT /api/bot/ficha: cada negocio califica distinto.
  ficha: z.record(z.unknown()).optional(),
  nota: z.string().max(4000).nullable().optional(),
  prioridad: z.enum(["alta", "media", "baja"]).nullable().optional(),
  /** Nombre de la etapa tal como se ve en el Pipeline (sin importar acentos). */
  etapa: z.string().max(60).nullable().optional(),
  motivoPerdida: z
    .enum(["precio", "no_es_perfil", "sin_presupuesto", "eligio_otro", "nunca_contesto", "otro"])
    .nullable()
    .optional(),
  /** Si viene, marca la conversación como "requiere humano" con este motivo. */
  handoff: z.string().max(60).nullable().optional(),
});

/**
 * Modo espejo: el cerebro externo actualiza el lead (nombre, ficha, nota,
 * prioridad, etapa). Crea contacto y lead si no existen. La etapa solo
 * avanza: nunca retrocede ni toca un lead ya ganado o perdido.
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

  const result = await actualizarLeadEspejo({ organizationId, ...body.data });
  return Response.json(result);
}
