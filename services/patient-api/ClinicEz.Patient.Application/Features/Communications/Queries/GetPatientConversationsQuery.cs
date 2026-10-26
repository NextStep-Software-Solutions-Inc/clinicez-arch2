using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Features.Communications.DTOs;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Communications.Queries;

public sealed record GetPatientConversationsQuery(
    string ClerkUserId,
    Guid? DependentId = null) : IRequest<IReadOnlyList<PatientConversationDto>>;

public sealed class GetPatientConversationsQueryHandler : IRequestHandler<GetPatientConversationsQuery, IReadOnlyList<PatientConversationDto>>
{
    private readonly IPatientRepository _patientRepo;
    private readonly IPatientCommunicationsRepository _commsRepo;

    public GetPatientConversationsQueryHandler(
        IPatientRepository patientRepo,
        IPatientCommunicationsRepository commsRepo)
    {
        _patientRepo = patientRepo;
        _commsRepo = commsRepo;
    }

    public async Task<IReadOnlyList<PatientConversationDto>> Handle(
        GetPatientConversationsQuery request,
        CancellationToken ct)
    {
        var primaryPatient = await _patientRepo.GetByClerkUserIdWithDetailsAsync(request.ClerkUserId, ct);
        if (primaryPatient == null)
        {
            throw new UnauthorizedException("Patient profile not found for authenticated user.");
        }

        List<Guid> targetPatientIds;

        if (request.DependentId.HasValue)
        {
            var isOwned = await _patientRepo.IsOwnedByAsync(request.DependentId.Value, request.ClerkUserId, ct);
            if (!isOwned)
            {
                throw new ForbiddenException("You do not have access to this dependent's records.");
            }
            targetPatientIds = [request.DependentId.Value];
        }
        else
        {
            targetPatientIds = [primaryPatient.Id];
            if (primaryPatient.ManagedDependents != null)
            {
                targetPatientIds.AddRange(primaryPatient.ManagedDependents.Select(d => d.Id));
            }
        }

        var conversations = await _commsRepo.GetConversationsForPatientsAsync(targetPatientIds, includeHidden: false, ct);

        return conversations.Select(c => new PatientConversationDto(
            c.Id,
            c.PatientId,
            c.HomeTenantId,
            c.HomeFacilityId,
            c.HomeFacilityType,
            c.FacilityName,
            c.Category,
            c.Subject,
            c.Status,
            c.TriageDisposition,
            c.DeclineReasonCode,
            c.AssignedStaffDisplayName,
            c.IsHiddenByPatient,
            c.OpenedAtUtc,
            c.ClosedAtUtc,
            c.LastMessageAtUtc,
            c.LastMessagePreview,
            c.UnreadCount,
            c.SubmittingAccountId,
            c.SubmittingAccountName,
            c.RelationshipToPatient
        )).ToList();
    }
}
