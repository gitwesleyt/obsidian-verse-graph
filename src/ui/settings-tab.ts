import { PluginSettingTab, Setting, type App, type SettingDefinitionItem } from 'obsidian';
import type VerseGraphPlugin from '../main';
import type { VerseGraphSettings } from '../settings';

const VERSION = {
	name: 'Version',
	desc: 'The version of Verse Graph installed in this vault.',
};

/** The switches, in order, with the web app's words for them. */
const SWITCHES: { key: keyof VerseGraphSettings; name: string; desc: string }[] = [
	{
		key: 'literaryCategories',
		name: 'Literary categories',
		desc: 'Groups books into their literary category, shown as a column between testament and book.',
	},
	{
		key: 'toolbarIcons',
		name: 'Toolbar icons',
		desc: "Shows the graph's toolbar as icons instead of words, as it is on a phone. Point at an icon to see what it does.",
	},
];

/**
 * Settings → Verse Graph. Declared, so Obsidian 1.13 and later draw it and
 * find it in the settings search; `display` draws the same switches on the
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
			...SWITCHES.map(({ key, name, desc }) => ({
				name,
				desc,
				control: { type: 'toggle' as const, key, defaultValue: false },
			})),
			{ ...VERSION, render: (setting) => this.showVersion(setting) },
		];
	}

	/** Saves through the plugin, which also redraws every open graph. */
	async setControlValue(key: string, value: unknown): Promise<void> {
		const known = SWITCHES.find((toggle) => toggle.key === key);
		if (!known || typeof value !== 'boolean') return;
		this.plugin.settings[known.key] = value;
		await this.plugin.saveSettings();
	}

	/** Obsidian before 1.13, which does not read `getSettingDefinitions`. */
	display(): void {
		this.containerEl.empty();
		for (const { key, name, desc } of SWITCHES) {
			new Setting(this.containerEl)
				.setName(name)
				.setDesc(desc)
				.addToggle((toggle) =>
					toggle.setValue(this.plugin.settings[key]).onChange((on) => this.setControlValue(key, on)),
				);
		}
		this.showVersion(new Setting(this.containerEl).setName(VERSION.name).setDesc(VERSION.desc));
	}

	/** Read only: the installed version, from the plugin's manifest, for reference. */
	private showVersion(setting: Setting): void {
		setting.controlEl.createSpan({ cls: 'verse-graph-version', text: this.plugin.manifest.version });
	}
}
