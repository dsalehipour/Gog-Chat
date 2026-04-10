import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import {
  discoverStandupDocs,
  fetchAllTranscripts,
  getCachedTranscriptIds,
  partitionBySpeaker,
} from "../lib/transcript-fetcher";
import {
  extractPersonaPatterns,
  extractDecisionCandidates,
} from "../lib/transcript-analyzer";
import type { ExistingDWNode } from "../lib/transcript-analyzer";

function resolveSpeaker(): string {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--speaker");
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return process.env.SPEAKER_NAME || "Darius Salehipour";
}

const TARGET_SPEAKER = resolveSpeaker();

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const PROJECT_ROOT = process.cwd();
const ENGINEERING_PROJECT =
  process.env.ENGINEERING_PROJECT || resolve(PROJECT_ROOT, "../engineering-new-LLM-process");
function personaOutputPath(speaker: string): string {
  const slug = speaker.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return join(ENGINEERING_PROJECT, "docs", `${slug}-patterns.json`);
}
const DW_CANDIDATES_OUTPUT = join(ENGINEERING_PROJECT, "docs", "decision-web", "dw-candidates.json");
const DW_SOURCE = join(ENGINEERING_PROJECT, "docs", "decision-web", "decision-web.json");

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

function log(msg: string): void {
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  console.log(`[${ts}] ${msg}`);
}

function parseArgs(): { dryRun: boolean; fetchOnly: boolean; personaOnly: boolean; dwOnly: boolean } {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    fetchOnly: args.includes("--fetch-only"),
    personaOnly: args.includes("--persona-only"),
    dwOnly: args.includes("--dw-only"),
  };
}

