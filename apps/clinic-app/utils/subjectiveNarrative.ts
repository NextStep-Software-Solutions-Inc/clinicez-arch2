export interface SymptomNarrativeItem {
  optionCode: string;
  symptomName?: string | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PROTECTED_PREFIX_REGEX = /^((?:Patient presents with|Follow-up):[^.\n]*\.)(.*)$/is;

function splitProtectedPrefix(narrative: string): { prefix: string; body: string } {
  const match = narrative.match(PROTECTED_PREFIX_REGEX);
  if (!match) {
    return { prefix: '', body: narrative };
  }
  return { prefix: match[1], body: (match[2] ?? '').trim() };
}

function joinProtectedPrefix(prefix: string, body: string): string {
  const trimmedBody = body.trim();
  if (!prefix) return trimmedBody;
  if (!trimmedBody) return prefix;
  return `${prefix} ${trimmedBody}`;
}

export function hasStandaloneSymptomInText(text: string, symptomLabel: string): boolean {
  const trimmedLabel = symptomLabel.trim();
  if (!trimmedLabel || !text.trim()) return false;
  const escaped = escapeRegExp(trimmedLabel);
  const pattern = new RegExp(`(?:^|[,.:;\\n][ \\t]*)${escaped}(?=[ \\t]*(?:[,.;\\n]|$))`, 'i');
  return pattern.test(text);
}

export function appendSymptomToNarrative(narrative: string, symptomLabel: string): string {
  const trimmedLabel = symptomLabel.trim();
  if (!trimmedLabel) return narrative;

  const { prefix, body } = splitProtectedPrefix(narrative);
  if (hasStandaloneSymptomInText(body, trimmedLabel)) {
    return narrative;
  }

  const trimmedBody = body.trim();
  if (!trimmedBody) {
    return joinProtectedPrefix(prefix, trimmedLabel);
  }

  const cleanedBody = trimmedBody.replace(/,\s*$/, '');
  const separator =
    cleanedBody.endsWith('.') || cleanedBody.endsWith(':') || cleanedBody.endsWith(';')
      ? ' '
      : ', ';
  const nextBody = `${cleanedBody}${separator}${trimmedLabel}`;
  return joinProtectedPrefix(prefix, nextBody);
}

export function removeSymptomFromNarrative(narrative: string, symptomLabel: string): string {
  const trimmedLabel = symptomLabel.trim();
  if (!trimmedLabel || !narrative.trim()) return narrative;

  const { prefix, body } = splitProtectedPrefix(narrative);
  if (!body.trim()) return narrative;

  const escaped = escapeRegExp(trimmedLabel);
  let nextBody = body.trim();

  // 1. Preceded by a comma (middle or trailing item, safe even if symptomLabel itself contains ", ")
  const afterCommaRegex = new RegExp(`,[ \\t]*${escaped}(?=[ \\t]*(?:[,.;\\n]|$))`, 'i');
  // 2. First item followed by a comma and subsequent items
  const beforeCommaRegex = new RegExp(`(^|[.:;\\n])[ \\t]*${escaped}[ \\t]*,[ \\t]*`, 'i');
  // 3. Standalone / sole item in body or sentence clause
  const soleItemRegex = new RegExp(`(^|[.:;\\n])[ \\t]*${escaped}[ \\t]*,?[ \\t]*(?=[.;\\n]|$)`, 'i');

  if (afterCommaRegex.test(nextBody)) {
    nextBody = nextBody.replace(afterCommaRegex, '');
  } else if (beforeCommaRegex.test(nextBody)) {
    nextBody = nextBody.replace(beforeCommaRegex, (_, sep: string) => (sep ? `${sep} ` : ''));
  } else if (soleItemRegex.test(nextBody)) {
    nextBody = nextBody.replace(soleItemRegex, '$1');
  }

  nextBody = nextBody
    .replace(/,[ \t]*,/g, ',')
    .replace(/(^|[.:;\n])[ \t]*,[ \t]*/g, '$1 ')
    .replace(/[ \t]+([,.;])/g, '$1')
    .replace(/,[ \t]*$/g, '')
    .trim();

  return joinProtectedPrefix(prefix, nextBody);
}

export function syncSubjectiveWithToggledSymptoms(
  currentNarrative: string,
  prevItems: SymptomNarrativeItem[],
  nextItems: SymptomNarrativeItem[],
): string {
  const prevCodes = new Set(prevItems.map((i) => i.optionCode));
  const nextCodes = new Set(nextItems.map((i) => i.optionCode));

  const removedItems = prevItems.filter((item) => !nextCodes.has(item.optionCode));
  const addedItems = nextItems.filter((item) => !prevCodes.has(item.optionCode));

  let updated = currentNarrative;

  for (const removed of removedItems) {
    const label = (removed.symptomName || removed.optionCode || '').trim();
    if (label) {
      updated = removeSymptomFromNarrative(updated, label);
    }
  }

  for (const added of addedItems) {
    const label = (added.symptomName || added.optionCode || '').trim();
    if (label) {
      updated = appendSymptomToNarrative(updated, label);
    }
  }

  return updated;
}
