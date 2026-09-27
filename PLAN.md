# Verse Graph plugin — first version plan

Sep 26, 2026 · @Wesley

A new Obsidian plugin, separate from Scripture Thread, that draws the web app's Graph screen inside Obsidian: Testament → Book → Chapter → Verse, then a column of the notes that cite each verse. The first version runs on a computer only, has no filters, and takes about 3 sessions. Its job is to show whether you actually use the graph before the phone and filter work is paid for.

## Scope

The first version draws the tree, lets you select, and opens notes. Anything that only makes it nicer waits until you've used it for a couple of weeks.

| Feature | First version? | Why |
| --- | --- | --- |
| Testament → Book → Chapter → Verse tree, only what you've cited | Yes | It's the whole point |
| Books start closed; click to open a book or chapter; Expand and Collapse one level at a time | Yes | A real vault is too tall otherwise; the app learned this on the preview |
| Notes column, newest first, with a line from each verse to each note | Yes | The "what did I write" half |
| Select a verse (lights its notes) or a note (lights its verses) | Yes | Reuses the app's lit-path logic unchanged |
| Click a note to select it and open item 8.5's read-only panel, with Open note; hover it for Obsidian's own preview | Yes | Changed in session 2: the panel is kept, drawn with Obsidian's `MarkdownRenderer`. It reads only the one chosen note |
| Pan by dragging, Shift + scroll to zoom, − / + / Fit buttons | Yes | The minimum to get around a big tree |
| Updates when a note changes | Yes | Otherwise it goes stale after one edit |
| Command "Open verse graph" and a ribbon icon | Yes | How Obsidian plugins are opened |
| Filters (books, reference, dates, tags) | No | 1–2 sessions; wait to see if they're missed |
| Phone and tablet (pinch, flick, touch gestures) | No | The riskiest part; the plugin is marked desktop-only until then |
| Slide animations and eased selection | Yes, since session 3 | You asked for them: without them you couldn't tell where things went. Flick glide waits for phone support, since it is for a finger |
| Keyboard walking of the tree, and `+` `-` `0` `C` | Yes, since session 3 | The app's `graph-key-rules.ts`, copied |
| Replay over time (item 8.3) | No | Not built in the app either |
| Settings tab | No | Nothing needs setting yet |

## Where the data comes from

The plugin reads the links Obsidian already keeps in memory (`metadataCache.resolvedLinks`). It never opens a note's text, so building the graph costs milliseconds even on a large vault.

That list isn't something a plugin fills. It's Obsidian's own index of every link in every note, built from the notes themselves, so it already holds every link written before this plugin existed: Scripture Thread's conversions, the old script's vaults, and links typed by hand. Scripture Thread's verse context panel reads the same list today (`src/context/find-mentions.ts`). Plain-text references that were never converted aren't in it, which is why converting stays Scripture Thread's job.

- **A verse is a link to a note whose name is one Bible reference**, the names Scripture Thread writes: `Psalms 23 1`, `John 3 16-18`, `Psalms 23`, `Matthew 5-7`. Scripture Thread's own `parseBibleLink` decides this, so both plugins agree on what a reference is.
- **A verse node is keyed by the verses it names, not by the note's path.** Two `John 3 16.md` files in different folders, or an unconverted `[[Jn 3 16]]` beside a real `John 3 16.md`, are one node. `parseBibleLink` gives the verse keys to group on, and two links are the same verse when `samePassage` says so.
- **Ranges are exact, which is better than the app.** `John 3 16-18` is one node because the note name says so; the web app has to guess ranges from the database (`v3/decisions/8.1-graph-view-spike.md`).
- **A whole chapter (`Psalms 23`) is a node in the Verse column**, as in the app. A chapter range (`Matthew 5-7`) becomes three chapters, as in the app.
- **A link to a book or testament note (`Psalms`, `Old Testament`) is not a citation**, as in the app, which has no book-level node.
- **An entry is any note that links to at least one verse**, not counting the parent-chain links Scripture Thread writes. Only one of those looks like a citation: the `[[John 3]]` inside `John 3 16.md`, a verse note linking to its own chapter. Chapter notes link to books and books to testaments, and neither is a citation. Scripture Thread's panel already skips that one link with `isParentLink` (`src/context/find-mentions.ts`). Using the same rule here keeps real commentary written inside a verse note, such as `[[Romans 8 28]]` in `John 3 16.md`. Leaving out every note named like a reference would lose it. Which rule to use is a decision at the end of this doc.
- **Links in properties at the top of a note count too.** Obsidian includes them in the same list.
- **Links to notes that don't exist yet count too** (`unresolvedLinks`), so a reference typed as a link but never converted still shows up.
- **Counts work as in the app.** A verse's number is the notes citing exactly it, and a book's number is its chapters added up.
- **An entry's title is the note's name.** Its date sorts the notes column newest first. Where the date comes from is the first decision at the end of this doc.

