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

const sql = `-- ============================================================
-- Vocero · de Empresa Clara a VENOVA (asistente: Eva).
-- Para una instancia YA en marcha: reemplaza la base de conocimiento y el
-- perfil del agente. No toca etapas, contactos, conversaciones ni leads.
-- Re-ejecutable. Generado por scripts/gen-venova-sql.ts: no editar a mano.
-- ============================================================
BEGIN;

CREATE TEMP TABLE _org AS SELECT id FROM organization ORDER BY created_at LIMIT 1;

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
