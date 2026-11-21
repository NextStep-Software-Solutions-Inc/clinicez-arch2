using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>
/// Sends <c>lab.result.reviewed</c> after a doctor accepted or rejected an unverified result: to the performing laboratory
/// when the order is routed to one that is known, and to the patient when they have a patient-app account. Queued in the
/// interop outbox, so the caller invokes it before its own <c>SaveChanges</c>.
/// </summary>
public interface ILabResultReviewedPublisher
{
    Task PublishAsync(LabOrder order, LabResultReviewedPayload review, CancellationToken ct);
}
