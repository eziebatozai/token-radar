// main.ts — token radar entrypoint.
//
// Reads the sealed snapshot, builds the ranked board, and writes the output
// bundle: board.json, data.js for the dashboard, the dashboard and
// screenshots directories, and dossier.json from the vendor module.
// Standard library only, no network. Deterministic: two runs on the same
// inputs write the same bytes.

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-board.ts";
import { buildBoard } from "./lib/model.ts";
import type { Snapshot } from "./lib/model.ts";

const TEXT_MAX_BYTES = 65536;

function argValue(argv: string[], flag: string): string | undefined {
  const at = argv.indexOf(flag);
  if (at >= 0 && at + 1 < argv.length) return argv[at + 1];
  const joined = argv.find((a) => a.startsWith(flag + "="));
  if (joined !== undefined) return joined.slice(flag.length + 1);
  return undefined;
}

// The snapshot path: --input wins, then MAKEFUN_INPUT_DIR (a file path, or a
// directory holding snapshot.json), then the default input location.
function inputPath(argv: string[]): string {
  const flag = argValue(argv, "--input");
  if (flag !== undefined) return resolve(flag);
  const env = process.env.MAKEFUN_INPUT_DIR;
  if (env !== undefined && env !== "") {
    return env.endsWith(".json") ? resolve(env) : join(resolve(env), "snapshot.json");
  }
  return "/input/snapshot.json";
}

// The output directory: MAKEFUN_OUTPUT_DIR, else the default output location.
function outputDir(): string {
  const env = process.env.MAKEFUN_OUTPUT_DIR;
  return resolve(env !== undefined && env !== "" ? env : "/output");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const input = inputPath(argv);
  const outDir = outputDir();
  const root = dirname(fileURLToPath(import.meta.url));
  const snapshot = JSON.parse(readFileSync(input, "utf8")) as Snapshot;
  const board = buildBoard(snapshot);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "board.json"), JSON.stringify(board, null, 2) + "\n", "utf8");
  writeFileSync(
    join(outDir, "data.js"),
    "window.TOKEN_RADAR = " + JSON.stringify(board) + ";\n",
    "utf8",
  );
  cpSync(join(root, "dashboard"), join(outDir, "dashboard"), { recursive: true });
  cpSync(join(root, "screenshots"), join(outDir, "screenshots"), { recursive: true });

  // The vendor module returns the dossier bytes for the current dashboard/
  // and screenshots/; write them out on every run so dossier.json always
  // matches the files it was built from.
  const made: unknown = await buildDossier(outDir, { text_max_bytes: TEXT_MAX_BYTES });
  const dossierPath = join(outDir, "dossier.json");
  if (typeof made === "string" && made.length > 0) {
    writeFileSync(dossierPath, made, "utf8");
  } else if (made instanceof Uint8Array && made.length > 0) {
    writeFileSync(dossierPath, made);
  } else if (made !== null && typeof made === "object") {
    const rec = made as Record<string, unknown>;
    const text = rec["dossier"] ?? rec["json"] ?? rec["text"] ?? rec["bytes"];
    if (typeof text === "string" && text.length > 0) {
      writeFileSync(dossierPath, text, "utf8");
    } else if (text instanceof Uint8Array && text.length > 0) {
      writeFileSync(dossierPath, text);
    }
  }
  if (!existsSync(dossierPath)) {
    throw new Error("buildDossier produced no dossier.json");
  }

  const top = board.rows[0];
  console.log(
    "token-radar: protocols=" +
      board.protocol_count +
      " watchlist=" +
      board.watchlist_count +
      " rows=" +
      board.row_count +
      " top=" +
      top.name +
      " implied_value_usd=" +
      top.implied_value_usd +
      " output=" +
      outDir,
  );
}

await main();
