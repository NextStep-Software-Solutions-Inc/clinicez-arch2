/**
 * Shared noun pluralization helpers for profile record summaries.
 */

const IRREGULAR_PLURALS: Record<string, string> = {
  address: 'addresses',
  allergy: 'allergies',
  disability: 'disabilities',
  entry: 'entries',
  illness: 'illnesses',
  pregnancy: 'pregnancies',
};

export function pluralizeNoun(noun: string): string {
  const lower = noun.toLowerCase();
  if (IRREGULAR_PLURALS[lower]) {
    return IRREGULAR_PLURALS[lower];
  }
  if (/[^aeiou]y$/i.test(noun)) {
    return `${noun.slice(0, -1)}ies`;
  }
  if (/(?:s|sh|ch|x|z)$/i.test(noun)) {
    return `${noun}es`;
  }
  return `${noun}s`;
}

export function pluralizeCount(n: number, noun: string): string {
  if (n === 0) return 'None';
  return `${n} ${n === 1 ? noun : pluralizeNoun(noun)}`;
}
