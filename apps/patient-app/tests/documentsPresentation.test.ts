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
    expect(provenanceBadge('clinicEzLab').label).toBe('ClinicEZ lab');
    expect(provenanceBadge('externalLab').label).toBe('External lab');
    expect(provenanceBadge('patientUploaded').label).toBe('Uploaded by me');
  });

  test('unknown sources degrade to a neutral badge', () => {
    expect(provenanceBadge('somethingNew')).toEqual({ label: 'Unknown source', tone: 'neutral' });
  });
});

describe('verificationBadge', () => {
  test('verified is a success badge without extra detail', () => {
    const badge = verificationBadge('verified');
    expect(badge.label).toBe('Verified');
    expect(badge.tone).toBe('success');
    expect(badge.detail).toBeNull();
  });

  test('unverified reads as pending doctor review', () => {
    const badge = verificationBadge('unverified');
    expect(badge.label).toBe('Pending doctor review');
    expect(badge.tone).toBe('warning');
    expect(badge.detail).not.toBeNull();
  });

  test('rejected surfaces the doctor remarks, trimmed', () => {
    const badge = verificationBadge('rejected', '  Image is too blurry  ');
    expect(badge.label).toBe('Rejected');
    expect(badge.tone).toBe('danger');
    expect(badge.detail).toBe('Image is too blurry');
  });

  test('rejected without remarks falls back to a generic explanation', () => {
    expect(verificationBadge('rejected', null).detail).toContain('did not accept');
    expect(verificationBadge('rejected', '   ').detail).toContain('did not accept');
  });

  test('unknown status is neutral', () => {
    expect(verificationBadge('mystery').tone).toBe('neutral');
  });
});

describe('payment chip and amount', () => {
  test('maps none, pending and paid', () => {
    expect(paymentChip('none').label).toBe('No payment due');
    expect(paymentChip('pending')).toMatchObject({ label: 'Payment pending', tone: 'warning' });
    expect(paymentChip('paid')).toMatchObject({ label: 'Paid', tone: 'success' });
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
    expect(stages(labTimeline('issued', true))).toContain('awaitingPayment');
    expect(stages(labTimeline('issued', true))).toContain('paid');
    expect(stages(labTimeline('issued', false))).not.toContain('awaitingPayment');
    expect(stages(labTimeline('issued', false))).not.toContain('paid');
  });

  test('marks earlier steps done, the active one current and later ones upcoming', () => {
    const steps = labTimeline('claimed', true);
    const states = Object.fromEntries(steps.map((step) => [step.stage, step.state]));
    expect(states.issued).toBe('done');
    expect(states.routed).toBe('done');
    expect(states.claimed).toBe('current');
    expect(states.awaitingPayment).toBe('upcoming');
    expect(states.reviewed).toBe('upcoming');
  });

  test('the final stage shows as completed rather than current', () => {
    const steps = labTimeline('reviewed', false);
    expect(steps.every((step) => step.state === 'done')).toBe(true);
  });

  test('external submission uses the short issued -> uploaded -> reviewed flow', () => {
    const steps = labTimeline('externalSubmitted', true);
    expect(stages(steps)).toEqual(['issued', 'externalSubmitted', 'reviewed']);
    expect(steps[1].state).toBe('current');
  });

  test('rejected and cancelled end in a failed step', () => {
    const rejected = labTimeline('rejected', true);
    expect(rejected).toHaveLength(2);
    expect(rejected[1]).toMatchObject({ stage: 'rejected', state: 'failed' });
    expect(labTimeline('cancelled', false)[1].state).toBe('failed');
  });

  test('an unknown stage starts at the first step instead of crashing', () => {
    const steps = labTimeline('brandNewStage', false);
    expect(steps[0].state).toBe('current');
  });
});

describe('lab request actions', () => {
  test('stage chips reflect progress, completion and failure', () => {
    expect(labStageChip('reviewed').tone).toBe('success');
    expect(labStageChip('rejected').tone).toBe('danger');
    expect(labStageChip('issued').tone).toBe('info');
    expect(labStageChip('inProcess').tone).toBe('primary');
  });

  test('upload is offered until the request is cancelled or reviewed', () => {
    expect(canUploadLabResult('issued')).toBe(true);
    expect(canUploadLabResult('externalSubmitted')).toBe(true);
    expect(canUploadLabResult('cancelled')).toBe(false);
    expect(canUploadLabResult('reviewed')).toBe(false);
  });

  test('claim QR needs a token and an open request', () => {
    expect(showLabClaimQr('issued', 'token')).toBe(true);
    expect(showLabClaimQr('issued', null)).toBe(false);
    expect(showLabClaimQr('cancelled', 'token')).toBe(false);
    expect(showLabClaimQr('reviewed', 'token')).toBe(false);
  });
});

describe('prescription actions', () => {
  test('stage chips', () => {
    expect(prescriptionStageChip('dispensed').tone).toBe('success');
    expect(prescriptionStageChip('externalDispensed').label).toBe('Dispensed elsewhere');
    expect(prescriptionStageChip('rejected').tone).toBe('danger');
    expect(prescriptionStageChip('accepted').tone).toBe('primary');
    expect(prescriptionStageChip('issued').tone).toBe('info');
  });

  test('dispensed elsewhere is only offered while not yet dispensed', () => {
    expect(canDispenseElsewhere('issued')).toBe(true);
    expect(canDispenseElsewhere('accepted')).toBe(true);
    expect(canDispenseElsewhere('dispensed')).toBe(false);
    expect(canDispenseElsewhere('externalDispensed')).toBe(false);
  });

  test('claim QR is hidden once dispensed or rejected', () => {
    expect(showPrescriptionClaimQr('issued', 'token')).toBe(true);
    expect(showPrescriptionClaimQr('issued', null)).toBe(false);
    expect(showPrescriptionClaimQr('dispensed', 'token')).toBe(false);
    expect(showPrescriptionClaimQr('rejected', 'token')).toBe(false);
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

  test('rejects files over 10 MB and states the size', () => {
    const message = validateUploadFile({ mimeType: 'application/pdf', size: UPLOAD_MAX_BYTES + 1 });
    expect(message).toContain('10.0 MB');
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
    expect(grantStatusChip('active')).toMatchObject({ label: 'Active', tone: 'success' });
    expect(grantStatusChip('expired')).toMatchObject({ label: 'Expired', tone: 'neutral' });
    expect(grantStatusChip('revoked')).toMatchObject({ label: 'Revoked', tone: 'danger' });
  });

  test('source labels', () => {
    expect(grantSourceLabel('qr')).toBe('Shared by QR code');
    expect(grantSourceLabel('booking')).toBe('Shared with a booking');
    expect(grantSourceLabel('manual')).toBe('Added manually');
  });

  test('only active grants can be revoked', () => {
    expect(canRevokeGrant('active')).toBe(true);
    expect(canRevokeGrant('expired')).toBe(false);
    expect(canRevokeGrant('revoked')).toBe(false);
  });

  test('revoke confirmation explains that imported data stays', () => {
    const message = revokeConfirmationMessage('Sample Clinic');
    expect(message).toContain('Sample Clinic');
    expect(message).toContain('already imported');
    expect(revokeConfirmationMessage(null)).toContain('This facility');
  });
});
