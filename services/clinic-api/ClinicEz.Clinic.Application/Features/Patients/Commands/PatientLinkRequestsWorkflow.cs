using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public interface IPatientLinkResolutionPublisher
{
    Task PublishResolvedAsync(
        Guid linkRequestId,
        Guid cloudPatientId,
        string clinicEzId,
        Guid? clinicPatientId,
        string status,
        string? rejectionReason,
        string? reviewedByStaffName,
        CancellationToken ct);
}

public sealed record PatientLinkCandidateDto(
    Guid PatientId,
    string PatientCode,
    string FullName,
    DateOnly? DateOfBirth,
    string? Email,
    string? ContactNumber,
    int Score,
    IReadOnlyList<string> MatchedSignals);

public sealed record PatientLinkRequestDto(
    Guid Id,
    Guid CloudPatientId,
    string ClinicEzId,
    string FirstName,
    string? MiddleName,
    string LastName,
    string? Suffix,
    DateOnly? DateOfBirth,
    string? VerifiedEmail,
    string? ContactNumber,
    IReadOnlyDictionary<string, string> IdentifierClaims,
    string Status,
    Guid? MatchedPatientId,
    string? ReviewedByStaffName,
    DateTime? ReviewedAtUtc,
    string? RejectionReason,
    DateTime RequestedAtUtc,
    IReadOnlyList<PatientLinkCandidateDto> Candidates);

public sealed record GetPatientLinkRequestsQuery(string? Status = "PendingReview") : IRequest<List<PatientLinkRequestDto>>;

public sealed class GetPatientLinkRequestsQueryHandler : IRequestHandler<GetPatientLinkRequestsQuery, List<PatientLinkRequestDto>>
{
    private readonly IRepository<PatientLinkRequest> _repo;
    private readonly IClinicContext _clinicContext;

    public GetPatientLinkRequestsQueryHandler(IRepository<PatientLinkRequest> repo, IClinicContext clinicContext)
    {
        _repo = repo;
        _clinicContext = clinicContext;
    }

    public async Task<List<PatientLinkRequestDto>> Handle(GetPatientLinkRequestsQuery request, CancellationToken ct)
    {
        var query = _repo.Query().AsNoTracking().Where(r => !r.IsDeleted);
        if (_clinicContext.ClinicId != Guid.Empty)
        {
            query = query.Where(r => r.ClinicId == _clinicContext.ClinicId);
        }

        if (!string.IsNullOrWhiteSpace(request.Status) &&
            Enum.TryParse<PatientLinkRequestStatus>(request.Status.Trim(), true, out var statusFilter))
        {
            query = query.Where(r => r.Status == statusFilter);
        }

        var rows = await query.OrderByDescending(r => r.RequestedAtUtc).Take(200).ToListAsync(ct);
        return rows.Select(MapDto).ToList();
    }

    internal static PatientLinkRequestDto MapDto(PatientLinkRequest r)
    {
        var candidates = (r.CandidateMatches ?? [])
            .Select(c => new PatientLinkCandidateDto(
                c.PatientId, c.PatientCode, c.FullName, c.DateOfBirth,
                c.Email, c.ContactNumber, c.Score, c.MatchedSignals))
            .ToList();

        var claims = r.IdentifierClaims is { Count: > 0 }
            ? new Dictionary<string, string>(r.IdentifierClaims, StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        return new PatientLinkRequestDto(
            r.Id, r.CloudPatientId, r.ClinicEzId,
            r.FirstName, r.MiddleName, r.LastName, r.Suffix,
            r.DateOfBirth, r.VerifiedEmail, r.ContactNumber,
            claims,
            r.Status.ToString(), r.MatchedPatientId,
            r.ReviewedByStaffName, r.ReviewedAtUtc, r.RejectionReason,
            r.RequestedAtUtc, candidates);
    }
}

public sealed record ApprovePatientLinkRequestCommand(Guid LinkRequestId, Guid TargetPatientId) : IRequest<PatientLinkRequestDto>;

public sealed class ApprovePatientLinkRequestCommandHandler : IRequestHandler<ApprovePatientLinkRequestCommand, PatientLinkRequestDto>
{
    private readonly IRepository<PatientLinkRequest> _linkRepo;
    private readonly IRepository<Patient> _patientRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IPatientLinkResolutionPublisher _publisher;
    private readonly IUnitOfWork _unitOfWork;

    public ApprovePatientLinkRequestCommandHandler(
        IRepository<PatientLinkRequest> linkRepo,
        IRepository<Patient> patientRepo,
        IClinicContext clinicContext,
        IPatientLinkResolutionPublisher publisher,
        IUnitOfWork unitOfWork)
    {
        _linkRepo = linkRepo;
        _patientRepo = patientRepo;
        _clinicContext = clinicContext;
        _publisher = publisher;
        _unitOfWork = unitOfWork;
    }

