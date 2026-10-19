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
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<ClinicLabOrder> _labOrderRepo;
    private readonly IRepository<PatientAllergy> _allergyRepo;
    private readonly IRepository<PatientProblem> _problemRepo;

    public EvaluateClinicalDecisionSupportQueryHandler(
        IRepository<ClinicPatient> patientRepo,
        IRepository<ClinicLabOrder> labOrderRepo,
        IRepository<PatientAllergy> allergyRepo,
        IRepository<PatientProblem> problemRepo)
    {
        _patientRepo = patientRepo;
        _labOrderRepo = labOrderRepo;
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

            if (patient != null && string.IsNullOrWhiteSpace(allergies))
            {
                allergies = patient.Allergies;
            }

            // Ingest latest clinical lab results if not manually provided
            if (!creatinine.HasValue || !egfr.HasValue || !potassium.HasValue)
            {
                var recentOrders = await _labOrderRepo.Query(l => l.PatientId == req.PatientId.Value && !string.IsNullOrEmpty(l.ObservationsJson))
                    .OrderByDescending(l => l.OrderDate)
                    .Take(5)
                    .AsNoTracking()
                    .ToListAsync(cancellationToken);

                foreach (var order in recentOrders)
                {
                    try
                    {
                        var json = order.ObservationsJson!;
                        using var doc = JsonDocument.Parse(json);
                        if (doc.RootElement.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var element in doc.RootElement.EnumerateArray())
                            {
                                var code = element.TryGetProperty("analyteCode", out var c) ? c.GetString() : null;
                                var valStr = element.TryGetProperty("value", out var v) ? v.GetString() : null;

                                if (double.TryParse(valStr, out var parsedVal))
                                {
                                    if (!creatinine.HasValue && (code == "CREA" || code == "CREATININE"))
                                    {
                                        creatinine = parsedVal;
                                    }
                                    if (!egfr.HasValue && (code == "EGFR" || code == "E-GFR"))
                                    {
                                        egfr = parsedVal;
                                    }
                                    if (!potassium.HasValue && (code == "K" || code == "POTASSIUM"))
                                    {
                                        potassium = parsedVal;
                                    }
                                }
                            }
                        }
                    }
                    catch
                    {
                        // Ignore malformed observation json
                    }
                }
            }
        }

        List<PatientAllergy>? structuredAllergies = null;
        List<PatientProblem>? activeProblems = null;

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
