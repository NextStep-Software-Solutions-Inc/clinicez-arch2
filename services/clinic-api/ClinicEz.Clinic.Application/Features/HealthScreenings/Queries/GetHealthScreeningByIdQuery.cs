using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Features.HealthScreenings.Common;
using ClinicEz.Clinic.Application.Features.HealthScreenings.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Workspace;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.HealthScreenings.Queries;

public sealed record GetHealthScreeningByIdQuery(Guid Id) : IRequest<HealthScreeningDetailDto>;

public sealed class GetHealthScreeningByIdQueryValidator : AbstractValidator<GetHealthScreeningByIdQuery>
{
    public GetHealthScreeningByIdQueryValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public sealed class GetHealthScreeningByIdQueryHandler
    : IRequestHandler<GetHealthScreeningByIdQuery, HealthScreeningDetailDto>
{
    private readonly IRepository<HealthScreening> _screeningRepo;
    private readonly IRepository<Patient> _patientRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<QueueItem>? _queueRepo;
    private readonly IRepository<ServiceItem>? _serviceItemRepo;
    private readonly IRepository<PatientVitals>? _vitalsRepo;
    private readonly IRepository<PatientPhysicalExam>? _physicalExamRepo;
    private readonly IRepository<NcdRiskAssessment>? _ncdRepo;
    private readonly IRepository<LabOrder>? _labOrderRepo;
    private readonly IRepository<PatientPhilHealthMembership>? _membershipRepo;
    private readonly IRepository<PatientYakapEnlistment>? _enlistmentRepo;
    private readonly IRepository<FacilitySettings>? _settingsRepo;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;

    public GetHealthScreeningByIdQueryHandler(
        IRepository<HealthScreening> screeningRepo,
        IRepository<Patient> patientRepo,
        IClinicContext clinicContext,
        IRepository<QueueItem>? queueRepo = null,
        IRepository<ServiceItem>? serviceItemRepo = null,
        IRepository<PatientVitals>? vitalsRepo = null,
        IRepository<PatientPhysicalExam>? physicalExamRepo = null,
        IRepository<NcdRiskAssessment>? ncdRepo = null,
        IRepository<LabOrder>? labOrderRepo = null,
        IRepository<PatientPhilHealthMembership>? membershipRepo = null,
        IRepository<PatientYakapEnlistment>? enlistmentRepo = null,
        IRepository<FacilitySettings>? settingsRepo = null,
        IWorkspaceProfileProvider? workspaceProfiles = null)
    {
        _screeningRepo = screeningRepo;
        _patientRepo = patientRepo;
        _clinicContext = clinicContext;
        _queueRepo = queueRepo;
        _serviceItemRepo = serviceItemRepo;
        _vitalsRepo = vitalsRepo;
        _physicalExamRepo = physicalExamRepo;
        _ncdRepo = ncdRepo;
        _labOrderRepo = labOrderRepo;
        _membershipRepo = membershipRepo;
        _enlistmentRepo = enlistmentRepo;
        _settingsRepo = settingsRepo;
        _workspaceProfiles = workspaceProfiles;
    }

    public async Task<HealthScreeningDetailDto> Handle(
        GetHealthScreeningByIdQuery request,
        CancellationToken cancellationToken)
    {
        var screening = await _screeningRepo
            .Query(hs => hs.Id == request.Id && hs.ClinicId == _clinicContext.ClinicId && !hs.IsDeleted)
            .AsNoTracking()
            .FirstOrDefaultAsync(cancellationToken);

        if (screening == null)
        {
            throw new NotFoundException($"Health screening '{request.Id}' was not found in this clinic.");
        }

        return await BuildDetailAsync(screening, cancellationToken);
    }

    internal async Task<HealthScreeningDetailDto> BuildDetailAsync(
        HealthScreening screening,
        CancellationToken cancellationToken)
    {
        var patient = await _patientRepo
            .Query(p => p.Id == screening.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .AsNoTracking()
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"Patient '{screening.PatientId}' was not found in this clinic.");

        var queueItem = _queueRepo != null
            ? await _queueRepo.Query(q => q.Id == screening.QueueItemId && q.ClinicId == _clinicContext.ClinicId)
                .AsNoTracking()
                .FirstOrDefaultAsync(cancellationToken)
            : null;

        var serviceItem = (_serviceItemRepo != null && screening.ServiceItemId.HasValue)
            ? await _serviceItemRepo.Query(s => s.Id == screening.ServiceItemId.Value && s.ClinicId == _clinicContext.ClinicId)
                .AsNoTracking()
                .FirstOrDefaultAsync(cancellationToken)
            : null;

        PatientVitals? vitals = null;
        if (_vitalsRepo != null)
        {
            if (screening.PatientVitalsId.HasValue)
            {
                vitals = await _vitalsRepo.Query(v => v.Id == screening.PatientVitalsId.Value && v.ClinicId == _clinicContext.ClinicId)
                    .AsNoTracking()
                    .FirstOrDefaultAsync(cancellationToken);
            }
            vitals ??= await _vitalsRepo.Query(v => v.QueueItemId == screening.QueueItemId && v.ClinicId == _clinicContext.ClinicId)
                .AsNoTracking()
                .OrderByDescending(v => v.RecordedAt)
                .FirstOrDefaultAsync(cancellationToken);
        }

        PatientPhysicalExam? physicalExam = null;
        if (_physicalExamRepo != null)
        {
            if (screening.PatientPhysicalExamId.HasValue)
            {
                physicalExam = await _physicalExamRepo.Query(pe => pe.Id == screening.PatientPhysicalExamId.Value && pe.ClinicId == _clinicContext.ClinicId)
                    .AsNoTracking()
                    .FirstOrDefaultAsync(cancellationToken);
            }
            physicalExam ??= await _physicalExamRepo.Query(pe => pe.PatientId == screening.PatientId && pe.ClinicId == _clinicContext.ClinicId)
                .AsNoTracking()
                .OrderByDescending(pe => pe.ExamDate)
                .ThenByDescending(pe => pe.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);
        }

        NcdRiskAssessment? ncdAssessment = null;
        if (_ncdRepo != null)
        {
            if (screening.NcdRiskAssessmentId.HasValue)
            {
                ncdAssessment = await _ncdRepo.Query(n => n.Id == screening.NcdRiskAssessmentId.Value && n.ClinicId == _clinicContext.ClinicId)
                    .AsNoTracking()
                    .FirstOrDefaultAsync(cancellationToken);
            }
            ncdAssessment ??= await _ncdRepo.Query(n => n.PatientId == screening.PatientId && n.ClinicId == _clinicContext.ClinicId && !n.IsDeleted)
                .AsNoTracking()
                .OrderByDescending(n => n.AssessmentDate)
                .ThenByDescending(n => n.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);
        }

        var labOrders = _labOrderRepo != null
            ? await _labOrderRepo.Query(o => o.QueueItemId == screening.QueueItemId && o.ClinicId == _clinicContext.ClinicId && !o.IsDeleted)
                .Include(o => o.Items)
                .AsNoTracking()
                .OrderByDescending(o => o.OrderDate)
                .ToListAsync(cancellationToken)
            : new List<LabOrder>();

        var settings = _settingsRepo != null
            ? await _settingsRepo.Query(s => s.ClinicId == _clinicContext.ClinicId)
                .AsNoTracking()
                .FirstOrDefaultAsync(cancellationToken)
            : null;

        YakapFpeReadinessDto? yakapReadiness = null;
        if (screening.WorkflowMode == VisitWorkflowMode.YakapAvailment || screening.ScreeningType == HealthScreeningType.YakapFpe)
        {
            var membership = _membershipRepo != null
                ? await _membershipRepo.Query(m => m.PatientId == screening.PatientId && m.ClinicId == _clinicContext.ClinicId)
                    .AsNoTracking()
                    .FirstOrDefaultAsync(cancellationToken)
                : null;

            var enlistments = _enlistmentRepo != null
                ? await _enlistmentRepo.Query(e => e.PatientId == screening.PatientId && e.ClinicId == _clinicContext.ClinicId)
                    .AsNoTracking()
                    .OrderByDescending(e => e.EffectiveYear)
                    .ToListAsync(cancellationToken)
                : new List<PatientYakapEnlistment>();

            var today = await ClinicTimeZoneResolver.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, cancellationToken, _settingsRepo);
            yakapReadiness = HealthScreeningHelper.EvaluateYakapReadiness(
                patient,
                membership,
                enlistments,
                screening,
                vitals,
                physicalExam,
                ncdAssessment,
                today);
        }

        return HealthScreeningHelper.ToDetailDto(
            screening,
            queueItem,
            serviceItem,
            vitals,
            physicalExam,
            ncdAssessment,
            labOrders,
            yakapReadiness,
            settings);
    }
}
