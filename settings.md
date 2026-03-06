---
layout: default
title: Settings
---

# Settings

Global configuration for the library. Affects `HDSModel`, `HDSService`, and localization.

## settings.setServiceInfoURL(url)

Set the default HDS service info endpoint. Used by `HDSModel` initialization and `HDSService`.

```javascript
HDSLib.settings.setServiceInfoURL('https://demo.datasafe.dev/reg/service/info');
```

**Default:** `https://demo.datasafe.dev/reg/service/info`

## settings.getServiceInfoURL()

Returns the currently configured service info URL.

```javascript
const url = HDSLib.settings.getServiceInfoURL();
```

## settings.setPreferredLocales(locales)

Set the preferred language order for localized text. Supported locales: `en`, `fr`, `es`.

```javascript
// French first, then English
HDSLib.settings.setPreferredLocales(['fr', 'en']);
```

**Default order:** `['en', 'fr', 'es']`

See [Localization](localization) for details on how localized text is handled.