One new pure function, `vaultToGraph`, turns the link list into the two shapes the app's logic already expects: `GraphVerseRow[]` for the tree and `GraphEntry[]` for the column. It is the only new piece of logic, and it's tested with a made-up vault written into the test, so no Obsidian is needed to test it.

## What is reused

About 1,900 lines of tested logic (not counting the tests) are copied in unchanged. The screen is new, and the plugin skips React: plain TypeScript and Obsidian's own `createEl` keep it light, and the first version's screen is small enough not to need React.

| File | From | Lines | Change needed |
| --- | --- | --- | --- |
| `graph-rules.ts` + test | Web app `src/lib/` | 285 | None. Builds the tree, the counts, the lit path and Expand/Collapse |
| `graph-layout.ts` + test | Web app `src/lib/` | 298 | None. Where every box sits, and the curved lines. The slide-animation half comes along unused |
| `graph-zoom-rules.ts` + test | Web app `src/lib/` | 321 | None. Zoom steps, Fit, zoom about the pointer, keep-in-view |
| `bible-books.ts` | Scripture Thread | 127 | None. Identical to the web app's copy today |
| `verse-rules.ts` + `bible-link.ts` + tests | Scripture Thread | 850 | None. Reads `John 3 16-18` as a reference |
| `@panzoom/panzoom` | npm | 3.7 KB | Same library and settings as the app: its own dragging and zooming off, the view's code drives it |
| `graph-key-rules.ts`, `graph-glide-rules.ts`, `graph-filter-rules.ts` | Web app | — | Not in the first version |

**The copies are the cost of keeping the plugins separate.** Each is a file that could drift from its original. They're pure logic that rarely changes, so the plan is to copy them once and note in each file's header where it came from and on what date. A shared package is the fix if drift ever bites, and isn't worth building for 5 files.

The app's screens (`GraphCanvas.tsx`, `GraphScreen.tsx`) are the reference for behaviour, not code to copy. They depend on Next.js and the app's own components.

## The build, session by session

Three sessions, each ending in something you can open in Obsidian. Work happens in a new repo and a test vault, never your real one, until session 3's last step.

**Session 1: the skeleton and the data.**

