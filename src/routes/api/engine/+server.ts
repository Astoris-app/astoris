import { json } from '@sveltejs/kit';
import { engineStatus } from '$lib/server/engine';

export async function GET() {
	return json(await engineStatus());
}
