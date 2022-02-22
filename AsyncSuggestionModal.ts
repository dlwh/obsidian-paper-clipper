import {App, Instruction, ISuggestOwner, Modal, SuggestModal} from "obsidian";

import AwesomeDebouncePromise from "awesome-debounce-promise";

interface SuggestModalExt<T> extends SuggestModal<T> {
    chooser: ChooserExt<T>;
}

interface ChooserExt<T> {
    useSelectedItem(evt: MouseEvent | KeyboardEvent): void;
    setSuggestions(suggestions: T[]): void;
}

// This class is similar to SuggestionModal, but it is used for async suggestions.
// TODO: it depends on internals of Obsidian, so would be good to upstream...
export default abstract class AsyncSuggestionModal<T> extends SuggestModal<T> {

    constructor(app: App) {
        super(app);
    }

    // This is hacky. It intercepts the super's setSuggestions method, makes it async+debounced.
    updateSuggestions = () => {
        const t = this.inputEl.value;
        this.getSuggestionsDebounced(t).then(e => {
            if (e.length > 0) {
                if(this.limit && this.limit > 0) {
                    e = e.slice(0, this.limit);
                }
                (this as unknown as SuggestModalExt<T>).chooser.setSuggestions(e);
            } else {
                if (t) {
                    this.onNoSuggestion()
                } else {
                    (this as unknown as SuggestModalExt<T>).chooser.setSuggestions(null);
                }
            }
        });
    }

    private getSuggestionsDebounced = AwesomeDebouncePromise(this.getSuggestionsAsync, 250);

    getSuggestions(query: string): T[] {
        return [];
    }

    abstract getSuggestionsAsync(query: string): Promise<T[]>;
}
