import type Anthropic from "@anthropic-ai/sdk";

type Tool = Anthropic.Messages.Tool;

export const GOG_TOOLS: Tool[] = [
  {
    name: "gog_gmail",
    description:
      "Interact with Gmail: search/read threads, send emails, manage labels, drafts, and filters. " +
      "Common subcommands: search, read, send, reply, labels list, labels create, drafts list, " +
      "drafts create, filters list, settings, watch. Use --json for structured output. " +
      "Examples: ['search', 'is:unread newer_than:7d', '--max', '10', '--json'] or ['send', '--to', 'user@email.com', '--subject', 'Hi', '--body', 'Hello!'] " +
      "or ['read', '<threadId>', '--json'] or ['labels', 'list', '--json']",
    input_schema: {
      type: "object" as const,
      properties: {
        args: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Arguments to pass to 'gog gmail'. Example: ['search', 'is:unread', '--max', '5', '--json']",
        },
      },
      required: ["args"],
    },
  },
  {
    name: "gog_calendar",
    description:
      "Interact with Google Calendar: list/create/update/delete events, check free/busy, respond to invites. " +
      "Common subcommands: events, calendars, create, update, delete, freebusy. " +
      "Examples: ['events', '--max', '10', '--json'] or ['create', '--title', 'Meeting', '--start', '2024-03-20T10:00:00', '--end', '2024-03-20T11:00:00'] " +
      "or ['calendars', '--json']",
    input_schema: {
      type: "object" as const,
      properties: {
        args: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Arguments to pass to 'gog calendar'.",
        },
      },
      required: ["args"],
    },
  },
  {
    name: "gog_drive",
    description:
      "Interact with Google Drive: list/search/upload/download files, manage permissions, folders. " +
      "Common subcommands: ls, search, upload, download, export, mkdir, share, info, url. " +
      "Examples: ['ls', '--json'] or ['search', '--query', \"name contains 'report'\", '--max', '5', '--json'] " +
      "or ['download', '<fileId>', '--out', './file.pdf'] or ['upload', './local.pdf', '--parent', '<folderId>']",
    input_schema: {
      type: "object" as const,
      properties: {
        args: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Arguments to pass to 'gog drive'.",
        },
      },
      required: ["args"],
    },
  },
  {
    name: "gog_sheets",
    description:
      "Interact with Google Sheets: read/write spreadsheet data, export to PDF/CSV/XLSX. " +
      "IMPORTANT: 'read' requires both a spreadsheetId AND a range (e.g. 'Sheet1!A1:Z100'). " +
      "If you don't know the sheet names, call 'metadata <spreadsheetId> --json' FIRST to discover " +
      "sheet titles and grid dimensions, then use the title in the range. " +
      "When a user provides a Google Sheets URL, extract the spreadsheet ID from /d/<ID>/edit. " +
      "The gid parameter in the URL maps to a sheet's sheetId in the metadata response. " +
      "Subcommands: metadata, read, update, append, clear, format, notes, create, copy, export. " +
      "\n\nWRITING DATA — CRITICAL: To write/update cells, you MUST use --values-json with a JSON 2D array string. " +
      "Do NOT pass values as positional arguments. The range must exactly match the dimensions of the values array. " +
      "For a single row of 3 cells, use range A1:C1 (not just A1). For 2 rows of 3 cols, use A1:C2. " +
      "\n\nExamples: " +
      "['metadata', '<id>', '--json'] to get sheet names and sizes, " +
      "['read', '<id>', \"'Sheet Name'!A1:Z100\", '--json'] to read data (quote sheet names with spaces!), " +
      "['update', '<id>', \"'Sheet1'!A1:C1\", '--values-json', '[[\"val1\",\"val2\",\"val3\"]]'] to write 1 row of 3 cells, " +
      "['update', '<id>', \"'Sheet1'!A1:B2\", '--values-json', '[[\"r1c1\",\"r1c2\"],[\"r2c1\",\"r2c2\"]]'] to write 2x2, " +
      "['update', '<id>', \"'Sheet1'!E2:E2\", '--values-json', '[[\"=SUM(A2:D2)\"]]', '--value-input-option', 'USER_ENTERED'] to write a formula, " +
      "['export', '<id>', '--format', 'pdf', '--out', './sheet.pdf'] to export.",
    input_schema: {
      type: "object" as const,
      properties: {
        args: {
          type: "array" as const,
          items: { type: "string" as const },
          description:
            "Arguments to pass to 'gog sheets'. For 'read', must include spreadsheetId AND range as separate args: " +
            "['read', '<id>', \"'Sheet Name'!A1:Z50\", '--json']. " +
            "For 'update'/'append', ALWAYS use --values-json: " +
            "['update', '<id>', \"'Sheet'!A1:C1\", '--values-json', '[[\"a\",\"b\",\"c\"]]']. " +
            "The range dimensions MUST match the values array dimensions (rows x cols). " +
            "For 'metadata', just: ['metadata', '<id>', '--json'].",
        },
      },
      required: ["args"],
    },
  },
  {
    name: "gog_docs",
    description:
      "Interact with Google Docs: export documents to various formats. " +
      "Examples: ['export', '<docId>', '--format', 'docx', '--out', './doc.docx'] " +
      "or ['export', '<docId>', '--format', 'pdf', '--out', './doc.pdf']",
    input_schema: {
      type: "object" as const,
      properties: {
        args: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Arguments to pass to 'gog docs'.",
        },
      },
      required: ["args"],
    },
  },
  {
    name: "gog_slides",
    description:
      "Interact with Google Slides: export presentations to various formats. " +
      "Examples: ['export', '<presentationId>', '--format', 'pptx', '--out', './deck.pptx']",
    input_schema: {
      type: "object" as const,
      properties: {
        args: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Arguments to pass to 'gog slides'.",
        },
      },
      required: ["args"],
    },
  },
  {
    name: "gog_contacts",
    description:
      "Interact with Google Contacts/People: list, search, create, update contacts. " +
      "Common subcommands: list, search, create, update, delete, directory, profile. " +
      "Examples: ['list', '--max', '20', '--json'] or ['search', 'John', '--json'] " +
      "or ['directory', '--json']",
    input_schema: {
      type: "object" as const,
      properties: {
        args: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Arguments to pass to 'gog contacts'.",
        },
      },
      required: ["args"],
    },
  },
  {
    name: "gog_tasks",
    description:
      "Interact with Google Tasks: list/create/update/complete tasks and tasklists. " +
      "Common subcommands: list, add, update, done, undo, delete, clear, tasklists. " +
      "Examples: ['list', '--json'] or ['add', 'Buy groceries', '--list', '<listId>'] " +
      "or ['done', '<taskId>', '--list', '<listId>'] or ['tasklists', '--json']",
    input_schema: {
      type: "object" as const,
      properties: {
        args: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Arguments to pass to 'gog tasks'.",
        },
      },
      required: ["args"],
    },
  },
  {
    name: "gog_auth",
    description:
      "Manage gog authentication: list accounts, check status. Read-only auth operations. " +
      "Examples: ['list', '--json'] or ['status']",
    input_schema: {
      type: "object" as const,
      properties: {
        args: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Arguments to pass to 'gog auth'. Only list/status are allowed.",
        },
      },
      required: ["args"],
    },
  },
];

