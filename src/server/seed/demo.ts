import { eq, inArray } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import { schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { RESPUESTAS_DEMO } from "@/server/quick-replies";
import { VENOVA_AGENT, VENOVA_KB } from "./venova";

/**
 * Negocio de demostración: VENOVA, sistemas, apps, web e IA a la medida de
 * una pyme, con la asistente Eva (perfil y conocimiento en `venova.ts`).
 * Un lead por etapa del pipeline de la agencia.
 * Idempotente: borra los datos demo previos de la organización (scoped por
 * los teléfonos demo) y reinserta. El KB queda lleno EXCEPTO confidencialidad
 * y manejo de datos — hueco INTENCIONAL para que el Laboratorio encuentre
 * algo real en la primera corrida.
 */

type Db = ReturnType<typeof getDb>;

const HOURS = 60 * 60 * 1000;

const DEMO_CURRENCY = "USD";

const DEMO_CONTACTS: {
  phone: string;
  name: string;
  notes?: string;
  stage: string;
  ficha?: Record<string, string | number | boolean>;
  amount?: number;
  priority?: "alta" | "media" | "baja";
  thread: { dir: "in" | "out"; text: string; hoursAgo: number; ai?: boolean }[];
}[] = [
  {
    phone: "5215612340004",
    name: "Jorge Castillo",
    stage: "Nuevo",
    notes: "Taller mecánico. Acaba de escribir, aún no cuenta su problema.",
    thread: [
      { dir: "in", text: "Buenas, vi su página. ¿Ustedes hacen sistemas para talleres?", hoursAgo: 2 },
      { dir: "out", text: "Buenas, soy Eva, la asistente de VENOVA. Antes de nada, ¿cómo te llamas?", hoursAgo: 2, ai: true },
      { dir: "in", text: "Jorge", hoursAgo: 1 },
    ],
  },
  {
    phone: "5215612340002",
    name: "Carlos Ramírez",
    stage: "Calificando",
    notes: "Distribuidora de víveres. Ya contó su dolor; Eva sigue con P1 a P4.",
    priority: "media",
    ficha: {
      empresa: "Distribuidora Ramírez",
      rubro: "Distribuidora de víveres",
      personas: 6,
      dolor: "Los pedidos se pierden entre WhatsApp, libreta y Excel",
    },
    thread: [
      { dir: "in", text: "Tengo una distribuidora y los pedidos se nos pierden", hoursAgo: 30 },
      { dir: "out", text: "Buenas, soy Eva, la asistente de VENOVA. Antes de nada, ¿cómo te llamas?", hoursAgo: 30, ai: true },
      { dir: "in", text: "Carlos. Todo pasa por mí, mi hermano carga y la muchacha factura", hoursAgo: 29 },
      { dir: "out", text: "O sea que si tú faltas un día, nadie sabe cómo van los pedidos. ¿Y cómo los anotan hoy?", hoursAgo: 29, ai: true },
    ],
  },
  {
    phone: "5215612340005",
    name: "Ana Sofía Torres",
    stage: "Conversación agendada",
    notes: "Inmobiliaria. Reservó la conversación inicial con Pedro por Meet.",
    priority: "alta",
    ficha: {
      empresa: "Torres Inmuebles",
      rubro: "Inmobiliaria",
      personas: 5,
      dolor: "Leads de portales sin seguimiento; cada asesor usa su propio Excel",
      p3_quiere_ver: "Todos los leads y quién los atendió en una sola pantalla",
      p4_decide: "Ella con su socio",
      metodo_llamada: "Meet",
    },
    thread: [
      { dir: "out", text: "La conversación inicial la atiende Pedro, el CEO de VENOVA, y dura de 30 a 45 minutos sin costo. ¿La prefieres por Meet o por videollamada de WhatsApp?", hoursAgo: 20, ai: true },
      { dir: "in", text: "Por Meet. Mi socio también entra", hoursAgo: 19 },
      { dir: "out", text: "Listo, ya quedó reservada. Te llega la confirmación al correo con el enlace de la videollamada.", hoursAgo: 19, ai: true },
    ],
  },
  {
    phone: "5215612340001",
    name: "María Fernanda López",
    stage: "Idea aclarada",
    notes: "Clínica dental. Hubo llamada con Pedro; decide si hay prototipo.",
    priority: "alta",
    ficha: {
      empresa: "Clínica Dental López",
      rubro: "Clínica dental",
      personas: 6,
      dolor: "Agenda y recordatorios a mano; 1 de cada 4 citas no se presenta",
      p3_quiere_ver: "La agenda del día y quién confirmó",
      busca: "Sistema",
    },
    thread: [
      { dir: "out", text: "María Fernanda, gracias por la conversación de hoy. Pedro revisa tu caso y te avisa si te prepara el prototipo.", hoursAgo: 6 },
      { dir: "in", text: "Perfecto, quedo atenta. Las confirmamos por WhatsApp una por una y a veces se nos pasan", hoursAgo: 5 },
    ],
  },
  {
    phone: "5215612340007",
    name: "Paty Domínguez",
    stage: "Prototipo en preparación",
    notes: "Pastelería con 5 empleados. Pedro arma el prototipo de pedidos personalizados.",
    priority: "media",
    ficha: {
      empresa: "Pastelería Dulce Paty",
      rubro: "Pastelería",
      personas: 5,
      dolor: "Pedidos personalizados con errores de sabor, fecha o dedicatoria",
      p3_quiere_ver: "Cada pedido con su fecha y su anticipo",
      busca: "Sistema y web",
    },
    thread: [
      { dir: "out", text: "Paty, estoy armando el prototipo con la toma de pedidos y el anticipo. ¿Lo revisamos el lunes con Rosa, que es quien los toma?", hoursAgo: 26 },
      { dir: "in", text: "Sí, mejor con Rosa, ella es la que sufre con los pedidos", hoursAgo: 25 },
    ],
  },
  {
    phone: "5215612340008",
    name: "Jesús Aguilar",
    stage: "Propuesta presentada",
    notes: "Constructora. Vio el prototipo y recibió la propuesta; lo consulta con su contador.",
    priority: "alta",
    amount: 3500,
    ficha: {
      empresa: "Constructora Aguilar",
      rubro: "Constructora",
      personas: 12,
      dolor: "Compras de obra sin control; el dueño aprueba todo por teléfono",
      busca: "Sistema",
    },
    thread: [
      { dir: "out", text: "Don Jesús, ya le envié la propuesta: qué se construye primero, en cuánto tiempo y las opciones de pago.", hoursAgo: 50 },
      { dir: "in", text: "La vi. Me gusta el prototipo, déjeme lo platico con mi contador esta semana", hoursAgo: 48 },
    ],
  },
  {
    phone: "5215612340003",
    name: "Lupita Hernández",
    stage: "Ganado",
    notes: "Carpintería de muebles a medida. Aprobó y pagó el primer 50%.",
    amount: 3200,
    ficha: {
      empresa: "Carpintería Hernández",
      rubro: "Carpintería de muebles a medida",
      personas: 4,
      dolor: "Pedidos en libretas; no sabe cuáles van atrasados",
      busca: "Sistema",
    },
    thread: [
      { dir: "in", text: "Ya hice la transferencia del primer 50%, ¿cuándo arrancamos?", hoursAgo: 30 },
      { dir: "out", text: "Recibido, Lupita. Pedro te escribe hoy con el plan de la primera semana.", hoursAgo: 29 },
    ],
  },
  {
    phone: "5215612340006",
    name: "Roberto Mendoza",
    stage: "No es el momento",
    notes: "Restaurante. Le interesó, pero está en temporada alta; retomar en 2 meses.",
    ficha: {
      empresa: "Restaurante El Fogón",
      rubro: "Restaurante",
      personas: 8,
      dolor: "Merma de insumos sin control",
      motivo: "Temporada alta; retomar en 2 meses",
    },
    thread: [
      { dir: "out", text: "Roberto, ¿cómo vas con la temporada? Quedamos en retomar lo del inventario.", hoursAgo: 96 },
      { dir: "in", text: "Ahorita estamos a tope, lo retomo después", hoursAgo: 95 },
      { dir: "out", text: "Entendido, sin presión. Te busco en dos meses.", hoursAgo: 95 },
    ],
  },
];

const DEMO_KB = VENOVA_KB;

export async function seedDemo(
  db: Db,
  organizationId: string
): Promise<{ contacts: number; kbEntries: number }> {
  // Más los dos teléfonos de la demo anterior (Empresa Clara), por si quedaron.
  const demoPhones = [...DEMO_CONTACTS.map((c) => c.phone), "5215612340009", "5215612340010"];

  // --- Idempotencia: limpiar datos demo previos (orden inverso de FKs) ---
  const prevContacts = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(inArray(schema.contact.phone, demoPhones));
  const prevIds = prevContacts.map((c) => c.id);
  if (prevIds.length > 0) {
    const prevConvs = await db
      .select({ id: schema.conversation.id })
      .from(schema.conversation)
      .where(inArray(schema.conversation.contactId, prevIds));
    const convIds = prevConvs.map((c) => c.id);
    if (convIds.length > 0) {
      await db
        .delete(schema.message)
        .where(inArray(schema.message.conversationId, convIds));
      await db
        .delete(schema.conversation)
        .where(inArray(schema.conversation.id, convIds));
    }
    await db.delete(schema.lead).where(inArray(schema.lead.contactId, prevIds));
    await db.delete(schema.contact).where(inArray(schema.contact.id, prevIds));
  }
  // KB y corridas demo previas
  await db
    .delete(schema.kbEntry)
    .where(eq(schema.kbEntry.organizationId, organizationId));
  await db
    .delete(schema.agentTestCase)
    .where(eq(schema.agentTestCase.organizationId, organizationId));
  await db
    .delete(schema.agentTestRun)
    .where(eq(schema.agentTestRun.organizationId, organizationId));

  // --- Etapas (por nombre) ---
  const stages = await db
    .select()
    .from(schema.pipelineStage)
    .where(eq(schema.pipelineStage.organizationId, organizationId));
  const stageByName = new Map(stages.map((s) => [s.name, s.id]));
  const fallbackStage = stages[0]?.id;
  if (!fallbackStage) throw new Error("La organización no tiene etapas");

  // --- Contactos + conversaciones + mensajes + leads ---
  const now = Date.now();
  let position = 0;
  for (const demo of DEMO_CONTACTS) {
    const contactId = newId("contact");
    await db.insert(schema.contact).values({
      id: contactId,
      organizationId,
      phone: demo.phone,
      waIdentity: demo.phone,
      name: demo.name,
      notes: demo.notes ?? null,
      ficha: demo.ficha ?? null,
    });

    const inbound = demo.thread.filter((t) => t.dir === "in");
    const lastInbound = inbound.reduce(
      (min, t) => Math.min(min, t.hoursAgo),
      Infinity
    );
    const lastMessage = demo.thread.reduce(
      (min, t) => Math.min(min, t.hoursAgo),
      Infinity
    );

    const conversationId = newId("conversation");
    await db.insert(schema.conversation).values({
      id: conversationId,
      organizationId,
      contactId,
      lastInboundAt: inbound.length > 0 ? new Date(now - lastInbound * HOURS) : null,
      lastMessageAt: new Date(now - lastMessage * HOURS),
      unreadCount: demo.thread[demo.thread.length - 1]?.dir === "in" ? 1 : 0,
    });

    for (const msg of demo.thread) {
      const at = new Date(now - msg.hoursAgo * HOURS);
      await db.insert(schema.message).values({
        id: newId("message"),
        organizationId,
        conversationId,
        waMessageId: `wamid.demo.${newId("message")}`,
        direction: msg.dir,
        type: "text",
        text: msg.text,
        status: msg.dir === "in" ? "delivered" : "read",
        aiGenerated: msg.ai ?? false,
        origin: msg.ai ? "ai" : "operator",
        waTimestamp: at,
        createdAt: at,
      });
    }

    await db.insert(schema.lead).values({
      id: newId("lead"),
      organizationId,
      contactId,
      stageId: stageByName.get(demo.stage) ?? fallbackStage,
      position: position++,
      lastActivityAt: new Date(now - lastMessage * HOURS),
      amountCents: demo.amount != null ? demo.amount * 100 : null,
      currency: demo.amount != null ? DEMO_CURRENCY : null,
      priority: demo.priority ?? null,
      priorityUpdatedAt: demo.priority ? new Date(now) : null,
    });
  }

  // --- Knowledge base (con el hueco intencional) ---
  for (const entry of DEMO_KB) {
    await db.insert(schema.kbEntry).values({
      id: newId("kbEntry"),
      organizationId,
      kind: entry.kind,
      question: entry.question ?? null,
      answer: entry.answer ?? null,
      content: entry.content ?? null,
    });
  }

  // --- Comportamiento del agente de la demo ---
  await db
    .update(schema.agentProfile)
    .set({
      name: VENOVA_AGENT.name,
      tone: VENOVA_AGENT.tone,
      instructions: VENOVA_AGENT.instructions,
      escalationRules: VENOVA_AGENT.escalationRules,
      greeting: VENOVA_AGENT.greeting,
      updatedAt: new Date(),
    })
    .where(eq(schema.agentProfile.organizationId, organizationId));

  // --- Corrida de Laboratorio de ejemplo (guardada, con el hueco encontrado) ---
  const runId = newId("testRun");
  await db.insert(schema.agentTestRun).values({
    id: runId,
    organizationId,
    status: "done",
    score: 83,
    startedAt: new Date(now - 24 * HOURS),
    finishedAt: new Date(now - 24 * HOURS + 3 * 60 * 1000),
  });
  const exampleCases: {
    persona: string;
    veredicto: "verde" | "amarillo" | "rojo";
    hallazgos: unknown[];
    transcript: { role: string; text: string }[];
  }[] = [
    {
      persona: "comprador_decidido",
      veredicto: "verde",
      hallazgos: [],
      transcript: [
        { role: "cliente", text: "Tengo una distribuidora y quiero ordenar cómo tomamos los pedidos" },
        { role: "agente", text: "Una distribuidora, entonces el día a día son pedidos, rutas y cobros. ¿Cuántas personas tocan un pedido desde que llega hasta que se entrega?" },
        { role: "cliente", text: "Me recomendaron con ustedes, quiero agendar la llamada esta semana" },
        { role: "agente", text: "La conversación inicial la atiende Pedro, el CEO de VENOVA, y dura de 30 a 45 minutos sin costo. ¿La prefieres por Meet o por videollamada de WhatsApp?" },
      ],
    },
    {
      persona: "pregunton_precios",
      veredicto: "verde",
      hallazgos: [],
      transcript: [
        { role: "cliente", text: "¿Cuánto cuesta el sistema?" },
        { role: "agente", text: "Depende de lo que necesites. Pedro te da una referencia en la conversación inicial, que no tiene costo, y el precio se acuerda viendo el prototipo. ¿La agendamos?" },
      ],
    },
    {
      persona: "cliente_enojado",
      veredicto: "amarillo",
      hallazgos: [
        {
          tipo: "tono",
          evidencia:
            "El agente escaló bien, pero ante 'pagamos y el equipo sigue con la libreta' faltó reconocer la molestia antes de avisar a Pedro.",
        },
      ],
      transcript: [
        { role: "cliente", text: "Pagamos el sistema y el equipo sigue anotando pedidos en la libreta" },
        { role: "agente", text: "Claro, ya le avisé a Pedro. Te escribe él por aquí mismo en un momento." },
      ],
    },
    {
      persona: "fuera_de_kb",
      veredicto: "rojo",
      hallazgos: [
        {
          tipo: "fuera_de_kb",
          evidencia:
            "El cliente preguntó si firman acuerdo de confidencialidad y el conocimiento no lo cubre.",
          sugerencia: {
            pregunta: "¿Firman acuerdo de confidencialidad?",
            respuesta:
              "Sí. Antes de recibir información de tu empresa firmamos un acuerdo de confidencialidad, y solo el equipo asignado a tu sistema ve tus datos.",
          },
        },
      ],
      transcript: [
        { role: "cliente", text: "¿Firman acuerdo de confidencialidad antes de ver la información de mi empresa?" },
        { role: "agente", text: "Déjame confirmarlo con Pedro y te respondo en un momento." },
      ],
    },
    {
      persona: "pide_humano",
      veredicto: "verde",
      hallazgos: [],
      transcript: [
        { role: "cliente", text: "Ya soy cliente, prefiero hablar directamente con Pedro" },
        { role: "agente", text: "(handoff: la conversación pasó a atención humana)" },
      ],
    },
    {
      persona: "errores_modismos",
      veredicto: "verde",
      hallazgos: [],
      transcript: [
        { role: "cliente", text: "ola, ustedes asen bots pa whatsap?" },
        { role: "agente", text: "Buenas, soy Eva, la asistente de VENOVA. Sí trabajamos con IA en WhatsApp. Antes de nada, ¿cómo te llamas?" },
      ],
    },
  ];
  for (const c of exampleCases) {
    await db.insert(schema.agentTestCase).values({
      id: newId("testCase"),
      organizationId,
      runId,
      persona: c.persona,
      status: "done",
      veredicto: c.veredicto,
      hallazgos: c.hallazgos,
      transcript: c.transcript,
    });
  }

  // 049 — Cuatro respuestas rápidas para probar el «/» del compositor. No
  // pisa ni duplica las que el negocio ya tenga con el mismo atajo.
  await db
    .insert(schema.quickReply)
    .values(RESPUESTAS_DEMO.map((r) => ({ id: newId("quickReply"), organizationId, ...r })))
    .onConflictDoNothing({ target: [schema.quickReply.organizationId, schema.quickReply.atajo] });

  return { contacts: DEMO_CONTACTS.length, kbEntries: DEMO_KB.length };
}

/** true si la organización aún no tiene datos de dominio (para el botón). */
export async function isDomainEmpty(
  db: Db,
  organizationId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(eq(schema.contact.organizationId, organizationId))
    .limit(1);
  return rows.length === 0;
}
