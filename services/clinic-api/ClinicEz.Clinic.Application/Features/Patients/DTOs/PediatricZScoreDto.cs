using System;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record PediatricZScoreDto(
    int AgeInMonths,
    decimal AdjustedLengthHeightCm,
    decimal? WeightForAgeZScore,
    decimal? HeightForAgeZScore,
    decimal? WeightForHeightZScore,
    string? PhilHealthZScoreCategory,
    string? PhilHealthZScoreCode,
    string? Interpretation);

public sealed record CalculatePediatricZScoreRequest(
    DateOnly DateOfBirth,
    string Sex,
    decimal LengthOrHeightCm,
    decimal WeightKg,
    bool IsMeasuredRecumbent = false,
    DateOnly? AssessmentDate = null);
