using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public sealed record CalculatePediatricZScoreQuery(
    DateOnly DateOfBirth,
    string Gender,
    decimal LengthOrHeightCm,
    decimal WeightKg,
    bool IsMeasuredRecumbent = false,
    DateOnly? AssessmentDate = null) : IRequest<PediatricZScoreDto?>;

public sealed class CalculatePediatricZScoreQueryHandler : IRequestHandler<CalculatePediatricZScoreQuery, PediatricZScoreDto?>
{
    private readonly IWhoZScoreCalculator _calculator;

    public CalculatePediatricZScoreQueryHandler(IWhoZScoreCalculator calculator)
    {
        _calculator = calculator;
    }

    public Task<PediatricZScoreDto?> Handle(CalculatePediatricZScoreQuery request, CancellationToken cancellationToken)
    {
        var eval = _calculator.Calculate(
            request.DateOfBirth,
            request.Gender,
            request.LengthOrHeightCm,
            request.WeightKg,
            request.IsMeasuredRecumbent,
            request.AssessmentDate);

        if (eval == null)
        {
            return Task.FromResult<PediatricZScoreDto?>(null);
        }

        return Task.FromResult<PediatricZScoreDto?>(new PediatricZScoreDto(
            eval.AgeInMonths,
            eval.AdjustedLengthHeightCm,
            eval.WeightForAgeZScore,
            eval.HeightForAgeZScore,
            eval.WeightForHeightZScore,
            eval.PhilHealthZScoreCategory,
            eval.PhilHealthZScoreCode,
            eval.Interpretation));
    }
}
