# Domain layer

Pure TypeScript. No SvelteKit, no Svelte components, no direct
`@supabase/supabase-js` or Anthropic SDK imports — those live in
`src/lib/providers/` and get called through an interface.

- `taxonomy.ts`, `rubric.ts`, `subjectProfiles.ts` — grounding data (Prompt 3)
- `schemas.ts` — Zod schemas, the single source of truth for what counts as valid domain data; `types.ts` re-exports the inferred TS types
- `library.ts` — visibility/org-boundary rules (who can view/edit/feature a lesson)
- `versioning.ts` — lesson version numbering and before/after score comparison

See `docs/ARCHITECTURE.md` Section 1, 3, and 10. The scoring engine
(Prompt 6) and file-parsing pipeline (`providers/`, Prompt 4) build on
these types but aren't domain-layer code themselves.
