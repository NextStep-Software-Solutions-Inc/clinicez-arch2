import { SHARING_SCOPE_KEYS, type SharingScope } from '../api/wireEnums';
import { SHARING_SCOPES, scopeLabel } from './scopes';

/**
 * Record sections a patient can send along with a booking request. Same PascalCase scope names as
 * the sharing enum, minus `Demographics`: personal details travel in the draft's `shareFieldsJson`.
 */
export type BookingShareSection = Exclude<SharingScope, 'Demographics'>;

export function isBookingShareSection(value: string): value is BookingShareSection {
    return value !== 'Demographics' && (SHARING_SCOPE_KEYS as readonly string[]).includes(value);
}

export const BOOKING_SHARE_SECTIONS: readonly BookingShareSection[] = SHARING_SCOPE_KEYS.filter(
    (scope): scope is BookingShareSection => isBookingShareSection(scope),
);

export interface BookingSectionInfo {
    key: BookingShareSection;
    label: string;
    description: string;
}

/** Labels and one-line explanations, reused from the share screen's scope list. */
export const BOOKING_SECTION_INFO: readonly BookingSectionInfo[] = SHARING_SCOPES.flatMap((scope) =>
    isBookingShareSection(scope.key) ? [{ key: scope.key, label: scope.label, description: scope.description }] : [],
);

const SECTION_BY_FIELD_KEY: ReadonlyMap<string, BookingShareSection> = new Map(
    BOOKING_SHARE_SECTIONS.map((section) => [section.toLowerCase(), section]),
);

/** Selected sections in canonical order, without duplicates. */
function canonical(sections: readonly BookingShareSection[]): BookingShareSection[] {
    return BOOKING_SHARE_SECTIONS.filter((section) => sections.includes(section));
}

export function toggleShareSection(
    selected: readonly BookingShareSection[],
    section: BookingShareSection,
    enabled: boolean,
): BookingShareSection[] {
    const next = enabled ? [...selected, section] : selected.filter((item) => item !== section);
    return canonical(next);
}

export function serializeShareSections(sections: readonly BookingShareSection[]): string {
    return JSON.stringify(canonical(sections));
}

/** Reads the locally stored JSON; anything malformed or unknown is dropped. */
export function parseShareSections(json: string): BookingShareSection[] {
    try {
        const parsed: unknown = JSON.parse(json);
        if (!Array.isArray(parsed)) return [];
        return canonical(parsed.filter((item): item is BookingShareSection => typeof item === 'string' && isBookingShareSection(item)));
    } catch {
        return [];
    }
}

/**
 * Sections a clinic hints at through its required share fields (`allergies`, `labResults`, ...).
 * Only a hint: nothing is preselected from it and the patient still decides.
 */
export function clinicRequestedSections(requiredShareFields: readonly string[]): BookingShareSection[] {
    const requested: BookingShareSection[] = [];
    for (const field of requiredShareFields) {
        const section = SECTION_BY_FIELD_KEY.get(field.toLowerCase());
        if (section) requested.push(section);
    }
    return canonical(requested);
}

/** One-line summary for the review step, e.g. `Allergies, Lab results` or `None`. */
export function shareSectionsSummary(sections: readonly BookingShareSection[]): string {
    if (sections.length === 0) return 'None';
    return canonical(sections).map(scopeLabel).join(', ');
}
