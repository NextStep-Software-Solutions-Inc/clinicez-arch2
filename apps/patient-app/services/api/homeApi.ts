import { api } from './apiClient';

export type WelcomeStepKey = 'health_profile' | 'link_insurance' | 'primary_clinic';
export type AppointmentCarouselState = 'first_time' | 'active' | 'returning_empty';
export type SearchCategoryFilter = 'all' | 'doctors' | 'clinics' | 'services';

export interface PatientHealthPassDto {
  patientId: string;
  clinicEzId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  bloodType: string | null;
  bloodGroupDisplay: string | null;
  avatarUrl: string | null;
  unreadNotificationsCount: number;
}

export interface WelcomeChecklistDto {
  visitedSteps: string[];
  completedCount: number;
  currentStepNumber: number;
  isHidden: boolean;
  hasHealthProfileData: boolean;
  hasInsuranceLinked: boolean;
  hasPrimaryClinic: boolean;
}

export interface HomeAppointmentCardDto {
  id: string;
  clinicId: string;
  clinicName: string;
  clinicAddress: string | null;
  providerId: string;
  providerName: string;
  providerSpecialty: string;
  providerAvatarUrl: string | null;
  scheduledAt: string;
  checkInOpensAt: string;
  durationMinutes: number;
  status: string;
  serviceType: string | null;
  checkedInAt: string | null;
  isCheckedIn: boolean;
}

export interface HomeAppointmentsSectionDto {
  carouselState: AppointmentCarouselState;
  scheduledCount: number;
  pastVisitsCount: number;
  upcomingItems: HomeAppointmentCardDto[];
}

export interface VitalSparklinePointDto {
  recordedAt: string;
  value: number;
  secondaryValue?: number | null;
}

export interface HomeRecentVitalsDto {
  hasAnyReadings: boolean;
  lastRecordedAt: string | null;
  lastSource: string | null;
  heartRateBpm: number | null;
  heartRateDeltaBpm: number | null;
  heartRateSeries: VitalSparklinePointDto[];
  systolicBp: number | null;
  diastolicBp: number | null;
  bloodPressureStatus: string | null;
  bloodPressureSeries: VitalSparklinePointDto[];
  fastingBloodGlucoseMgDl: number | null;
  bloodGlucoseStatus: string | null;
  bloodGlucoseSeries: VitalSparklinePointDto[];
  sleepDurationMinutes: number | null;
  deepSleepMinutes: number | null;
  sleepDeltaPercent: number | null;
  sleepSeries: VitalSparklinePointDto[];
}

export interface TodayMedicationScheduleItemDto {
  medicationId: string;
  medicationName: string;
  dosage: string | null;
  frequency: string | null;
  route: string | null;
  instructions: string | null;
  scheduledTimeLabel: string;
  isTakenToday: boolean;
  takenAt: string | null;
  logId: string | null;
}

export interface TodayMedicationScheduleDto {
  activeCount: number;
  items: TodayMedicationScheduleItemDto[];
}

export interface DailyMindfulMomentDto {
  id: string;
  category: string;
  title: string;
  body: string;
}

export interface PatientHomeDashboardDto {
  healthPass: PatientHealthPassDto;
  welcomeChecklist: WelcomeChecklistDto;
  appointments: HomeAppointmentsSectionDto;
  recentVitals: HomeRecentVitalsDto;
  todaySchedule: TodayMedicationScheduleDto;
  mindfulMoment: DailyMindfulMomentDto;
}

export interface LogPatientVitalsRequestDto {
  heartRateBpm?: number | null;
  systolicBp?: number | null;
  diastolicBp?: number | null;
  fastingBloodGlucoseMgDl?: number | null;
  sleepDurationMinutes?: number | null;
  deepSleepMinutes?: number | null;
  source?: string | null;
  recordedAt?: string | null;
}

export interface VitalSignsEntryDto {
  id: string;
  recordedAt: string;
  heartRateBpm: number | null;
  systolicBp: number | null;
  diastolicBp: number | null;
  fastingBloodGlucoseMgDl: number | null;
  sleepDurationMinutes: number | null;
  deepSleepMinutes: number | null;
  source: string | null;
}

export interface LogMedicationIntakeRequestDto {
  scheduledTimeLabel?: string | null;
  takenAt?: string | null;
  notes?: string | null;
}

export interface AppointmentCheckInResponseDto {
  appointmentId: string;
  checkedInAt: string;
  status: string;
  clinicName: string;
  providerName: string;
}

export interface PatientSearchCountsDto {
  all: number;
  doctors: number;
  clinics: number;
  services: number;
}

