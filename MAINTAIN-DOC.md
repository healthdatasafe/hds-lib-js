# Documentation Maintenance Guide

This file describes when and how to update the hds-lib-js documentation in `docs/`.

## Structure

```
docs/                          (source, in repo)
├── _config.yml                # Jekyll configuration for gh-pages
├── _layouts/
│   └── default.html           # Custom layout (nav bar, mermaid support)
├── index.md                   # Home: overview, architecture, export list
├── getting-started.md         # Installation, setup, browser/Node usage
├── settings.md                # Settings module reference
├── hds-model.md               # HDSModel, items, streams, authorizations, event types, datasources
├── app-templates.md           # Detailed App Templates guide (Manager, Collector, Invite, Client)
├── localization.md            # Localization utilities
├── toolkit.md                 # StreamsAutoCreate, StreamTools
├── utilities.md               # Duration, reminders, errors, logger
└── MAINTAIN-DOC.md            # This file (excluded from Jekyll build)
```

On build (`npm run build`), webpack copies docs flat into `dist/` alongside
the JS bundles and test files. `dist/` is the gh-pages branch root — Jekyll
processes it as a single flat site.

## When to update

### Always update docs when:

1. **Adding a new public method/property** to any exported class
   - Add it to the relevant section with signature, description, and example
   - If it's in appTemplates, update `app-templates.md`

2. **Changing method signatures** (parameters, return types)
   - Update the method documentation and any affected code examples

3. **Adding a new module or class**
   - Create a new page if warranted, or add a section to the most relevant existing page
   - Update `index.md` exports table and architecture diagram
   - Add to `_config.yml` nav if it's a new page

4. **Changing the appTemplates flow** (new statuses, new event types, new stream suffixes)
   - Update the sequence diagram, state diagrams, and SVG stream structure in `app-templates.md`

5. **Changing CollectorRequest structure** (new properties, new section types)
   - Update the data structure diagram and property tables in `app-templates.md`

6. **Adding or changing event types**
   - Update the event types table in `app-templates.md` and/or `hds-model.md`

7. **Changing the data model integration** (new HDSModel sub-modules, new item properties)
   - Update `hds-model.md`

### No doc update needed for:

- Internal refactoring that doesn't change the public API
- Bug fixes that don't change behavior
- Test changes
- Build/CI changes

## How to update

### Markdown conventions

- Use Jekyll front matter (`---\nlayout: default\ntitle: ...\n---`) on every page
- Use GitHub-Flavored Markdown (GFM)
- Use fenced code blocks with language tags (`javascript`, `typescript`, `bash`)
- Use Mermaid for flow/sequence/state diagrams (```mermaid blocks)

### Diagrams

- **ASCII trees** — Preferred for hierarchical/nested structures (stream structures, data models). They render everywhere, stay narrow, and are easy to edit.
- **Mermaid** — Use for flowcharts, sequence diagrams, state machines. Rendered by GitHub and most Jekyll themes with mermaid support.
- **Avoid inline SVG** — SVG does not render in most Markdown viewers (GitHub, Jekyll). Use ASCII or Mermaid instead.
- Keep diagram source editable (no rasterized images for diagrams).
- **Split complex diagrams** — When an architecture or overview diagram has multiple concerns (e.g., library modules + class relationships), split into separate graphs stacked vertically rather than one dense graph. This improves readability on all screen sizes.

### Code examples

- Every public method should have at least one usage example
- Examples should be copy-pasteable and realistic
- Use `const` and `await` consistently
- Show typical output in comments where helpful

### Adding a new page

1. Create `docs/new-page.md` with Jekyll front matter (`layout: default`, `title: ...`)
2. Add a nav link in `docs/_layouts/default.html`
3. Add link to the table in `docs/index.md`

## Publishing (gh-pages)

The `dist/` directory is a separate git checkout on the `gh-pages` branch.
Docs are copied flat into `dist/` by the webpack build alongside JS bundles.

**Deploy workflow:**
1. `npm run build` — compiles TS, bundles JS, copies docs to `dist/`
2. `npm run deploy` — commits and pushes `dist/` to gh-pages

Jekyll processes the gh-pages branch root. Our custom `_layouts/default.html`
provides the nav bar and mermaid rendering (no remote theme dependency).

**URL structure:** `https://healthdatasafe.github.io/hds-lib-js/{page}`

## Versioning

When the library version changes significantly, consider noting breaking changes at the top of affected pages. The docs track the current `main` branch — there is no versioned documentation (yet).

## Checklist for doc PRs

- [ ] Updated all affected pages
- [ ] Code examples are correct and tested
- [ ] Mermaid diagrams render (check on GitHub preview)
- [ ] Nav links in `_layouts/default.html` are up to date
- [ ] `index.md` exports table is up to date
- [ ] No broken internal links
