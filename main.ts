import {App, Notice, Plugin, PluginSettingTab, Setting, TFile} from 'obsidian';
import {Article, search_for_articles_by_id} from "./arxiv-api";
import AsyncSuggestionModal from "./AsyncSuggestionModal";

const Mustache = require('mustache');

interface ArxivGetterSettings {
	paperTemplate?: string;
	titleTemplate?: string;
}

const DEFAULT_SETTINGS: ArxivGetterSettings = {
	paperTemplate: '',
	titleTemplate: '{{id}}'
}

export default class ArxivGetter extends Plugin {
	settings: ArxivGetterSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'ArXiv Getter', async (evt: MouseEvent) => {
			new Notice('This is a notice!');
		});

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-arxiv-paper-getter',
			name: 'Retrieve a paper by ID or URL',
			callback: () => {
				new ArxivGetterModal(this).open();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ArxivGetterSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	createNote(article: Article) {
		const fields = this.makeTemplateFields(article);
		const template  = this.loadTemplate();
		const titleTemplate: string = this.settings.titleTemplate || "";
		let title = Mustache.render(titleTemplate, fields);
		if (!title.endsWith(".md")) {
			title += ".md";
		}
		template.then(template => {
			const note = Mustache.render(template, fields);
			console.log("creating a note with title:", title, note);
			this.app.vault.create(title, note).then( (f: TFile) => {
				this.app.workspace.getLeaf(false).openFile(f);
			});
		});
	}

	makeTemplateFields(article: Article):ArticleTemplateFields {
		const date = new Date().toISOString().split('T')[0];
		const real_id = extract_arxiv_id_from_url(article.id, false);
		return {...article, date, id: real_id, url: article.id}
	}

	loadTemplate(): Promise<string> {
		if (!this.settings.paperTemplate) {
			return Promise.resolve("");
		}

		const file = this.app.vault.getAbstractFileByPath(this.settings.paperTemplate + ".md");
		if (!file) {
			return Promise.resolve("");
		}

		return this.app.vault.cachedRead(file as TFile)

	}
}

interface ArticleTemplateFields extends Article {
	date: string;
	url: string;
}

function extract_arxiv_id_from_url(query: string, keep_version: boolean): string|undefined {
	const id_match = query.match(/^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\/([0-9.]+)[^.]*(?:\.pdf)?$/);
	if (id_match) {
		if (!keep_version) {
			return id_match[1].split('v')[0];
		}
		return id_match[1];
	}
}

class ArxivGetterModal extends AsyncSuggestionModal<Article> {

	constructor(plugin: ArxivGetter) {
		super(plugin.app);
		this.plugin = plugin;
	}

	articles?: Article[];
	plugin: ArxivGetter;

	onOpen() {
		const {inputEl} = this;
		console.log(inputEl);
		this.setPlaceholder("Enter a paper ID or URL");
		inputEl.focus()
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}

	getSuggestionsAsync(query: string): Promise<Article[]> {
		// query can either be an id or a url from arxiv
		// if it's a url, we'll extract the id from the url
		// arxiv urls look like https://arxiv.org/abs/1812.01097 or https://arxiv.org/pdf/1812.01097(.pdf)?
		// we'll extract the id from the url
		const id = extract_arxiv_id_from_url(query, true);
		if (id)	{
			query = id
		}
		return search_for_articles_by_id(query).then(articles => {
			return articles;
		});
	}

	onChooseSuggestion(item: Article, evt: MouseEvent | KeyboardEvent): any {
		// TODO: should we insert into the current note sometimes?
		console.log("Chose", item);
		this.plugin.createNote(item);
	}

	renderSuggestion(value: Article, el: HTMLElement): void {
		el.innerText = value.title;
	}
}

class ArxivGetterSettingTab extends PluginSettingTab {
	plugin: ArxivGetter;

	constructor(app: App, plugin: ArxivGetter) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for my ArXiv Getter.'});

		new Setting(containerEl)
			.setName('Paper Note Template')
			.setDesc('Note to use as a template for new papers')
			.addText(text => text
				.setPlaceholder('Enter path to template')
				.setValue(this.plugin.settings.paperTemplate)
				.onChange(async (value) => {
					if (value && this.plugin.app.vault.getAbstractFileByPath(value) == null) {
						new Notice("The template file doesn't exist in the vault.", 5000)
					}
					this.plugin.settings.paperTemplate = value;
					await this.plugin.saveSettings();
				}));


		new Setting(containerEl)
			.setName('Paper Note Title Template')
			.setDesc('Template title to use for new notes')
			.addText(text => text
				.setPlaceholder('Enter title')
				.setValue(this.plugin.settings.titleTemplate)
				.onChange(async (value) => {
					this.plugin.settings.titleTemplate = value;
					await this.plugin.saveSettings();
				}));

	}
}
