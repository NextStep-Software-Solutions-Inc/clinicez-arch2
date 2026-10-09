using ClinicEz.Patient.Application.Common.Errors;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.Options;

namespace ClinicEz.Patient.Application.Features.Sharing.Commands.CreateShareToken;

/// <summary>
/// The patient picks the scopes and how many times the QR may be scanned (default once); the result is the short-lived signed
/// token the app renders as a QR code.
/// </summary>
public sealed record CreateShareTokenCommand(Guid PatientId, IReadOnlyList<string> Scopes, string? Purpose, int? MaxRedemptions = null)
    : IRequest<ShareTokenDto>;

public sealed class CreateShareTokenCommandValidator : AbstractValidator<CreateShareTokenCommand>
{
    public const int MaxPurposeLength = 200;

    public CreateShareTokenCommandValidator(IOptions<SharingOptions> options)
    {
        RuleFor(x => x.Scopes)
            .NotEmpty().WithErrorCode(ErrorCodes.CollectionEmpty).WithMessage("Choose at least one category to share.")
            .Must(scopes => SharingScopeMap.TryParse(scopes, out _)).WithErrorCode(ErrorCodes.InvalidEnumValue)
            .WithMessage("One or more sharing categories are not recognised.");

        RuleFor(x => x.Purpose).MaximumLength(MaxPurposeLength).WithErrorCode(ErrorCodes.FieldTooLong);

        RuleFor(x => x.MaxRedemptions)
            .InclusiveBetween(1, options.Value.MaxShareRedemptions).When(x => x.MaxRedemptions is not null)
            .WithErrorCode(ErrorCodes.OutOfRange)
            .WithMessage($"A share can be scanned between 1 and {options.Value.MaxShareRedemptions} times.");
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

        var maxRedemptions = request.MaxRedemptions ?? 1;
        var token = _tokens.Issue(patient.Id, scopes, purpose, maxRedemptions);

        return new ShareTokenDto(
            token.Value, token.ExpiresAtUtc, _options.ShareTokenTtlSeconds, patient.ClinicEzId,
            SharingScopeMap.ToNames(scopes), purpose, maxRedemptions);
    }
}