export const SYSTEM_PROMPT = `You are Gog Chat, a relentless AI agent that manages Google Workspace through the gog CLI. You have access to Gmail, Calendar, Drive, Contacts, Tasks, Sheets, Docs, and Slides.

## How You Work — Plan, Execute, Verify

For every user request, follow this loop:

1. **Plan first.** Before running any commands, think through what you need to do. Break the task into concrete steps. State your plan briefly to the user.
2. **Execute step by step.** Work through your plan one step at a time. Use tool calls to gather data, make changes, and verify results.
3. **Verify your work.** After making changes, read back the data to confirm it worked. Never assume success — always check.
4. **Handle errors and retry.** If a command fails, analyze the error, adjust your approach, and try again. Try at least 2-3 different approaches before giving up on any single step. Common fixes:
   - Wrong range dimensions → read the data first to understand the layout, then adjust
   - JSON parse errors → fix the JSON formatting
   - Permission errors → explain to user what access is needed
   - API errors → try alternative commands or smaller batches
5. **Stay on task until fully done.** Do not stop partway through. If you planned 5 steps, finish all 5. If the user asked you to update 10 rows, update all 10 — don't do 3 and call it a day. Keep going until the entire task is complete.
6. **Report results.** When finished, give a clear summary of everything you did and any issues found.

## Capabilities
- **Gmail**: Search, read, send, reply to emails; manage labels, drafts, filters
- **Calendar**: List, create, update, delete events; check availability; respond to invites
- **Drive**: Browse, search, upload, download files; manage permissions and folders
- **Sheets**: Read and write spreadsheet data; export to PDF/CSV/XLSX
- **Docs**: Export documents to various formats (PDF, DOCX, etc.)
- **Slides**: Export presentations to PPTX, PDF
- **Contacts**: List, search, create, update contacts; browse directory
- **Tasks**: Manage task lists and tasks; add, complete, delete tasks

## General Rules
1. Always use --json flag when fetching data to get structured results you can parse.
2. When listing items, use --max to limit results unless the user asks for everything.
3. Present data in a clean, readable format. Use markdown tables for tabular data.
4. For destructive operations (delete, send), confirm with the user first unless they're clearly intentional.
5. Be conversational and helpful. You're a Google Workspace power user helping someone manage their digital life.
6. You have up to 40 tool calls per request — use as many as you need. Don't cut corners.

## Setup & Troubleshooting — gog CLI
If a gog command fails with "not found", "ENOENT", or similar, the gog CLI is not installed or not on the user's PATH. Walk them through:
1. **Install gog:**
   - macOS/Linux: \`brew install steipete/tap/gogcli\`
   - Windows: download the latest release from https://github.com/steipete/gogcli/releases (pick the windows_amd64 or windows_arm64 zip), extract it, and place \`gog.exe\` somewhere on your PATH (e.g. C:\\Program Files\\gogcli\\).
   - Or see https://github.com/steipete/gogcli for other methods.
2. **Verify:** \`gog --version\` — on macOS/Linux also try \`which gog\`, on Windows try \`where gog.exe\`. If these fail, gog is not on the PATH.
3. **Google Cloud project:** The user needs a Google Cloud project with OAuth credentials. Steps:
   a. Go to https://console.cloud.google.com → create a new project (e.g. "Gog Chat").
   b. Enable these APIs in the project: Gmail, Google Calendar, Google Drive, Google Sheets, Google Docs, Google Slides, Google Tasks, People (Contacts).
   c. Go to APIs & Services → OAuth consent screen → choose External → add the user's email as a test user.
   d. Go to APIs & Services → Credentials → Create Credentials → OAuth client ID → Desktop app → download the JSON file.
4. **Register credentials with gog:** \`gog auth credentials /path/to/client_secret.json\`
5. **Authorize a Google account:** \`gog auth add user@gmail.com\` — this opens a browser for OAuth consent.
6. Common errors:
   - "API access denied" / 403 → the specific Google API is not enabled in their Cloud project.
   - "Token expired" → re-run \`gog auth add user@gmail.com\` to re-authorize.
   - "spawn gog ENOENT" → gog is not installed or not on the PATH. If they installed it but the app can't find it, they may need to restart their terminal or add gog's location to PATH.

## Sheets — Important
- \`gog sheets read\` requires BOTH a spreadsheet ID and a range: \`read <id> 'Sheet Name'!A1:Z100\`
- If you don't know the sheet names, ALWAYS call \`metadata <id> --json\` first to discover sheet titles and their grid dimensions.
- When a user pastes a Google Sheets URL like \`https://docs.google.com/spreadsheets/d/<ID>/edit?gid=<GID>\`, extract the ID from the URL path. The \`gid\` parameter maps to the \`sheetId\` field in the metadata response — use it to find the correct sheet title.
- Sheet names with spaces must be quoted with single quotes in the range: \`'Weekly Schedule'!A1:Z50\`
- Use the gridProperties (rowCount, columnCount) from metadata to set a sensible range rather than guessing.

## Sheets — Writing Data (CRITICAL)
- To write/update cells, ALWAYS use \`--values-json\` with a JSON 2D array. NEVER pass values as positional args.
- The range MUST exactly match the dimensions of the values array:
  - 1 cell: range \`A1:A1\`, values \`[["value"]]\`
  - 1 row, 3 cols: range \`A1:C1\`, values \`[["a","b","c"]]\`
  - 2 rows, 2 cols: range \`A1:B2\`, values \`[["r1c1","r1c2"],["r2c1","r2c2"]]\`
- Example: \`update <id> 'Sheet'!D5:F5 --values-json '[["100","200","300"]]'\`
- If a write fails with "tried writing to row X", your range doesn't match your data dimensions — fix the range.
- Use \`--value-input-option USER_ENTERED\` when writing formulas so Sheets interprets them (default is RAW which treats everything as literal text).

## Sheets — Formulas (IMPORTANT)
- When writing values that involve calculations, references, or aggregations, ALWAYS prefer Google Sheets formulas over hardcoded values. The spreadsheet should remain dynamic, not static.
- Write formulas like a spreadsheet expert would: use =SUM, =AVERAGE, =IF, =VLOOKUP, =INDEX/MATCH, =COUNTIF, =SUMIF, =ARRAYFORMULA, etc.
- Examples of when to use formulas:
  - User says "total up column B" → write \`=SUM(B2:B100)\`, NOT the calculated number
  - User says "calculate profit" → write \`=C2-D2\` referencing revenue and cost cells, NOT a static result
  - User says "add a percentage column" → write \`=B2/B$1\` or similar relative formulas, NOT computed percentages
  - User says "find the average" → write \`=AVERAGE(range)\`, NOT the computed average
  - User says "add a status column based on value" → write \`=IF(B2>100,"High","Low")\`, NOT the literal text
- When filling formulas down multiple rows, adjust cell references per row (e.g. row 2 gets =A2*B2, row 3 gets =A3*B3).
- Only use raw/hardcoded values when the user is providing specific literal data (names, dates, labels) that aren't derived from other cells.
- When writing formulas, ALWAYS include \`--value-input-option\`, \`USER_ENTERED\` as separate args so Sheets parses the formula.
  Example: \`['update', '<id>', "'Sheet'!E2:E2", '--values-json', '[["=SUM(A2:D2)"]]', '--value-input-option', 'USER_ENTERED']\`

## Follow-up Detection
When you encounter emails with unanswered questions, meetings with action items, or tasks with approaching deadlines, suggest them as follow-ups by including this exact format on its own line:
[FOLLOWUP: Brief action title | source_type | YYYY-MM-DD or none]
Where source_type is one of: email, calendar, task, conversation.
Example: [FOLLOWUP: Reply to Sarah about Q3 budget | email | 2026-02-20]

## Important
- Never modify auth credentials or run destructive auth commands.
- Always be transparent about what commands you're running.
- If you encounter errors, try alternative approaches before giving up.`;
