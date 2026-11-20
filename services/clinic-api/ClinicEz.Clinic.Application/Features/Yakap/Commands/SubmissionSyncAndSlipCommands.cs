using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.HealthScreenings.Common;
using ClinicEz.Clinic.Application.Features.Yakap.Common;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Workspace;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Yakap.Commands;

// ── Service 06 Status Polling ────────────────────────────────────────────────
public sealed record PollYakapSubmissionStatusCommand(Guid SubmissionId, Guid? BranchId = null) : IRequest<PortalYakapSubmissionDto>;

public sealed class PollYakapSubmissionStatusCommandHandler : IRequestHandler<PollYakapSubmissionStatusCommand, PortalYakapSubmissionDto>
{
    private readonly IRepository<YakapSubmission> _submissionRepo;
    private readonly IRepository<YakapSubmissionError> _errorRepo;
    private readonly IRepository<Patient> _patientRepo;
    private readonly IYakapPcapiClient _pcapiClient;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public PollYakapSubmissionStatusCommandHandler(
        IRepository<YakapSubmission> submissionRepo,
        IRepository<YakapSubmissionError> errorRepo,
        IRepository<Patient> patientRepo,
        IYakapPcapiClient pcapiClient,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _submissionRepo = submissionRepo;
        _errorRepo = errorRepo;
        _patientRepo = patientRepo;
        _pcapiClient = pcapiClient;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<PortalYakapSubmissionDto> Handle(PollYakapSubmissionStatusCommand request, CancellationToken ct)
    {
        var submission = await _submissionRepo
            .Query(s => s.Id == request.SubmissionId && s.ClinicId == _clinicContext.ClinicId && !s.IsDeleted)
            .Include(s => s.Errors)
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException($"Submission '{request.SubmissionId}' was not found.");

        if (string.IsNullOrWhiteSpace(submission.UploadTransactionNo))
            throw new BadRequestException("This submission has not been uploaded to PhilHealth yet. Try sending it again.");

        var res = await _pcapiClient.GetUploadStatusAsync(submission.UploadTransactionNo, ct);
        if (!res.Succeeded || res.Data == null)
            throw new BadRequestException(res.Message ?? "Unable to check submission status from PhilHealth right now.");

        var nowUtc = DateTime.UtcNow;
        var statusRaw = res.Data.ProcessingStatus?.Trim().ToLowerInvariant() ?? "processing";
        submission.LastPolledAtUtc = nowUtc;
        submission.UpdatedAt = nowUtc;

        switch (statusRaw)
        {
            case "completed":
            case "accepted":
                submission.ProcessingStatus = YakapProcessingStatus.Accepted;
                submission.ReportStatus = YakapReportStatus.V;
                submission.CompletedAtUtc ??= res.Data.ProcessedAt ?? nowUtc;
                submission.LastErrorMessage = null;
                break;
            case "rejected":
                submission.ProcessingStatus = YakapProcessingStatus.Rejected;
                submission.ReportStatus = YakapReportStatus.F;
                submission.CompletedAtUtc ??= res.Data.ProcessedAt ?? nowUtc;
                if (res.Data.Errors != null && res.Data.Errors.Count > 0)
                {
                    submission.LastErrorMessage = string.Join("; ", res.Data.Errors.Select(e => $"{e.Field}: {e.Issue}"));
                    foreach (var err in res.Data.Errors)
                    {
                        var entityErr = new YakapSubmissionError
                        {
                            Id = Guid.NewGuid(),
                            TenantId = submission.TenantId,
                            ClinicId = submission.ClinicId,
                            YakapSubmissionId = submission.Id,
                            FieldPath = err.Field,
                            Issue = err.Issue,
                            ErrorCode = "PCAPI_REJECTED",
                            CreatedAt = nowUtc,
                            CreatedBy = "PcapiPoll"
                        };
                        await _errorRepo.AddAsync(entityErr, ct);
                        // Avoid duplicate insertion into List<YakapSubmissionError> when EF Core relationship fix-up already attached it
                        if (!submission.Errors.Any(existing => existing.Id == entityErr.Id))
                        {
                            submission.Errors.Add(entityErr);
                        }
                    }
                }
                else
                {
                    submission.LastErrorMessage = "PhilHealth rejected this submission during validation.";
                }
                break;
            case "queued":
                submission.ProcessingStatus = YakapProcessingStatus.Queued;
                submission.NextPollAtUtc = nowUtc.AddMinutes(2);
                break;
            default:
                submission.ProcessingStatus = YakapProcessingStatus.Processing;
                submission.NextPollAtUtc = nowUtc.AddMinutes(1);
                break;
        }

        _submissionRepo.Update(submission);
        await _unitOfWork.SaveChangesAsync(ct);

        var patientCode = await _patientRepo
            .Query(p => p.Id == submission.PatientId)
            .Select(p => p.PatientCode)
            .FirstOrDefaultAsync(ct) ?? "UNKNOWN";

        return GetYakapSubmissionsQueryHandler.MapToPortalDto(submission, patientCode);
    }
}

// ── Retry Failed / Queued Submission ─────────────────────────────────────────
public sealed record RetryYakapSubmissionCommand(Guid SubmissionId, Guid? BranchId = null) : IRequest<PortalYakapSubmissionDto>;

public sealed class RetryYakapSubmissionCommandHandler : IRequestHandler<RetryYakapSubmissionCommand, PortalYakapSubmissionDto>
{
    private readonly IRepository<YakapSubmission> _submissionRepo;
    private readonly IRepository<Patient> _patientRepo;
    private readonly ISender _sender;
    private readonly IClinicContext _clinicContext;

