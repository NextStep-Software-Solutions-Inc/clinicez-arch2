using ClinicEz.Patient.Application.Common.Errors;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Sharing.Commands.CreateShareToken;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.Options;

namespace ClinicEz.Patient.Application.Features.Sharing.Commands.CreateShareCode;

/// <summary>The patient picks the scopes and gets a short single-use code to read out to a facility that cannot scan a QR.</summary>
public sealed record CreateShareCodeCommand(Guid PatientId, IReadOnlyList<string> Scopes, string? Purpose) : IRequest<ShareCodeDto>;

public sealed class CreateShareCodeCommandValidator : AbstractValidator<CreateShareCodeCommand>
{
    public CreateShareCodeCommandValidator()
    {
        RuleFor(x => x.Scopes)
            .NotEmpty().WithErrorCode(ErrorCodes.CollectionEmpty).WithMessage("Choose at least one category to share.")
            .Must(scopes => SharingScopeMap.TryParse(scopes, out _)).WithErrorCode(ErrorCodes.InvalidEnumValue)
            .WithMessage("One or more sharing categories are not recognised.");

        RuleFor(x => x.Purpose).MaximumLength(CreateShareTokenCommandValidator.MaxPurposeLength).WithErrorCode(ErrorCodes.FieldTooLong);
    }
}

public sealed class CreateShareCodeCommandHandler : IRequestHandler<CreateShareCodeCommand, ShareCodeDto>
{
    private const int MaxGenerationAttempts = 5;

    private readonly IPatientRepository _patients;
    private readonly IShareCodeRepository _codes;
    private readonly IShareCodeService _codeService;
    private readonly IUnitOfWork _unitOfWork;
    private readonly SharingOptions _options;
    private readonly TimeProvider _time;

    public CreateShareCodeCommandHandler(
        IPatientRepository patients,
        IShareCodeRepository codes,
        IShareCodeService codeService,
        IUnitOfWork unitOfWork,
        IOptions<SharingOptions> options,
        TimeProvider time)
    {
        _patients = patients;
        _codes = codes;
        _codeService = codeService;
        _unitOfWork = unitOfWork;
        _options = options.Value;
        _time = time;
    }

    public async Task<ShareCodeDto> Handle(CreateShareCodeCommand request, CancellationToken cancellationToken)
    {
        var patient = await _patients.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        var now = _time.GetUtcNow().UtcDateTime;
        if (await _codes.CountLiveAsync(patient.Id, now, cancellationToken) >= _options.MaxLiveShareCodes)
            throw new ConflictException("You already have several unused codes. Wait for them to expire or use one before creating another.");

        SharingScopeMap.TryParse(request.Scopes, out var scopes);
        var purpose = string.IsNullOrWhiteSpace(request.Purpose) ? CreateShareTokenCommandHandler.DefaultPurpose : request.Purpose.Trim();

        var (code, hash) = await NewUniqueCodeAsync(patient.Id, cancellationToken);
        var expiresAt = now.AddMinutes(_options.ShareCodeTtlMinutes);

        await _codes.AddAsync(new ShareCode
        {
            PatientId = patient.Id,
            TokenId = $"code-{Guid.NewGuid():N}",
            CodeHash = hash,
            Scopes = (AccessScopes)(int)scopes,
            Purpose = purpose,
            ExpiresAt = expiresAt
        }, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new ShareCodeDto(
            _codeService.Format(code), expiresAt, _options.ShareCodeTtlMinutes * 60, patient.ClinicEzId,
            SharingScopeMap.ToNames(scopes), purpose);
    }

    private async Task<(string Code, string Hash)> NewUniqueCodeAsync(Guid patientId, CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < MaxGenerationAttempts; attempt++)
        {
            var code = _codeService.Generate();
            var hash = _codeService.Hash(patientId, code);
            if (await _codes.FindAsync(patientId, hash, cancellationToken) is null)
                return (code, hash);
        }

        throw new ConflictException("A share code could not be generated. Please try again.");
    }
}
