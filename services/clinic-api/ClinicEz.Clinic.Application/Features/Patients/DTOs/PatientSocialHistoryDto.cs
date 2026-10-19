using System;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record PatientSocialHistoryDto(
    Guid Id,
    Guid PatientId,
    bool IsSmoker,
    decimal? PacksPerDay,
    int? CigarettesPerDay,
    int? YearsSmoking,
    decimal? SmokingPackYears,
    DateOnly? SmokingStoppedDate,
    bool IsAlcoholDrinker,
    int? AlcoholDrinksPerWeek,
    int? AlcoholBottlesPerDay,
    string? AlcoholFrequency,
    bool UsesIllicitDrugs,
    string? SubstanceUseHistory,
    string? DrugTypes,
    bool IsSexuallyActive,
    int? CoitarcheAge,
    string? PhysicalActivityFrequency,
    string? DietaryHabits,
    string? Remarks,
    string? SmokingStatus = null,
    string? AlcoholStatus = null);

public sealed record UpdatePatientSocialHistoryRequest(
    bool IsSmoker,
    decimal? PacksPerDay = null,
    int? CigarettesPerDay = null,
    int? YearsSmoking = null,
    decimal? SmokingPackYears = null,
    DateOnly? SmokingStoppedDate = null,
    bool IsAlcoholDrinker = false,
    int? AlcoholDrinksPerWeek = null,
    int? AlcoholBottlesPerDay = null,
    string? AlcoholFrequency = null,
    bool UsesIllicitDrugs = false,
    string? SubstanceUseHistory = null,
    string? DrugTypes = null,
    bool IsSexuallyActive = false,
    int? CoitarcheAge = null,
    string? PhysicalActivityFrequency = null,
    string? DietaryHabits = null,
    string? Remarks = null,
    string? SmokingStatus = null,
    string? AlcoholStatus = null);

