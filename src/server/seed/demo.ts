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
    notes: "Taller mecánico. Llegó pidiendo un chatbot.",
    ficha: { rubro: "Taller mecánico", tamano_equipo: "2-4" },
    thread: [
      { dir: "in", text: "Hola, vi su post en Instagram. ¿Ustedes hacen chatbots con IA para WhatsApp?", hoursAgo: 2 },
      { dir: "out", text: "¡Hola Jorge! Sí trabajamos con IA, pero antes de meter un bot revisamos cómo funciona hoy tu proceso: automatizar el desorden solo lo hace más rápido. ¿A qué se dedica tu negocio?", hoursAgo: 2, ai: true },
      { dir: "in", text: "Tengo un taller mecánico, me escriben mucho para citas y cotizaciones y no me da la vida", hoursAgo: 1 },
    ],
  },
  {
    phone: "5215612340002",
    name: "Carlos Ramírez",
    stage: "Asesoría agendada",
    notes: "Distribuidora de abarrotes. Pedidos por WhatsApp, libreta y Excel.",
    priority: "alta",
    ficha: {
      rubro: "Distribuidora de abarrotes",
      tamano_equipo: "5-7",
      dolor_principal: "Pedidos perdidos entre WhatsApp, libreta y Excel",
    },
    thread: [
      { dir: "in", text: "Buenas, tengo una distribuidora y los pedidos se nos pierden. Quiero automatizar", hoursAgo: 30 },
      { dir: "out", text: "¡Hola Carlos! Justo eso trabajamos. ¿Cuántas personas tocan un pedido desde que llega hasta que sale el camión?", hoursAgo: 30, ai: true },
      { dir: "in", text: "Yo, mi hermano que carga y la muchacha que factura. Todo pasa por mí", hoursAgo: 29 },
      { dir: "out", text: "Ahí está la pista: todo depende de ti. Te propongo una llamada de asesoría de 30 min para verlo juntos. ¿Te queda el jueves a las 10:00?", hoursAgo: 29, ai: true },
      { dir: "in", text: "Va, el jueves a las 10", hoursAgo: 28 },
      { dir: "out", text: "Agendado ✅ Te llega el enlace por aquí. Nos vemos el jueves.", hoursAgo: 28 },
    ],
  },
  {
    phone: "5215612340005",
    name: "Ana Sofía Torres",
    stage: "Diagnóstico propuesto",
    notes: "Inmobiliaria. Tuvo asesoría; se le propuso el diagnóstico.",
    priority: "media",
    amount: 450,
    ficha: {
      rubro: "Inmobiliaria",
      tamano_equipo: "5-7",
      dolor_principal: "Leads de portales sin seguimiento; cada asesor usa su propio Excel",
      nivel_paquete: "0 · Diagnóstico",
    },
    thread: [
      { dir: "out", text: "Ana, gracias por la llamada de hoy. Como quedamos, te comparto la propuesta del diagnóstico: revisamos las 5 áreas y salimos con 3 prioridades y un número de éxito.", hoursAgo: 20 },
      { dir: "in", text: "Gracias Pedro, se ve bien. Déjame revisarlo con mi socio y te confirmo", hoursAgo: 18 },
      { dir: "out", text: "Claro. Recuerda que el diagnóstico se acredita si luego avanzan con la transformación. Quedo atento.", hoursAgo: 18 },
    ],
  },
  {
    phone: "5215612340001",
    name: "María Fernanda López",
    stage: "Auditando (Fase 1)",
    notes: "Clínica dental. Diagnóstico pagado; reunión de arranque hecha.",
    priority: "alta",
    amount: 450,
    ficha: {
      rubro: "Clínica dental",
      tamano_equipo: "5-7",
      dolor_principal: "Agenda y recordatorios a mano; 25% de citas no se presentan",
      dependencia_dueno: "Alta: ella confirma todas las citas",
      estrella_polar: "Inasistencias de 25% → 10%",
      nivel_paquete: "0 · Diagnóstico",
    },
    thread: [
      { dir: "out", text: "María Fernanda, gracias por la reunión de arranque. Para la auditoría necesito: la agenda de las últimas 4 semanas y cómo confirman las citas hoy.", hoursAgo: 6 },
      { dir: "in", text: "Te mando la agenda hoy en la tarde. Las confirmamos por WhatsApp una por una, a veces se nos pasan", hoursAgo: 5 },
      { dir: "out", text: "Perfecto, con eso medimos cuántas se caen. El jueves te hago la devolución del diagnóstico.", hoursAgo: 5 },
    ],
  },
  {
    phone: "5215612340007",
    name: "Paty Domínguez",
    stage: "Diseñando (Fase 2)",
    notes: "Pastelería con 5 empleados. Prioridad 1: pedidos personalizados.",
    priority: "media",
    amount: 1800,
    ficha: {
      rubro: "Pastelería",
      tamano_equipo: "5-7",
      dolor_principal: "Pedidos personalizados con errores de sabor, fecha o dedicatoria",
      estrella_polar: "Pedidos con error: 12% → 2%",
      nivel_paquete: "2 · Diseño + Plan",
      prioridades_p1: "Toma de pedidos personalizados; anticipo y confirmación",
    },
    thread: [
      { dir: "out", text: "Paty, ya tengo el flujo de cómo debería quedar la toma de pedidos: formulario único, anticipo del 50% y confirmación 48 h antes. ¿Lo revisamos el lunes con Rosa, que es quien los toma?", hoursAgo: 26 },
      { dir: "in", text: "Sí, mejor con Rosa, ella es la que sufre con los pedidos 😅", hoursAgo: 25 },
    ],
  },
  {
    phone: "5215612340008",
    name: "Jesús Aguilar",
    stage: "Presupuesto de ejecución",
    notes: "Constructora. Diseño entregado; se envió propuesta de Transformación.",
    priority: "alta",
    amount: 3500,
    ficha: {
      rubro: "Constructora",
      tamano_equipo: "5-7",
      dolor_principal: "Compras de obra sin control; el dueño aprueba todo por teléfono",
      estrella_polar: "Horas del dueño en compras: 15 → 4 por semana",
      nivel_paquete: "3 · Transformación",
    },
    thread: [
      { dir: "out", text: "Don Jesús, le envié la propuesta de ejecución: implementar el flujo de compras que diseñamos, capacitar a los residentes y medir a 30 y 90 días.", hoursAgo: 50 },
      { dir: "in", text: "La vi. Me gusta, pero ¿el software de inventario a la medida entra ahí?", hoursAgo: 49 },
      { dir: "out", text: "Eso sería un proyecto de desarrollo aparte. Con la propuesta dejamos el control funcionando con herramientas que ya existen; si después lo necesita a la medida, lo cotizamos por separado.", hoursAgo: 49 },
      { dir: "in", text: "Va, déjeme lo platico con mi contador esta semana", hoursAgo: 48 },
    ],
  },
  {
    phone: "5215612340003",
    name: "Lupita Hernández",
    stage: "Ejecutando (Fase 3)",
    notes: "Carpintería de muebles a medida. En implementación y adopción.",
    priority: "media",
    amount: 3200,
    ficha: {
      rubro: "Carpintería de muebles a medida",
      tamano_equipo: "2-4",
      estrella_polar: "Pedidos entregados a tiempo: 60% → 90%",
      nivel_paquete: "3 · Transformación",
      responsable_adopcion: "Mario (jefe de taller)",
    },
    thread: [
      { dir: "out", text: "Lupita, ¿cómo va Mario con el tablero de pedidos? Esta semana quiero ver si lo están usando todos los días.", hoursAgo: 30 },
      { dir: "in", text: "Ya lo usa, pero los viernes se le olvida actualizar", hoursAgo: 29 },
      { dir: "out", text: "Normal al inicio. Le dejo un recordatorio automático los viernes a las 5 pm y lo revisamos en 2 semanas antes del siguiente cambio.", hoursAgo: 29 },
    ],
  },
  {
    phone: "5215612340009",
    name: "Ricardo Salas",
    stage: "Control 30/90 días (Fase 4)",
    notes: "Despacho contable. Ejecución terminada; revisión a 30 días.",
    priority: "baja",
    amount: 3800,
    ficha: {
      rubro: "Despacho contable",
      tamano_equipo: "5-7",
      estrella_polar: "Días para cerrar el mes: 12 → 5",
      nivel_paquete: "3 · Transformación",
      revision_30: "Hecha: 12 → 7 días",
      revision_90: "Pendiente",
    },
    thread: [
      { dir: "out", text: "Ricardo, revisión a 30 días: el cierre de mes pasó de 12 a 7 días. Vamos bien hacia la meta de 5.", hoursAgo: 72 },
      { dir: "in", text: "Se nota muchísimo en la oficina. ¿Qué sigue?", hoursAgo: 70 },
      { dir: "out", text: "Mantener la solicitud de documentos que automatizamos y medimos de nuevo a los 90 días. Ahí vemos si ampliamos a nómina.", hoursAgo: 70 },
    ],
  },
  {
    phone: "5215612340010",
    name: "Gabriela Ruiz",
    stage: "Cliente",
    notes: "Gimnasio. Transformación completa; caso de éxito.",
    amount: 3000,
    ficha: {
      rubro: "Gimnasio",
      tamano_equipo: "5-7",
      estrella_polar: "Horas de la dueña en la operación: 50 → 25 por semana",
      nivel_paquete: "3 · Transformación",
      resultado: "Logrado: 50 → 22 horas por semana",
    },
    thread: [
      { dir: "in", text: "Pedro, ya pasaron los 90 días y sigo sin tener que estar en recepción. ¡Gracias!", hoursAgo: 120 },
      { dir: "out", text: "¡Qué gusto Gabriela! De 50 a 22 horas por semana. ¿Me permites usarlo como caso de éxito?", hoursAgo: 119 },
      { dir: "in", text: "Claro que sí 🙌", hoursAgo: 118 },
    ],
  },
  {
    phone: "5215612340006",
    name: "Roberto Mendoza",
    stage: "Nutrir / En pausa",
    notes: "Restaurante. Compró solo el diagnóstico; retomar en 2 meses.",
    amount: 450,
    ficha: {
      rubro: "Restaurante",
      tamano_equipo: "5-7",
      estrella_polar: "Merma de insumos: 18% → 8%",
      nivel_paquete: "0 · Diagnóstico",
    },
    thread: [
      { dir: "out", text: "Roberto, ¿cómo te fue aplicando las prioridades del diagnóstico?", hoursAgo: 96 },
      { dir: "in", text: "Arrancamos con el inventario pero ahorita estamos en temporada alta, lo retomo después", hoursAgo: 95 },
      { dir: "out", text: "Entendido. Te busco en dos meses para ver cómo va la merma y si quieres que lo implementemos juntos.", hoursAgo: 95 },
    ],
  },
];

const DEMO_KB = VENOVA_KB;

export async function seedDemo(
  db: Db,
  organizationId: string
): Promise<{ contacts: number; kbEntries: number }> {
  const demoPhones = DEMO_CONTACTS.map((c) => c.phone);

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
