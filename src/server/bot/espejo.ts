import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { publish } from "@/server/events/bus";
import { getOrCreateContact, getOrCreateConversation, serializeMessage } from "@/server/inbox/ingest";
import { createLeadForContact, onLeadActivity } from "@/server/inbox/lead-activity";
import { moveLeadToStage } from "@/server/leads/stage-history";
import { upsertFicha, type FichaInput } from "@/server/bot/ficha";
import { toHandoffReason } from "@/server/bot/handoff";
import type { LossReason, PriorityValue } from "@/lib/types";

/**
 * Modo espejo: un cerebro externo que habla con WhatsApp por SU cuenta (p. ej.
 * Baileys / WhatsApp Web) usa Vocero solo como CRM. Aquí se REGISTRA lo que
 * ya pasó —mensajes y avances del lead— sin enviar nada por Meta y sin
 * despertar al agente in-process: quien responde es el cerebro externo.
 */

/** Prefijo del wa_message_id: separa los ids del espejo de los de Meta. */
const ESPEJO_ID_PREFIX = "espejo:";

function toDate(at: string | number | undefined): Date {
  if (at === undefined) return new Date();
  if (typeof at === "number") return new Date(at < 1e12 ? at * 1000 : at);
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Solo dígitos: el cerebro externo puede mandar `+52 1 55…` o `52155…@s.whatsapp.net`. */
export function espejoPhone(raw: string): string {
  return raw.split("@")[0]!.replace(/\D/g, "");
}

export async function registrarMensajeEspejo(input: {
  organizationId: string;
  phone: string;
  name?: string | null;
  direction: "in" | "out";
  text: string;
  externalId: string;
  at?: string | number;
  /** Salientes: `ai` lo escribió el agente, `manual` el dueño desde su teléfono. */
  origin?: "ai" | "manual";
}): Promise<{ conversationId: string; contactId: string; duplicate: boolean }> {
  const db = getDb();
  const { organizationId } = input;
  const { contact } = await getOrCreateContact(
    organizationId,
    espejoPhone(input.phone),
    input.direction === "in" ? input.name : null
  );
  const conversation = await getOrCreateConversation(organizationId, contact.id);
  const at = toDate(input.at);
  const origin = input.direction === "out" ? (input.origin ?? "ai") : "operator";

  const inserted = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId,
      conversationId: conversation.id,
      waMessageId: `${ESPEJO_ID_PREFIX}${input.externalId}`,
      direction: input.direction,
      type: "text",
      text: input.text,
      status: input.direction === "in" ? "delivered" : "sent",
      aiGenerated: origin === "ai",
      origin,
      waTimestamp: at,
      createdAt: at,
    })
    .onConflictDoNothing({ target: [schema.message.waMessageId] })
    .returning();
  const message = inserted[0];
  if (!message) {
    return { conversationId: conversation.id, contactId: contact.id, duplicate: true };
  }

  await db
    .update(schema.conversation)
    .set(
      input.direction === "in"
        ? {
            lastInboundAt: at,
            lastMessageAt: at,
            unreadCount: sql`${schema.conversation.unreadCount} + 1`,
            updatedAt: new Date(),
          }
        : { lastMessageAt: at, updatedAt: new Date() }
    )
    .where(eq(schema.conversation.id, conversation.id));

  await onLeadActivity(organizationId, contact.id, at);

  publish(organizationId, {
    type: "message.new",
    data: { conversationId: conversation.id, message: serializeMessage(message, null) },
  });
  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conversation.id } },
  });

  return { conversationId: conversation.id, contactId: contact.id, duplicate: false };
}

/** Compara nombres de etapa sin mayúsculas, acentos ni espacios de más. */
function stageKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type LeadEspejoResult = {
  contactId: string;
  conversationId: string;
  leadId: string | null;
  etapa: string | null;
  /** Por qué no se movió de etapa, si se pidió y no se hizo. */
  etapaOmitida?: "etapa_desconocida" | "no_retrocede" | "lead_cerrado" | "sin_etapas";
};

