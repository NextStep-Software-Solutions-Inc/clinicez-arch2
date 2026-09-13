// ─────────────────────────────────────────────────────────────────────────────
// Attached Files Store
// Simple module-level store to pass selected file IDs from AttachFilesScreen
// back to BookingDraftScreen. Necessary because React Navigation's static API
// does not support callback params between screens.
//
// Pattern:
//   AttachFilesScreen  →  setAttachedFileSelection(ids)  →  navigation.goBack()
//   BookingDraftScreen →  useFocusEffect → consumeAttachedFileSelection()
// ─────────────────────────────────────────────────────────────────────────────

let _ids: string[] = [];
let _dirty = false;

/** Called by AttachFilesScreen when the user taps Done. */
export function setAttachedFileSelection(ids: string[]): void {
    _ids = [...ids];
    _dirty = true;
}

/**
 * Called by BookingDraftScreen inside useFocusEffect.
 * Returns the current selection + whether it has been updated since last read.
 * Resets the dirty flag on read.
 */
export function consumeAttachedFileSelection(): { ids: string[]; updated: boolean } {
    const result = { ids: [..._ids], updated: _dirty };
    _dirty = false;
    return result;
}

/** Peek at the current selection without resetting dirty flag. */
export function peekAttachedFileSelection(): string[] {
    return [..._ids];
}

/** Initialise the store with a set of pre-selected IDs (e.g. from a draft). */
export function initAttachedFileSelection(ids: string[]): void {
    _ids = [...ids];
    _dirty = false;
}
