# Gog Chat

**Talk to your Google Workspace in plain English.**

Gog Chat is a **locally-run** AI assistant that connects to your Gmail, Calendar, Drive, Sheets, Docs, Tasks, and Contacts through natural conversation. Ask it to read your emails, update a spreadsheet, schedule a meeting, or find a file — and it just does it.

Runs on your machine. Your credentials and API keys never leave your computer. Built with [Next.js](https://nextjs.org), [Claude](https://anthropic.com), and the [gog CLI](https://github.com/steipete/gogcli).

<p align="center">
  <img src="docs/screenshots/hero.png" alt="Gog Chat main interface" width="720" />
</p>
<p align="center"><em>The main chat interface with sidebar navigation, service icons, and conversation history.</em></p>

---

## What It Does

| Service | What you can do |
|---------|----------------|
| **Gmail** | Search, read, send, reply, manage labels & drafts |
| **Calendar** | List, create, update, delete events; check availability |
| **Drive** | Browse, search, upload, download files; manage sharing |
| **Sheets** | Read & write cells, export to PDF/CSV/XLSX |
| **Docs** | Export documents to PDF, DOCX, etc. |
| **Slides** | Export presentations to PPTX, PDF |
| **Tasks** | Add, complete, delete tasks across lists |
| **Contacts** | Search, create, update contacts |

### Highlights

- **Conversational interface** — just describe what you need in natural language
- **Streaming responses** — see the AI think and work in real time
- **Quick-search panel** — click any service icon to instantly browse and search your recent files, emails, events, etc.
- **Conversation management** — star, rename, archive, and restore chats
- **Google Drive sync** — conversations are backed up to a `GogChat` folder in your Drive automatically
- **Light & dark mode** — toggle from the sidebar
- **Configurable models** — defaults to Claude Opus 4.6, supports all Claude models + custom model IDs
- **Your API key stays local** — stored in your browser, sent only to Anthropic's API

<p align="center">
  <img src="docs/screenshots/sidebar.png" alt="Sidebar with service icons and conversation list" width="320" />
</p>
<p align="center"><em>Sidebar with starred conversations, service shortcuts, and Drive sync status.</em></p>

<p align="center">
  <img src="docs/screenshots/service-panel.png" alt="Quick-search panel showing recent Google Sheets" width="520" />
</p>
<p align="center"><em>Quick-search panel for browsing and searching your Google Sheets.</em></p>

---

## Prerequisites

> **Note:** Gog Chat is a local application — you run it on your own machine at `localhost:3000`. The gog CLI executes locally to access Google's APIs, so your Google credentials and Anthropic API key stay entirely on your computer.

Before you start, you'll need three things:

1. **Node.js 18+** — [Download here](https://nodejs.org)
2. **gog CLI** — the bridge between the app and Google's APIs
3. **An Anthropic API key** — for Claude ([Get one here](https://console.anthropic.com))

---

## Setup

### Step 1 — Install the gog CLI

```bash
brew install steipete/tap/gogcli
```

> No Homebrew? See the [gog CLI repo](https://github.com/steipete/gogcli) for other install methods.

Verify it's installed:

```bash
gog --version
```

### Step 2 — Create a Google Cloud project & OAuth credentials

This gives gog permission to access your Google Workspace on your behalf. It takes about 5 minutes.

#### 2a. Create a project

1. Go to the [Google Cloud Console](https://console.cloud.google.com)
2. Click the project dropdown at the top → **New Project**
3. Name it something like `Gog Chat` → **Create**
4. Make sure your new project is selected in the dropdown

#### 2b. Enable the APIs

Go to **APIs & Services → Library** and enable each of these (click into each one and hit **Enable**):

- [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
- [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)
- [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
- [Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com)
- [Google Docs API](https://console.cloud.google.com/apis/library/docs.googleapis.com)
- [Google Slides API](https://console.cloud.google.com/apis/library/slides.googleapis.com)
- [Google Tasks API](https://console.cloud.google.com/apis/library/tasks.googleapis.com)
- [People API](https://console.cloud.google.com/apis/library/people.googleapis.com) (for Contacts)

> **Tip:** You can paste each link directly into your browser while your project is selected — it'll take you right to the enable page.

#### 2c. Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** → **Create**
3. Fill in:
   - **App name:** `Gog Chat` (or anything you like)
   - **User support email:** your email
   - **Developer contact email:** your email
4. Click **Save and Continue** through the remaining steps
5. Under **Test users**, add your Google email address

#### 2d. Create OAuth credentials

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. Application type: **Desktop app**
4. Name: `Gog Chat` (or anything)
5. Click **Create**
6. **Download the JSON file** — you'll need it in the next step

### Step 3 — Clone and run Gog Chat

```bash
git clone https://github.com/dsalehipour/Gog-Chat.git
cd Gog-Chat
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Step 4 — Connect your Google account (in-app)

1. Click the **gear icon** in the sidebar to open Settings
2. Under **Google Authorization**, click **Upload credentials JSON** and select the `client_secret_...json` file you downloaded in Step 2d
3. Click **Authorize** — this opens a browser tab where you sign into Google and grant permissions
4. Once authorized, your Google account will appear in Settings automatically

> **Prefer the terminal?** You can also run these commands manually:
> ```bash
> gog auth credentials ~/Downloads/client_secret_....json
> gog auth add your@email.com
> ```

### Step 5 — Add your Anthropic API key

1. Still in Settings, paste your **Anthropic API key**
2. (Optional) Choose a different Claude model
3. Start chatting!

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Settings panel showing gog CLI status, API key, and model selection" width="520" />
</p>
<p align="center"><em>Settings panel — configure your Google account, API key, and Claude model. The gog CLI status is detected automatically.</em></p>

---

## Usage Examples

Here are some things you can say:

| Try saying... | What happens |
|--------------|-------------|
| "Show me my unread emails from today" | Searches Gmail and displays results |
| "Schedule a meeting with Alex tomorrow at 2pm" | Creates a Calendar event |
| "What's in my Q4 Budget spreadsheet?" | Reads the sheet and summarizes it |
| "Update cell D5 in that sheet to 42000" | Writes directly to Sheets |
| "Find all PDFs in my Drive from last month" | Searches Drive with filters |
| "Add 'Buy groceries' to my tasks" | Creates a new Google Task |
| "Send a reply to that email saying I'll be there" | Drafts and sends via Gmail |

### Quick-search panel

Click any service icon in the sidebar (Sheets, Gmail, Calendar, etc.) to open the quick-search panel:

- **Browse** your 20 most recently opened items
- **Type to filter** the loaded results instantly
- **Press Enter** to do a full Google search across that service
- **Click an item** to start a new chat referencing it

---

## Project Structure

```
Gog-Chat/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main app — state, conversations, sync
│   │   ├── layout.tsx            # Root layout + metadata
│   │   ├── globals.css           # Theme variables + Tailwind
│   │   └── api/
│   │       ├── chat/route.ts     # Claude streaming + gog tool execution
│   │       ├── status/route.ts   # gog CLI health check
│   │       ├── services/route.ts # Quick-search: recent items + search
│   │       └── conversations/
│   │           ├── backup/route.ts  # Local file backup
│   │           └── sync/route.ts    # Google Drive sync
│   ├── components/
│   │   ├── ChatInterface.tsx     # Chat area + input + conversation controls
│   │   ├── MessageBubble.tsx     # Message rendering + markdown
│   │   ├── Sidebar.tsx           # Navigation + conversation list
│   │   ├── ServicePanel.tsx      # Quick-search modal
│   │   └── SettingsPanel.tsx     # API key + model config
│   └── lib/
│       ├── gog.ts                # gog CLI wrapper (execFile)
│       ├── tools.ts              # Claude tool definitions + system prompt
│       ├── types.ts              # TypeScript interfaces
│       └── drive-sync.ts         # Drive upload/download/merge logic
├── public/                       # Favicons
├── package.json
├── tsconfig.json
└── next.config.ts
```

---

## How It Works

1. You type a message in the chat
2. The message + conversation history is sent to Claude via the Anthropic API
3. Claude decides which `gog` CLI commands to run (if any) using [tool use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
4. The server executes each `gog` command securely via `child_process.execFile`
5. Results stream back to Claude, which can run more commands or compose a final response
6. Everything streams to the browser in real time via Server-Sent Events

Conversations are saved to `localStorage`, backed up to a local file on the server, and synced to a `GogChat` folder in your Google Drive.

<p align="center">
  <img src="docs/screenshots/drive-syncing.png" alt="Syncing to Drive indicator" width="200" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="docs/screenshots/drive-saved.png" alt="Saved to Drive indicator" width="200" />
</p>
<p align="center"><em>The sidebar shows real-time sync status — syncing in progress (left) and successfully saved (right).</em></p>

---

## Configuration

All settings are accessible from the gear icon in the sidebar:

| Setting | Default | Description |
|---------|---------|-------------|
| **API Key** | — | Your Anthropic API key (required) |
| **Model** | `claude-opus-4-6` | Which Claude model to use |
| **gog Account** | Auto-detected | Which Google account gog uses |
| **Custom Models** | — | Add any model ID (e.g. for new releases) |

---

## Troubleshooting

### "gog not found"
Make sure gog is installed and on your PATH:
```bash
which gog
gog --version
```

### "API access denied" or 403 errors
You probably need to enable the specific Google API. Go back to [Step 2b](#2b-enable-the-apis) and make sure all APIs are enabled for your project.

### "Token expired" or auth errors
Re-authorize gog:
```bash
gog auth add --client-credentials /path/to/client-secret.json
```

### Conversations not syncing to Drive
Make sure the Google Drive API is enabled and gog is authorized. Check the sync indicator in the sidebar — it shows the current sync status.

### Claude responses cut off
Very long conversations may exceed context limits. Start a new conversation for fresh context, or switch to a model with a larger window.

---

## Tech Stack

- **[Next.js 16](https://nextjs.org)** — App Router, API routes, SSE streaming
- **[React 19](https://react.dev)** — UI components
- **[Tailwind CSS v4](https://tailwindcss.com)** — Styling + dark/light themes
- **[Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript)** — Claude API with tool use
- **[gog CLI](https://github.com/steipete/gogcli)** — Google Workspace command-line interface
- **[Lucide React](https://lucide.dev)** — Icons

---

## License

ISC

---

## Contributing

Issues and PRs welcome! If you run into problems or have ideas, [open an issue](https://github.com/dsalehipour/Gog-Chat/issues).
