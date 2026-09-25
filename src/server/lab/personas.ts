/**
 * Las 6 personas GUIONADAS del Laboratorio (FR-030). El cliente simulado no
 * usa LLM: son secuencias fijas — determinismo total del lado del cliente.
 * El agente que responde es el REAL (mismo pipeline de US3).
 */

export type Persona = {
  key: string;
  label: string;
  description: string;
  /** Teléfono sintético estable (jamás un número real). */
  phone: string;
  contactName: string;
  script: string[];
};

export const PERSONAS: Persona[] = [
  {
    key: "comprador_decidido",
    label: "Comprador decidido",
    description: "Sabe lo que quiere y va directo a agendar.",
    phone: "5210000000001",
    contactName: "[Prueba] Comprador decidido",
    script: [
      "Hola, buenas tardes",
      "Tengo una distribuidora y quiero ordenar cómo tomamos los pedidos",
      "Me recomendaron con ustedes, ¿cómo arrancamos?",
      "Perfecto, quiero agendar la llamada esta semana",
    ],
  },
  {
    key: "pregunton_precios",
    label: "Preguntón de precios",
    description: "Pregunta precio tras precio sin decidirse.",
    phone: "5210000000002",
    contactName: "[Prueba] Preguntón de precios",
    script: [
      "Hola, ¿cuánto cuesta el diagnóstico?",
      "¿Y la transformación completa?",
      "¿Y solo un chatbot de WhatsApp?",
      "¿Hay descuento si pago todo junto?",
      "Ok, lo voy a pensar",
    ],
  },
  {
    key: "cliente_enojado",
    label: "Cliente enojado",
    description: "Cliente en ejecución, molesto porque el cambio no se nota.",
    phone: "5210000000003",
    contactName: "[Prueba] Cliente enojado",
    script: [
      "Oigan, esto es el colmo",
      "Pagamos la implementación y el equipo sigue anotando pedidos en la libreta",
      "¿Me van a responder o qué? Quiero una solución YA",
      "Pues espero que sí porque no pienso perder mi dinero",
    ],
  },
  {
    key: "fuera_de_kb",
    label: "Pregunta fuera del conocimiento",
    description: "Pregunta algo que el knowledge base no cubre (fuera_de_kb).",
    phone: "5210000000004",
    contactName: "[Prueba] Fuera del conocimiento",
    script: [
      "Hola, una pregunta",
      "¿Firman acuerdo de confidencialidad antes de ver la información de mi empresa?",
      "¿Quién de su equipo va a ver mis números?",
      "¿Cómo protegen los datos de mis clientes?",
    ],
  },
  {
    key: "pide_humano",
    label: "Pide un humano",
    description: "Quiere ser atendido por una persona (debe escalar).",
    phone: "5210000000005",
    contactName: "[Prueba] Pide humano",
    script: [
      "Hola",
      "Ya soy cliente, tengo un tema delicado con el proyecto",
      "Prefiero hablar directamente con el consultor, con una persona",
      "Gracias",
    ],
  },
  {
    key: "errores_modismos",
    label: "Errores y modismos",
    description: "Escribe con faltas de ortografía y modismos.",
    phone: "5210000000006",
    contactName: "[Prueba] Errores y modismos",
    script: [
      "ola, ustedes asen bots pa whatsap?",
      "es q se me pierden los pedidos x todos lados",
      "cuanto sale mas o menos pa un negocio chiquito",
      "va, orita les escribo, sale",
    ],
  },
];

export const PERSONA_LABELS: Record<string, string> = Object.fromEntries(
  PERSONAS.map((p) => [p.key, p.label])
);
