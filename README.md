# Verse Graph

An Obsidian plugin that shows the Bible verses your notes cite as a tree (Testament → Book → Chapter → Verse), next to the notes that cite them. It recreates the Graph screen from the Bible Journal web app.

It reads the links Obsidian already keeps in memory and never reads the text of your notes. A verse is any link to a note whose name is one Bible reference, such as `Psalms 23 1`, `John 3 16-18` or `Matthew 5-7`, which are the names Scripture Thread writes. Plain-text references that haven't been converted to links don't appear.

Open it with **Open graph** in the command palette, or the ribbon icon. It works on desktop only for now.

No network requests, no telemetry.

## Development

```bash
npm install
npm run check        # build, lint and test
npm run big-vault    # build, then write a 5,000-note vault to test-vault-big/ with the plugin installed
npm run test-vault   # the same for a small vault in test-vault/, a few notes you can read one by one
npm run compare-app  # copied files changed in the originals, and the app's graph commits since last caught up
```

`test-vault-big` is the one to test in. Its 5,000 journal notes have every case the plugin handles: single verses, verse ranges, whole chapters and chapter ranges; unconverted references and book links; tags in the body and in properties; `date` properties and undated notes; verse links in properties; commentary inside a verse note; and a duplicate verse note. It is the same vault every run, and rerunning is safe while it's open in Obsidian. `test-vault` has the same cases in a dozen notes, for checking one by hand.

Several files are copied unchanged from the Bible Journal web app (`graph-*.ts`) and from Scripture Thread (`bible-books.ts`, `verse-rules.ts`, `bible-link.ts`). Each one's header says where it came from and when. Change them in the original and copy them across again, rather than editing them here. `npm run compare-app` says which have changed since, and lists the web app's graph commits since `app-caught-up.json`, since not every decision is in a copied file (the toolbar's order is in the app's screen code). `npm run compare-app -- --caught-up` moves that marker on once they're dealt with.