    public RetryYakapSubmissionCommandHandler(
        IRepository<YakapSubmission> submissionRepo,
        IRepository<Patient> patientRepo,
        ISender sender,
        IClinicContext clinicContext)
    {
        _submissionRepo = submissionRepo;
        _patientRepo = patientRepo;
        _sender = sender;
        _clinicContext = clinicContext;
    }

    public async Task<PortalYakapSubmissionDto> Handle(RetryYakapSubmissionCommand request, CancellationToken ct)
    {
        var submission = await _submissionRepo
            .Query(s => s.Id == request.SubmissionId && s.ClinicId == _clinicContext.ClinicId && !s.IsDeleted)
            .Include(s => s.Errors)
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException($"Submission '{request.SubmissionId}' was not found.");

        if (submission.SubmissionType == YakapSubmissionType.Fpe && submission.SourceRecordId.HasValue)
        {
            await _sender.Send(new SubmitHealthScreeningYakapFpeCommand(submission.SourceRecordId.Value), ct);
        }
        else if (!string.IsNullOrWhiteSpace(submission.UploadTransactionNo))
        {
            return await _sender.Send(new PollYakapSubmissionStatusCommand(submission.Id, request.BranchId), ct);
        }

        var refreshed = await _submissionRepo
            .Query(s => s.Id == submission.Id)
            .Include(s => s.Errors)
            .AsNoTracking()
            .FirstAsync(ct);

        var patientCode = await _patientRepo
            .Query(p => p.Id == refreshed.PatientId)
            .Select(p => p.PatientCode)
            .FirstOrDefaultAsync(ct) ?? "UNKNOWN";

        return GetYakapSubmissionsQueryHandler.MapToPortalDto(refreshed, patientCode);
    }
}

// ── Service 05: Masterlist Sync ──────────────────────────────────────────────
public sealed record SyncYakapMasterlistCommand(
    string? PatientPin = null,
    int? EffectiveYear = null,
    DateOnly? StartDate = null,
    DateOnly? EndDate = null,
    Guid? BranchId = null) : IRequest<PortalYakapMasterlistSyncResultDto>;

public sealed class SyncYakapMasterlistCommandHandler : IRequestHandler<SyncYakapMasterlistCommand, PortalYakapMasterlistSyncResultDto>
{
    private readonly IYakapPcapiClient _pcapiClient;
    private readonly IPhilHealthMasterlistSyncService _syncService;
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;

    public SyncYakapMasterlistCommandHandler(
        IYakapPcapiClient pcapiClient,
        IPhilHealthMasterlistSyncService syncService,
        IRepository<FacilitySettings> settingsRepo,
        IClinicContext clinicContext,
        IWorkspaceProfileProvider? workspaceProfiles = null)
    {
        _pcapiClient = pcapiClient;
        _syncService = syncService;
        _settingsRepo = settingsRepo;
        _clinicContext = clinicContext;
        _workspaceProfiles = workspaceProfiles;
    }

