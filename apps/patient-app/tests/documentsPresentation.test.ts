import { describe, expect, test } from 'bun:test';
import {
  canDispenseElsewhere,
  canUploadLabResult,
  documentRouteForKind,
  fileKindFromUrl,
  formatAmount,
  isAbnormalFlag,
  labStageChip,
  labTimeline,
  paymentChip,
  prescriptionStageChip,
  provenanceBadge,
  showLabClaimQr,
  showPrescriptionClaimQr,
  verificationBadge,
} from '../services/documents/presentation';
import {
  UPLOAD_MAX_BYTES,
  formatBytes,
  uploadFailureMessage,
  validateUploadFile,
} from '../services/documents/uploadRules';
import {
  canRevokeGrant,
  grantSourceLabel,
  grantStatusChip,
  revokeConfirmationMessage,
} from '../services/sharing/presentation';

describe('provenanceBadge', () => {
  test('maps each source to its label', () => {
    expect(provenanceBadge('ClinicEzLab').label).toBe('Clinic EZ lab');
    expect(provenanceBadge('ExternalLab').label).toBe('External lab');
    expect(provenanceBadge('PatientUploaded').label).toBe('Uploaded by me');
  });
});

describe('verificationBadge', () => {
  test('verified is a success badge without extra detail', () => {
    const badge = verificationBadge('Verified');
    expect(badge.label).toBe('Verified');
    expect(badge.tone).toBe('success');
    expect(badge.detail).toBeNull();
  });

  test('unverified reads as pending doctor review', () => {
    const badge = verificationBadge('Unverified');
    expect(badge.label).toBe('Pending doctor review');
    expect(badge.tone).toBe('warning');
    expect(badge.detail).not.toBeNull();
  });

  test('rejected surfaces the doctor remarks, trimmed', () => {
    const badge = verificationBadge('Rejected', '  Image is too blurry  ');
    expect(badge.label).toBe('Rejected');
    expect(badge.tone).toBe('danger');
    expect(badge.detail).toBe('Image is too blurry');
  });

  test('rejected without remarks falls back to a generic explanation', () => {
    expect(verificationBadge('Rejected', null).detail).toContain('did not accept');
    expect(verificationBadge('Rejected', '   ').detail).toContain('did not accept');
  });
});

describe('payment chip and amount', () => {
  test('maps none, pending and paid', () => {
    expect(paymentChip('None').label).toBe('No payment due');
    expect(paymentChip('Pending')).toMatchObject({ label: 'Payment pending', tone: 'warning' });
    expect(paymentChip('Paid')).toMatchObject({ label: 'Paid', tone: 'success' });
  });

  test('formatAmount renders currency with two decimals and tolerates nulls', () => {
    expect(formatAmount(250, 'PHP')).toBe('PHP 250.00');
    expect(formatAmount(99.5, null)).toBe('PHP 99.50');
    expect(formatAmount(null, 'PHP')).toBeNull();
  });
});

describe('labTimeline', () => {
  const stages = (steps: ReturnType<typeof labTimeline>) => steps.map((step) => step.stage);

  test('includes payment steps only when payment is required', () => {
    expect(stages(labTimeline('Issued', true))).toContain('AwaitingPayment');
    expect(stages(labTimeline('Issued', true))).toContain('Paid');
    expect(stages(labTimeline('Issued', false))).not.toContain('AwaitingPayment');
    expect(stages(labTimeline('Issued', false))).not.toContain('Paid');
  });

  test('marks earlier steps done, the active one current and later ones upcoming', () => {
    const steps = labTimeline('Claimed', true);
    const states = Object.fromEntries(steps.map((step) => [step.stage, step.state]));
    expect(states.Issued).toBe('done');
    expect(states.Routed).toBe('done');
    expect(states.Claimed).toBe('current');
    expect(states.AwaitingPayment).toBe('upcoming');
    expect(states.Reviewed).toBe('upcoming');
  });

  test('the final stage shows as completed rather than current', () => {
    const steps = labTimeline('Reviewed', false);
    expect(steps.every((step) => step.state === 'done')).toBe(true);
  });

  test('external submission uses the short issued -> uploaded -> reviewed flow', () => {
    const steps = labTimeline('ExternalSubmitted', true);
    expect(stages(steps)).toEqual(['Issued', 'ExternalSubmitted', 'Reviewed']);
    expect(steps[1].state).toBe('current');
  });

  test('rejected and cancelled end in a failed step', () => {
    const rejected = labTimeline('Rejected', true);
    expect(rejected).toHaveLength(2);
    expect(rejected[1]).toMatchObject({ stage: 'Rejected', state: 'failed' });
    expect(labTimeline('Cancelled', false)[1].state).toBe('failed');
  });
});

describe('lab request actions', () => {
  test('stage chips reflect progress, completion and failure', () => {
    expect(labStageChip('Reviewed').tone).toBe('success');
    expect(labStageChip('Rejected').tone).toBe('danger');
    expect(labStageChip('Issued').tone).toBe('info');
    expect(labStageChip('InProcess').tone).toBe('primary');
  });

  test('upload is offered until the request is cancelled or reviewed', () => {
    expect(canUploadLabResult('Issued')).toBe(true);
    expect(canUploadLabResult('ExternalSubmitted')).toBe(true);
    expect(canUploadLabResult('Cancelled')).toBe(false);
    expect(canUploadLabResult('Reviewed')).toBe(false);
  });

  test('claim QR needs a token and an open request', () => {
    expect(showLabClaimQr('Issued', 'token')).toBe(true);
    expect(showLabClaimQr('Issued', null)).toBe(false);
    expect(showLabClaimQr('Cancelled', 'token')).toBe(false);
    expect(showLabClaimQr('Reviewed', 'token')).toBe(false);
  });
});

