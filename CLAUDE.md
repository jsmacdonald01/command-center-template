# Command Center — guide for Claude Code

You are helping someone set up and shape their own **Command Center**: a
Windows desktop app that keeps their lists, money, documents, notes and
calendar on one scrolling screen, with Claude built in.

The person you are working with is probably **not a developer**. Talk in
plain words. If a technical word is unavoidable, say what it means the first
time. When they have to do something themselves (sign up for a service, paste
a key, click a button), give numbered steps: where to click, what to type,
and what they should see when it worked.

---

## If they say "set this up" (first run)

Do these in order. Ask one or two questions at a time, not all at once.

1. **Check the computer.** They need Windows 10 or 11, and Node.js (the LTS
   version). Run `node --version`; if it is missing, walk them through
   installing it from nodejs.org, then continue.
2. **Install the app's parts.** Run `npm install`, then `npm run setup`.
   Both can take a few minutes. `setup` fetches the database engine built
   for this app's version of Electron — skipping it means the app cannot
   open its data.
3. **The pages are already laid out.** It comes ready to use: **Home,
   Finance, Business, Workshop, Log**. Everything starts blank and is filled
   in right on the page — their name (click "(name)" in the greeting), the
   business name (click "(business name)"), bills, clients, links. Empty
   boxes carry a short instruction that disappears once they hold
   something. **They should never need you to add or remove their own
   data, and never need to arrange the layout.** Only if they ask: hide
   a page they don't want (e.g. Business, if they have no business), or add
   one (see *Adding a page* below).
4. **Optionally, a few things about them** for `"about"` in **their own
   file** (see *Their own file*) — short sentences the agent reads, e.g.
   "Nurse, works night shifts", "Saving for a house". Keep it to what they
   offer.
