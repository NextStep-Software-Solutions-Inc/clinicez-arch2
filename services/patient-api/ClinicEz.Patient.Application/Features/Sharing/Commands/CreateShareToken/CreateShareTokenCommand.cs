using ClinicEz.Patient.Application.Common.Errors;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.Options;

namespace ClinicEz.Patient.Application.Features.Sharing.Commands.CreateShareToken;

/// <summary>The patient picks the scopes; the result is the short-lived signed token the app renders as a QR code.</summary>
public sealed record CreateShareTokenCommand(Guid PatientId, IReadOnlyList<string> Scopes, string? Purpose) : IRequest<ShareTokenDto>;

public sealed class CreateShareTokenCommandValidator : AbstractValidator<CreateShareTokenCommand>
{
    public const int MaxPurposeLength = 200;

    public CreateShareTokenCommandValidator()
    {
        RuleFor(x => x.Scopes)
            .NotEmpty().WithErrorCode(ErrorCodes.CollectionEmpty).WithMessage("Choose at least one category to share.")
            .Must(scopes => SharingScopeMap.TryParse(scopes, out _)).WithErrorCode(ErrorCodes.InvalidEnumValue)
            .WithMessage("One or more sharing categories are not recognised.");

        RuleFor(x => x.Purpose).MaximumLength(MaxPurposeLength).WithErrorCode(ErrorCodes.FieldTooLong);
    }
}

public sealed class CreateShareTokenCommandHandler : IRequestHandler<CreateShareTokenCommand, ShareTokenDto>
{
    public const string DefaultPurpose = "Consultation";

    private readonly IPatientRepository _patients;
    private readonly IShareTokenService _tokens;
    private readonly SharingOptions _options;

    public CreateShareTokenCommandHandler(IPatientRepository patients, IShareTokenService tokens, IOptions<SharingOptions> options)
    {
        _patients = patients;
        _tokens = tokens;
        _options = options.Value;
    }

    public async Task<ShareTokenDto> Handle(CreateShareTokenCommand request, CancellationToken cancellationToken)
    {
        var patient = await _patients.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        SharingScopeMap.TryParse(request.Scopes, out var scopes);
        var purpose = string.IsNullOrWhiteSpace(request.Purpose) ? DefaultPurpose : request.Purpose.Trim();

        var token = _tokens.Issue(patient.Id, scopes, purpose);

        return new ShareTokenDto(
            token.Value, token.ExpiresAtUtc, _options.ShareTokenTtlSeconds, patient.ClinicEzId,
            SharingScopeMap.ToNames(scopes), purpose);
    }
}