    public async Task<PortalYakapMasterlistSyncResultDto> Handle(SyncYakapMasterlistCommand request, CancellationToken ct)
    {
        var today = await YakapWorkflowHelpers.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, _settingsRepo, ct);
        var nowUtc = DateTime.UtcNow;

        ApiResponse<MasterlistDownloadResponse> downloadRes;
        if (!string.IsNullOrWhiteSpace(request.PatientPin))
        {
            var pin = PhilHealthPinNormalizer.Normalize(request.PatientPin) ?? request.PatientPin.Trim();
            var effYear = (request.EffectiveYear ?? today.Year).ToString();
            downloadRes = await _pcapiClient.DownloadIndividualMasterlistAsync(
                new MasterlistIndividualRequest(pin, effYear, true),
                ct);
        }
        else
        {
            var end = request.EndDate ?? today;
            var start = request.StartDate ?? end.AddDays(-6);
            if (end.DayNumber - start.DayNumber > 6)
            {
                start = end.AddDays(-6);
            }

            downloadRes = await _pcapiClient.DownloadBatchMasterlistAsync(
                new MasterlistBatchRequest(
                    YakapWorkflowHelpers.FormatMmDdYyyy(start),
                    YakapWorkflowHelpers.FormatMmDdYyyy(end),
                    true),
                ct);
        }

        if (!downloadRes.Succeeded || downloadRes.Data == null)
        {
            return new PortalYakapMasterlistSyncResultDto
            {
                Success = false,
                SyncedAtUtc = nowUtc,
                Message = downloadRes.Message ?? "Unable to download the assigned patient list from PhilHealth."
            };
        }

        var syncResult = await _syncService.SyncMasterlistDownloadAsync(
            _clinicContext.TenantId,
            _clinicContext.ClinicId,
            downloadRes.Data,
            ct);

        return new PortalYakapMasterlistSyncResultDto
        {
            Success = true,
            RecordsAdded = syncResult.ActiveEnlistmentsCount,
            RecordsUpdated = syncResult.MatchedPatientsCount,
            TotalActiveCount = syncResult.ActiveEnlistmentsCount,
            SyncedAtUtc = nowUtc,
            Message = $"Synced {syncResult.TotalProcessed} PhilHealth roster records ({syncResult.MatchedPatientsCount} matched clinic patients)."
        };
    }
}

// ── Service 08: Confirmation / Availment Slip PDF ────────────────────────────
public sealed record GetYakapAvailmentSlipQuery(Guid PatientId, int? EffectiveYear = null) : IRequest<AvailmentSlipResponse>;

public sealed class GetYakapAvailmentSlipQueryHandler : IRequestHandler<GetYakapAvailmentSlipQuery, AvailmentSlipResponse>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<PatientPhilHealthMembership> _membershipRepo;
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IYakapPcapiClient _pcapiClient;
    private readonly IClinicContext _clinicContext;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;

    public GetYakapAvailmentSlipQueryHandler(
        IRepository<Patient> patientRepo,
        IRepository<PatientPhilHealthMembership> membershipRepo,
        IRepository<FacilitySettings> settingsRepo,
        IYakapPcapiClient pcapiClient,
        IClinicContext clinicContext,
        IWorkspaceProfileProvider? workspaceProfiles = null)
    {
        _patientRepo = patientRepo;
        _membershipRepo = membershipRepo;
        _settingsRepo = settingsRepo;
        _pcapiClient = pcapiClient;
        _clinicContext = clinicContext;
        _workspaceProfiles = workspaceProfiles;
    }

    public async Task<AvailmentSlipResponse> Handle(GetYakapAvailmentSlipQuery request, CancellationToken ct)
    {
        var patient = await _patientRepo
            .Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId && !p.IsDeleted)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("Patient record was not found.");

        var membership = await _membershipRepo
            .Query(m => m.PatientId == patient.Id && m.ClinicId == _clinicContext.ClinicId && !m.IsDeleted)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        var pin = HealthScreeningHelper.ResolvePatientPin(patient, membership);
        if (string.IsNullOrWhiteSpace(pin) || !PhilHealthPinNormalizer.IsValidPin(pin))
            throw new BadRequestException("A valid 12-digit PhilHealth number is required to download the confirmation slip.");

        var today = await YakapWorkflowHelpers.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, _settingsRepo, ct);
        var effYear = (request.EffectiveYear ?? today.Year).ToString();
        var normalizedPin = PhilHealthPinNormalizer.Normalize(pin) ?? pin.Trim();

        var res = await _pcapiClient.GenerateAvailmentSlipAsync(
            new AvailmentSlipRequest(normalizedPin, effYear, true),
            ct);

        if (!res.Succeeded || res.Data == null)
        {
            throw new BadRequestException(
                string.IsNullOrWhiteSpace(res.Message)
                    ? "Unable to generate the PhilHealth confirmation slip right now."
                    : res.Message);
        }

        return res.Data;
    }
}