function writeOutput(filePath: string, data: unknown): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function loadExistingDWNodes(): ExistingDWNode[] {
  if (!existsSync(DW_SOURCE)) {
    throw new Error(`Decision Web not found at ${DW_SOURCE}`);
  }
  const raw = readFileSync(DW_SOURCE, "utf-8");
  const dw = JSON.parse(raw) as { nodes: ExistingDWNode[] };
  return dw.nodes;
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();
  const { dryRun, fetchOnly, personaOnly, dwOnly } = parseArgs();
  const runPersona = !dwOnly && !fetchOnly;
  const runDW = !personaOnly && !fetchOnly;

  console.log("\n========================================");
  console.log("  Standup Transcript Analysis Pipeline  ");
  console.log("========================================\n");

  // Sanity checks
  if (!existsSync(join(PROJECT_ROOT, "package.json"))) {
    console.error("ERROR: Run this script from the google-connect project root.");
    process.exit(1);
  }
  if (!existsSync(ENGINEERING_PROJECT)) {
    console.error(`ERROR: engineering-new-LLM-process not found at ${ENGINEERING_PROJECT}`);
    console.error("Set ENGINEERING_PROJECT env var to override.");
    process.exit(1);
  }
  if (runDW && !existsSync(DW_SOURCE)) {
    console.error(`ERROR: Decision Web JSON not found at ${DW_SOURCE}`);
    process.exit(1);
  }
  if (!dryRun && !fetchOnly && !process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY environment variable is required for analysis.");
    console.error("Export it: export ANTHROPIC_API_KEY=sk-ant-...");
    process.exit(1);
  }

  log(`Mode: ${dryRun ? "DRY RUN" : fetchOnly ? "FETCH ONLY" : [runPersona && "persona", runDW && "decision-web"].filter(Boolean).join(" + ")}`);
  log(`Output → ${ENGINEERING_PROJECT}\n`);

  // -------------------------------------------------------------------------
  // Stage 1: Discover
  // -------------------------------------------------------------------------
  log("[Stage 1] Discovering standup transcript docs in Google Drive...");
  const docs = await discoverStandupDocs();
  log(`Found ${docs.length} standup transcripts\n`);

  if (docs.length === 0) {
    log("No transcripts found. Verify your gog auth and Drive access.");
    log("Expected docs matching: name contains 'Standup' AND name contains 'Notes by Gemini'");
    process.exit(1);
  }

  // Dry run: just list and exit
  if (dryRun) {
    const cachedIds = new Set(getCachedTranscriptIds());
    console.log("\n--- Document List ---\n");
    for (const doc of docs) {
      const cached = cachedIds.has(doc.id) ? "[cached]" : "[new]   ";
      const dateStr = doc.date ? doc.date.slice(0, 10) : "no-date   ";
      console.log(`  ${cached} ${dateStr} | ${doc.title}`);
    }
    console.log(`\nTotal: ${docs.length} documents (${cachedIds.size} already cached)`);
    console.log("Run without --dry-run to fetch and analyze.\n");
    return;
  }

  // -------------------------------------------------------------------------
  // Stage 2: Fetch
  // -------------------------------------------------------------------------
  log("[Stage 2] Fetching transcript text (cached docs will be skipped)...\n");
  const { fetched, errors } = await fetchAllTranscripts(docs, (msg) => console.log(msg));

  console.log("");
  log(`Fetched: ${fetched.length} | Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log("\n  Failed docs:");
    for (const e of errors) {
      console.log(`    - ${e.doc.title}: ${e.error}`);
    }
  }
  console.log("");

  if (fetched.length === 0) {
    log("No transcripts could be fetched. Exiting.");
    process.exit(1);
  }

  const totalChars = fetched.reduce((sum, t) => sum + t.text.length, 0);
  log(`Total text: ${(totalChars / 1024).toFixed(0)} KB across ${fetched.length} documents`);

  // -------------------------------------------------------------------------
  // Stage 2b: Partition by speaker presence
  // -------------------------------------------------------------------------
  const { speakerPresent, speakerAbsent } = partitionBySpeaker(fetched, TARGET_SPEAKER);
  log(`Speaker "${TARGET_SPEAKER}" found in ${speakerPresent.length}/${fetched.length} transcripts`);
  log(`  → ${speakerPresent.length} transcripts for persona extraction`);
  log(`  → ${fetched.length} transcripts for DW extraction (all)\n`);

  if (fetchOnly) {
    console.log("========================================");
    log(`Fetch complete in ${formatDuration(Date.now() - startTime)}`);
    console.log("========================================\n");
    console.log("  All transcripts cached. Run without --fetch-only to analyze.\n");
    return;
  }

  if (runPersona && speakerPresent.length === 0) {
    log(`WARNING: "${TARGET_SPEAKER}" was not found as a speaker in any transcript.`);
    log(`  Gemini transcripts use "SpeakerName: text" format.`);
    log(`  Check if the name appears differently. Override with: SPEAKER_NAME="Other Name" npx tsx ...`);
    log(`  Skipping persona extraction.\n`);
  }

  // -------------------------------------------------------------------------
  // Stage 3a: Persona extraction (only transcripts where speaker is present)
  // -------------------------------------------------------------------------
  if (runPersona && speakerPresent.length > 0) {
    const personaStart = Date.now();
    log(`[Stage 3a] Extracting persona patterns from ${speakerPresent.length} transcripts...\n`);

    try {
      const profile = await extractPersonaPatterns(speakerPresent, (msg) => console.log(msg), TARGET_SPEAKER);
      const outPath = personaOutputPath(TARGET_SPEAKER);
      writeOutput(outPath, profile);

      const patternCount = Object.values(profile.patterns)
        .reduce((sum, arr) => sum + arr.length, 0);

      console.log("");
      log(`Persona profile written to ${outPath}`);
      log(`  Patterns: ${patternCount} across 5 categories`);
      log(`  Exemplar quotes: ${profile.exemplarExcerpts.length}`);
      log(`  Source transcripts: ${speakerPresent.length} (where ${TARGET_SPEAKER} speaks)`);
      log(`  Time: ${formatDuration(Date.now() - personaStart)}\n`);
    } catch (err) {
      log(`ERROR: Persona extraction failed: ${err instanceof Error ? err.message : err}\n`);
    }
  }

  // -------------------------------------------------------------------------
  // Stage 3b: Decision Web extraction (ALL transcripts — decisions get quoted)
  // -------------------------------------------------------------------------
  if (runDW) {
    const dwStart = Date.now();
    log(`[Stage 3b] Extracting Decision Web candidates from all ${fetched.length} transcripts...\n`);

    try {
      const existingNodes = loadExistingDWNodes();
      log(`  Loaded ${existingNodes.length} existing DW nodes for deduplication\n`);

      const result = await extractDecisionCandidates(fetched, existingNodes, (msg) => console.log(msg));
      writeOutput(DW_CANDIDATES_OUTPUT, result);

      const newCount = result.candidates.filter((c) => c.status === "new").length;
      const dupCount = result.candidates.filter((c) => c.status === "possible_duplicate").length;

      console.log("");
      log(`DW candidates written to ${DW_CANDIDATES_OUTPUT}`);
      log(`  New candidates: ${newCount}`);
      log(`  Possible duplicates: ${dupCount}`);
      log(`  Time: ${formatDuration(Date.now() - dwStart)}\n`);
    } catch (err) {
      log(`ERROR: Decision extraction failed: ${err instanceof Error ? err.message : err}\n`);
    }
  }

  // -------------------------------------------------------------------------
  // Done
  // -------------------------------------------------------------------------
  console.log("========================================");
  log(`Pipeline complete in ${formatDuration(Date.now() - startTime)}`);
  console.log("========================================\n");

  if (runPersona) {
    console.log(`  Persona profile → ${personaOutputPath(TARGET_SPEAKER)}`);
  }
  if (runDW) {
    console.log(`  DW candidates   → ${DW_CANDIDATES_OUTPUT}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
