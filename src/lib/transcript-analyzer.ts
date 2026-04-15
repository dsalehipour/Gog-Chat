import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FetchedTranscript } from "./transcript-fetcher";

const MODEL = "claude-sonnet-4-5";
const BATCH_SIZE = 5;
const MAX_TOKENS = 8192;
const SYNTHESIS_MAX_TOKENS = 8192;
const DELAY_BETWEEN_BATCHES_MS = 1000;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface PersonaProfile {
  version: string;
  generatedAt: string;
  sourceDocCount: number;
  patterns: {
    problemFraming: string[];
    questioningStyle: string[];
    conversationSteering: string[];
    decisionMaking: string[];
    followUpBehavior: string[];
  };
  exemplarExcerpts: Array<{ pattern: string; quote: string; sourceDoc: string }>;
  synthesizedProfile: string;
}

export interface DWCandidateNode {
  id: string;
  title: string;
  category: "business" | "product" | "engineering" | "process";
  statement: string;
  scope: string;
  inputs: string[];
  outputs: string[];
  invariants: string[];
  related_nodes: string[];
  test_expectations: string[];
}

export interface DWCandidate {
  status: "new" | "possible_duplicate";
  confidence: number;
  overlapsWithExisting?: string;
  sourceTranscripts: string[];
  node: DWCandidateNode;
  reasoning: string;
}

export interface DWCandidatesOutput {
  version: string;
  generatedAt: string;
  sourceDocCount: number;
  existingNodeCount: number;
  candidates: DWCandidate[];
}

export interface ExistingDWNode {
  id: string;
  title: string;
  statement: string;
  category?: string;
}

export interface ImprovementArea {
  category: "communication" | "leadership" | "technical" | "process" | "collaboration";
  title: string;
  observation: string;
  evidence: Array<{ quote: string; sourceDoc: string }>;
  suggestion: string;
  frequency: number;
}

export interface ImprovementProfile {
  version: string;
  generatedAt: string;
  sourceDocCount: number;
  speakerName: string;
  areas: ImprovementArea[];
  synthesizedSummary: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is required.\n" +
      "Export it before running: export ANTHROPIC_API_KEY=sk-ant-...",
    );
  }
  return new Anthropic({ apiKey });
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function extractResponseText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function parseJSON<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in LLM response");

  try {
    return JSON.parse(match[0]) as T;
  } catch {
    // Response was likely truncated mid-JSON — attempt repair
    return repairAndParse<T>(match[0]);
  }
}