describe('prescription actions', () => {
  test('stage chips', () => {
    expect(prescriptionStageChip('Dispensed').tone).toBe('success');
    expect(prescriptionStageChip('ExternalDispensed').label).toBe('Dispensed elsewhere');
    expect(prescriptionStageChip('Rejected').tone).toBe('danger');
    expect(prescriptionStageChip('Accepted').tone).toBe('primary');
    expect(prescriptionStageChip('Issued').tone).toBe('info');
  });

  test('dispensed elsewhere is only offered while not yet dispensed', () => {
    expect(canDispenseElsewhere('Issued')).toBe(true);
    expect(canDispenseElsewhere('Accepted')).toBe(true);
    expect(canDispenseElsewhere('Dispensed')).toBe(false);
    expect(canDispenseElsewhere('ExternalDispensed')).toBe(false);
  });

  test('claim QR is hidden once dispensed or rejected', () => {
    expect(showPrescriptionClaimQr('Issued', 'token')).toBe(true);
    expect(showPrescriptionClaimQr('Issued', null)).toBe(false);
    expect(showPrescriptionClaimQr('Dispensed', 'token')).toBe(false);
    expect(showPrescriptionClaimQr('Rejected', 'token')).toBe(false);
  });
});

describe('result file and observation helpers', () => {
  test('fileKindFromUrl ignores signed query strings', () => {
    expect(fileKindFromUrl('https://files.example/a/result.pdf?sig=abc.png')).toBe('pdf');
    expect(fileKindFromUrl('https://files.example/a/scan.JPG?expires=1')).toBe('image');
    expect(fileKindFromUrl('https://files.example/a/scan.heic')).toBe('image');
    expect(fileKindFromUrl('https://files.example/a/blob')).toBe('other');
  });

  test('isAbnormalFlag treats empty and normal flags as normal', () => {
    expect(isAbnormalFlag('')).toBe(false);
    expect(isAbnormalFlag(' N ')).toBe(false);
    expect(isAbnormalFlag('normal')).toBe(false);
    expect(isAbnormalFlag('H')).toBe(true);
    expect(isAbnormalFlag('critical')).toBe(true);
  });

  test('documentRouteForKind maps notification payload kinds to screens', () => {
    expect(documentRouteForKind('labRequest')?.screen).toBe('LabRequestDetailScreen');
    expect(documentRouteForKind('labResult')?.screen).toBe('LabResultDetailScreen');
    expect(documentRouteForKind('prescription')?.screen).toBe('PrescriptionDetailScreen');
    expect(documentRouteForKind('medicalCertificate')?.screen).toBe('MedicalCertificateDetailScreen');
    expect(documentRouteForKind('appointment')).toBeNull();
    expect(documentRouteForKind(undefined)).toBeNull();
  });
});

describe('upload rules', () => {
  test('accepts pdf and image types under the size limit', () => {
    expect(validateUploadFile({ mimeType: 'application/pdf', size: 1024 })).toBeNull();
    expect(validateUploadFile({ mimeType: 'IMAGE/JPEG', size: UPLOAD_MAX_BYTES })).toBeNull();
    expect(validateUploadFile({ mimeType: 'image/heic', size: null })).toBeNull();
  });

  test('rejects unsupported or missing types', () => {
    expect(validateUploadFile({ mimeType: 'application/zip', size: 10 })).toContain('Unsupported file type');
    expect(validateUploadFile({ mimeType: undefined, size: 10 })).toContain('Unsupported file type');
  });

  test('rejects files over 25 MB and states the size', () => {
    const message = validateUploadFile({ mimeType: 'application/pdf', size: UPLOAD_MAX_BYTES + 1 });
    expect(message).toContain('25.0 MB');
  });

  test('formatBytes picks a readable unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  test('uploadFailureMessage turns API statuses into guidance', () => {
    expect(uploadFailureMessage(0, 'x')).toContain('No connection');
    expect(uploadFailureMessage(404, 'x')).toContain('could not be found');
    expect(uploadFailureMessage(409, 'x')).toContain('already been recorded');
    expect(uploadFailureMessage(413, 'x')).toContain('too large');
    expect(uploadFailureMessage(415, 'x')).toContain('Unsupported file type');
    expect(uploadFailureMessage(500, 'Server said no')).toBe('Server said no');
  });
});

describe('access grant presentation', () => {
  test('status chips for active, expired and revoked', () => {
    expect(grantStatusChip('Active')).toMatchObject({ label: 'Active', tone: 'success' });
    expect(grantStatusChip('Expired')).toMatchObject({ label: 'Expired', tone: 'neutral' });
    expect(grantStatusChip('Revoked')).toMatchObject({ label: 'Revoked', tone: 'danger' });
  });

  test('source labels', () => {
    expect(grantSourceLabel('Qr')).toBe('Shared by QR code');
    expect(grantSourceLabel('Booking')).toBe('Shared with a booking');
    expect(grantSourceLabel('Manual')).toBe('Added manually');
  });

  test('only active grants can be revoked', () => {
    expect(canRevokeGrant('Active')).toBe(true);
    expect(canRevokeGrant('Expired')).toBe(false);
    expect(canRevokeGrant('Revoked')).toBe(false);
  });

  test('revoke confirmation explains that imported data stays', () => {
    const message = revokeConfirmationMessage('Sample Clinic');
    expect(message).toContain('Sample Clinic');
    expect(message).toContain('already imported');
    expect(revokeConfirmationMessage(null)).toContain('This facility');
  });
});
