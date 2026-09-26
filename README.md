# Verse Graph

An Obsidian plugin that shows the Bible verses your notes cite as a tree (Testament → Book → Chapter → Verse), next to the notes that cite them. It recreates the Graph screen from the Bible Journal web app.

It reads the links Obsidian already keeps in memory and never reads the text of your notes. A verse is any link to a note whose name is one Bible reference, such as `Psalms 23 1`, `John 3 16-18` or `Matthew 5-7`, which are the names Scripture Thread writes. Plain-text references that haven't been converted to links don't appear.

Open it with **Open graph** in the command palette, or the ribbon icon. It works on desktop only for now.

No network requests, no telemetry.

## Development

```bash
npm install
npm run check        # build, lint and test
npm run test-vault   # build, then write a throwaway vault to test-vault/ with the plugin installed
```

Several files are copied unchanged from the Bible Journal web app (`graph-*.ts`) and from Scripture Thread (`bible-books.ts`, `verse-rules.ts`, `bible-link.ts`). Each one's header says where it came from and when. Change them in the original and copy them across again, rather than editing them here.
