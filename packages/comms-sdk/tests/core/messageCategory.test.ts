import { describe, expect, it } from 'bun:test';
import {
  formatMessageCategory,
  isLegacyRawCategoryInquiryTitle,
  isRedundantCategorySubject,
  resolveConversationDisplayTitle,
  resolvePatientFacilityDisplayTitle,
  resolvePatientParticipantName,
} from '../../src/core';

describe('messageCategory & PatientFacility identity resolution (#284)', () => {
  it('formats all canonical MessageCategory values cleanly for clinical and patient styles', () => {
    expect(formatMessageCategory('PostVisitFollowUp', 'clinical')).toBe('Post-Visit Follow-Up');
    expect(formatMessageCategory('PrescriptionRefill', 'clinical')).toBe('Prescription Refill');
    expect(formatMessageCategory('LabResultQuestion', 'clinical')).toBe('Lab Result Question');
    expect(formatMessageCategory('Billing', 'clinical')).toBe('Billing');
    expect(formatMessageCategory('Scheduling', 'clinical')).toBe('Scheduling');
    expect(formatMessageCategory('OrderStatus', 'clinical')).toBe('Order Status');
    expect(formatMessageCategory('MedicineQuestion', 'clinical')).toBe('Medicine Question');
    expect(formatMessageCategory('CollectionAndAppointment', 'clinical')).toBe('Collection & Appointment');
    expect(formatMessageCategory('ReportCopy', 'clinical')).toBe('Report Copy');
    expect(formatMessageCategory('Other', 'clinical')).toBe('General');

    expect(formatMessageCategory('PostVisitFollowUp', 'patient')).toBe('Medical / Follow-Up');
    expect(formatMessageCategory('PrescriptionRefill', 'patient')).toBe('Prescriptions');
    expect(formatMessageCategory('LabResultQuestion', 'patient')).toBe('Lab Inquiry');
    expect(formatMessageCategory('Billing', 'patient')).toBe('Billing / HMO');
    expect(formatMessageCategory('Scheduling', 'patient')).toBe('Scheduling');
    expect(formatMessageCategory('Other', 'patient')).toBe('General');
  });

  it('splits unknown PascalCase category strings and falls back to General on empty', () => {
    expect(formatMessageCategory('CustomFollowUpCategory', 'clinical')).toBe('Custom Follow Up Category');
    expect(formatMessageCategory('Post-Visit Follow-Up', 'clinical')).toBe('Post-Visit Follow-Up');
    expect(formatMessageCategory(null, 'clinical')).toBe('General');
    expect(formatMessageCategory('  ', 'patient')).toBe('General');
  });

  it('detects legacy raw "<Category> Inquiry" titles and redundant subjects', () => {
    expect(isLegacyRawCategoryInquiryTitle('PostVisitFollowUp Inquiry')).toBe(true);
    expect(isLegacyRawCategoryInquiryTitle('PrescriptionRefill Inquiry')).toBe(true);
    expect(isLegacyRawCategoryInquiryTitle('Justine Mae Tabasan')).toBe(false);
    expect(isLegacyRawCategoryInquiryTitle('Post-Visit Follow-Up Inquiry')).toBe(false);

    expect(isRedundantCategorySubject('', 'PostVisitFollowUp')).toBe(true);
    expect(isRedundantCategorySubject('PostVisitFollowUp', 'PostVisitFollowUp')).toBe(true);
    expect(isRedundantCategorySubject('Medical / Follow-Up', 'PostVisitFollowUp')).toBe(true);
    expect(isRedundantCategorySubject('Post-Visit Follow-Up', 'PostVisitFollowUp')).toBe(true);
    expect(isRedundantCategorySubject('Follow-up on CBC blood test', 'PostVisitFollowUp')).toBe(false);
  });

  it('resolves patient name for PatientFacility conversations and ignores generic "Patient"', () => {
    const convWithRealNameTitle = {
      scope: 'PatientFacility',
      title: 'Justine Mae Tabasan',
      category: 'PostVisitFollowUp',
      participants: [
        { participantType: 'Patient', role: 'Patient', displayName: 'Justine Mae Tabasan' },
      ],
    };
    expect(resolveConversationDisplayTitle(convWithRealNameTitle, 'staff-1', 'Nurse Joy')).toBe(
      'Justine Mae Tabasan',
    );

    const legacyConvWithNamedParticipant = {
      scope: 'PatientFacility',
      title: 'PostVisitFollowUp Inquiry',
      category: 'PostVisitFollowUp',
      participants: [
        { participantType: 'Patient', role: 'Patient', displayName: 'Justine Mae Tabasan' },
        { participantType: 'Staff', role: 'Staff', displayName: 'Nurse Joy' },
      ],
    };
    expect(resolvePatientParticipantName(legacyConvWithNamedParticipant.participants)).toBe(
      'Justine Mae Tabasan',
    );
    expect(resolvePatientFacilityDisplayTitle(legacyConvWithNamedParticipant)).toBe(
      'Justine Mae Tabasan',
    );
    expect(resolveConversationDisplayTitle(legacyConvWithNamedParticipant, 'staff-1', 'Nurse Joy')).toBe(
      'Justine Mae Tabasan',
    );

    const legacyConvWithoutNamedParticipant = {
      scope: 'PatientFacility',
      title: 'PostVisitFollowUp Inquiry',
      category: 'PostVisitFollowUp',
      participants: [{ participantType: 'Patient', role: 'Patient', displayName: 'Patient' }],
    };
    expect(resolvePatientFacilityDisplayTitle(legacyConvWithoutNamedParticipant)).toBe(
      'Post-Visit Follow-Up Inquiry',
    );
  });
});