5. **Run it:** `npm start`. It builds the screens and opens the app. On
   first start it also makes their notebook (`Documents\Command Center
   Notes`) from `notebook-starter\` — nothing to do for that.
6. **Go through the add-ons, in this order.** For each: say in one
   sentence what it does and what it costs, ask if they want it, and if
   yes, take them through it start to finish using its guide in
   `docs/integrations/` — **including making any account it needs** (open
   the sign-up page for them, tell them exactly what to click and type,
   and wait while they do it). Install software only after they say yes.
   Never type passwords for them.
   1. **Obsidian** (`obsidian.md`) — free, no account needed. Check whether
      it is installed (`%LOCALAPPDATA%\Programs\Obsidian\Obsidian.exe`). If
      not, offer to install it (`winget install Obsidian.Obsidian`), then
      have them open it once and close it. Restart the app: it adds their
      notebook to Obsidian's list on its own, so Obsidian opens straight
      into it. Then fill in `Handoffs/Next Session.md` together (see *The
      notebook*).
   2. **Claude agent** (`claude.md`, part 1) — needs an Anthropic Console
      account with a little credit; they paste the key in Settings.
   3. **Claude Desktop** (`claude.md`, part 2) — free with their Claude
      account; you can write the config for them.
   4. **Telegram** (`telegram.md`) — needs the Telegram app and an account
      on their phone.
   5. **Google Calendar and Gmail** (`google.md`) — the longest; uses their
      Google account.
   6. **Claude chat on the phone** (`claude-chat.md`) — needs Tailscale (a
      free account).
7. **Install it for real:** `npm run dist` makes an installer in `dist\`.
   Run it. After that they open the app from the Start menu like any other,
   and **new versions arrive on their own** (see *Updates*).

## Their own file — `my-pages.json`

Two files make the layout:

| File | Whose | Updates |
|---|---|---|
| `config/command-center.json` | The template's built-in pages | **Replaced** by every update |
| `%APPDATA%\my-command-center\my-pages.json` | **Theirs** | **Never touched** |

The app makes `my-pages.json` empty on first start and merges the two:

```json
{
  "owner": "Sam",
  "about": ["Works in construction", "Has two dogs"],
  "pages": [ { "id": "car", "title": "Car", "columns": 3, "rows": 2, "widgets": [] } ],
  "hide": ["business"]
}
```

- **`pages`** — their own pages, shown after the built-in ones. A page with
  the **same id** as a built-in one replaces it (it then stops getting
  updates to that page, so do this only when they ask to change a built-in
  page).
- **`hide`** — ids of built-in pages to leave out. Hiding keeps the data;
  taking the id out of `hide` brings the page back as it was.
- **`owner`, `about`, `telegramInbox`** — set here, they win over the
  built-in file.

**Anything for one person goes in their file, never in
`config/command-center.json`** — that file belongs to the template and an
update would wipe their change. If the file has a mistake, the app leaves
their pages out (and says why in its log) rather than failing to open, so
check the JSON is valid after editing.

## Adding a page

Write it in **their own file** (above), then restart the app so it shows —
no rebuild needed, even for the installed app. Design it with them: suggest
the boxes (see *Box types*), describe the plan in plain words, wait for a
yes, then write it — and lay it out yourself, so it looks finished without
them arranging anything. Box ids must be unique across both files.

## Updates

Installed copies check GitHub (`build.publish` in `package.json`) when they
start and every six hours, download a new version in the background, and
show **"A new version is ready — Update now"**. One click closes, installs
and reopens. Settings → **Updates** shows the version and a *Check for
updates* button. Their data folder — database, attachments, keys and
`my-pages.json` — is outside the app, so an update never touches it.

- Updates only reach copies installed from a release. A copy run with
  `npm start` does not check.
- The repo must be **public** for this to work. While it is private, the
  check finds nothing and says so.
- **For whoever maintains the template:** make the change, commit, push,
  then `npm run release` (or `npm run release -- --notes "What changed"`).
  It raises the version number, builds the installer, publishes it as a
  GitHub release with the GitHub CLI (`gh`, signed in), and commits the new
  number. Everyone's app offers it within a few hours.
- **Someone who made their own copy** of the template should point
  `build.publish` at their own repo, or their app will offer the original's
  versions.

---

## The pages it ships with

| Page | Layout | What's on it |
|---|---|---|
| Home | `"layout": "home"` (fixed) | Greeting with their name (click "(name)" to type it) and the sphere that opens the agent · **Workload** (open jobs from the Business page) · To do (next 3 days, from Google) · Month calendar · Weather · Markets · Top stories · an Email button |
| Finance | `"layout": "finance"` (fixed) | Market ticker · links to banks and accounts (paste a website; its logo appears) · Bills with Autopay/Manual on one side · Income and Savings & investments in equal halves on the other |
| Business | `"layout": "business"` (fixed) | The page title is the business name (click to type it) · Company card (logo, type, state issued, EIN) with Clients under it · Jobs · Leads & quotes · Unpaid invoices · Expenses this month · Contracts & paperwork |
| Workshop | grid | Ideas and Long-term goals (equal size) · Notebook (Obsidian) |
| Log | `"layout": "log"` (fixed) | History of every change · Library (search inside every document) · Settings (one row; click a name to open it) |

The four fixed layouts are drawn by `src/layouts/` and always look the
same. Their boxes are still listed in the config so the agent, the library
and Telegram can find them by name — **do not change those ids**:
`bills`, `income`, `savings`, `finance-links`, `business`, `jobs`,
`clients`, `leads`, `invoices`, `expenses`, `business-docs`. Workload on
the Home page reads `jobs`.

**Instructions inside boxes** come from a box's `"hint"` in the config
(or, on fixed pages, from the layout file). They show only while the box
is empty, so they vanish by themselves once it holds something.

---

## How the app is shaped

**The pages** come from `config/command-center.json` plus their own
`my-pages.json` (above). Both use the same shape. Pages without a
`"layout"` are grids of boxes:

```json
{
  "owner": "Sam",
  "about": ["Works in construction", "Has two dogs"],
  "telegramInbox": "work-tasks",
  "pages": [
    {
      "id": "car",
      "title": "Car",
      "columns": 3,
      "rows": 2,
      "widgets": [
        { "id": "car-facts", "type": "facts", "title": "Car",
          "fields": [{ "key": "plate", "label": "Plate" }, { "key": "insurer", "label": "Insurance" }] },
        { "id": "car-repairs", "type": "list", "title": "Repairs", "rowSpan": 2 },
        { "id": "car-docs", "type": "documents", "title": "Papers" }
      ]
    }
  ]
}
```

- **Pages** appear in the order listed, top to bottom. Each is one screen.
- **`columns` and `rows`** set the page's grid. Each box fills one cell by
  default; `colSpan` and `rowSpan` make it wider or taller. Boxes flow left
  to right, top to bottom, and slide into the first gap they fit.
- **Every box needs an `id`** that is unique across the whole file. **Never
  change an `id` once someone has typed into that box** — the id is how
  their data is found. Changing a `title` is always safe.
- `"private": true` on a box keeps it out of what the agent can say over
  Telegram.
- `telegramInbox` names the checklist that Telegram's `/add` writes into
  (default: the first checklist).

### Box types

| type | What it is | Extra settings |
|---|---|---|
| `checklist` | To-dos you tick off; drag to reorder | `placeholder`, `hint` |
| `list` | Records with a date and a note (appointments, goals, contacts) | `dates`, `notes` (true/false), `placeholder`, `hint` |
| `money` | Names with amounts, and a total (bills, income, budget) | `hint` |
| `facts` | A few labelled values (policy number, school, savings goal) | `fields`: `[{ "key", "label", "headline" }]` |
| `notes` | A free-text scratchpad | `placeholder` |
| `documents` | Attached files, searchable inside | `hint` |
| `links` | Quick buttons to websites | `links`: `[{ "name", "url" }]` |
| `coursework` | Graded work with due dates (school calendar link in Settings) | — |
| `calendar` | Today and the next two days (needs Google) | — |
| `month` | A month grid (needs Google) | — |
| `email` | Newest Gmail messages (needs Google) | — |
| `weather` | Today and the week (town set in Settings) | — |
| `news` | Headlines (feeds set in Settings, or defaults) | — |
| `markets` | A few stock indexes | — |
| `vault` | Their Obsidian notebook, read-only | — |
| `library` | Search inside every document in the app | — |
| `log` | History of every change | — |
| `settings` | Keys and connections | — |

In `facts`, the field `key` is the storage name — like an id, do not change
it once filled in. A `headline` field is shown large.

### Adding a new box type

1. Build a component in `src/widgets/` (copy the closest existing one).
2. Add it to the switch in `src/widgets/Widget.jsx`.
3. If it stores rows, it uses the shared `items` table — no database change
   is needed. Rows have `text, note, date, amount, done, name, filePath`.
4. If the agent should understand it, add it to `ROW_TYPES` or the
   overview in `electron/agent/tools/registry.js` and to `buildContext` in
   `electron/services/conversation.js`.
5. Add it to the table above.

---

## Where things live

| What | Where |
|---|---|
| **Their data** — everything typed, attached files, encrypted keys | `%APPDATA%\my-command-center\` |
| Daily backups | `Documents\Command Center Backups\` (optionally also OneDrive) |
| The code | this folder |
| The built-in layout | `config/command-center.json` |
| Their own pages and settings | `%APPDATA%\my-command-center\my-pages.json` |
| The installed app | `%LOCALAPPDATA%\Programs\My Command Center\` |

**Only the data folder is irreplaceable.** Never delete anything in it
without asking. Never move it into OneDrive or Dropbox — sync tools fight
the database's helper files and can corrupt it. The backups are finished
files and are safe to sync.

To rename the app (Start menu name, install folder), change `productName`
in `package.json`. To keep data separate from another copy on the same
computer, also change `name` in `package.json` **and** the matching folder
name in `mcp/mcp-server.js`.

## Rules that matter

- **Never commit their data or secrets.** `.gitignore` already blocks the
  database, backups and `electron/services/google-oauth-client.json`. Check
  `git status` before any commit.
- **Anything that opens the database must run under Electron**, not plain
  `node` — the database engine is built for Electron. For a one-off script:
  `node_modules\electron\dist\electron.exe your-script.js` with
  `ELECTRON_RUN_AS_NODE=1`.
- **Back up before writing to their database from a script.** Copy the
  `.sqlite` file (and any `-wal`/`-shm` beside it) first.
- **The agent proposes; it never writes.** Its write tools only create an
  approval card. Claude Desktop (`mcp/`) can write directly — the owner is
  at the keyboard there. Claude chat (`remote-mcp.js`) gets read tools only.
- **Telegram stays narrow.** It never sees money, facts, documents or
  notes. Do not widen it.
- **Shell here-documents eat backslashes.** Write files with an editor, not
  `cat <<EOF`, whenever they contain `\n`, `\d` or similar.
- **Plain language** in everything the owner reads — on screen and in chat.

## The notebook

On first start the app copies `notebook-starter/` to
`Documents\Command Center Notes` (unless a notebook folder was already
chosen), points the notebook box at it, and — once Obsidian has been opened
at least once — adds it to Obsidian's own notebook list. Nobody has to copy
or open a folder by hand. It never overwrites a note that already exists.

The notebook keeps track of how *their* Command Center works: what was
changed, what was decided, and what is next. **Each Claude Code session
reads `Handoffs/Next Session.md` there first** and updates it when they ask
for a handoff, so the next session starts knowing the history. To use a
different folder they can pick one in Settings → Notebook.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Downloads the parts the app is built from |
| `npm run setup` | Fetches the database engine for Electron (run after install) |
| `npm start` | Builds the screens and opens the app |
| `npm run dev` | Live-reloading version for changing the screens |
| `npm run dist` | Makes an installer in `dist\` |
| `npm run release` | Publishes a new version everyone's app will offer (maintainer only) |
