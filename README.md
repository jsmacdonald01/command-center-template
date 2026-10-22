# Command Center

A personal dashboard for Windows. Your to-dos, money, documents, notes,
calendar and email on one scrolling screen — with Claude built in, so you
can ask questions about your own stuff and get real answers.

It comes ready to use. Home, Finance, Business, Workshop and Log are already
laid out, and every box tells you what goes in it. You just type in your own
information. Nothing to arrange.

If you want more, you can add your own pages: a "Car" page with the plate
number, insurance papers and an oil-change list, or a "School" page with
classes and assignments. Just ask Claude Code.

## What it can do

- **Pages and boxes you choose** — checklists, lists, money with totals,
  labelled facts, notes, documents, quick links, weather, headlines.
- **Documents you can search inside.** Attach a PDF and find it later by a
  word printed on it — even scans, read by Windows itself.
- **Claude, inside the app** (optional). Ask "what bills are due this week?"
  It can prepare changes, but nothing happens until you click Approve.
- **Claude on your phone** (optional). Let Claude's website and app read your
  dashboard, read-only.
- **A morning text** (optional). A free daily brief to your phone through
  Telegram, and a way to add to your list from anywhere.
- **Google Calendar and Gmail** (optional).
- **Obsidian notes** (optional), shown right on a page.
- **Daily backups**, to your Documents folder and, if you want, OneDrive.
- **Updates on their own.** When a new version comes out, the app says so
  and installs it with one click. Your information and your own pages are
  kept separately, so nothing is lost.

Your information stays on your computer. Nothing is uploaded unless you turn
on an add-on that needs it, and each one says what it shares.

## Getting started

The easiest way is to let Claude Code do it with you.

1. Install **Claude Code** (claude.com/claude-code) if you don't have it.
2. Download this project: on this page click the green **Code** button,
   then **Download ZIP**, and unzip it somewhere like `Documents\Command Center`.
   (Or use `git clone` if you know how.)
3. Open that folder in Claude Code.
4. Type: **"Set up my Command Center."**

Claude will check your computer, install what's needed, build it, and walk
you through any add-ons — one step at a time, in plain words.

After that you only type in your own information. If you ever want a page
of your own, ask: *"Add a page for my car with a list of repairs and a box
for the insurance papers."* Your own pages are kept separately and stay
when the app updates.

## What you need

- Windows 10 or 11
- Node.js (Claude Code will help you install it)
- For the add-ons: a free Telegram account, a Google account, and a Claude
  account with an API key — only for the ones you choose.

## For the curious

Built with Electron, React and SQLite. The layout is one file,
`config/command-center.json`. See `CLAUDE.md` for how everything fits
together.