function repairAndParse<T>(json: string): T {
  let repaired = json;

  // Trim trailing incomplete string values
  repaired = repaired.replace(/,\s*"[^"]*$/, "");
  // Trim trailing incomplete key-value pairs
  repaired = repaired.replace(/,\s*"[^"]*":\s*("[^"]*)?$/, "");
  // Trim trailing incomplete array elements
  repaired = repaired.replace(/,\s*\{[^}]*$/, "");

  // Count unclosed brackets and braces, close them
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;

  repaired += "]".repeat(Math.max(0, openBrackets - closeBrackets));
  repaired += "}".repeat(Math.max(0, openBraces - closeBraces));

  return JSON.parse(repaired) as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


// ---------------------------------------------------------------------------
// Persona extraction prompts
// ---------------------------------------------------------------------------

function buildPersonaMapPrompt(speakerName: string): string {
  return `You are analyzing daily standup meeting transcripts to extract patterns in how "${speakerName}" thinks through problems, drives conversations, and helps his team.

The transcripts use the format "SpeakerName: dialogue text". Focus ONLY on lines spoken by ${speakerName} (look for "${speakerName}:" or similar) and how they interact with others.

Focus on these dimensions:

1. **Problem Framing**: How does ${speakerName} break down or reframe problems? Analogies, first-principles, scope reduction, decomposition?
2. **Questioning Style**: What kinds of questions does he ask? Clarifying, Socratic, boundary-testing, priority-forcing, "what if" scenarios?
3. **Conversation Steering**: How does he redirect conversations? Summarizing, timeboxing, deferring, escalating, refocusing, bridging between people?
4. **Decision Making**: How does he drive toward decisions? Consensus-building, owner-assignment, explicit tradeoff framing, "good enough for now" pragmatism?
5. **Follow-Up Behavior**: How does he track open items? Callbacks to previous discussions, accountability patterns, connecting dots across meetings?

For each pattern you observe, include a DIRECT QUOTE from the transcript as evidence.

Return a JSON object:
{
  "problemFraming": ["pattern description with context"],
  "questioningStyle": ["pattern description with context"],
  "conversationSteering": ["pattern description with context"],
  "decisionMaking": ["pattern description with context"],
  "followUpBehavior": ["pattern description with context"],
  "exemplarExcerpts": [
    { "pattern": "problemFraming", "quote": "exact quote from transcript", "sourceDoc": "doc title" }
  ]
}

Only include patterns backed by evidence. Quality over quantity.
Return ONLY the JSON object, no markdown fences or extra text.`;
}

const PERSONA_REDUCE_PROMPT = `You are synthesizing persona observations extracted from {docCount} daily standup transcripts (across {batchCount} analysis batches) into a definitive behavioral profile of {speakerName} as a conversation leader and problem-solver.

Your tasks:

1. **Merge** similar patterns across batches. If a pattern appears in many batches, it's high-confidence.
2. **Rank** by frequency — patterns seen across many batches are more reliable than one-offs.
3. **Deduplicate** — collapse synonymous observations into canonical descriptions.
4. **Select the best exemplar quotes** — 2-3 per pattern category that most vividly illustrate the behavior.
5. **Write a synthesized profile** — a 2-3 paragraph narrative that captures how {speakerName} operates, written so another system could use it to emulate his style. Be specific and behavioral, not vague.

Return a JSON object:
{
  "patterns": {
    "problemFraming": ["pattern 1 (observed in ~N batches)", "pattern 2"],
    "questioningStyle": ["pattern 1", "pattern 2"],
    "conversationSteering": ["pattern 1"],
    "decisionMaking": ["pattern 1"],
    "followUpBehavior": ["pattern 1"]
  },
  "exemplarExcerpts": [
    { "pattern": "problemFraming", "quote": "exact quote", "sourceDoc": "doc title" }
  ],
  "synthesizedProfile": "2-3 paragraph narrative..."
}

Return ONLY the JSON object, no markdown fences or extra text.`;

// ---------------------------------------------------------------------------
// Decision Web extraction prompts
// ---------------------------------------------------------------------------

const DW_MAP_PROMPT = `You are analyzing daily standup meeting transcripts to extract decisions, principles, and rules that the team discusses or establishes.

A Decision Web node captures a business decision, product principle, engineering constraint, or process rule that code and team behavior must respect.

## What to extract:
- Explicit decisions: "We decided to...", "Going forward we will..."
- Stated principles: "We should always...", "Never do X because..."
- Process rules: "Before deploying...", "Every PR needs..."
- Architecture constraints: "The scraper should...", "Services must..."
- Business rules: "Customers expect...", "Revenue depends on..."

## What to skip:
- Task assignments or status updates
- Vague opinions without actionable content
- Decisions already captured in the existing nodes below

## Existing Decision Web nodes — DO NOT duplicate:
{existingNodeTitles}

Return a JSON object:
{
  "candidates": [
    {
      "title": "Short Imperative Title",
      "category": "engineering | business | product | process",
      "statement": "2-4 sentence explanation of the rule and why it matters.",
      "evidence": ["direct quote from transcript"],
      "sourceDoc": "transcript title",
      "confidence": 0.85
    }
  ]
}

Only include candidates with confidence >= 0.5.
Return ONLY the JSON object, no markdown fences or extra text.`;

const DW_REDUCE_PROMPT = `You are consolidating decision candidates extracted from {docCount} standup transcripts into final Decision Web node candidates.

## Tasks:
1. **Merge duplicates**: Same decision from multiple transcripts → one candidate, all sources listed, higher confidence.
2. **Deduplicate against existing nodes**: Compare each candidate against existing node titles below. Mark overlapping candidates as "possible_duplicate" with the existing node ID.
3. **Format as DW nodes**: Assign sequential IDs starting from DW-{nextId}. Write proper invariants, inputs, outputs, test_expectations, related_nodes (reference existing IDs where relevant).
4. **Filter low quality**: Drop candidates that are too vague, too meeting-specific, or have low confidence after merging.

## Existing Decision Web nodes:
{existingNodeTitles}

## Next available ID: DW-{nextId}

Return a JSON object:
{
  "candidates": [
    {
      "status": "new",
      "confidence": 0.85,
      "sourceTranscripts": ["doc title 1", "doc title 2"],
      "node": {
        "id": "DW-560",
        "title": "Imperative Title",
        "category": "engineering",
        "statement": "2-4 sentences explaining the rule, why it exists, what breaks if violated.",
        "scope": "area this applies to",
        "inputs": ["what feeds into this rule"],
        "outputs": ["what this rule produces or enforces"],
        "invariants": ["hard constraints that must always hold"],
        "related_nodes": ["DW-001"],
        "test_expectations": ["how to verify compliance"]
      },
      "reasoning": "Why this is a new, valuable node"
    },
    {
      "status": "possible_duplicate",
      "confidence": 0.6,
      "overlapsWithExisting": "DW-042",
      "sourceTranscripts": ["doc title"],
      "node": { "id": "DW-561", "title": "...", "category": "...", "statement": "...", "scope": "...", "inputs": [], "outputs": [], "invariants": [], "related_nodes": [], "test_expectations": [] },
      "reasoning": "Similar to DW-042 but adds nuance about X"
    }
  ]
}

Return ONLY the JSON object, no markdown fences or extra text.`;

// ---------------------------------------------------------------------------
// Improvement areas prompts
// ---------------------------------------------------------------------------

function buildImprovementMapPrompt(speakerName: string): string {
  return `You are analyzing daily standup meeting transcripts to identify areas where "${speakerName}" could improve as a communicator, leader, and collaborator.

The transcripts use the format "SpeakerName: dialogue text". Focus ONLY on lines spoken by ${speakerName} and how they interact with others.

Look for patterns that suggest room for growth across these dimensions:

1. **Communication**: Unclear explanations, talking over others, under/over-communicating, not adjusting style to audience, monologuing, not confirming understanding.
2. **Leadership**: Missing opportunities to delegate, not recognizing contributions, over-indexing on own ideas, not creating space for quieter voices, inconsistent follow-through on commitments.
3. **Technical**: Over-engineering solutions in discussion, jumping to implementation before understanding the problem, not asking enough clarifying questions about edge cases, dismissing simpler approaches.
4. **Process**: Letting meetings run long, not driving toward action items, revisiting already-decided topics, skipping retrospective thinking, not documenting decisions.
5. **Collaboration**: Not building on others' ideas, dominating the conversation, being dismissive of concerns, not acknowledging trade-offs raised by others, not asking for input from specific people.

Be constructive and specific — back every observation with DIRECT QUOTES from the transcript. Only flag real patterns, not one-off moments. If ${speakerName} is doing well in a dimension, say so briefly and move on.

Return a JSON object:
{
  "observations": [
    {
      "category": "communication | leadership | technical | process | collaboration",
      "title": "Short descriptive title",
      "observation": "What the pattern is and why it matters",
      "evidence": [
        { "quote": "exact quote from transcript", "sourceDoc": "doc title" }
      ],
      "suggestion": "Concrete, actionable suggestion for improvement"
    }
  ]
}

Only include observations backed by evidence. Be honest but constructive.
Return ONLY the JSON object, no markdown fences or extra text.`;
}

const IMPROVEMENT_REDUCE_PROMPT = `You are synthesizing improvement observations extracted from {docCount} daily standup transcripts (across {batchCount} analysis batches) into an actionable growth profile for {speakerName}.

Your tasks:

1. **Merge** similar observations across batches. If the same pattern appears in many batches, it's a real habit worth addressing.
2. **Rank** by impact and frequency — patterns seen across many batches and that affect team dynamics most should rank highest.
3. **Deduplicate** — collapse synonymous observations into canonical descriptions.
4. **Select the best evidence quotes** — 1-2 per area that most clearly illustrate the pattern.
5. **Filter out noise** — drop observations that are one-off or too minor to act on.
6. **Write a synthesized summary** — a 2-3 paragraph narrative that captures the key growth areas, framed constructively. Acknowledge strengths where relevant. Be direct but not harsh.

Return a JSON object:
{
  "areas": [
    {
      "category": "communication | leadership | technical | process | collaboration",
      "title": "Short descriptive title",
      "observation": "What the pattern is and why it matters",
      "evidence": [
        { "quote": "exact quote", "sourceDoc": "doc title" }
      ],
      "suggestion": "Concrete, actionable suggestion",
      "frequency": 0.7
    }
  ],
  "synthesizedSummary": "2-3 paragraph constructive narrative..."
}

The "frequency" field is a 0-1 score indicating how often this pattern appeared across batches (1.0 = every batch).

Return ONLY the JSON object, no markdown fences or extra text.`;

// ---------------------------------------------------------------------------
// Persona extraction
// ---------------------------------------------------------------------------

interface PersonaObservation {
  problemFraming: string[];
  questioningStyle: string[];
  conversationSteering: string[];
  decisionMaking: string[];
  followUpBehavior: string[];
  exemplarExcerpts: Array<{ pattern: string; quote: string; sourceDoc: string }>;
}

export async function extractPersonaPatterns(
  transcripts: FetchedTranscript[],
  onProgress?: (msg: string) => void,
  speakerName: string = "Darius Salehipour",
): Promise<PersonaProfile> {
  const client = createClient();
  const batches = chunkArray(transcripts, BATCH_SIZE);
  const observations: PersonaObservation[] = [];
  const mapPrompt = buildPersonaMapPrompt(speakerName);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    onProgress?.(`  [persona pass 1] Batch ${i + 1}/${batches.length} (${batch.length} transcripts)`);

    const transcriptBlock = batch
      .map((t) => `--- TRANSCRIPT: "${t.title}" ---\n${t.text}`)
      .join("\n\n");

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: "user", content: `${mapPrompt}\n\n${transcriptBlock}` },
        ],
      });

      const obs = parseJSON<PersonaObservation>(extractResponseText(response));
      observations.push(obs);
    } catch (err) {
      onProgress?.(`  [WARN] Batch ${i + 1} failed: ${err instanceof Error ? err.message : err}`);
    }

    if (i < batches.length - 1) await delay(DELAY_BETWEEN_BATCHES_MS);
  }

  if (observations.length === 0) {
    throw new Error("No persona observations extracted from any batch");
  }

  onProgress?.(`  [persona pass 2] Synthesizing ${observations.length} batch observations...`);

  const observationsSummary = observations
    .map((o, idx) => `--- BATCH ${idx + 1} ---\n${JSON.stringify(o, null, 2)}`)
    .join("\n\n");

  const prompt = PERSONA_REDUCE_PROMPT
    .replace("{docCount}", String(transcripts.length))
    .replace("{batchCount}", String(batches.length))
    .replace(/\{speakerName\}/g, speakerName);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: SYNTHESIS_MAX_TOKENS,
    messages: [{ role: "user", content: `${prompt}\n\n${observationsSummary}` }],
  });

  const synthesis = parseJSON<{
    patterns: PersonaProfile["patterns"];
    exemplarExcerpts: PersonaProfile["exemplarExcerpts"];
    synthesizedProfile: string;
  }>(extractResponseText(response));

  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    sourceDocCount: transcripts.length,
    patterns: synthesis.patterns,
    exemplarExcerpts: synthesis.exemplarExcerpts,
    synthesizedProfile: synthesis.synthesizedProfile,
  };
}