// ── Zero-PHI Submission Telemetry Queries (Clinic + Portal) ──────────────────
public sealed record GetYakapSubmissionsSummaryQuery(Guid? BranchId = null) : IRequest<PortalYakapBranchSummaryDto>;

public sealed class GetYakapSubmissionsSummaryQueryHandler : IRequestHandler<GetYakapSubmissionsSummaryQuery, PortalYakapBranchSummaryDto>
{
    private readonly IRepository<YakapSubmission> _submissionRepo;
    private readonly IRepository<PatientYakapEnlistment> _enlistmentRepo;
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IClinicContext _clinicContext;

    public GetYakapSubmissionsSummaryQueryHandler(
        IRepository<YakapSubmission> submissionRepo,
        IRepository<PatientYakapEnlistment> enlistmentRepo,
        IRepository<FacilitySettings> settingsRepo,
        IClinicContext clinicContext)
    {
        _submissionRepo = submissionRepo;
        _enlistmentRepo = enlistmentRepo;
        _settingsRepo = settingsRepo;
        _clinicContext = clinicContext;
    }

    public async Task<PortalYakapBranchSummaryDto> Handle(GetYakapSubmissionsSummaryQuery request, CancellationToken ct)
    {
        var clinicId = _clinicContext.ClinicId;
        var settings = await _settingsRepo.Query(s => s.ClinicId == clinicId).AsNoTracking().FirstOrDefaultAsync(ct);
        var submissions = await _submissionRepo
            .Query(s => s.ClinicId == clinicId && !s.IsDeleted)
            .AsNoTracking()
            .ToListAsync(ct);

        var enlistments = await _enlistmentRepo
            .Query(e => e.ClinicId == clinicId && !e.IsDeleted)
            .AsNoTracking()
            .ToListAsync(ct);

        var byType = submissions
            .GroupBy(s => s.SubmissionType.ToString())
            .ToDictionary(g => g.Key, g => g.Count());

        var empaneledCount = enlistments.Count(e => !string.IsNullOrWhiteSpace(e.YesReferenceNo) || e.McaFlag);
        var selectedCount = enlistments.Count(e => e.Status is YakapEnlistmentStatus.Active or YakapEnlistmentStatus.ProfilingCompleted or YakapEnlistmentStatus.Transmitted);
        var masterlistSynced = enlistments
            .Where(e => e.Source == YakapEnlistmentSource.PhilHealthMasterlist)
            .ToList();

        return new PortalYakapBranchSummaryDto
        {
            BranchId = request.BranchId ?? settings?.BranchId ?? clinicId,
            AccreditationNo = settings?.AccreditationNumber,
            EmpaneledCount = empaneledCount,
            SelectedCount = selectedCount,
            AcceptedUploadsCount = submissions.Count(s => s.ProcessingStatus == YakapProcessingStatus.Accepted),
            PendingPollingCount = submissions.Count(s => s.ProcessingStatus is YakapProcessingStatus.Queued or YakapProcessingStatus.Pending or YakapProcessingStatus.Processing),
            RejectedOrFailedCount = submissions.Count(s => s.ProcessingStatus is YakapProcessingStatus.Rejected or YakapProcessingStatus.Failed),
            SubmissionsByType = byType,
            LastMasterlistSyncAtUtc = masterlistSynced.Count > 0 ? masterlistSynced.Max(e => e.UpdatedAt ?? e.CreatedAt) : null,
            MasterlistTotalCount = masterlistSynced.Count
        };
    }
}

public sealed record GetYakapSubmissionsQuery(
    string? Status = null,
    string? SubmissionType = null,
    int Page = 1,
    int PageSize = 50,
    Guid? BranchId = null) : IRequest<List<PortalYakapSubmissionDto>>;

