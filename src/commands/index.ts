import { TFile, type App, type Plugin } from 'obsidian';
import type VerseGraphPlugin from '../main';
import { VerseGraphSettingTab } from '../ui/settings-tab';
import { VERSE_GRAPH_VIEW, VerseGraphView } from '../ui/verse-graph-view';
import { vaultToGraph } from '../vault-graph';

export function registerAll(plugin: VerseGraphPlugin): void {
	plugin.registerView(VERSE_GRAPH_VIEW, (leaf) => new VerseGraphView(leaf, () => plugin.settings));
	plugin.addSettingTab(new VerseGraphSettingTab(plugin.app, plugin));
	// Hovering a note in the graph shows Obsidian's page preview; set in Page preview's settings.
	plugin.registerHoverLinkSource(VERSE_GRAPH_VIEW, { display: 'Verse Graph', defaultMod: true });

	plugin.addRibbonIcon('git-fork', 'Open verse graph', () => void openVerseGraph(plugin));
	plugin.addCommand({
		id: 'open-graph',
		name: 'Open graph',
		callback: () => void openVerseGraph(plugin),
	});

	// Show in graph (the web app's item 8.5), for the open note and from a note's menu.
	plugin.addCommand({
		id: 'show-note-in-graph',
		name: 'Show current note in graph',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || !citesVerses(plugin.app, file.path)) return false;
			if (!checking) void showInGraph(plugin, file.path);
			return true;
		},
	});
	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, file) => {
			if (!(file instanceof TFile) || !citesVerses(plugin.app, file.path)) return;
			menu.addItem((item) =>
				item
					.setTitle('Show in verse graph')
					.setIcon('git-fork')
					.onClick(() => void showInGraph(plugin, file.path)),
			);
		}),
	);
}

/** Shows the graph in its existing tab if it is open, else in a new one. */
async function openVerseGraph(plugin: Plugin): Promise<VerseGraphView | null> {
	const { workspace } = plugin.app;
	const leaf = workspace.getLeavesOfType(VERSE_GRAPH_VIEW)[0] ?? workspace.getLeaf('tab');
	await leaf.setViewState({ type: VERSE_GRAPH_VIEW, active: true });
	await workspace.revealLeaf(leaf);
	return leaf.view instanceof VerseGraphView ? leaf.view : null;
}

async function showInGraph(plugin: Plugin, path: string): Promise<void> {
	(await openVerseGraph(plugin))?.showNote(path);
}

/** Whether a note cites a verse, by the graph's own rules, from its links in memory. */
function citesVerses(app: App, path: string): boolean {
	const index = {
		resolvedLinks: { [path]: app.metadataCache.resolvedLinks[path] ?? {} },
		unresolvedLinks: { [path]: app.metadataCache.unresolvedLinks[path] ?? {} },
	};
	return vaultToGraph(index, () => ({ dateProperty: undefined, created: 0 })).entries.length > 0;
}
