import { Plugin } from 'obsidian';
import { registerAll } from './commands';

export default class VerseGraphPlugin extends Plugin {
	onload() {
		registerAll(this);
	}
}
