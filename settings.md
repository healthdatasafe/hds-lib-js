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

## saveLanguage(locale, options?)

Saves the person's language in the two places that hold it, as the account app's Preferences page does:

1. the account-level `preferredLocales` (`HDSProfile`, stream `profile-preferences`), read by every HDS app: the
   language becomes its only entry, and the localizer switches to it;
2. the Pryv core `account.language`, which the platform uses for its own mail (password reset). Best effort: it
   needs a personal token, and a refusal does not fail the save.

```javascript
import { HDSProfile, saveLanguage } from 'hds-lib';

await HDSProfile.hookToConnection(connection);
const { coreLanguageSaved, coreError } = await saveLanguage('fr');
if (!coreLanguageSaved) showNotice('Saved for HDS apps; platform e-mails stay in the previous language.');
```

`options.connection` sends `account.update` through another connection than the one HDSProfile is hooked to. The
call rejects only when the profile write fails (HDSProfile not hooked, write refused).
