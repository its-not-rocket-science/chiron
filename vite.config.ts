import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';

export default defineConfig({
	// prompt.txt Prompt G3: sentrySvelteKit() must come before sveltekit()
	// in this array (Sentry's own documented ordering). Source-map upload
	// only actually attempts anything when SENTRY_AUTH_TOKEN is present in
	// the build environment — autoUploadSourceMaps: false otherwise, so a
	// normal `npm run build` with no Sentry credentials configured (every
	// local checkout, and CI until someone sets these as repo secrets —
	// see docs/OPERATIONS.md) still builds clean rather than warning or
	// failing on a missing token.
	//
	// autoInstrument: false — this plugin's default auto-wraps every
	// +page.server.ts `load` export with a span-creating wrapper
	// (wrapServerLoadWithSentry) that expects a real SvelteKit
	// ServerLoadEvent (reads event.request.method, etc.). This codebase's
	// own established test pattern calls a route's exported `load`
	// directly with a hand-built fake event object (e.g.
	// tests/rls/lessonDetailAccess.spec.ts's fakeLoadEvent helper) — found
	// breaking exactly those tests with "Cannot read properties of
	// undefined (reading 'method')" once this plugin was added. The
	// feature is pure tracing/performance instrumentation anyway (spans
	// have nowhere to go without tracesSampleRate set — see
	// hooks.server.ts's own comment on why tracing is deliberately never
	// enabled here), so disabling it costs nothing real.
	plugins: [
		sentrySvelteKit({
			autoUploadSourceMaps: Boolean(process.env.SENTRY_AUTH_TOKEN),
			autoInstrument: false
		}),
		tailwindcss(),
		sveltekit()
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