public sealed class GetYakapSubmissionsQueryHandler : IRequestHandler<GetYakapSubmissionsQuery, List<PortalYakapSubmissionDto>>
{
    private readonly IRepository<YakapSubmission> _submissionRepo;
    private readonly IClinicContext _clinicContext;

    public GetYakapSubmissionsQueryHandler(
        IRepository<YakapSubmission> submissionRepo,
        IClinicContext clinicContext)
    {
        _submissionRepo = submissionRepo;
        _clinicContext = clinicContext;
    }

    public async Task<List<PortalYakapSubmissionDto>> Handle(GetYakapSubmissionsQuery request, CancellationToken ct)
    {
        var query = _submissionRepo
            .Query(s => s.ClinicId == _clinicContext.ClinicId && !s.IsDeleted)
            .Include(s => s.Patient)
            .Include(s => s.Errors)
            .AsNoTracking();

        if (!string.IsNullOrWhiteSpace(request.Status) &&
            Enum.TryParse<YakapProcessingStatus>(request.Status.Trim(), true, out var statusEnum))
        {
            query = query.Where(s => s.ProcessingStatus == statusEnum);
        }

        if (!string.IsNullOrWhiteSpace(request.SubmissionType) &&
            Enum.TryParse<YakapSubmissionType>(request.SubmissionType.Trim(), true, out var typeEnum))
        {
            query = query.Where(s => s.SubmissionType == typeEnum);
        }

        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 200);

        var items = await query
            .OrderByDescending(s => s.SubmittedAtUtc ?? s.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return items.Select(s => MapToPortalDto(s, s.Patient?.PatientCode ?? "UNKNOWN")).ToList();
    }

    internal static PortalYakapSubmissionDto MapToPortalDto(YakapSubmission s, string patientCode) =>
        new()
        {
            Id = s.Id,
            PatientCode = patientCode,
            AccreditationNo = s.AccreditationNo,
            CaseNo = s.CaseNo,
            SubmissionType = s.SubmissionType.ToString(),
            ReportStatus = s.ReportStatus.ToString(),
            LocalTransactionNo = s.LocalTransactionNo,
            UploadTransactionNo = s.UploadTransactionNo,
            YesReferenceNo = s.YesReferenceNo,
            ProcessingStatus = s.ProcessingStatus.ToString(),
            PayloadSha256Hash = s.PayloadSha256Hash,
            SubmittedAtUtc = s.SubmittedAtUtc,
            LastPolledAtUtc = s.LastPolledAtUtc,
            CompletedAtUtc = s.CompletedAtUtc,
            AttemptCount = s.AttemptCount,
            LastErrorMessage = s.LastErrorMessage,
            Errors = s.Errors
                .Where(e => !e.IsDeleted)
                .Select(e => new PortalYakapSubmissionErrorDto
                {
                    FieldPath = e.FieldPath,
                    Issue = e.Issue,
                    ErrorCode = e.ErrorCode
                })
                .ToList()
        };
}

public sealed record GetYakapSubmissionByIdQuery(Guid SubmissionId, Guid? BranchId = null) : IRequest<PortalYakapSubmissionDto>;

public sealed class GetYakapSubmissionByIdQueryHandler : IRequestHandler<GetYakapSubmissionByIdQuery, PortalYakapSubmissionDto>
{
    private readonly IRepository<YakapSubmission> _submissionRepo;
    private readonly IClinicContext _clinicContext;

    public GetYakapSubmissionByIdQueryHandler(
        IRepository<YakapSubmission> submissionRepo,
        IClinicContext clinicContext)
    {
        _submissionRepo = submissionRepo;
        _clinicContext = clinicContext;
    }

    public async Task<PortalYakapSubmissionDto> Handle(GetYakapSubmissionByIdQuery request, CancellationToken ct)
    {
        var s = await _submissionRepo
            .Query(sub => sub.Id == request.SubmissionId && sub.ClinicId == _clinicContext.ClinicId && !sub.IsDeleted)
            .Include(sub => sub.Patient)
            .Include(sub => sub.Errors)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException($"Submission '{request.SubmissionId}' was not found.");

        return GetYakapSubmissionsQueryHandler.MapToPortalDto(s, s.Patient?.PatientCode ?? "UNKNOWN");
    }
}
