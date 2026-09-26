import type { Plugin } from 'obsidian';
import { VERSE_GRAPH_VIEW, VerseGraphView } from '../ui/verse-graph-view';

export function registerAll(plugin: Plugin): void {
	plugin.registerView(VERSE_GRAPH_VIEW, (leaf) => new VerseGraphView(leaf));
	// Hovering a note in the graph shows Obsidian's page preview; set in Page preview's settings.
	plugin.registerHoverLinkSource(VERSE_GRAPH_VIEW, { display: 'Verse Graph', defaultMod: true });

	plugin.addRibbonIcon('git-fork', 'Open verse graph', () => void openVerseGraph(plugin));
	plugin.addCommand({
		id: 'open-graph',
		name: 'Open graph',
		callback: () => void openVerseGraph(plugin),
	});
}

/** Shows the graph in its existing tab if it is open, else in a new one. */
async function openVerseGraph(plugin: Plugin): Promise<void> {
	const { workspace } = plugin.app;
	const leaf = workspace.getLeavesOfType(VERSE_GRAPH_VIEW)[0] ?? workspace.getLeaf('tab');
	await leaf.setViewState({ type: VERSE_GRAPH_VIEW, active: true });
	await workspace.revealLeaf(leaf);
}
