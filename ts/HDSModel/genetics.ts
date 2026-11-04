/**
 * Genetic test results (data-model 3.43.0, site-agents#37): one `genetic-variant/coded-v1` event per tested variant,
 * under the `explicitGrantOnly` root `genetics`. See data-model documentation/GENETICS.md.
 */
export const GENETIC_VARIANT_CODED = 'genetic-variant/coded-v1';

/**
 * Short text of a `genetic-variant/coded-v1` content: "MTHFR C677T: C677T hétérozygote" with the result as printed,
 * else the coded result and zygosity ("MTHFR C677T: present, heterozygous"). Null when the content is not an object.
 */
export function geneticVariantText (content: any): string | null {
  if (content == null || typeof content !== 'object') return null;
  const name = [content.gene?.label, content.variant?.label].filter((s) => typeof s === 'string' && s !== '').join(' ');
  const printed = typeof content.resultText === 'string' && content.resultText !== '' ? content.resultText : null;
  const coded = [content.result, content.zygosity].filter((s) => typeof s === 'string' && s !== '').join(', ');
  const result = printed ?? (coded !== '' ? coded : null);
  if (name === '') return result;
  return result ? `${name}: ${result}` : name;
}