// ---------------------------------------------------------------------------
// Decision Web extraction
// ---------------------------------------------------------------------------

interface RawDWCandidate {
  title: string;
  category: string;
  statement: string;
  evidence: string[];
  sourceDoc: string;
  confidence: number;
}

export async function extractDecisionCandidates(
  transcripts: FetchedTranscript[],
  existingNodes: ExistingDWNode[],
  onProgress?: (msg: string) => void,
): Promise<DWCandidatesOutput> {
  const client = createClient();
  const cacheFile = join(process.cwd(), ".transcripts-cache", "_dw-raw-candidates.json");
  let allRawCandidates: RawDWCandidate[] = [];

  const existingTitles = existingNodes
    .map((n) => `- ${n.id} [${n.category || "engineering"}]: ${n.title}`)
    .join("\n");

  // Reuse cached Pass 1 results if available
  if (existsSync(cacheFile)) {
    allRawCandidates = JSON.parse(readFileSync(cacheFile, "utf-8")) as RawDWCandidate[];
    onProgress?.(`  [dw pass 1] Loaded ${allRawCandidates.length} cached raw candidates — skipping Pass 1`);
  } else {
    const batches = chunkArray(transcripts, BATCH_SIZE);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      onProgress?.(`  [dw pass 1] Batch ${i + 1}/${batches.length} (${batch.length} transcripts)`);

      const transcriptBlock = batch
        .map((t) => `--- TRANSCRIPT: "${t.title}" ---\n${t.text}`)
        .join("\n\n");

      const prompt = DW_MAP_PROMPT.replace("{existingNodeTitles}", existingTitles);

      try {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          messages: [
            { role: "user", content: `${prompt}\n\n${transcriptBlock}` },
          ],
        });

        const parsed = parseJSON<{ candidates: RawDWCandidate[] }>(extractResponseText(response));
        allRawCandidates.push(...(parsed.candidates || []));
      } catch (err) {
        onProgress?.(`  [WARN] Batch ${i + 1} failed: ${err instanceof Error ? err.message : err}`);
      }

      if (i < batches.length - 1) await delay(DELAY_BETWEEN_BATCHES_MS);
    }

    // Cache raw candidates for reuse
    if (allRawCandidates.length > 0) {
      writeFileSync(cacheFile, JSON.stringify(allRawCandidates, null, 2), "utf-8");
      onProgress?.(`  [dw pass 1] Cached ${allRawCandidates.length} raw candidates`);
    }
  }

  if (allRawCandidates.length === 0) {
    onProgress?.("  No decision candidates found in any batch");
    return {
      version: "1.0",
      generatedAt: new Date().toISOString(),
      sourceDocCount: transcripts.length,
      existingNodeCount: existingNodes.length,
      candidates: [],
    };
  }

  const maxId = Math.max(
    0,
    ...existingNodes.map((n) => parseInt(n.id.replace("DW-", ""), 10) || 0),
  );
  let runningNextId = maxId + 1;

  // Chunk the reduce pass — 50 raw candidates per call to avoid truncation
  const REDUCE_CHUNK_SIZE = 50;
  const reduceChunks = chunkArray(allRawCandidates, REDUCE_CHUNK_SIZE);
  const allConsolidated: DWCandidate[] = [];

  onProgress?.(`  [dw pass 2] Consolidating ${allRawCandidates.length} raw candidates in ${reduceChunks.length} chunks...`);

  for (let i = 0; i < reduceChunks.length; i++) {
    const chunk = reduceChunks[i];
    onProgress?.(`  [dw pass 2] Chunk ${i + 1}/${reduceChunks.length} (${chunk.length} candidates)`);

    const nextIdStr = String(runningNextId).padStart(3, "0");

    const rawSummary = chunk
      .map((c, idx) => `--- RAW CANDIDATE ${idx + 1} ---\n${JSON.stringify(c, null, 2)}`)
      .join("\n\n");

    const prompt = DW_REDUCE_PROMPT
      .replace("{docCount}", String(transcripts.length))
      .replace("{existingNodeTitles}", existingTitles)
      .replace(/\{nextId\}/g, nextIdStr);

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: SYNTHESIS_MAX_TOKENS,
        messages: [{ role: "user", content: `${prompt}\n\n${rawSummary}` }],
      });

      const synthesis = parseJSON<{ candidates: DWCandidate[] }>(extractResponseText(response));
      const candidates = synthesis.candidates || [];
      allConsolidated.push(...candidates);
      runningNextId += candidates.filter((c) => c.status === "new").length;
    } catch (err) {
      onProgress?.(`  [WARN] Reduce chunk ${i + 1} failed: ${err instanceof Error ? err.message : err}`);
    }

    if (i < reduceChunks.length - 1) await delay(DELAY_BETWEEN_BATCHES_MS);
  }

  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    sourceDocCount: transcripts.length,
    existingNodeCount: existingNodes.length,
    candidates: allConsolidated,
  };
}

