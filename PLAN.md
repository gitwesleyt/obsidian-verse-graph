# Verse Graph plugin — first version plan

Sep 26, 2026 · @Wesley

A new Obsidian plugin, separate from Scripture Thread, that draws the web app's Graph screen inside Obsidian: Testament → Book → Chapter → Verse, then a column of the notes that cite each verse. The first version runs on a computer only, has no filters, and takes about 3 sessions. Its job is to show whether you actually use the graph before the phone and filter work is paid for.

## Scope

The first version draws the tree, lets you select, and opens notes. Anything that only makes it nicer came after, once a quick try showed it was worth it.

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
| Filters (books, reference, dates, tags) | Yes, since session 4 | Item 8.4, built in the Wave 8 parity session |
| Phone and tablet (pinch, flick, touch gestures) | Yes, since session 6 | Built from the app's gestures and phone layout; tried on your phone |
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
| 8.2 Tree, notes column, canvas, selection, pan and zoom, empty state, keyboard | Merged | Done, sessions 2, 3 and 6 | Nothing. Session 6 added touch, the flick glide and the phone layout |
| 8.3 Replay | Merged 2026-09-27 | Done, session 7 | Nothing. Last in the toolbar, or in the header on a narrow graph |
| 8.4 Filters: books, a reference, a date range, tags, Reset | Merged | Done, session 4 | Nothing. `graph-filter-rules.ts` copied; the filtering the app does in SQL is `graph-filters.ts`. Tags are Obsidian's, from its in-memory cache |
| 8.5 Read-only note panel, and *Show in graph* from the editor | Merged | Done, sessions 2 and 4 | Nothing. **Show current note in graph** (command) and **Show in verse graph** (a note's menu). The chosen note is kept in the view's saved state, the plugin's version of the app's address |
| 8.6 Literary categories | Merged | Done, session 4 | Nothing. **Settings → Verse Graph → Literary categories**, off by default |
| 8.7 Hide dimmed | Merged 2026-09-27 | Done, sessions 4 and 5 | Nothing. Session 5 took in the app's later change: the selection stays still |
| 8.8 Center | Merged | Done, session 2 | Nothing |
| 8.9 Toolbar icons, a setting | Merged 2026-09-27 | Done, session 7 | Nothing. **Settings → Verse Graph → Toolbar icons**, off by default |

**Session 4: Wave 8 parity.** Items 8.4, 8.5's *Show in graph*, 8.6's setting and 8.7's toggle, each checked side by side against the app. Replay waits for the app, and glide for phone support. If the app adds to Wave 8 later, the new item lands here as a row.

## After Wave 8

Wave 8 is done except Replay, and `0.2.0` is in your real vault (2026-09-27). Whatever gets in the way in your real journal outranks the order below.

**1. Session 5: small things. Done.**

- **The whole view is kept with its tab**: the selected verse, the chosen note and what's open (`view-state.ts`), so a graph reopened at launch comes back as it was left. The app still loses the verse and what's open (its TD-117).
- **`npm run compare-app`** compares every copied file with the original as it is now, and lists the app's graph rules not copied here; `--diff` shows the differences. Development only: it reads the other repos when they're beside this one, and nothing in the build or tests needs it. Its first run found the app's refinement of 8.7, below.
- **Declarative settings**: the `obsidian` types are 1.13.1, and **Literary categories** is declared, so it turns up in Obsidian's settings search. The old way still draws it on 1.11 and 1.12.
- **`test-vault-big` has every case**, not only single verses: ranges, chapters, chapter ranges, unconverted references, book links, tags, `date` properties, property links, commentary in a verse note and a duplicate, across its 5,000 journal notes. It's the vault to test in; `test-vault` stays for checking a case by hand.
- **The version installed**, read only, at the bottom of **Settings → Verse Graph**.
- **8.7 brought back in step** with the app's commit `02cd395`: Hide dimmed keeps the selection where it is on screen and closes the rest up round it (`keepStill`), instead of recentring, and Center while hiding centres what's left on each axis (`centerEachAxis`).

**2. Session 6: phone and tablet. Done, and tried on your phone at `0.4.6` (2026-09-27).**

- **Touch, as the app does it**: one finger pans, two pinch (`pinchTo`), and a count of fingers changing starts the gesture again from where the graph is; a flick glides a little and slows (`graph-glide-rules.ts`, copied); a double tap zooms one step in on the spot. The canvas takes every touch, and a swipe on it doesn't reach Obsidian's side panels.
- **A narrow graph gets the phone layout**: the toolbar along the bottom, the filters one row that scrolls sideways, and the note panel a sheet along the bottom that arrives as its title and opens from it. The app draws this below 1100px of window; the plugin goes by the graph's own width, under 50rem, so a narrow pane on a computer gets it too.
- **44px controls** whenever Obsidian is on a phone or tablet.
- **`isDesktopOnly: false`.** Nothing in the plugin uses Node or Electron.
- **Not done: the Books sheet that stages** (the app's *Show 5 verses*). The pickers are Obsidian dialogs, which a phone shows full screen, and they apply as ticked, as on a computer.
- **On the phone, BRAT needs the token in that device's own secret storage.** Obsidian's secret storage doesn't sync, so a vault synced from the computer brings BRAT's token *name* (`scripture-thread`) without the token; BRAT then gets a 404 from GitHub for both private repos until a secret of that name is added on the phone.

**3. Session 7: Replay, and the app's other changes of 2026-09-27. Done.**

- **Replay (8.3)**: draws the graph again in the order the notes were written, a note's worth of verses a step, over about six seconds, from the opening view at this zoom, and leaves it complete; a second press stops it, and so does choosing a verse or a note or changing a filter. It plays what's open, so Expand first to watch the verses arrive. Counts and the notes column wait for the end. `graph-replay-rules.ts` copied; `onlyLit` is `keepOnly` in the app now, and the canvas follows.
- **The narrow toolbar is the app's one row of icons**, scrolling sideways if a phone is too narrow for it, with Replay in the header. This replaces session 6's two rows of words, as the app replaced its own.
- **Collapse is on the left and Expand on the right**, and **Cmd- or Ctrl-click on either goes all the way.**
- **Toolbar icons (8.9)**: a switch in **Settings → Verse Graph**, off by default, that draws the toolbar as the phone's icons on a wide graph too, Replay's included, keeping the percentage and the dividers. Every control has the app's tooltip.
- **`npm run compare-app` also lists the web app's graph commits** since the one in `app-caught-up.json`, because not every call is in a copied file: the Collapse and Expand swap was in the app's screen code, and was missed until you pointed it out. `-- --caught-up` moves the marker on.
- **`graph-layout.ts` re-copied** for the app's fix that drops a box once it has faded to nothing, whether or not its slide finished.

**3a. Session 8: verse blocks from Scripture Thread (its `PLAN.md`, "Verse blocks", step 5). Done, and tried on your phone at `0.6.0-beta.1` (2026-09-28).**

- **The note panel boxes the verse block citing the selected verse**, with Scripture Thread's grey rounded border, and scrolls to it, instead of tinting the first paragraph. The rest of the note stays readable round it. A citation in no block (a heading, a callout, the properties) keeps the tint.
- **`verse-block-rules.ts`, its test and `spec/verse-blocks.md` copied** from Scripture Thread; `npm run compare-app` now compares `spec/*.md` copies too.
- **How:** the panel finds the citing line from Obsidian's link index, as Open note does, and renders the note in three parts (before, the block, after) so the block is an element of its own to box (`citing-block.ts`). **Known limit:** a footnote or reference-style link whose definition is outside the block doesn't resolve inside it, and the reverse.

**4. Following the app, as it changes.** Each lands as a row in the Wave 8 table:

- **TD-116** (`Proverbs 3:5, 6` drawn as the range `3:5–6`). The plugin does the same thing, in `rangesOf`, for the same reason. If the app fixes it, the fix comes across with the files.
- Anything the app adds to its Graph screen.

**5. Open decision: the web app's Wave 9, Calendar.** Month, year and decade views, with each day shaded by how much was written. It isn't the graph, so it doesn't belong in this plugin. The choice is:

- **A second plugin** (`verse-calendar` or a broader name), built the same way: copy the app's rules once they exist, draw with Obsidian's theme. The year and decade heat maps are what Obsidian's existing calendar plugins don't do.
- **Not at all**, and use an existing calendar plugin for the month view.

Recommended: wait for the app to build Wave 9 first. Its rules don't exist yet, and the whole approach here is copying what the app has settled.

**Listing in Obsidian's community directory:** see *Public release* at the end.

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

- **Session 6, from trying it on the phone (`0.4.1`–`0.4.6`):**
  - **The graph ends above Obsidian's floating navigation bar**, by Obsidian's own `--view-bottom-spacing`; the toolbar along the bottom was under it.
  - **The narrow toolbar is two fixed rows**: − % + Fit ⌖, then Show all lines, Expand, Collapse, Hide dimmed. Tighter buttons, smaller text and no dividers, still 44px tall. Squeezed onto one row the labels overlapped; wrapped freely it took three rows.
  - **Hover styles only where there's a pointer to hover with.** A touch screen keeps a tapped button hovered, so a toggle switched off stayed grey and looked still on.
  - **Obsidian's grey tap flash is kept on the action buttons and skipped on the two toggles.** The flash is the only sign Expand, Fit and the rest were tapped; on a toggle, its tint is the sign.
  - **The first tap after panning works.** A finger drag ends in no click, so the flag it left swallowed the next tap, on Center or a note; every new press now clears it.

- **Session 4: the filter pickers are Obsidian dialogs**, not the app's popovers: Books, Dates and Tags are modals that apply as you tick, as the app does at desktop width, and Reference is Obsidian's type-ahead suggester. A chip in use is filled and has an × of its own.
- **Session 4: only three pieces of the app's `entry-filter-rules.ts` are copied** (`monthName`, `weekdayName`, `weekdayPlural`, `EntryFacet`), each unchanged. The rest of that file is Home's filter, with a chain of imports the plugin has no use for.
- **Session 4: the "nothing matches" sentence says notes**, not entries: the app's sentence is used with that one word changed where it is shown.
- **Session 4: *Show in graph* on a note the filters hide resets them**, rather than saying the note cites nothing.
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

All taken. The first five were built as recommended; the sixth was dropped.

- [x] **Where a note's date comes from.** A `date` property if the note has one, else a `sermon date` property (Word and Apple Notes imports write that one), else a date in the file name (`2026-09-26 …`), else the day the file was created. Creation dates can shift when files are synced or copied, which is why they're the last resort.
- [x] **Only Scripture Thread's links, or plain-text references too?** Links only. Finding plain text for the graph means reading every note in the vault on every rebuild, which is what the speed rules forbid.
- [x] **Which verse-linking notes count as entries.** Every note except the parent-chain link, using Scripture Thread's `isParentLink` rule, so commentary written inside a verse note appears.
- [x] **Plugin name and id.** *Verse Graph*, `verse-graph`. The id can't change now that it's installed.
- [x] **Private repo, installed through BRAT**, like Scripture Thread. Listing it in Obsidian's community directory can wait.
- [x] **What counts as "worth continuing".** Dropped: a quick try in your real vault settles it, not a two-week wait. Filters are already built; phone support is next after the small things.


---

# Public release: the community directory

The same checks Scripture Thread went through on 2026-09-29, against Obsidian's Developer policies,
Submission requirements for plugins and Plugin guidelines. Submission is through
community.obsidian.md, with an automated review.

## Decisions
- [x] Released as `1.0.0`: going public is the first stable version
- [x] The repository goes public; no secrets in its history
- [x] Releases come from GitHub Actions, with build provenance, once the repo is public
- [x] The copy headers still name the private web app, which `compare-app` needs; the README says
      it's private and that nothing here needs it to build or test
- [x] No `fundingUrl`
- [x] LICENSE names you, not the sample template's Dynalist Inc.

## Fixes
- [x] README: install from Community plugins, BRAT without a token, by hand, and a Privacy
      section; "desktop only for now" removed, since `isDesktopOnly` is false and it was tried
      on the phone in session 6
- [x] The sample template's `AGENTS.md` removed
- [x] `release.yml` and `lint.yml` as in Scripture Thread: a tag push publishes after
      `npm run check`, with provenance; a tag with a `-` is a prerelease beta; a release tag must
      match `manifest.json`. `npm run release` now checks and pushes the tag

Audited and fine: no lookbehind in any regular expression, no Node or Electron APIs, no
`innerHTML`, no console logging, no `activeLeaf`, never writes to the vault, settings without
headings, command names in sentence case and IDs without the plugin ID, the description ends with
a period, and the id `verse-graph` and the name are unused among 8,200 listed plugins.

## Release and submit
- [x] Make the repository public
- [x] Merge, release `1.0.0` through Actions, and check the workflow's run: it passed, and
      `gh attestation verify` confirms the published `main.js` and `styles.css` (2026-09-29)
- [ ] You: sign in at community.obsidian.md, add the plugin, and act on the review
