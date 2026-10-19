/**
 * Canonical user-facing string literals dictionary for Gated Clinic Intake and Join Code Unlock workflows.
 * Enforces 1:1 invariant equality between components and automated unit tests.
 */
export const GATED_CATALOG_STRINGS = {
  lockedCard: {
    badge: 'Institutional Access',
    title: 'Services & Booking Restricted',
    description: 'This facility is a private or affiliated institutional clinic (e.g. campus student health center, corporate wellness center, or network partner). Direct booking and clinical procedures are reserved for verified institutional members.',
    reassurance: 'The public facility profile, location, operating hours, and PhilHealth YAKAP accreditation are publicly viewable above.',
    enterCodeCta: 'Enter Join Code',
    scanQrCta: 'Scan Reception QR',
    joinOrgCtaPrefix: 'Join ',
    partnerOrgCtaFallback: 'Join Partner Organization',
    emptyGuidance: 'This institutional facility requires in-person enrollment at the intake desk.',
  },
  modal: {
    title: 'Unlock Clinic Access',
    subtitlePrefix: 'Enter the 6-character code from the front desk placard at ',
    subtitleSuffix: ' to unlock clinical services and doctor bookings.',
    inputAccessibilityLabel: '6-character clinic join code input',
    lengthError: 'Join code must be exactly 6 characters.',
    submitButton: 'Unlock Access',
    submittingButton: 'Unlocking Access...',
    cancelButton: 'Cancel',
    qrButton: 'Scan Reception Placard QR',
    defaultError: 'Invalid clinic join code.',
    offlineError: 'Network unavailable. Reconnect to unlock clinic access.',
    invalidQrError: 'Scanned QR code does not contain a valid 6-character Join Code.',
    scannerModalTitle: 'Scan Reception Placard',
    scannerModalSubtitlePrefix: 'Align the QR code on ',
    scannerModalSubtitleSuffix: "'s reception placard",
  },
  catalog: {
    servicesSectionTitle: 'Services & Pricing',
    providersSectionTitle: 'Healthcare Providers',
    noServicesText: 'No services listed for this clinic.',
    noProvidersText: 'No providers listed for this clinic.',
    bookingDraftCta: 'Create booking draft',
    bookingPausedLabel: 'Booking not yet available',
    freePriceLabel: 'Free',
    currencyPrefix: 'PHP',
    durationSuffix: 'mins',
  },
  profile: {
    yakapBadge: 'PhilHealth YAKAP Accredited',
    publicBadge: 'Public',
    privateBadge: 'Private',
    joinedBadge: 'Joined',
    pendingBadge: 'Pending Approval',
  },
} as const;