    public async Task<PatientLinkRequestDto> Handle(ApprovePatientLinkRequestCommand request, CancellationToken ct)
    {
        var linkReq = await _linkRepo.Query()
            .FirstOrDefaultAsync(r => r.Id == request.LinkRequestId && !r.IsDeleted, ct)
            ?? throw new NotFoundException($"Patient link request '{request.LinkRequestId}' was not found.");

        if (_clinicContext.ClinicId != Guid.Empty && linkReq.ClinicId != _clinicContext.ClinicId)
        {
            throw new NotFoundException($"Patient link request '{request.LinkRequestId}' was not found.");
        }

        if (linkReq.Status != PatientLinkRequestStatus.PendingReview)
        {
            throw new ConflictException($"Link request is already {linkReq.Status}.");
        }

        var targetChart = await _patientRepo.Query()
            .FirstOrDefaultAsync(p => p.Id == request.TargetPatientId && p.ClinicId == linkReq.ClinicId && !p.IsDeleted, ct)
            ?? throw new NotFoundException($"Clinic patient chart '{request.TargetPatientId}' was not found.");

        if (targetChart.CloudPatientId.HasValue && targetChart.CloudPatientId.Value != linkReq.CloudPatientId)
        {
            throw new ConflictException("The selected clinic chart is already linked to a different ClinicEZ patient account.");
        }

        var alreadyLinkedElsewhere = await _patientRepo.Query()
            .AnyAsync(p => !p.IsDeleted && p.ClinicId == linkReq.ClinicId &&
                           p.Id != targetChart.Id && p.CloudPatientId == linkReq.CloudPatientId, ct);
        if (alreadyLinkedElsewhere)
        {
            throw new ConflictException("This ClinicEZ patient account is already linked to another chart in this clinic.");
        }

        var now = DateTime.UtcNow;
        var staffName = _clinicContext.StaffName ?? _clinicContext.StaffId?.ToString() ?? "Clinic Staff";

        targetChart.LinkCloudAccount(linkReq.CloudPatientId, linkReq.ClinicEzId);
        targetChart.UpdatedAt = now;
        targetChart.UpdatedBy = staffName;

        linkReq.Status = PatientLinkRequestStatus.Approved;
        linkReq.MatchedPatientId = targetChart.Id;
        linkReq.ReviewedByStaffId = _clinicContext.StaffId;
        linkReq.ReviewedByStaffName = staffName;
        linkReq.ReviewedAtUtc = now;
        linkReq.UpdatedAt = now;
        linkReq.UpdatedBy = staffName;

        await _publisher.PublishResolvedAsync(
            linkReq.Id,
            linkReq.CloudPatientId,
            linkReq.ClinicEzId,
            targetChart.Id,
            "Approved",
            null,
            staffName,
            ct);

        await _unitOfWork.SaveChangesAsync(ct);
        return GetPatientLinkRequestsQueryHandler.MapDto(linkReq);
    }
}

public sealed record RejectPatientLinkRequestCommand(Guid LinkRequestId, string Reason) : IRequest<PatientLinkRequestDto>;

public sealed class RejectPatientLinkRequestCommandHandler : IRequestHandler<RejectPatientLinkRequestCommand, PatientLinkRequestDto>
{
    private readonly IRepository<PatientLinkRequest> _linkRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IPatientLinkResolutionPublisher _publisher;
    private readonly IUnitOfWork _unitOfWork;

    public RejectPatientLinkRequestCommandHandler(
        IRepository<PatientLinkRequest> linkRepo,
        IClinicContext clinicContext,
        IPatientLinkResolutionPublisher publisher,
        IUnitOfWork unitOfWork)
    {
        _linkRepo = linkRepo;
        _clinicContext = clinicContext;
        _publisher = publisher;
        _unitOfWork = unitOfWork;
    }

    public async Task<PatientLinkRequestDto> Handle(RejectPatientLinkRequestCommand request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            throw new BadRequestException("A rejection reason is required.");
        }

        var linkReq = await _linkRepo.Query()
            .FirstOrDefaultAsync(r => r.Id == request.LinkRequestId && !r.IsDeleted, ct)
            ?? throw new NotFoundException($"Patient link request '{request.LinkRequestId}' was not found.");

        if (_clinicContext.ClinicId != Guid.Empty && linkReq.ClinicId != _clinicContext.ClinicId)
        {
            throw new NotFoundException($"Patient link request '{request.LinkRequestId}' was not found.");
        }

        if (linkReq.Status != PatientLinkRequestStatus.PendingReview)
        {
            throw new ConflictException($"Link request is already {linkReq.Status}.");
        }

        var now = DateTime.UtcNow;
        var staffName = _clinicContext.StaffName ?? _clinicContext.StaffId?.ToString() ?? "Clinic Staff";
        var reason = request.Reason.Trim();

        linkReq.Status = PatientLinkRequestStatus.Rejected;
        linkReq.RejectionReason = reason;
        linkReq.ReviewedByStaffId = _clinicContext.StaffId;
        linkReq.ReviewedByStaffName = staffName;
        linkReq.ReviewedAtUtc = now;
        linkReq.UpdatedAt = now;
        linkReq.UpdatedBy = staffName;

        await _publisher.PublishResolvedAsync(
            linkReq.Id,
            linkReq.CloudPatientId,
            linkReq.ClinicEzId,
            null,
            "Rejected",
            reason,
            staffName,
            ct);

        await _unitOfWork.SaveChangesAsync(ct);
        return GetPatientLinkRequestsQueryHandler.MapDto(linkReq);
    }
}
