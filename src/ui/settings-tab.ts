import { PluginSettingTab, Setting, type App } from 'obsidian';
import type VerseGraphPlugin from '../main';

/** Settings → Verse Graph. */
export class VerseGraphSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: VerseGraphPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		this.containerEl.empty();
		new Setting(this.containerEl)
			.setName('Literary categories')
			.setDesc('Groups books into their literary category, shown as a column between testament and book.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.literaryCategories).onChange(async (on) => {
					this.plugin.settings.literaryCategories = on;
					await this.plugin.saveSettings();
				}),
			);
	}
}
