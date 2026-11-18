namespace ClinicEz.Patient.Application.Common.DTOs;

public sealed record PatientHealthPassDto(
    Guid PatientId,
    string ClinicEzId,
    string FullName,
    string FirstName,
    string LastName,
    string? BloodType,
    string? BloodGroupDisplay,
    string? AvatarUrl,
    int UnreadNotificationsCount);

public sealed record WelcomeChecklistDto(
    IReadOnlyList<string> VisitedSteps,
    int CompletedCount,
    int CurrentStepNumber,
    bool IsHidden,
    bool HasHealthProfileData,
    bool HasInsuranceLinked,
    bool HasPrimaryClinic);

public sealed record HomeAppointmentCardDto(
    Guid Id,
    Guid ClinicId,
    string ClinicName,
    string? ClinicAddress,
    Guid ProviderId,
    string ProviderName,
    string ProviderSpecialty,
    string? ProviderAvatarUrl,
    DateTime ScheduledAt,
    DateTime CheckInOpensAt,
    int DurationMinutes,
    string Status,
    string? ServiceType,
    DateTime? CheckedInAt,
    bool IsCheckedIn);

public sealed record HomeAppointmentsSectionDto(
    string CarouselState,
    int ScheduledCount,
    int PastVisitsCount,
    IReadOnlyList<HomeAppointmentCardDto> UpcomingItems);

public sealed record VitalSparklinePointDto(
    DateTime RecordedAt,
    decimal Value,
    decimal? SecondaryValue = null);

public sealed record HomeRecentVitalsDto(
    bool HasAnyReadings,
    DateTime? LastRecordedAt,
    string? LastSource,
    int? HeartRateBpm,
    int? HeartRateDeltaBpm,
    IReadOnlyList<VitalSparklinePointDto> HeartRateSeries,
    int? SystolicBp,
    int? DiastolicBp,
    string? BloodPressureStatus,
    IReadOnlyList<VitalSparklinePointDto> BloodPressureSeries,
    decimal? FastingBloodGlucoseMgDl,
    string? BloodGlucoseStatus,
    IReadOnlyList<VitalSparklinePointDto> BloodGlucoseSeries,
    int? SleepDurationMinutes,
    int? DeepSleepMinutes,
    int? SleepDeltaPercent,
    IReadOnlyList<VitalSparklinePointDto> SleepSeries);

public sealed record TodayMedicationScheduleItemDto(
    Guid MedicationId,
    string MedicationName,
    string? Dosage,
    string? Frequency,
    string? Route,
    string? Instructions,
    string ScheduledTimeLabel,
    bool IsTakenToday,
    DateTime? TakenAt,
    Guid? LogId);

public sealed record TodayMedicationScheduleDto(
    int ActiveCount,
    IReadOnlyList<TodayMedicationScheduleItemDto> Items);

public sealed record DailyMindfulMomentDto(
    string Id,
    string Category,
    string Title,
    string Body);

public sealed record PatientHomeDashboardDto(
    PatientHealthPassDto HealthPass,
    WelcomeChecklistDto WelcomeChecklist,
    HomeAppointmentsSectionDto Appointments,
    HomeRecentVitalsDto RecentVitals,
    TodayMedicationScheduleDto TodaySchedule,
    DailyMindfulMomentDto MindfulMoment);

public sealed record LogPatientVitalsRequestDto(
    int? HeartRateBpm,
    int? SystolicBp,
    int? DiastolicBp,
    decimal? FastingBloodGlucoseMgDl,
    int? SleepDurationMinutes,
    int? DeepSleepMinutes,
    string? Source,
    DateTime? RecordedAt);

public sealed record VitalSignsEntryDto(
    Guid Id,
    DateTime RecordedAt,
    int? HeartRateBpm,
    int? SystolicBp,
    int? DiastolicBp,
    decimal? FastingBloodGlucoseMgDl,
    int? SleepDurationMinutes,
    int? DeepSleepMinutes,
    string? Source);

public sealed record LogMedicationIntakeRequestDto(
    string? ScheduledTimeLabel,
    DateTime? TakenAt,
    string? Notes);

public sealed record AppointmentCheckInResponseDto(
    Guid AppointmentId,
    DateTime CheckedInAt,
    string Status,
    string ClinicName,
    string ProviderName);