export async function actualizarLeadEspejo(input: {
  organizationId: string;
  phone: string;
  nombre?: string | null;
  ficha?: FichaInput;
  nota?: string | null;
  prioridad?: PriorityValue | null;
  etapa?: string | null;
  motivoPerdida?: LossReason | null;
  handoff?: string | null;
}): Promise<LeadEspejoResult> {
  const db = getDb();
  const { organizationId } = input;
  const { contact } = await getOrCreateContact(organizationId, espejoPhone(input.phone), null);
  const conversation = await getOrCreateConversation(organizationId, contact.id);

  // La ficha va por su única puerta (`upsertFicha`), antes que el resto.
  if (input.ficha && Object.keys(input.ficha).length > 0) {
    await upsertFicha({ organizationId, contactId: contact.id, ficha: input.ficha });
  }

  // Nombre REAL que dio el lead: pisa al del perfil de WhatsApp, pero jamás
  // a uno que el dueño escribió a mano.
  const nombre = input.nombre?.trim();
  const contactPatch: Partial<typeof schema.contact.$inferInsert> = {};
  if (nombre && contact.nameSource === "perfil" && nombre !== contact.name) {
    contactPatch.name = nombre;
    contactPatch.nameSource = "manual";
  }
  const nota = input.nota?.trim();
  if (nota) {
    const stamped = `[Agente] ${nota}`;
    contactPatch.notes = contact.notes ? `${contact.notes}\n${stamped}` : stamped;
  }
  if (Object.keys(contactPatch).length > 0) {
    contactPatch.updatedAt = new Date();
    await db
      .update(schema.contact)
      .set(contactPatch)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contact.id)));
  }

  let leadRow = (
    await db
      .select({ lead: schema.lead, stage: schema.pipelineStage })
      .from(schema.lead)
      .leftJoin(schema.pipelineStage, eq(schema.lead.stageId, schema.pipelineStage.id))
      .where(and(eq(schema.lead.organizationId, organizationId), eq(schema.lead.contactId, contact.id)))
      .limit(1)
  )[0];
  if (!leadRow) {
    await createLeadForContact({ organizationId, contactId: contact.id, source: "bot" });
    leadRow = (
      await db
        .select({ lead: schema.lead, stage: schema.pipelineStage })
        .from(schema.lead)
        .leftJoin(schema.pipelineStage, eq(schema.lead.stageId, schema.pipelineStage.id))
        .where(and(eq(schema.lead.organizationId, organizationId), eq(schema.lead.contactId, contact.id)))
        .limit(1)
    )[0];
  }

  const result: LeadEspejoResult = {
    contactId: contact.id,
    conversationId: conversation.id,
    leadId: leadRow?.lead.id ?? null,
    etapa: leadRow?.stage?.name ?? null,
  };

  if (!leadRow) {
    if (input.etapa) result.etapaOmitida = "sin_etapas";
    return result;
  }

  if (input.prioridad && input.prioridad !== leadRow.lead.priority) {
    await db
      .update(schema.lead)
      .set({ priority: input.prioridad, priorityUpdatedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.lead.id, leadRow.lead.id));
  }

  if (input.etapa) {
    const stages = await db
      .select()
      .from(schema.pipelineStage)
      .where(eq(schema.pipelineStage.organizationId, organizationId));
    const target = stages.find((s) => stageKey(s.name) === stageKey(input.etapa!));
    const current = leadRow.stage;
    if (!target) {
      result.etapaOmitida = "etapa_desconocida";
    } else if (current && current.kind !== "open") {
      // Ganado o perdido lo decide el dueño; el agente no reabre ni recierra.
      result.etapaOmitida = "lead_cerrado";
    } else if (current && target.kind === "open" && target.position <= current.position) {
      // Solo hacia adelante: el agente nunca deshace lo que el dueño avanzó.
      result.etapaOmitida = "no_retrocede";
    } else if (target.id !== leadRow.lead.stageId) {
      const moved = await moveLeadToStage({
        organizationId,
        leadId: leadRow.lead.id,
        toStageId: target.id,
        source: "bot",
        lossReason: target.kind === "lost" ? (input.motivoPerdida ?? "otro") : null,
        extra: { lastActivityAt: new Date() },
      });
      if (moved.ok) result.etapa = target.name;
    }
  }

  if (input.handoff) {
    await db
      .update(schema.conversation)
      .set({
        aiEnabled: false,
        handoffAt: new Date(),
        handoffReason: toHandoffReason(input.handoff),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.conversation.id, conversation.id), sql`${schema.conversation.handoffAt} is null`));
  }

  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conversation.id } },
  });
  return result;
}
