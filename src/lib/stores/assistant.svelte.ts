// Hält den flüchtigen Assistent-/Crypt-Zustand modul-weit, damit er beim Wechsel
// zwischen App-Bereichen (Navigation zerstört die Seite) erhalten bleibt.
class AssistantState {
	mode = $state<'chat' | 'crypt'>('chat');
	// Assistent-Chat
	messages = $state<unknown[]>([]);
	draft = $state('');
	currentChatId = $state<string | null>(null);
	activePersonaId = $state('astoris');
	// Crypt-Messenger
	cryptPass = $state('');
	cryptChannel = $state('telegram');
	cryptRecipient = $state('');
	cryptDraft = $state('');
	cryptMessages = $state<unknown[]>([]);
}
export const assistant = new AssistantState();