// ---------------------------------------------------------------------------
// Improvement areas extraction
// ---------------------------------------------------------------------------

interface RawImprovementObservation {
  category: string;
  title: string;
  observation: string;
  evidence: Array<{ quote: string; sourceDoc: string }>;
  suggestion: string;
}

export async function extractImprovementAreas(
  transcripts: FetchedTranscript[],
  onProgress?: (msg: string) => void,
  speakerName: string = "Darius Salehipour",
): Promise<ImprovementProfile> {
  const client = createClient();
  const batches = chunkArray(transcripts, BATCH_SIZE);
  const allObservations: RawImprovementObservation[][] = [];
  const mapPrompt = buildImprovementMapPrompt(speakerName);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    onProgress?.(`  [improvements pass 1] Batch ${i + 1}/${batches.length} (${batch.length} transcripts)`);

    const transcriptBlock = batch
      .map((t) => `--- TRANSCRIPT: "${t.title}" ---\n${t.text}`)
      .join("\n\n");

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: "user", content: `${mapPrompt}\n\n${transcriptBlock}` },
        ],
      });

      const parsed = parseJSON<{ observations: RawImprovementObservation[] }>(
        extractResponseText(response),
      );
      allObservations.push(parsed.observations || []);
    } catch (err) {
      onProgress?.(`  [WARN] Batch ${i + 1} failed: ${err instanceof Error ? err.message : err}`);
    }

    if (i < batches.length - 1) await delay(DELAY_BETWEEN_BATCHES_MS);
  }

  if (allObservations.length === 0) {
    throw new Error("No improvement observations extracted from any batch");
  }

  onProgress?.(`  [improvements pass 2] Synthesizing ${allObservations.length} batch observations...`);

  const observationsSummary = allObservations
    .map((obs, idx) => `--- BATCH ${idx + 1} ---\n${JSON.stringify(obs, null, 2)}`)
    .join("\n\n");

  const prompt = IMPROVEMENT_REDUCE_PROMPT
    .replace("{docCount}", String(transcripts.length))
    .replace("{batchCount}", String(batches.length))
    .replace("{speakerName}", speakerName);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: SYNTHESIS_MAX_TOKENS,
    messages: [{ role: "user", content: `${prompt}\n\n${observationsSummary}` }],
  });

  const synthesis = parseJSON<{
    areas: ImprovementArea[];
    synthesizedSummary: string;
  }>(extractResponseText(response));

  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    sourceDocCount: transcripts.length,
    speakerName,
    areas: synthesis.areas,
    synthesizedSummary: synthesis.synthesizedSummary,
  };
}
