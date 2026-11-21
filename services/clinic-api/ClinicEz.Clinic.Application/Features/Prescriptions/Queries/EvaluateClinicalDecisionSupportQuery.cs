using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Domain.Services;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Prescriptions.Queries;

public record EvaluateCdsRequest(
    Guid? PatientId,
    string? PatientAllergies,
    List<PrescriptionCandidate> Prescriptions,
    List<PrescriptionCandidate>? ExistingMedications = null,
    double? SerumCreatinineMgDl = null,
    double? EgfrMlMin = null,
    double? SerumPotassiumMmolL = null
);

public record EvaluateCdsResponse(
    bool HasCriticalAlerts,
    bool RequiresOverride,
    List<CdsAlert> Alerts,
    string? PatientAllergiesEvaluated,
    double? LatestCreatinine,
    double? LatestEgfr,
    double? LatestPotassium
);

public record EvaluateClinicalDecisionSupportQuery(EvaluateCdsRequest Request) : IRequest<EvaluateCdsResponse>;

public class EvaluateClinicalDecisionSupportQueryHandler : IRequestHandler<EvaluateClinicalDecisionSupportQuery, EvaluateCdsResponse>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<LabObservation> _observationRepo;
    private readonly IRepository<PatientAllergy> _allergyRepo;
    private readonly IRepository<PatientMedicalHistory> _problemRepo;

    public EvaluateClinicalDecisionSupportQueryHandler(
        IRepository<Patient> patientRepo,
        IRepository<LabObservation> observationRepo,
        IRepository<PatientAllergy> allergyRepo,
        IRepository<PatientMedicalHistory> problemRepo)
    {
        _patientRepo = patientRepo;
        _observationRepo = observationRepo;
        _allergyRepo = allergyRepo;
        _problemRepo = problemRepo;
    }

    public async Task<EvaluateCdsResponse> Handle(EvaluateClinicalDecisionSupportQuery query, CancellationToken cancellationToken)
    {
        var req = query.Request;
        var allergies = req.PatientAllergies;
        var creatinine = req.SerumCreatinineMgDl;
        var egfr = req.EgfrMlMin;
        var potassium = req.SerumPotassiumMmolL;

        if (req.PatientId.HasValue && req.PatientId.Value != Guid.Empty)
        {
            var patient = await _patientRepo.Query(p => p.Id == req.PatientId.Value)
                .AsNoTracking()
                .FirstOrDefaultAsync(cancellationToken);

            // Ingest latest clinical lab results if not manually provided
            if (!creatinine.HasValue || !egfr.HasValue || !potassium.HasValue)
            {
                var recentObservations = await _observationRepo.Query(o => o.LabOrder.PatientId == req.PatientId.Value)
                    .OrderByDescending(o => o.CreatedAt)
                    .Take(20)
                    .AsNoTracking()
                    .ToListAsync(cancellationToken);

                foreach (var obs in recentObservations)
                {
                    var code = obs.AnalyteCode?.ToUpperInvariant();
                    var val = obs.NumericValue.HasValue ? (double)obs.NumericValue.Value : (double.TryParse(obs.ValueText, out var v) ? v : (double?)null);
                    if (val.HasValue)
                    {
                        if (!creatinine.HasValue && (code == "CREA" || code == "CREATININE"))
                            creatinine = val.Value;
                        if (!egfr.HasValue && (code == "EGFR" || code == "E-GFR"))
                            egfr = val.Value;
                        if (!potassium.HasValue && (code == "K" || code == "POTASSIUM"))
                            potassium = val.Value;
                    }
                }
            }
        }

        List<PatientAllergy>? structuredAllergies = null;
        List<PatientMedicalHistory>? activeProblems = null;

        if (req.PatientId.HasValue && req.PatientId.Value != Guid.Empty)
        {
            structuredAllergies = await _allergyRepo.Query(a => a.PatientId == req.PatientId.Value && a.Status == AllergyStatus.Active)
                .AsNoTracking()
                .ToListAsync(cancellationToken);

            activeProblems = await _problemRepo.Query(p => p.PatientId == req.PatientId.Value && (p.Status == ProblemStatus.Active || p.Status == ProblemStatus.Relapsed))
                .AsNoTracking()
                .ToListAsync(cancellationToken);
        }

        var alerts = ClinicalDecisionSupportEvaluator.Evaluate(
            req.Prescriptions,
            allergies,
            req.ExistingMedications,
            creatinine,
            egfr,
            potassium,
            structuredAllergies,
            activeProblems
        );

        var hasCritical = alerts.Any(a => a.Severity == CdsAlertSeverity.Critical);
        var requiresOverride = alerts.Any(a => a.RequiresOverrideReason);

        return new EvaluateCdsResponse(
            HasCriticalAlerts: hasCritical,
            RequiresOverride: requiresOverride,
            Alerts: alerts,
            PatientAllergiesEvaluated: allergies,
            LatestCreatinine: creatinine,
            LatestEgfr: egfr,
            LatestPotassium: potassium
        );
    }
}
