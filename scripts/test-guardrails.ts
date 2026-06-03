#!/usr/bin/env npx tsx
/** Verify guardrails accept the hand-written reference descriptions. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { runGuardrails } from "../src/lib/routes/description-guardrails";
import type { NarrativeContext } from "../src/lib/routes/narrative-context";

const ids = ["route", "route-2", "route-3"];
let failed = 0;
for (const id of ids) {
  const dir = resolve(__dirname, "..", "data", "few-shot");
  const ctx = JSON.parse(readFileSync(`${dir}/${id}.context.json`, "utf-8")) as NarrativeContext;
  const desc = readFileSync(`${dir}/${id}.description.md`, "utf-8");
  const report = runGuardrails(desc, ctx);
  console.log(`${id}: ok=${report.ok} allowed=${report.allowedCount}`);
  if (report.unknownQuoted.length > 0) {
    console.log(`  unknown quoted: ${JSON.stringify(report.unknownQuoted)}`);
  }
  if (report.unknownCapitalised.length > 0) {
    console.log(`  unknown capitalised: ${JSON.stringify(report.unknownCapitalised)}`);
  }
  if (!report.ok) failed++;
}
if (failed > 0) {
  console.error(`${failed}/${ids.length} reference(s) failed guardrails`);
  process.exit(1);
}
