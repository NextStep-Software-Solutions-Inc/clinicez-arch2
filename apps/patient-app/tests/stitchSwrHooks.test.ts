import { describe, expect, test, mock } from 'bun:test';

mock.module('../contexts/AuthContext', () => ({
  useAuth: () => ({
    getToken: async () => 'mock-jwt-token',
    internalPatientId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    isSignedIn: true,
  }),
}));

import { useVitals } from '../hooks/useVitals';
import { useTodayMedications } from '../hooks/useTodayMedications';
import { useLiveSearch } from '../hooks/useLiveSearch';
import { useAppointments } from '../hooks/useAppointments';
import { api } from '../services/api/apiClient';
import * as vitalsApi from '../services/api/vitalsApi';
import * as medicationsApi from '../services/api/medicationsApi';
import * as searchApi from '../services/api/searchApi';
import * as appointmentsService from '../services/appointments/appointmentsService';

describe('Custom SWR Hooks Suite (Milestone 2 - State & SWR Layer)', () => {
  const patientId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';

  describe('Hook Definitions & Contracts', () => {
    test('all custom SWR hooks are exported and defined as functions', () => {
      expect(typeof useVitals).toBe('function');
      expect(typeof useTodayMedications).toBe('function');
      expect(typeof useLiveSearch).toBe('function');
      expect(typeof useAppointments).toBe('function');
    });

    test('vitalsApi module exports all required DTOs and pure HTTP functions', () => {
      expect(typeof vitalsApi.fetchLatestVitals).toBe('function');
      expect(typeof vitalsApi.fetchVitalsHistory).toBe('function');
      expect(typeof vitalsApi.recordPatientVitals).toBe('function');
      expect(typeof vitalsApi.getCachedLatestVitals).toBe('function');
      expect(typeof vitalsApi.persistLatestVitalsToCache).toBe('function');
    });

    test('medicationsApi module exports all required DTOs and pure HTTP functions', () => {
      expect(typeof medicationsApi.fetchTodayMedications).toBe('function');
      expect(typeof medicationsApi.logMedicationAdherence).toBe('function');
      expect(typeof medicationsApi.getCachedTodayMedications).toBe('function');
      expect(typeof medicationsApi.persistTodayMedicationsToCache).toBe('function');
    });

    test('searchApi module exports unified search functions and DTOs', () => {
      expect(typeof searchApi.fetchUnifiedSearch).toBe('function');
      expect(typeof searchApi.getCachedUnifiedSearch).toBe('function');
    });
  });

  describe('useVitals functional behavior', () => {
    test('recordPatientVitals integrates with vitalsApi and returns VitalSignsDto', async () => {
      const originalPost = api.post;
      const mockResult: vitalsApi.VitalSignsDto = {
        id: 'new-v-1',
        patientId,
        recordedAt: '2026-11-03T00:00:00Z',
        heartRateBpm: 74,
        systolicBp: 118,
        diastolicBp: 78,
      };

      (api as any).post = mock(async (_getToken: any, path: string, body: any) => {
        expect(path).toBe(`/patients/${patientId}/vitals`);
        expect(body.heartRateBpm).toBe(74);
        return mockResult;
      });

      try {
        const input: vitalsApi.RecordVitalsInput = {
          heartRateBpm: 74,
          systolicBp: 118,
          diastolicBp: 78,
        };

        const res = await vitalsApi.recordPatientVitals(patientId, input);
        expect(res.id).toBe('new-v-1');
        expect(res.heartRateBpm).toBe(74);
        expect(res.systolicBp).toBe(118);
      } finally {
        (api as any).post = originalPost;
      }
    });

    test('fetchLatestVitals enriches vitals with telemetry categories and trends', async () => {
      const originalGet = api.get;
      const mockLatest: vitalsApi.LatestVitalsDto = {
        heartRateBpm: 72,
        heartRateTrend: '+2 bpm',
        systolicBp: 118,
        diastolicBp: 76,
        bpCategory: 'Optimal',
        bloodGlucoseMgDl: 94,
        glucoseCategory: 'Fasting',
        sleepHours: 7.75,
        sleepFormatted: '7h 45m',
        sleepDeepFormatted: '2h 10m',
        recordedAt: '2026-11-03T08:00:00Z',
        bpSystolic: 118,
        bpDiastolic: 76,
      };

      (api as any).get = mock(async (_getToken: any, path: string) => {
        expect(path).toBe(`/patients/${patientId}/vitals/latest`);
        return mockLatest;
      });

      try {
        const data = await vitalsApi.fetchLatestVitals(patientId);
        expect(data?.heartRateBpm).toBe(72);
        expect(data?.heartRateTrend).toBe('+2 bpm');
        expect(data?.bpCategory).toBe('Optimal');
        expect(data?.glucoseCategory).toBe('Fasting');
        expect(data?.sleepFormatted).toBe('7h 45m');
        expect(data?.sleepDeepFormatted).toBe('2h 10m');
      } finally {
        (api as any).get = originalGet;
      }
    });
  });

  describe('useTodayMedications functional behavior', () => {
    test('logMedicationAdherence marks dose taken and returns true', async () => {
      const originalPost = api.post;
      (api as any).post = mock(async (_getToken: any, path: string, body: any) => {
        expect(path).toBe(`/patients/${patientId}/medications/med-123/log`);
        expect(body.takenAt).toBe('2026-11-03T08:00:00Z');
        return true;
      });

      try {
        const success = await medicationsApi.logMedicationAdherence(
          patientId,
          'med-123',
          '2026-11-03T08:00:00Z',
        );
        expect(success).toBe(true);
      } finally {
        (api as any).post = originalPost;
      }
    });

    test('fetchTodayMedications enriches items with name and instruction aliases', async () => {
      const originalGet = api.get;
      const mockMeds: medicationsApi.TodayMedicationDto[] = [
        {
          id: 'med-1',
          medicationName: 'Lisinopril',
          dosage: '10mg',
          instructions: '1 tablet with breakfast',
          scheduledTime: '8:00 AM',
          isTaken: true,
          takenAt: '2026-11-03T08:15:00Z',
        },
      ];

      (api as any).get = mock(async (_getToken: any, path: string) => {
        expect(path).toBe(`/patients/${patientId}/medications/today`);
        return mockMeds;
      });

      try {
        const meds = await medicationsApi.fetchTodayMedications(patientId);
        expect(meds.length).toBe(1);
        expect(meds[0].medicationName).toBe('Lisinopril');
        expect(meds[0].name).toBe('Lisinopril');
        expect(meds[0].instruction).toBe('1 tablet with breakfast');
        expect(meds[0].isTaken).toBe(true);
      } finally {
        (api as any).get = originalGet;
      }
    });
  });

  describe('useLiveSearch functional behavior', () => {
    test('empty query returns zero results immediately without network call', async () => {
      const res = await searchApi.fetchUnifiedSearch('');
      expect(res.doctors).toEqual([]);
      expect(res.clinics).toEqual([]);
      expect(res.services).toEqual([]);
    });

    test('query returns doctors, clinics, and care packages matching Stitch Screen 4', async () => {
      const originalGet = api.get;
      const mockResult: searchApi.UnifiedSearchResultDto = {
        doctors: [
          {
            id: 'doc-1',
            fullName: 'Dr. Evelyn Reed, MD',
            specialty: 'Cardiology Specialist',
            clinicName: 'Metro Cardiology Center',
            distance: '1.2 km away',
            rating: 4.9,
            reviewsCount: 128,
            nextAvailableSlot: 'Tomorrow, 10:30 AM',
            tags: ['Accepts Insurance', 'In-Person & Telehealth'],
          },
        ],
        clinics: [
          {
            id: 'clinic-1',
            name: 'Metro Cardiology Center',
            address: '402 Medical Blvd, Suite 402',
            distance: '1.2 km away',
            isOpenNow: true,
            openText: 'Open Today • Closes 6:00 PM',
            rating: 4.8,
            reviewsCount: 94,
            tags: ['Echo & Diagnostic Lab', 'Walk-ins Welcome'],
          },
        ],
        services: [
          {
            id: 'service-1',
            name: 'Comprehensive Cardiac Screening',
            description: 'Includes 12-lead ECG, Lipid Profile & Consult',
            durationMinutes: 45,
            isCovered: true,
            tags: ['Fully Covered by Insurance', 'Prep Guide Included'],
          },
        ],
      };

      (api as any).get = mock(async (_getToken: any, path: string) => {
        expect(path).toContain('/discovery/search?');
        expect(path).toContain('q=Cardio');
        return mockResult;
      });

      try {
        const searchRes = await searchApi.fetchUnifiedSearch('Cardio');
        expect(searchRes.doctors.length).toBe(1);
        expect(searchRes.doctors[0].fullName).toBe('Dr. Evelyn Reed, MD');
        expect(searchRes.clinics.length).toBe(1);
        expect(searchRes.clinics[0].name).toBe('Metro Cardiology Center');
        expect(searchRes.services.length).toBe(1);
        expect(searchRes.services[0].name).toBe('Comprehensive Cardiac Screening');
      } finally {
        (api as any).get = originalGet;
      }
    });
  });

  describe('useAppointments functional behavior', () => {
    test('appointmentsApi calls /patients/{patientId}/appointments and parses response', async () => {
      const originalGet = api.get;
      const mockApiApt = {
        items: [
          {
            id: 'apt-1',
            clinicId: 'c-1',
            clinicName: 'Metro Cardiology Center',
            provider: {
              id: 'p-1',
              name: 'Dr. Evelyn Reed',
              specialty: 'Cardiologist',
              avatarUrl: null,
            },
            serviceType: 'Cardiology Follow-Up',
            scheduledAt: '2026-11-05T10:30:00Z',
            durationMinutes: 30,
            status: 'Confirmed',
            notes: 'Follow-up ECG check',
          },
        ],
        totalCount: 1,
      };

      (api as any).get = mock(async (_getToken: any, path: string) => {
        expect(path).toBe(`/patients/${patientId}/appointments`);
        return mockApiApt;
      });

      try {
        const result = await appointmentsService.fetchAppointments(
          patientId,
          {
            delete: () => ({ where: () => Promise.resolve() }),
            insert: () => ({ values: () => Promise.resolve() }),
            select: () => ({
              from: () => ({
                where: () => ({
                  orderBy: () => Promise.resolve([]),
                }),
              }),
            }),
          } as any,
          async () => null,
        );

        expect(result.items.length).toBe(1);
        expect(result.items[0].id).toBe('apt-1');
        expect(result.items[0].clinic.name).toBe('Metro Cardiology Center');
        expect(result.items[0].status).toBe('confirmed');
      } finally {
        (api as any).get = originalGet;
      }
    });
  });
});
