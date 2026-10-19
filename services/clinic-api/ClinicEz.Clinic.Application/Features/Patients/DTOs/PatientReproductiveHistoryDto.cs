using System;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record PatientReproductiveHistoryDto(
    Guid Id,
    Guid PatientId,
    bool IsApplicable,
    int? MenarcheAge,
    DateOnly? LastMenstrualPeriod,
    int? PeriodDurationDays,
    int? CycleIntervalDays,
    int? PadsPerDay,
    bool IsMenopausal,
    int? MenopauseAge,
    string? ContraceptiveMethod,
    int Gravidity,
    int Parity,
    int TermBirths,
    int PretermBirths,
    int Abortions,
    int LivingChildren,
    string? DeliveryType,
    bool HadPreEclampsiaHypertension,
    bool ReceivedFamilyPlanningCounseling,
    string? Remarks);

public sealed record UpdatePatientReproductiveHistoryRequest(
    bool IsApplicable = true,
    int? MenarcheAge = null,
    DateOnly? LastMenstrualPeriod = null,
    int? PeriodDurationDays = null,
    int? CycleIntervalDays = null,
    int? PadsPerDay = null,
    bool IsMenopausal = false,
    int? MenopauseAge = null,
    string? ContraceptiveMethod = null,
    int Gravidity = 0,
    int Parity = 0,
    int TermBirths = 0,
    int PretermBirths = 0,
    int Abortions = 0,
    int LivingChildren = 0,
    string? DeliveryType = null,
    bool HadPreEclampsiaHypertension = false,
    bool ReceivedFamilyPlanningCounseling = false,
    string? Remarks = null);
