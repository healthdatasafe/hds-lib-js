---
layout: default
title: Content-Security-Policy
---

# Content-Security-Policy

`hds-lib` runs under a strict CSP. It needs **no `'unsafe-eval'`** and **no `'unsafe-inline'`**
for scripts.

---

## `unsafe-eval` is not required (since 2.6.2)

Up to and including **2.6.1** it was. The AppTemplate loader built its JSON-schema validator with
Ajv at import time, and Ajv 8 compiles schemas by handing generated source to the `Function`
constructor — which `script-src 'self'` refuses.

The failure was not graceful. The compile ran at module top level, so the throw happened while the
module graph was still initialising: the consuming application rendered a **blank page** rather
than degrading to "validation skipped". An integrator hitting this saw a dead app and no obvious
cause.

From **2.6.2** the validator is precompiled at build time (`npm run build:validators`) and shipped
as plain JavaScript, so nothing generates code from strings at runtime. `ajv` moved to
`devDependencies` and is no longer part of the browser bundle at all.

Regression tests live in [`tests/validatorDrift.test.js`](https://github.com/healthdatasafe/hds-lib-js/blob/main/tests/validatorDrift.test.js).
`[VDR7]` imports the loader in a Node process started with `--disallow-code-generation-from-strings`,
which fails on exactly the same constructs a CSP without `'unsafe-eval'` does, so the property is
verified rather than assumed.

---

## Origins to allow

`hds-lib` contacts **one** hardcoded origin: the service-info URL you configure with
`settings.setServiceInfoURL()`. Everything else is discovered from that document's `assets` map at
runtime, which is why the list below differs per platform — read `service/info` for your own
deployment rather than copying these values if you are not on an HDS platform.

### HDS production (`reg.api.datasafe.dev`)

| Purpose | Origin | CSP directive |
|---|---|---|
| Service info + registration | `https://reg.api.datasafe.dev` | `connect-src` |
| Per-user core API | `https://*.api.datasafe.dev` | `connect-src` |
| Access / auth polling | `https://access.api.datasafe.dev` | `connect-src` |
| Data model pack | `https://model.datasafe.dev` | `connect-src` |
| Asset definitions | `https://healthdatasafe.github.io` | `connect-src` |
| Datasets | `https://datasets.datasafe.dev` | `connect-src` |
| Sign-in button CSS | `https://healthdatasafe.github.io` | `style-src` |
| Sign-in button / favicon images | `https://healthdatasafe.github.io` | `img-src` |

### HDS demo (`demo.datasafe.dev`)

Same shape, three substitutions: the API, register and access origins all collapse to
`https://demo.datasafe.dev`; datasets is `https://demo-datasets.datasafe.dev`; asset definitions
come from `assets-demo` rather than `assets-prod` on the same `healthdatasafe.github.io` host.

### A working policy (production)

```
default-src 'none';
script-src  'self';
style-src   'self' https://healthdatasafe.github.io;
img-src     'self' data: https://healthdatasafe.github.io;
connect-src 'self'
            https://reg.api.datasafe.dev
            https://*.api.datasafe.dev
            https://access.api.datasafe.dev
            https://model.datasafe.dev
            https://datasets.datasafe.dev
            https://healthdatasafe.github.io;
```

`style-src` carries no `'unsafe-inline'` here. If your framework injects inline styles (many do in
development), that requirement comes from the framework, not from `hds-lib`.

---

## Two origins you do *not* need

Both appear in ecosystem documentation and neither belongs in a browser CSP:

- **`https://pryv.github.io`** — the Pryv JS library's built-in *fallback* for asset definitions
  (`assets-pryv.me`). It is used only when `service/info` supplies no `assets.definitions`. Every
  HDS platform supplies one, so the fallback never fires.
- **`https://pryv.github.io/event-types/flat.json`** — the event-types dictionary is fetched by
  the **core, server-side**, not by the browser.
