using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.Yakap.Services;

public interface IYakapClinicalMapper
{
    YakapReportDocumentDto MapToYakapReportDocument(
        string reportTagging,
        string effectiveYear,
        ClinicSettings settings,
        IReadOnlyList<ConsultationEncounter> encounters,
        IReadOnlyDictionary<Guid, ClinicPatient> patients,
        IReadOnlyDictionary<Guid, TriageVitals> vitalsMap,
        string transmittalNumber,
        IReadOnlyDictionary<Guid, YakapNcdAnswersDto>? ncdMap = null,
        IReadOnlyDictionary<Guid, List<ClinicLabOrder>>? labOrdersMap = null,
        IReadOnlyDictionary<string, decimal>? feeScheduleMap = null);

    string FormatPhilHealthAge(DateOnly birthDate, DateTime asOfDate);

    string NormalizePin(string pin);

    string FormatDrugCode(string rawDrugCode);
}
