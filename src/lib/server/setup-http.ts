import { error } from '@sveltejs/kit';
export async function setupBody(request: Request) {
	if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') error(415);
	if (!request.body) error(400);
	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let bytes = 0, text = '';
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > 32768) { await reader.cancel(); error(413); }
			text += decoder.decode(value, { stream: true });
		}
		text += decoder.decode();
	} finally { reader.releaseLock(); }
	try {
		const data = JSON.parse(text);
		if (!data || typeof data !== 'object' || Array.isArray(data)) error(400);
		return data as Record<string, unknown>;
	} catch { error(400, 'Ungültige Anfrage / invalid request.'); }
}
export function sameOrigin(request: Request, url: URL) {
	if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) error(403);
}
