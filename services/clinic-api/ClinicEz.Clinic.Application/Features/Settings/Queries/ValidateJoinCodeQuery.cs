using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Queries;

public sealed record ValidateJoinCodeQuery(string Code) : IRequest<PublicJoinCodeValidationResult>;

public sealed record PublicJoinCodeValidationResult(
    bool IsValid,
    string? ErrorMessage,
    int StatusCode,
    string? TenantSlug = null,
    string? TenantName = null,
    string? FacilitySlug = null,
    string? FacilityName = null,
    string? FacilityAddress = null,
    string? OperatingHours = null,
    DateTime? ExpiresAt = null
);

public sealed class ValidateJoinCodeQueryHandler : IRequestHandler<ValidateJoinCodeQuery, PublicJoinCodeValidationResult>
{
    private readonly IRepository<ClinicSettings> _settingsRepo;

    public ValidateJoinCodeQueryHandler(IRepository<ClinicSettings> settingsRepo)
    {
        _settingsRepo = settingsRepo;
    }

    public async Task<PublicJoinCodeValidationResult> Handle(ValidateJoinCodeQuery request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Code))
        {
            return new PublicJoinCodeValidationResult(false, "Join code is required.", 400);
        }

        var normalized = request.Code.Trim().ToUpperInvariant();
        var clinic = await _settingsRepo.IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(s => !s.IsDeleted && s.JoinCode != null && s.JoinCode.ToUpper() == normalized, ct);

        if (clinic == null)
        {
            return new PublicJoinCodeValidationResult(false, "Invalid clinic join code.", 404);
        }

        if (!clinic.IsJoinEnabled)
        {
            return new PublicJoinCodeValidationResult(false, "Clinic self-registration is currently disabled.", 400);
        }

        if (clinic.JoinCodeExpiresAt.HasValue && clinic.JoinCodeExpiresAt.Value < DateTime.UtcNow)
        {
            return new PublicJoinCodeValidationResult(false, "This clinic join code has expired. Please ask clinic reception for a new code.", 410);
        }

        var fullAddress = !string.IsNullOrWhiteSpace(clinic.LetterheadAddress)
            ? clinic.LetterheadAddress
            : null;

        return new PublicJoinCodeValidationResult(
            IsValid: true,
            ErrorMessage: null,
            StatusCode: 200,
            TenantSlug: clinic.TenantSlug ?? clinic.TenantId,
            TenantName: clinic.ClinicName,
            FacilitySlug: clinic.FacilitySlug ?? "main",
            FacilityName: clinic.ClinicName,
            FacilityAddress: fullAddress,
            OperatingHours: clinic.OperatingHours,
            ExpiresAt: clinic.JoinCodeExpiresAt
        );
    }
}
