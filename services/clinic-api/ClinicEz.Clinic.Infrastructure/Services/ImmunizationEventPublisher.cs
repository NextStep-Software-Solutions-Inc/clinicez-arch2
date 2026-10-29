using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class ImmunizationEventPublisher : IImmunizationEventPublisher
{
    private readonly IInteropPublisher _publisher;
    private readonly ClinicPatientAddressResolver _addresses;
    private readonly ILogger<ImmunizationEventPublisher> _logger;

    public ImmunizationEventPublisher(
        IInteropPublisher publisher,
        ClinicPatientAddressResolver addresses,
        ILogger<ImmunizationEventPublisher> logger)
    {
        _publisher = publisher;
        _addresses = addresses;
        _logger = logger;
    }

    public async Task<bool> PublishImmunizationAdministeredAsync(PatientImmunization immunization, CancellationToken cancellationToken = default)
    {
        var address = await _addresses.ResolveAsync(immunization.ClinicId, immunization.PatientId, cancellationToken);
        if (address == null)
        {
            _logger.LogInformation(
                "Immunization {ImmunizationId} administered; patient {PatientId} has no patient-app account to notify.",
                immunization.Id, immunization.PatientId);
            return false;
        }

        var payload = new ClinicalImmunizationAdministeredPayload(
            ImmunizationId: immunization.Id,
            PatientId: address.SyncPatientId,
            ClinicId: immunization.ClinicId,
            PhilHealthLibrary: immunization.PhilHealthLibrary ?? "VACCINE",
            PhilHealthCode: immunization.PhilHealthCode ?? "OTHER",
            VaccineName: immunization.VaccineName,
            BrandName: immunization.BrandName,
            LotBatchNumber: immunization.LotBatchNumber ?? "LOT-NA",
            ExpirationDate: immunization.ExpirationDate ?? DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            DoseSequence: immunization.DoseSequence,
            IsSeriesCompleted: immunization.IsSeriesCompleted,
            Route: immunization.Route ?? "IM",
            InjectionSite: immunization.InjectionSite ?? "Arm",
            AdministeredAtUtc: immunization.AdministeredAtUtc,
            AdministeredByStaffId: immunization.AdministeredByStaffId ?? Guid.Empty,
            AdministeredByStaffName: immunization.AdministeredByStaffName ?? "Clinic Staff",
            AdministeredByPrcLicense: immunization.AdministeredByPrcLicense,
            IsHistorical: immunization.IsHistorical,
            HistoricalFacilityName: immunization.HistoricalFacilityName
        );

        _publisher.Enqueue(
            InteropTypes.ClinicalImmunizationAdministered,
            address.From,
            address.To,
            immunization.Id,
            payload);

        return true;
    }
}
