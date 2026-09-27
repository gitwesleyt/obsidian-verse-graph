import { Plugin } from 'obsidian';
import { registerAll } from './commands';
import { DEFAULT_SETTINGS, type VerseGraphSettings } from './settings';
import { VERSE_GRAPH_VIEW, VerseGraphView } from './ui/verse-graph-view';

export default class VerseGraphPlugin extends Plugin {
	settings: VerseGraphSettings = { ...DEFAULT_SETTINGS };

	async onload() {
		this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<VerseGraphSettings> | null) };
		registerAll(this);
	}

	/** Saves the settings, and redraws every open graph with them. */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		for (const leaf of this.app.workspace.getLeavesOfType(VERSE_GRAPH_VIEW)) {
			if (leaf.view instanceof VerseGraphView) leaf.view.settingsChanged();
		}
	}
}
