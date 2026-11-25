import { localizeText } from '../localizeText.ts';

/**
 * The stamp charted on one day of a stamp-based chart (data-model 4.32.0, site-agents#67): `{ method, stamp }`. Chart
 * notation, never a statement about fertility. See data-model documentation/MENSTRUAL-CYCLE.md § Charted stamp.
 */
export const CHART_STAMP = 'fertility/chart-stamp-v1';

const STAMP_LABELS: Record<string, Record<string, string>> = {
  red: { en: 'Red', fr: 'Rouge', es: 'Rojo', it: 'Rosso', 'pt-BR': 'Vermelho' },
  green: { en: 'Green', fr: 'Vert', es: 'Verde', it: 'Verde', 'pt-BR': 'Verde' },
  'green-baby': { en: 'Green with a baby', fr: 'Vert avec un bébé', es: 'Verde con un bebé', it: 'Verde con un bambino', 'pt-BR': 'Verde com um bebê' },
  'white-baby': { en: 'White with a baby', fr: 'Blanc avec un bébé', es: 'Blanco con un bebé', it: 'Bianco con un bambino', 'pt-BR': 'Branco com um bebê' },
  yellow: { en: 'Yellow', fr: 'Jaune', es: 'Amarillo', it: 'Giallo', 'pt-BR': 'Amarelo' },
  'yellow-baby': { en: 'Yellow with a baby', fr: 'Jaune avec un bébé', es: 'Amarillo con un bebé', it: 'Giallo con un bambino', 'pt-BR': 'Amarelo com um bebê' }
};

/** Short text of a charted stamp: its name, "Yellow with a baby" (an unknown one as stored). Null without a stamp. */
export function chartStampText (content: any): string | null {
  const stamp = content?.stamp;
  if (typeof stamp !== 'string' || stamp === '') return null;
  return (Object.hasOwn(STAMP_LABELS, stamp) ? localizeText(STAMP_LABELS[stamp]) : null) || stamp;
}
