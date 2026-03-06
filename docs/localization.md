---
layout: default
title: Localization
---

# Localization

The library uses `localizableText` objects for all user-facing strings.

## localizableText type

```typescript
type localizableText = {
  en: string;    // Required
  fr?: string;   // Optional
  es?: string;   // Optional
};
```

## localizeText(textItem)

Returns the best available translation based on preferred locale order.

```javascript
const text = { en: 'Weight', fr: 'Poids' };

HDSLib.settings.setPreferredLocales(['fr', 'en']);
HDSLib.localizeText(text); // => "Poids"

HDSLib.settings.setPreferredLocales(['es', 'en']);
HDSLib.localizeText(text); // => "Weight" (falls back to en)
```

**Alias:** `HDSLib.l(text)` is equivalent to `HDSLib.localizeText(text)`.

## Locale management functions

| Function | Description |
|----------|-------------|
| `setPreferredLocales(locales)` | Set language priority order |
| `getPreferredLocales()` | Get current locale order |
| `getSupportedLocales()` | Returns `['en', 'fr', 'es']` |
| `resetPreferredLocales()` | Reset to default order |
| `validateLocalizableText(key, text)` | Validate structure; throws `HDSLibError` if invalid |

## Validation

```javascript
// Throws HDSLibError — missing 'en' key
HDSLib.localizeText.validateLocalizableText('title', { fr: 'Titre' });
```
