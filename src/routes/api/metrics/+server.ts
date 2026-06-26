import { json } from '@sveltejs/kit';
import {
	getMetrics,
	addMetric, updateMetric, removeMetric, addMeasurement
} from '$lib/server/metrics';

export async function GET() {
	return json({ metrics: getMetrics().metrics });
}

export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const action = b?.action;
	const id = (b?.id ?? '').toString();

	if (action === 'add-metric') {
		const name = (b.name ?? '').toString().trim();
		if (!name) return json({ metrics: getMetrics().metrics });
		addMetric({
			name,
			unit: (b.unit ?? '').toString(),
			category: (b.category ?? '').toString(),
			target: b.target,
			current: b.current
		});
		return json({ metrics: getMetrics().metrics });
	}

	if (action === 'update-metric') {
		const patch: Record<string, unknown> = {};
		if ('name' in b) patch.name = (b.name ?? '').toString();
		if ('unit' in b) patch.unit = (b.unit ?? '').toString();
		if ('category' in b) patch.category = (b.category ?? '').toString();
		if ('target' in b) patch.target = b.target;
		if ('current' in b) patch.current = b.current;
		updateMetric(id, patch);
		return json({ metrics: getMetrics().metrics });
	}

	if (action === 'remove-metric') {
		removeMetric(id);
		return json({ metrics: getMetrics().metrics });
	}

	if (action === 'add-measurement') {
		const value = Number(b.value);
		if (id && Number.isFinite(value)) addMeasurement(id, value);
		return json({ metrics: getMetrics().metrics });
	}

	return json({ metrics: getMetrics().metrics });
}
