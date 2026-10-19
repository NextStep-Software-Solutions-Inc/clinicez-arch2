using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class PatientDocumentPublisher : IPatientDocumentPublisher
{
    private readonly ClinicPatientAddressResolver _addresses;
    private readonly IInteropPublisher _publisher;

    public PatientDocumentPublisher(ClinicPatientAddressResolver addresses, IInteropPublisher publisher)
    {
        _addresses = addresses;
        _publisher = publisher;
    }

    public async Task<bool> PublishAsync(PatientDocumentDraft draft, CancellationToken ct)
    {
        var address = await _addresses.ResolveAsync(draft.ClinicId, draft.ClinicPatientId, ct);
        if (address == null) return false;

        var payload = new PatientDocumentIssuedPayload
        {
            DocumentId = draft.DocumentId,
            Kind = draft.Kind,
            PatientId = address.SyncPatientId,
            IssuerTenantId = address.Clinic.TenantId,
            IssuerFacilityId = address.Clinic.ClinicId.ToString(),
            IssuerFacilityType = FacilityType.Clinic,
            IssuerName = address.Clinic.ClinicName,
            Title = draft.Title,
            IssuedAtUtc = draft.IssuedAtUtc,
            Status = draft.Status,
            Source = draft.Source,
            Verification = draft.Verification,
            VerificationToken = draft.VerificationToken,
            VerificationUrl = draft.VerificationUrl,
            ClaimToken = draft.ClaimToken,
            Body = draft.Body is null
                ? null
                : JsonSerializer.SerializeToElement(draft.Body, draft.Body.GetType(), InteropJson.Options)
        };

        _publisher.Enqueue(InteropTypes.PatientDocumentIssued, address.From, address.To, draft.DocumentId, payload);
        return true;
    }
}
