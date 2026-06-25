// Kontaktverwaltung für den Crypt-Messenger (Svelte 5 Runes).
// Zero-Knowledge: alles client-seitig in localStorage, nichts geht an den Server.
const STORAGE_KEY = 'astoris-crypt-contacts';

export type Contact = {
	id: string;
	name: string;
	channel: string;
	address: string;
	key: string;
};

class ContactsState {
	#list = $state<Contact[]>([]);
	#loaded = false;

	// Lazy-Init: erst beim ersten Zugriff aus localStorage laden (kein localStorage auf dem Server).
	#ensure() {
		if (this.#loaded) return;
		this.#loaded = true;
		if (typeof localStorage === 'undefined') return;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) this.#list = parsed.filter((c) => c && c.id);
			}
		} catch {
			/* ignore corrupt storage */
		}
	}

	#persist() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#list));
		} catch {
			/* ignore quota / private mode */
		}
	}

	all(): Contact[] {
		this.#ensure();
		return this.#list;
	}

	add(c: Omit<Contact, 'id'> & { id?: string }): Contact {
		this.#ensure();
		const contact: Contact = {
			id: c.id ?? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `c${Date.now()}${Math.random().toString(36).slice(2, 8)}`),
			name: c.name,
			channel: c.channel,
			address: c.address,
			key: c.key
		};
		this.#list = [...this.#list, contact];
		this.#persist();
		return contact;
	}

	remove(id: string) {
		this.#ensure();
		this.#list = this.#list.filter((c) => c.id !== id);
		this.#persist();
	}
}

export const contacts = new ContactsState();
