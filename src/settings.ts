export type VerseGraphSettings = {
	/**
	 * A column between Testament and Book grouping the books the way a study
	 * Bible does (the web app's item 8.6). Off, as in the app.
	 */
	literaryCategories: boolean;
	/**
	 * The toolbar as icons on a wide graph too, as a narrow one always has it
	 * (the web app's item 8.9). Off, as in the app.
	 */
	toolbarIcons: boolean;
};

export const DEFAULT_SETTINGS: VerseGraphSettings = {
	literaryCategories: false,
	toolbarIcons: false,
};
