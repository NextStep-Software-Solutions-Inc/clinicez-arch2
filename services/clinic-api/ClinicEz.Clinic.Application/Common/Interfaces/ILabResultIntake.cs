using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>
/// A result file arriving for a lab order. <see cref="Source"/> is decided by the channel (grant kind, sender party), never
/// by what the uploader claims about itself.
/// </summary>
public sealed record LabResultSubmission(
    Guid ClinicId,
    Guid LabOrderId,
    ResultSource Source,
    byte[] Content,
    string? FileName,
    string ContentType,
    string? ExternalLabName,
    string? Notes,
    UploadGrant? Grant = null,
    Guid? UploadedByPatientId = null);

public sealed record LabResultIntakeOutcome(Guid ResultId, string OrderNumber, DateTime ReceivedAtUtc);

/// <summary>
/// The single way an external-lab or patient-uploaded result enters the chart: validates size and content type, stores the
/// file encrypted in clinic storage, records an Unverified result, moves the order to ExternalSubmitted, consumes the grant
/// and tells the patient. Used by the anonymous upload page and by the inbound <c>lab.result.external.submitted</c> message.
/// </summary>
public interface ILabResultIntake
{
    Task<LabResultIntakeOutcome> SubmitAsync(LabResultSubmission submission, CancellationToken ct);
}
