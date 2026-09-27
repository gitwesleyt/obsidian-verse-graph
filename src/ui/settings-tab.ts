import { PluginSettingTab, Setting, type App, type SettingDefinitionItem } from 'obsidian';
import type VerseGraphPlugin from '../main';
import type { VerseGraphSettings } from '../settings';

const VERSION = {
	name: 'Version',
	desc: 'The version of Verse Graph installed in this vault.',
};

const LITERARY_CATEGORIES = {
	name: 'Literary categories',
	desc: 'Groups books into their literary category, shown as a column between testament and book.',
};

/**
 * Settings → Verse Graph. Declared, so Obsidian 1.13 and later draw it and
 * find it in the settings search; `display` draws the same switch on the
 * older versions the manifest still allows.
 */
export class VerseGraphSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: VerseGraphPlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				...LITERARY_CATEGORIES,
				control: { type: 'toggle', key: 'literaryCategories', defaultValue: false },
			},
			{ ...VERSION, render: (setting) => this.showVersion(setting) },
		];
	}

	/** Saves through the plugin, which also redraws every open graph. */
	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'literaryCategories' && typeof value === 'boolean') {
			this.plugin.settings[key satisfies keyof VerseGraphSettings] = value;
			await this.plugin.saveSettings();
		}
	}

	/** Obsidian before 1.13, which does not read `getSettingDefinitions`. */
	display(): void {
		this.containerEl.empty();
		new Setting(this.containerEl)
			.setName(LITERARY_CATEGORIES.name)
			.setDesc(LITERARY_CATEGORIES.desc)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.literaryCategories)
					.onChange((on) => this.setControlValue('literaryCategories', on)),
			);
		this.showVersion(new Setting(this.containerEl).setName(VERSION.name).setDesc(VERSION.desc));
	}

	/** Read only: the installed version, from the plugin's manifest, for reference. */
	private showVersion(setting: Setting): void {
		setting.controlEl.createSpan({ cls: 'verse-graph-version', text: this.plugin.manifest.version });
	}
}
