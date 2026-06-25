import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Dedicated, configurable vision endpoint (OpenAI-compatible, e.g. qwen2.5-vl-3b).
// The saved 'local-models' chat connection is NOT necessarily the vision model.
const VISION_BASE = (env.VISION_URL ?? 'http://localhost:8003').replace(/\/$/, '');
const DEFAULT_MODEL = 'qwen2.5-vl-3b';
const VISION_ERR = 'Vision-Modell nicht erreichbar — unter Verbindungen einrichten.';

/** Resolve the first served model id, fall back to the known default. */
async function pickModel(): Promise<string> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 5000);
	try {
		const res = await fetch(`${VISION_BASE}/v1/models`, { signal: ctrl.signal });
		if (!res.ok) return DEFAULT_MODEL;
		const data = await res.json();
		return data?.data?.[0]?.id ?? DEFAULT_MODEL;
	} catch {
		return DEFAULT_MODEL;
	} finally {
		clearTimeout(t);
	}
}

export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	const image = typeof body?.image === 'string' ? body.image.trim() : '';
	const prompt =
		typeof body?.prompt === 'string' && body.prompt.trim()
			? body.prompt.trim()
			: 'Beschreibe dieses Bild detailliert.';

	// Expect a data URL (data:image/...;base64,...) from the client FileReader.
	if (!image || !image.startsWith('data:image/')) {
		return json({ error: 'Kein gültiges Bild übermittelt.' }, { status: 400 });
	}

	const model = await pickModel();
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 60000); // 60s timeout for vision inference

	try {
		const res = await fetch(`${VISION_BASE}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				model,
				max_tokens: 512,
				messages: [
					{
						role: 'user',
						content: [
							{ type: 'text', text: prompt },
							{ type: 'image_url', image_url: { url: image } }
						]
					}
				]
			}),
			signal: ctrl.signal
		});
		if (!res.ok) return json({ error: VISION_ERR }, { status: 502 });
		const data = await res.json();
		const msg = data?.choices?.[0]?.message ?? {};
		const description = String(msg.content || msg.reasoning_content || '').trim();
		if (!description) return json({ error: VISION_ERR }, { status: 502 });
		return json({ description });
	} catch {
		return json({ error: VISION_ERR }, { status: 502 });
	} finally {
		clearTimeout(t);
	}
}
