using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using FluentValidation;
using MediatR;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Workspace;

/// <summary>
/// Replaces the whole "general" section. Every field is explicit: a blank optional value clears it,
/// nothing is silently ignored.
/// </summary>
public record UpdateWorkspaceGeneralCommand(
    string TenantSlug,
    WorkspaceActor Actor,
    string Name,
    string? RepresentativeName,
    string Email,
    string? PhoneNumber,
    string TimeZoneId,
    string Locale,
    string DateFormat,
    string CurrencyCode
) : IRequest<WorkspaceGeneralDto>;

public static partial class WorkspaceTimeZones
{
    [GeneratedRegex(@"^[A-Za-z][A-Za-z0-9_+\-]*(/[A-Za-z0-9_+\-]+){0,2}$")]
    private static partial Regex IanaShape();

    /// <summary>
    /// Validates an IANA time zone id. Uses the host's tz database when it has one; hosts without
    /// tz data (minimal containers) fall back to a shape check so saving still works.
    /// </summary>
    public static bool IsValid(string? id)
    {
        if (string.IsNullOrWhiteSpace(id) || id.Length > 64 || !IanaShape().IsMatch(id)) return false;
        if (TimeZoneInfo.TryFindSystemTimeZoneById(id, out _)) return true;

        var hostHasTzData = TimeZoneInfo.GetSystemTimeZones().Count > 1;
        return !hostHasTzData;
    }
}

public partial class UpdateWorkspaceGeneralCommandValidator : AbstractValidator<UpdateWorkspaceGeneralCommand>
{
    [GeneratedRegex(@"^[0-9+()\-\s]{7,20}$")]
    private static partial Regex PhoneShape();

    [GeneratedRegex(@"^[a-z]{2,3}(-[A-Z]{2})?$")]
    private static partial Regex LocaleShape();

    [GeneratedRegex(@"^[A-Z]{3}$")]
    private static partial Regex CurrencyShape();

    public UpdateWorkspaceGeneralCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty().WithMessage("Tenant identifier is required.");

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Workspace name is required.")
            .Must(n => n.Trim().Length is >= 2 and <= 120)
            .WithMessage("Workspace name must be between 2 and 120 characters.");

        RuleFor(x => x.RepresentativeName)
            .MaximumLength(200).WithMessage("Representative name must be 200 characters or fewer.");

        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("Contact email is required.")
            .EmailAddress().WithMessage("Must be a valid email address.")
            .MaximumLength(254);

        When(x => !string.IsNullOrWhiteSpace(x.PhoneNumber), () =>
        {
            RuleFor(x => x.PhoneNumber!).Must(p => PhoneShape().IsMatch(p.Trim()))
                .WithMessage("Phone number may only contain digits, spaces, +, - and parentheses (7-20 characters).");
        });

        RuleFor(x => x.TimeZoneId).Must(WorkspaceTimeZones.IsValid)
            .WithMessage("Time zone must be a valid IANA identifier, e.g. Asia/Manila.");

        RuleFor(x => x.Locale).Must(l => !string.IsNullOrEmpty(l) && LocaleShape().IsMatch(l))
            .WithMessage("Locale must look like 'en' or 'en-PH'.");

        RuleFor(x => x.DateFormat).Must(f => WorkspaceSettings.SupportedDateFormats.Contains(f))
            .WithMessage("Unsupported date format.");

        RuleFor(x => x.CurrencyCode).Must(c => !string.IsNullOrEmpty(c) && CurrencyShape().IsMatch(c))
            .WithMessage("Currency must be a 3-letter ISO 4217 code, e.g. PHP.");
    }
}

public class UpdateWorkspaceGeneralCommandHandler(IApplicationDbContext context, IPublishEndpoint publishEndpoint)
    : IRequestHandler<UpdateWorkspaceGeneralCommand, WorkspaceGeneralDto>
{
    public async Task<WorkspaceGeneralDto> Handle(UpdateWorkspaceGeneralCommand request, CancellationToken cancellationToken)
    {
        var key = request.TenantSlug.Trim().ToLowerInvariant();
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == key || t.Id.ToString() == key, cancellationToken)
            ?? throw new KeyNotFoundException($"Workspace '{request.TenantSlug}' not found.");

        var settings = await WorkspaceSettingsStore.GetOrCreateAsync(context, tenant, cancellationToken);
        var changes = new WorkspaceChangeSet();

        var name = request.Name.Trim();
        changes.Track("name", tenant.Name, name);
        tenant.Name = name;

        var parts = (request.RepresentativeName ?? string.Empty)
            .Trim()
            .Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        var firstName = parts.Length > 0 ? parts[0] : string.Empty;
        var lastName = parts.Length > 1 ? parts[1] : string.Empty;
        changes.Track("representativeName", $"{tenant.FirstName} {tenant.LastName}".Trim(), $"{firstName} {lastName}".Trim());
        tenant.FirstName = firstName;
        tenant.LastName = lastName;

        var email = request.Email.Trim();
        changes.Track("email", tenant.Email, email);
        tenant.Email = email;

        var phone = string.IsNullOrWhiteSpace(request.PhoneNumber) ? null : request.PhoneNumber.Trim();
        changes.Track("phoneNumber", tenant.PhoneNumber, phone);
        tenant.PhoneNumber = phone;

        changes.Track("timeZoneId", settings.TimeZoneId, request.TimeZoneId);
        settings.TimeZoneId = request.TimeZoneId;

        changes.Track("locale", settings.Locale, request.Locale);
        settings.Locale = request.Locale;

        changes.Track("dateFormat", settings.DateFormat, request.DateFormat);
        settings.DateFormat = request.DateFormat;

        changes.Track("currencyCode", settings.CurrencyCode, request.CurrencyCode);
        settings.CurrencyCode = request.CurrencyCode;

        var profileChanged = changes.HasChanges;
        if (profileChanged)
        {
            tenant.UpdatedAt = DateTime.UtcNow;
            WorkspaceSettingsStore.BumpProfileVersion(settings);
            changes.Stage(context, tenant.Id, request.Actor, section: "general");
        }

        await context.SaveChangesAsync(cancellationToken);

        if (profileChanged) await WorkspaceProfileEvents.PublishUpdatedAsync(publishEndpoint, tenant, settings, cancellationToken);

        return WorkspaceSettingsMapper.ToGeneral(tenant, settings);
    }
}
