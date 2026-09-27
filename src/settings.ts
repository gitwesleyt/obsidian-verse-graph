export type VerseGraphSettings = {
	/**
	 * A column between Testament and Book grouping the books the way a study
	 * Bible does (the web app's item 8.6). Off, as in the app.
	 */
	literaryCategories: boolean;
};

export const DEFAULT_SETTINGS: VerseGraphSettings = {
	literaryCategories: false,
};
