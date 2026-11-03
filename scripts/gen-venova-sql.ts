import { writeFileSync } from "node:fs";
import { VENOVA_AGENT, VENOVA_KB } from "../src/server/seed/venova";

/**
 * Genera `actualizar-a-venova.sql`: pone el perfil de Eva y el conocimiento de
 * VENOVA en una instancia que YA corre (las etapas del pipeline y los leads
 * no se tocan). Correr: pnpm gen:venova-sql
 */
const q = (s: string | undefined) => (s == null ? "NULL" : `'${s.replace(/'/g, "''")}'`);
const id = (i: number) => `kb_venova_${String(i + 1).padStart(2, "0")}`;

const kb = VENOVA_KB.map(
  (e, i) =>
    `INSERT INTO kb_entry (id, organization_id, kind, question, answer, content) VALUES (${q(id(i))}, (SELECT id FROM _org), ${q(e.kind)}, ${q(e.question)}, ${q(e.answer)}, ${q(e.content)});`
).join("\n");

/** Etapas de VENOVA, en orden. `desde`: nombres anteriores que se renombran (conservan sus leads). */
const ETAPAS: { name: string; kind: "open" | "won" | "lost"; desde: string[] }[] = [
  { name: "Nuevo", kind: "open", desde: [] },
  { name: "Calificando", kind: "open", desde: ["Auditando (Fase 1)"] },
  { name: "Conversación agendada", kind: "open", desde: ["Asesoría agendada"] },
  { name: "Idea aclarada", kind: "open", desde: ["Diagnóstico propuesto"] },
  { name: "Prototipo en preparación", kind: "open", desde: ["Diseñando (Fase 2)"] },
  { name: "Presentación agendada", kind: "open", desde: [] },
  { name: "Propuesta presentada", kind: "open", desde: ["Presupuesto de ejecución"] },
  { name: "Ganado", kind: "won", desde: ["Cliente"] },
  { name: "No es el momento", kind: "lost", desde: ["Perdido"] },
];
/** Etapas que desaparecen: sus leads pasan a la etapa indicada antes de borrarlas. */
const SOBRAN: { name: string; a: string }[] = [
  { name: "Ejecutando (Fase 3)", a: "Ganado" },
  { name: "Control 30/90 días (Fase 4)", a: "Ganado" },
  { name: "Nutrir / En pausa", a: "No es el momento" },
  { name: "En conversación", a: "Conversación agendada" },
  { name: "Interesado", a: "Idea aclarada" },
];
const stg = (n: string) => `(SELECT id FROM pipeline_stage WHERE organization_id=(SELECT id FROM _org) AND name=${q(n)} LIMIT 1)`;
const etapas = [
  ...ETAPAS.flatMap((e) =>
    e.desde.map(
      (d) =>
        `UPDATE pipeline_stage SET name=${q(e.name)} WHERE organization_id=(SELECT id FROM _org) AND name=${q(d)} AND NOT EXISTS (SELECT 1 FROM pipeline_stage WHERE organization_id=(SELECT id FROM _org) AND name=${q(e.name)});`
    )
  ),
  ...ETAPAS.map(
    (e, i) =>
      `INSERT INTO pipeline_stage (id, organization_id, name, position, kind) SELECT 'stg_' || substr(md5(random()::text || ${q(e.name)}), 1, 20), (SELECT id FROM _org), ${q(e.name)}, ${i}, ${q(e.kind)} WHERE NOT EXISTS (SELECT 1 FROM pipeline_stage WHERE organization_id=(SELECT id FROM _org) AND name=${q(e.name)});`
  ),
  ...SOBRAN.flatMap((s) => [
    `UPDATE lead SET stage_id=${stg(s.a)} WHERE stage_id IN (SELECT id FROM pipeline_stage WHERE organization_id=(SELECT id FROM _org) AND name=${q(s.name)}) AND ${stg(s.a)} IS NOT NULL;`,
    `DELETE FROM pipeline_stage WHERE organization_id=(SELECT id FROM _org) AND name=${q(s.name)} AND kind='open' AND NOT EXISTS (SELECT 1 FROM lead WHERE stage_id=pipeline_stage.id);`,
  ]),
  ...ETAPAS.map(
    (e, i) =>
      `UPDATE pipeline_stage SET position=${i} WHERE organization_id=(SELECT id FROM _org) AND name=${q(e.name)};`
  ),
].join("\n");

const sql = `-- ============================================================
-- Vocero · de Empresa Clara a VENOVA (asistente: Eva).
-- Para una instancia YA en marcha: deja las 9 etapas de VENOVA (los leads de
-- las etapas que sobran pasan a la equivalente), reemplaza la base de
-- conocimiento y el perfil del agente. No toca contactos ni conversaciones.
-- Re-ejecutable. Generado por scripts/gen-venova-sql.ts: no editar a mano.
-- ============================================================
BEGIN;

CREATE TEMP TABLE _org AS SELECT id FROM organization ORDER BY created_at LIMIT 1;

-- Etapas del pipeline
${etapas}

-- Base de conocimiento
DELETE FROM kb_entry WHERE organization_id=(SELECT id FROM _org);
${kb}

UPDATE agent_profile SET
  name=${q(VENOVA_AGENT.name)},
  tone=${q(VENOVA_AGENT.tone)},
  instructions=${q(VENOVA_AGENT.instructions)},
  escalation_rules=${q(VENOVA_AGENT.escalationRules)},
  greeting=${q(VENOVA_AGENT.greeting)},
  updated_at=now()
WHERE organization_id=(SELECT id FROM _org);

COMMIT;
`;
writeFileSync("actualizar-a-venova.sql", sql);
console.log("actualizar-a-venova.sql listo");
