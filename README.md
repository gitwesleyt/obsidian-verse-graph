# Verse Graph

An Obsidian plugin that shows the Bible verses your notes cite as a tree (Testament → Book → Chapter → Verse), next to the notes that cite them. It recreates the Graph screen from Bible Journal, a web app of the author's.

It reads the links Obsidian already keeps in memory and never reads the text of your notes. A verse is any link to a note whose name is one Bible reference, such as `Psalms 23 1`, `John 3 16-18` or `Matthew 5-7`, which are the names [Scripture Thread](https://github.com/gitwesleyt/obsidian-scripture-thread) writes. Plain-text references that haven't been converted to links don't appear.

Open it with **Open graph** in the command palette, or the ribbon icon.

## Installation

Requires Obsidian 1.11 or later, on desktop and mobile. Each vault has its own plugins, so install it in every vault you want it in — a vault synced across devices (iCloud, Obsidian Sync) brings the plugin along.

### From Community plugins
1. In Obsidian, open Settings → Community plugins, and turn off Restricted mode if it's on.
2. Choose **Browse**, search for **Verse Graph**, then **Install** and **Enable**.

Obsidian offers new versions under Settings → Community plugins → **Check for updates**.

### With BRAT (beta versions)
[BRAT](https://github.com/TfTHacker/obsidian42-brat) installs plugins straight from their GitHub releases, including pre-release betas.

1. Install and enable **BRAT** from Settings → Community plugins → Browse.
2. In BRAT's settings choose **Add beta plugin**, enter `gitwesleyt/obsidian-verse-graph`, and pick a version.
3. Enable **Verse Graph** in Settings → Community plugins.

### By hand
1. From the [latest release](https://github.com/gitwesleyt/obsidian-verse-graph/releases/latest), download `main.js`, `manifest.json` and `styles.css`.
2. Put them in `<your-vault>/.obsidian/plugins/verse-graph/` (create the folder).
3. Restart Obsidian. It only notices a newly added plugin folder when it starts, or when you click the refresh button next to **Installed plugins** in Settings → Community plugins.
4. Enable **Verse Graph** in Settings → Community plugins.

To update, download the new release's three files over the old ones, then turn the plugin off and on again.

## Privacy

Verse Graph only reads. It makes no network requests, collects no telemetry, needs no account, never reads or writes files outside the vault, and never changes a note. The graph comes from the links Obsidian already keeps in memory; the only note text it reads is the note you select, to show it in the panel.

## Development

```bash
npm install
npm run check        # build, lint and test
npm run big-vault    # build, then write a 5,000-note vault to test-vault-big/ with the plugin installed
npm run test-vault   # the same for a small vault in test-vault/, a few notes you can read one by one
npm run compare-app  # copied files changed in the originals, and the app's graph commits since last caught up
```

`test-vault-big` is the one to test in. Its 5,000 journal notes have every case the plugin handles: single verses, verse ranges, whole chapters and chapter ranges; unconverted references and book links; tags in the body and in properties; `date` properties and undated notes; verse links in properties; commentary inside a verse note; and a duplicate verse note. It is the same vault every run, and rerunning is safe while it's open in Obsidian. `test-vault` has the same cases in a dozen notes, for checking one by hand.

Several files are copied unchanged from the Bible Journal web app (`graph-*.ts`) and from Scripture Thread (`bible-books.ts`, `verse-rules.ts`, `bible-link.ts`). Each one's header says where it came from and when. The web app's repository is private, so those headers point somewhere only its author can open; the copies here are complete and need nothing from it to build or test. Change them in the original and copy them across again, rather than editing them here. `npm run compare-app` says which have changed since, and lists the web app's graph commits since `app-caught-up.json`, since not every decision is in a copied file (the toolbar's order is in the app's screen code). `npm run compare-app -- --caught-up` moves that marker on once they're dealt with. It needs both repositories beside this one.

### Releasing a new version
GitHub Actions publishes each release when its tag is pushed, after running the same checks, and attaches build provenance so anyone can verify the files were built from this repository.

1. Bump the version. Use `patch` for fixes (1.0.0 → 1.0.1), `minor` for new features (1.1.0), `major` for changes that break how it's used (2.0.0):
   ```bash
   npm version patch
   ```
   This updates `package.json`, `manifest.json` and `versions.json`, commits, and tags the commit `1.0.1` — no `v`, which is what Obsidian and BRAT expect.
2. Check, then push the commit and its tag:
   ```bash
   npm run release
   ```
   The *Release Obsidian plugin* workflow then publishes the release with `main.js`, `manifest.json` and `styles.css`, and refuses a tag that doesn't match `manifest.json`.

**A beta for BRAT:** tag a branch's commit with a pre-release version and push the tag. The workflow publishes it as a prerelease whose manifest carries that version, and nothing on the branch changes:
```bash
git tag 1.0.1-beta.1
git push origin 1.0.1-beta.1
```

## License

[0BSD](LICENSE)
