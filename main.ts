import {App, debounce, Notice, Plugin, PluginSettingTab, Setting, TFile} from 'obsidian';
import {Article, extract_arxiv_id_from_url, search_for_articles_by_id} from "./arxiv-api";
import AsyncSuggestionModal from "./AsyncSuggestionModal";

const Mustache = require('mustache');

interface PaperClipperSettings {
	paperTemplate?: string;
	titleTemplate?: string;
}

const DEFAULT_SETTINGS: PaperClipperSettings = {
	paperTemplate: "",
	titleTemplate: '{{id}}'
}

const DEFAULT_TEMPLATE = `
# {{{title}}}
**URL**:: {{{url}}}
**PDF**:: {{{pdf}}}
**Authors**:: {{{authorLinks}}}
**Tags**:: 

## Abstract
> {{{abstract}}}
## Notes`;

export default class PaperClipper extends Plugin {
	settings: PaperClipperSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'open-paper-clipper',
			name: 'Retrieve a paper by ID or URL',
			callback: () => {
				new PaperClipperModal(this).open();
			}
		});

		this.addSettingTab(new PaperClipperSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async createNote(article: Article): Promise<void> {
		const fields = this.makeTemplateFields(article);
		const titleTemplate: string = this.settings.titleTemplate || "";
		let title = Mustache.render(titleTemplate, fields);
		if (!title.endsWith(".md")) {
			title += ".md";
		}
		const template = await this.loadTemplate();
		const note = Mustache.render(template, fields);
		console.log("creating a note with title:", title, note);
		let f: TFile|null = null;
		try {
			f = await this.app.vault.create(title, note);
		} catch (e) {
			console.error(e);
			new Notice(`Failed to create note with title ${title}: ${e}`);
			throw e;
		}
		if (!f) {
			try {
				const tafile = await this.app.vault.getAbstractFileByPath(title)
				if (tafile instanceof TFile) {
					f = tafile;
				}
			} catch (e) {
				console.error(e);
				new Notice(`Failed to get note with title ${title}: ${e}`);
				throw e;
			}
		}
		await this.app.workspace.getLeaf(false).openFile(f);
	}

	makeTemplateFields(article: Article):ArticleTemplateFields {
		const date = new Date().toISOString().split('T')[0];
		const real_id = extract_arxiv_id_from_url(article.id, false);
		const authorLinks = article.authors.map(a => `[[${a}]]`).join(', ');
		const abstract = article.abstract.replace(/\s+/g, ' ');
		const title = article.title.replace(/\s+/g, ' ');
		return {...article, date, id: real_id, url: article.id, authorLinks, abstract, title}
	}

	loadTemplate(): Promise<string> {
		if (!this.settings.paperTemplate) {
			return Promise.resolve(DEFAULT_TEMPLATE);
		}

		let path = this.settings.paperTemplate;
		if (!path.endsWith(".md")) {
			path = `${path}.md`;
		}
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file) {
			new Notice(`Failed to load template file ${path}. Using default template.`);
			return Promise.resolve(DEFAULT_TEMPLATE);
		}

		return this.app.vault.cachedRead(file as TFile)

	}
}

interface ArticleTemplateFields extends Article {
	date: string;
	url: string;
	authorLinks: string;
}


class PaperClipperModal extends AsyncSuggestionModal<Article> {

	constructor(plugin: PaperClipper) {
		super(plugin.app);
		this.plugin = plugin;
	}

	articles?: Article[];
	plugin: PaperClipper;

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

	async getSuggestionsAsync(query: string): Promise<Article[]> {
		// query can either be an id or a url from arxiv
		// if it's a url, we'll extract the id from the url
		// arxiv urls look like https://arxiv.org/abs/1812.01097 or https://arxiv.org/pdf/1812.01097(.pdf)?
		// we'll extract the id from the url
		const id = extract_arxiv_id_from_url(query, true);
		if (id)	{
			query = id
		}
		return await search_for_articles_by_id(query);
	}

	onChooseSuggestion(item: Article, evt: MouseEvent | KeyboardEvent): Promise<void> {
		// TODO: should we insert into the current note sometimes?
		console.log("Chose", item);
		return this.plugin.createNote(item);
	}

	renderSuggestion(value: Article, el: HTMLElement): void {
		el.innerText = value.title;
	}
}

class PaperClipperSettingTab extends PluginSettingTab {
	plugin: PaperClipper;

	constructor(app: App, plugin: PaperClipper) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for Paper Clipper'});

		const setting_update_warning = debounce((value: string) => {
			if (!value.endsWith(".md")) {
				value = `${value}.md`;
			}
			if (value && this.plugin.app.vault.getAbstractFileByPath(value) == null) {
				new Notice("The template file doesn't exist in the vault.", 5000)
			}
		}, 250, true);

		new Setting(containerEl)
			.setName('Paper Note Template')
			.setDesc('Note to use as a template for new papers')
			.addText(text => text
				.setPlaceholder('Enter path to template')
				.setValue(this.plugin.settings.paperTemplate)
				.onChange(async (value) => {
					setting_update_warning(value)
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

		const settings_info_div = containerEl.createDiv({});
		const info = containerEl.createEl('p', {
			text: 'The template is a markdown file with templates rendered via mustache,' +
				'which means you should use triple {{{}}} to handle html in the way you probably want.' +
				'The title is also a mustache template.' +
				'You can use the following variables:'});
		settings_info_div.appendChild(info);
		const list = containerEl.createEl('ul');
		// NOTE: Keep synced with Article and ArticleTemplateFields
		list.appendChild(containerEl.createEl('li', {
			text: '{{{title}}} - the title of the paper'}));
		list.appendChild(containerEl.createEl('li', {
			text: '{{{authors}}} - the authors of the paper. Will be comma separated'}));
		list.appendChild(containerEl.createEl('li', {
			text: '{{{authorLinks}}} - the authors of the paper formatted as Obsidian links. Will be comma separated'}));
		list.appendChild(containerEl.createEl('li', {
			text: "{{{date}}} - today's date"}));
		list.appendChild(containerEl.createEl('li', {
			text: '{{{url}}} - the url of the paper'}));
		list.appendChild(containerEl.createEl('li', {
			text: '{{{id}}} - the arxiv id of the paper'}));
		list.appendChild(containerEl.createEl('li', {
			text: '{{{pdf}}} - the url of the pdf of the paper'}));
		list.appendChild(containerEl.createEl('li', {
			text: '{{{abstract}}} - the abstract of the paper'}));
		list.appendChild(containerEl.createEl('li', {
			text: '{{{published}}} - the published date of the paper'}));
		list.appendChild(containerEl.createEl('li', {
			text: '{{{updated}}} - the updated date of the paper'}));



	}
}