export interface PatientSearchDoctorDto {
  id: string;
  clinicId: string;
  name: string;
  specialty: string;
  avatarUrl: string | null;
  professionalLicenseNo: string | null;
  isVerified: boolean;
  clinicName: string;
  clinicAddress: string | null;
  clinicSupportsAppointments: boolean;
  nextAvailableAt: string | null;
  nextAvailableLabel: string;
  tags: string[];
}

export interface PatientSearchClinicDto {
  id: string;
  name: string;
  primarySpecialty: string | null;
  description: string | null;
  address: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  operatingHours: string | null;
  openStatusLabel: string;
  isOpenNow: boolean;
  SupportsAppointments?: boolean;
  supportsAppointments: boolean;
  isPublic: boolean;
  isGated: boolean;
  isUnlocked: boolean;
  activeMemberCount: number;
  nextAvailableAt: string | null;
  nextAvailableLabel: string | null;
  tags: string[];
}

export interface PatientSearchServiceDto {
  id: string;
  clinicId: string;
  clinicName: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  durationMinutes: number | null;
  price: number | null;
  priceBadgeLabel: string;
  tags: string[];
}

export interface PatientSearchResponseDto {
  query: string;
  category: SearchCategoryFilter;
  counts: PatientSearchCountsDto;
  doctors: PatientSearchDoctorDto[];
  clinics: PatientSearchClinicDto[];
  services: PatientSearchServiceDto[];
}

export interface SearchPatientCatalogParams {
  q?: string;
  category?: SearchCategoryFilter;
  availableTodayOnly?: boolean;
  openNowOnly?: boolean;
  take?: number;
}

export async function getPatientHomeDashboard(
  getToken: () => Promise<string | null>,
  patientId: string,
): Promise<PatientHomeDashboardDto> {
  return api.get<PatientHomeDashboardDto>(getToken, `/patients/${patientId}/home-dashboard`);
}

export async function postWelcomeStepVisited(
  getToken: () => Promise<string | null>,
  patientId: string,
  stepKey: WelcomeStepKey,
): Promise<WelcomeChecklistDto> {
  return api.post<WelcomeChecklistDto>(
    getToken,
    `/patients/${patientId}/welcome-steps/${encodeURIComponent(stepKey)}`,
    {},
  );
}

export async function postPatientVitals(
  getToken: () => Promise<string | null>,
  patientId: string,
  payload: LogPatientVitalsRequestDto,
): Promise<VitalSignsEntryDto> {
  return api.post<VitalSignsEntryDto>(getToken, `/patients/${patientId}/vitals`, payload);
}

export async function getTodayMedicationSchedule(
  getToken: () => Promise<string | null>,
  patientId: string,
): Promise<TodayMedicationScheduleDto> {
  return api.get<TodayMedicationScheduleDto>(getToken, `/patients/${patientId}/medications/today`);
}

export async function postMedicationIntakeLog(
  getToken: () => Promise<string | null>,
  patientId: string,
  medicationId: string,
  payload: LogMedicationIntakeRequestDto = {},
): Promise<TodayMedicationScheduleItemDto> {
  return api.post<TodayMedicationScheduleItemDto>(
    getToken,
    `/patients/${patientId}/medications/${medicationId}/log`,
    payload,
  );
}

export async function postAppointmentCheckIn(
  getToken: () => Promise<string | null>,
  patientId: string,
  appointmentId: string,
): Promise<AppointmentCheckInResponseDto> {
  return api.post<AppointmentCheckInResponseDto>(
    getToken,
    `/patients/${patientId}/appointments/${appointmentId}/check-in`,
    {},
  );
}

export async function searchPatientCatalog(
  getToken: () => Promise<string | null>,
  patientId: string,
  params: SearchPatientCatalogParams = {},
): Promise<PatientSearchResponseDto> {
  const searchParams = new URLSearchParams();
  if (params.q && params.q.trim().length > 0) {
    searchParams.set('q', params.q.trim());
  }
  if (params.category && params.category !== 'all') {
    searchParams.set('category', params.category);
  }
  if (params.availableTodayOnly) {
    searchParams.set('availableTodayOnly', 'true');
  }
  if (params.openNowOnly) {
    searchParams.set('openNowOnly', 'true');
  }
  if (params.take) {
    searchParams.set('take', String(params.take));
  }
  const qs = searchParams.toString();
  const url = `/patients/${patientId}/search${qs ? `?${qs}` : ''}`;
  return api.get<PatientSearchResponseDto>(getToken, url);
}
