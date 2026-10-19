import { expect, it, vi } from 'vitest';
import { AstorisClient } from '../sdk/astoris';
it('retains the authenticated session and encodes resource IDs', async () => {
	const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ ok: true }, { headers: { 'set-cookie': 'astoris_session=test; HttpOnly; Path=/' } }))
		.mockResolvedValueOnce(Response.json({ run: { id: 'safe' }, calls: [], events: [] }));
	const client = new AstorisClient('https://astoris.example.org', { fetch: fetchMock });
	await client.login('alice', 'test-only'); await client.getRun('a/b');
	expect(fetchMock.mock.calls[1][0]).toBe('https://astoris.example.org/api/runs/a%2Fb');
	expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ cookie: 'astoris_session=test' });
});
it('does not retry failed mutations', async () => {
	const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ message: 'conflict' }, { status: 409 }));
	await expect(new AstorisClient('https://astoris.example.org', { fetch: fetchMock }).approve('run', 'call')).rejects.toThrow('409');
	expect(fetchMock).toHaveBeenCalledTimes(1);
});
