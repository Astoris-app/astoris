// Real first-time UI workflow, isolated data and deterministic local model only.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = mkdtempSync(join(tmpdir(), 'astoris-browser-smoke-'));
const browserErrors = [], unauthorized = [];
let requests = 0, browser, child, exited;
async function listen(server) {
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	return server.address().port;
}
const plan = {
	summary: 'A small, fictional company for a safe first-time workflow.',
	profile: { name: 'Example Workshop', industry: 'Digital services', mission: 'Make internal processes understandable.' },
	roles: [{ title: 'Coordination', description: 'Prepare internal tasks.' }],
	goals: [{ title: 'First checklist', description: 'Describe a fictional inquiry process.' }], connectors: []
};
const model = createServer(async (request, response) => {
	if (request.url === '/v1/models') {
		response.setHeader('content-type', 'application/json');
		response.end(JSON.stringify({ data: [{ id: 'browser-test-model' }] })); return;
	}
	let raw = ''; for await (const chunk of request) raw += chunk;
	const body = JSON.parse(raw);
	assert.ok(!body.tools?.length, 'Setup planning must not offer tools');
	requests++;
	const value = requests === 1 ? { kind: 'questions', questions: ['What is the first goal?'] } : { kind: 'plan', plan };
	response.setHeader('content-type', 'text/event-stream');
	response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(value) } }] })}\n\ndata: [DONE]\n\n`);
});
try {
	const modelPort = await listen(model), probe = createServer();
	const appPort = await listen(probe); await new Promise((done) => probe.close(done));
	const base = `http://127.0.0.1:${appPort}`;
	child = spawn(process.execPath, [join(root, 'build/index.js')], { cwd: fixture, stdio: 'ignore', env: {
		NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(appPort), ORIGIN: base,
		ASTORIS_MASTER_KEY: randomBytes(32).toString('hex')
	} });
	exited = once(child, 'exit');
	let ready = false;
	for (let i = 0; i < 100; i++) {
		try { if ((await fetch(base + '/api/setup')).ok) { ready = true; break; } } catch { /* booting */ }
		await delay(50);
	}
	assert.ok(ready, 'Production build must start');
	for (const path of ['/api/company', '/api/companies', '/api/connections', '/api/engine']) {
		assert.equal((await fetch(base + path)).status, 401);
	}
	assert.equal((await fetch(base + '/api/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
	browser = await chromium.launch({ headless: true, ...(process.env.ASTORIS_BROWSER_EXECUTABLE ? { executablePath: process.env.ASTORIS_BROWSER_EXECUTABLE } : {}) });
	const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 1440, height: 1000 } });
	const page = await context.newPage();
	const screenshot = async (name) => {
		const directory = process.env.ASTORIS_BROWSER_SCREENSHOTS_DIR;
		if (!directory) return;
		mkdirSync(directory, { recursive: true, mode: 0o700 });
		await page.screenshot({ path: join(directory, name + '.png') });
	};
	page.on('pageerror', (error) => browserErrors.push(error.message));
	page.on('response', (r) => { if (r.url().startsWith(base + '/api/') && r.status() === 401) unauthorized.push(new URL(r.url()).pathname); });
	const json = async (path) => {
		const r = await context.request.get(base + path); assert.equal(r.status(), 200, path); return r.json();
	};
	await page.goto(base + '/welcome', { waitUntil: 'networkidle' });
	await expect(page).toHaveURL(base + '/login');
	await page.setViewportSize({ width: 320, height: 568 });
	await page.locator('details > summary').click();
	await expect(page.locator('#setup-token')).toBeVisible();
	await page.locator('form button.primary').scrollIntoViewIfNeeded();
	await expect(page.locator('form button.primary')).toBeInViewport();
	assert.ok(await page.locator('.wrap').evaluate((e) => e.scrollWidth <= e.clientWidth));
	await screenshot('login-setup-mobile');
	await page.locator('details > summary').click();
	await page.setViewportSize({ width: 1440, height: 1000 });
	await expect(page.getByLabel('Benutzername', { exact: true })).toBeVisible();
	await page.locator('#setup-user').fill('test-operator');
	const testAccessValue = randomUUID();
	await page.locator('#setup-password').fill(testAccessValue);
	await page.locator('#setup-repeat').fill(testAccessValue);
	await page.locator('#setup-repeat').press('Enter');
	await expect(page).toHaveURL(base + '/welcome');
	await page.locator('.nav button').last().click();
	await page.getByRole('button', { name: 'Weiter', exact: true }).click();
	await page.locator('.choice').filter({ has: page.locator('strong', { hasText: /^Firma$/ }) }).click();
	await page.getByRole('button', { name: 'Weiter', exact: true }).click();
	await page.locator('#wz-name').fill('Fictional Workshop');
	await page.getByRole('button', { name: 'Weiter', exact: true }).click();
	await page.locator('#wz-mission').fill('Test the full first-time workflow.');
	await page.getByRole('button', { name: 'Weiter', exact: true }).click();
	await page.getByRole('button', { name: 'Weiter', exact: true }).click();
	const saved = page.waitForResponse((r) => r.url() === base + '/api/companies' && r.request().method() === 'POST');
	await page.getByRole('button', { name: 'Firma einrichten', exact: true }).click();
	assert.equal((await saved).status(), 200, 'Company setup must succeed with the new browser session');
	// Skip optional connections first: verify the missing-model guidance without bypassing the tour.
	await page.getByRole('button', { name: 'Überspringen', exact: true }).click();
	await page.getByRole('button', { name: 'Überspringen', exact: true }).click();
	await page.getByRole('button', { name: 'Zum Arbeitsbereich', exact: true }).click();
	await page.goto(base + '/einrichten', { waitUntil: 'networkidle' });
	await expect(page.getByText('Noch kein Modell eingerichtet', { exact: true })).toBeVisible();
	await page.locator('#brief').fill('Prepare a fictional company.');
	await expect(page.getByRole('button', { name: 'Plan vorschlagen lassen', exact: true })).toBeDisabled();
	await screenshot('setup-model-missing');
	await expect(page.locator('details.advanced')).not.toHaveAttribute('open', '');
	await page.getByRole('link', { name: 'KI-Modell einrichten', exact: true }).first().click();
	await expect(page).toHaveURL(base + '/connections#ai-models');
	await expect(page.locator('#ai-models')).toBeInViewport();
	const local = page.locator('#ai-models article').filter({ has: page.getByRole('heading', { name: 'KI-Modelle', exact: true }) });
	await local.getByRole('button', { name: 'Verbinden', exact: true }).click();
	// The local connection is entered through the same browser dialog as a real user.
	await page.getByRole('dialog').getByLabel('Endpoint', { exact: true }).fill(`http://127.0.0.1:${modelPort}`);
	const connectionSaved = page.waitForResponse((r) => r.url() === base + '/api/connections' && r.request().method() === 'POST');
	await page.getByRole('dialog').locator('.dactions button.primary').click();
	assert.ok((await (await connectionSaved).json()).saved);
	await page.goto(base + '/einrichten', { waitUntil: 'networkidle' });
	await expect(page.getByText('Modell eingerichtet', { exact: true })).toBeVisible();
	await expect(page.getByText('Noch kein Modell eingerichtet', { exact: true })).toHaveCount(0);
	await page.locator('#brief').fill('A fictional company with a clear internal checklist.');
	await page.getByRole('button', { name: 'Plan vorschlagen lassen', exact: true }).click();
	await expect(page.locator('#answers')).toBeFocused();
	await page.locator('#answers').fill('A single fictional checklist.');
	await page.getByRole('button', { name: 'Plan vorschlagen lassen', exact: true }).click();
	await expect(page.locator('article.plan')).toBeFocused();
	await screenshot('plan-review-focused');
	const apply = page.getByRole('button', { name: 'Plan übernehmen', exact: true });
	await expect(apply).toBeDisabled();
	assert.equal((await json('/api/company')).company.name, 'Fictional Workshop');
	await page.getByRole('checkbox', { name: /Ich habe das vorgeschlagene/ }).check();
	await apply.click(); await expect(page.locator('article.plan').getByText('Übernommen', { exact: true })).toBeVisible();
	assert.equal((await json('/api/company')).company.name, 'Example Workshop');
	await expect(page.getByRole('link', { name: /Team prüfen/ })).toBeVisible();
	for (const lang of ['de', 'en']) for (const mode of ['dark', 'light']) for (const width of [320, 390, 1440]) {
		await page.evaluate(({ lang, mode }) => { localStorage.setItem('astoris-lang', lang); localStorage.setItem('astoris-mode', mode); }, { lang, mode });
		await page.setViewportSize({ width, height: 1000 });
		await page.reload({ waitUntil: 'networkidle' }); await delay(450);
		assert.ok(await page.locator('.scroll').evaluate((e) => e.scrollWidth <= e.clientWidth), `${lang}/${mode}/${width} overflow`);
		if (lang === 'de') await screenshot(`setup-${mode}-${width}`);
	}
	await page.locator('details.advanced > summary').click();
	await page.locator('#access-name').fill('Temporary browser verification');
	await page.getByRole('button', { name: 'Create access', exact: true }).click();
	await expect(page.locator('textarea[readonly]')).toBeVisible();
	await page.getByRole('button', { name: 'Hide credential', exact: true }).click();
	await expect(page.locator('textarea[readonly]')).toHaveCount(0);
	page.once('dialog', (d) => d.accept()); await page.getByRole('button', { name: 'Revoke', exact: true }).click();
	await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
	assert.ok((await json('/api/agent-access')).accesses[0].revokedAt);
	assert.deepEqual(browserErrors, []); assert.deepEqual(unauthorized, []);
	await context.request.post(base + '/api/auth', { data: { action: 'logout' } });
	await page.goto(base + '/login', { waitUntil: 'networkidle' });
	await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
	await page.getByLabel('Username', { exact: true }).fill('test-operator');
	await page.getByLabel('Password', { exact: true }).fill(testAccessValue);
	await page.getByLabel('Password', { exact: true }).press('Enter');
	await expect(page).toHaveURL(base + '/');
	assert.deepEqual(browserErrors, []); assert.deepEqual(unauthorized, []);
	console.log('Browser passed: fresh login → company tour → model connection → follow-up focus → explicit approval; DE/EN, dark/light, 320/390/1440px, token hide/revoke, no JS errors or unexpected 401s.');
} finally {
	await browser?.close();
	if (child && child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited; }
	await new Promise((done) => { model.close(done); model.closeAllConnections(); });
	assert.ok(fixture.startsWith(join(tmpdir(), 'astoris-browser-smoke-')));
	rmSync(fixture, { recursive: true, force: true });
}