1. New private repo `obsidian-verse-graph`, started from the [official sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin), with the same tooling as Scripture Thread (esbuild, vitest, `eslint-plugin-obsidianmd`, the same `check` and `release` scripts).
2. Copy in the reused files from the table above, and get their tests passing in the new repo.
3. Write `vaultToGraph` and its tests: verse, range, whole chapter, chapter range, book-link ignored, parent-chain link excluded, commentary inside a verse note kept (if that's the rule chosen), unresolved links, duplicate verse notes merged into one node, an unconverted `[[Jn 3 16]]` merged with `John 3 16.md`, counts.
4. Register an empty view, a command and a ribbon icon.

Done when: `npm run check` is green, and the view opens in a test vault showing a plain list of the verses it found, with counts.

**Session 2: drawing it.**

1. Draw the tree and the notes column from `layoutGraph`, boxes as positioned elements and lines as one SVG behind them, sized in `rem` like the app.
2. Open and close books and chapters, and add Expand and Collapse. The graph starts on the two testaments with every book closed, as in the app.
3. Select a verse or a note: its path lights and the rest dims to 35%. Click again, Escape, or click the empty canvas to let go.
4. Click a note to select it and open the read-only panel (title, date, cited verses as chips, the note scrolled to the paragraph citing the selected verse, Open note). Hovering one shows Obsidian's page preview. This isn't automatic: register the view as a preview source with `registerHoverLinkSource` (it's in the installed `obsidian.d.ts`), then trigger Obsidian's `hover-link` event from each entry on hover. The source also appears as an option in the Page preview core plugin's settings.
5. Pan and zoom with `@panzoom/panzoom`: drag, Shift + scroll, − / + / Fit, 40%–200%, and ease back when dragged off screen.
6. Colours from Obsidian's theme variables (`--interactive-accent`, `--background-primary`, `--text-muted`), so it matches light, dark and custom themes.

Done when: the test vault's graph matches the web app's screen for the same references, checked side by side with screenshots, in light and dark.

**Session 3: keeping it live, and your real vault.**

1. Rebuild when notes change, waiting for typing to pause (next section), and when a note is renamed. Keep which books are open and what's selected across a rebuild.
2. The empty state, "No verses cited yet", when the vault has none.
3. Mark it `isDesktopOnly: true` in `manifest.json`.
4. A timing check on a large generated vault (5,000 notes), then install it in your real vault through BRAT, as Scripture Thread is installed.

Done when: editing a note updates the graph within a second, and opening the graph on your real vault takes under half a second.

## Matching the web app's Wave 8

The plugin is meant to end up with everything the web app's Graph screen does (`bible-journal-app/v3/V3-BUILD-PLAN.md`, Wave 8), built from copies of its rule files, never imports. Where each item stands:

| Item | In the app | In the plugin | What's left |
| --- | --- | --- | --- |
| 8.1 Spike: what the graph reads | Merged | Done differently, session 1 | Nothing. The app queries its database; the plugin reads Obsidian's link index (`vaultToGraph`) |
| 8.2 Tree, notes column, canvas, selection, pan and zoom, empty state, keyboard | Merged | Done, sessions 2–3 | Phone flick glide (`graph-glide-rules.ts`), with phone support |
| 8.3 Replay over time | Not started | Not started | Follows the app, if the app builds it |
| 8.4 Filters: books, a reference, a date range, tags, Reset | Merged | Not started | Session 4. Copy `graph-filter-rules.ts` and the `entry-filter-rules.ts` it needs. Tags are Obsidian's tags, from its in-memory cache, so the graph still never reads note text |
| 8.5 Read-only note panel, and *Show in graph* from the editor | Merged | Panel done, session 2 | Session 4: a **Show in graph** command and note menu item for the open note. The app's `graph-address-rules.ts` (the chosen entry in the web address) becomes the view's saved state, so a reopened graph keeps its chosen note |
| 8.6 Literary categories | Merged | Logic copied, switched off | Session 4: a settings tab with the **Literary categories** switch, off by default as in the app |
| 8.7 Hide dimmed | Merged 2026-09-27 | Logic copied in session 3 (`onlyLit`) | Session 4: the toolbar toggle beside Expand and Collapse |
| 8.8 Center | Merged | Done, session 2 | Nothing |

**Session 4: Wave 8 parity.** Items 8.4, 8.5's *Show in graph*, 8.6's setting and 8.7's toggle, each checked side by side against the app. Replay waits for the app, and glide for phone support. If the app adds to Wave 8 later, the new item lands here as a row.

## Keeping Obsidian fast

A badly built plugin freezes Obsidian rather than crashing it, or quietly shows stale data. These rules cover the ways this one could.

| Risk | Guardrail |
| --- | --- |
| Rebuilding on every keystroke | Rebuild only on Obsidian's `resolved` event, at most once every 500 ms, and only while the graph view is open |
| Work when Obsidian starts | Nothing runs at startup except registering the view, and the graph is built the first time it's opened. But Obsidian reopens views left open, so a graph open at quit is opened again at launch, possibly before the link list is complete, and the API has no public "finished" flag. So a reopened graph waits for `workspace.onLayoutReady`, draws what's there, and rebuilds on the next `resolved` event |
| A renamed note left stale | `metadataCache` doesn't fire `changed` on a rename. Also listen for the vault's `rename` event (through the same 500 ms wait), unless testing shows `resolved` already covers it |
| Reading every note's text | Never. Links come from Obsidian's in-memory list, and dates from its in-memory properties or the file's own details |
| Too many boxes on screen | Books start closed, and only what's open is drawn. Selecting a verse draws only its notes |
| Listeners left behind when the plugin is turned off | Every listener goes through `registerEvent` / `registerDomEvent`, which Obsidian removes automatically |

Session 3's 5,000-note timing check is what proves these rules hold, not what the plan says.

## Changes since the plan was written

- **Session 3: opening and closing animate**, as in the web app: boxes and lines slide over 220 ms with the app's `blendLayouts`, lit and dimmed fade, a note's panel slides in. Under reduced motion it jumps.
- **Session 3: only rows near the screen are drawn.** The plan's "only what's open is drawn" isn't enough once Expand opens every verse: on the 5,000-note vault that's some 11,000 boxes. The canvas now keeps rows within a screen of what shows in the page, and draws more as you pan.
- **Session 3: keyboard walking of the tree**, from the app's `graph-key-rules.ts`: the arrows, Home and End move through the tree and the view follows; Enter or Space opens a book or chapter or selects a verse; `+` `-` `0` `C` zoom, fit and center. Keys work only while the keyboard is in the graph. Escape clears from anywhere in the view.
- **Session 3: `graph-rules.ts` re-copied** for the app's item 8.7 (`onlyLit`, Hide dimmed), merged the same day.
- **Session 3: renames and deletes are listened for.** `resolved` doesn't cover a rename, so the vault's `rename` and `delete` events go through the same 500 ms wait, and a chosen note stays chosen under its new name.
- **Session 2: the read-only note panel stays** (item 8.5), instead of opening the note on click. It renders only the chosen note, so the graph itself still never reads note text.
- **Session 2: the web app's item 8.6 (literary categories) came across with the copied files.** The canvas draws the category column when the tree has one, but it is off, as it is by default in the app. Turning it on needs a setting, which waits with the settings tab.
- **Session 2: hover preview needs Cmd/Ctrl by default**, so panning over the notes column doesn't pop a preview on every note. It can be changed in **Settings → Page preview → Verse Graph**.
- **Session 1: the command is "Open graph"** (id `open-graph`), since the palette already prefixes the plugin's name.

## Decisions before the first session

Each has a recommended answer, so none of them blocks starting. Change any you disagree with.

- [ ] **Where a note's date comes from.** Recommended: a `date` property if the note has one, else a date in the file name (`2026-09-26 …`), else the day the file was created. Creation dates can shift when files are synced or copied, which is why they're the last resort.
- [ ] **Only Scripture Thread's links, or plain-text references too?** Recommended: links only. Scripture Thread's panel does read note text, but only the paragraph around each link it shows. Finding plain text for the graph means reading every note in the vault on every rebuild, which is what the speed rules forbid. Your vault's references are converted to links anyway.
- [ ] **Which verse-linking notes count as entries.** Recommended: every note except the parent-chain link, using Scripture Thread's `isParentLink` rule, so commentary written inside a verse note appears. The alternative is to leave out every note named like a reference, which is simpler but drops that commentary.
- [ ] **Plugin name and id.** Placeholder: *Verse Graph*, `verse-graph`. The id can't change once it's installed.
- [ ] **Private repo, installed through BRAT**, like Scripture Thread. Listing it in Obsidian's community directory can wait.
- [ ] **What counts as "worth continuing".** Suggested: after two weeks, if you've opened it more than a handful of times, the next step is filters, then phone support.
