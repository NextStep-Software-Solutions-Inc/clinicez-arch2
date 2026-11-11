using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Search;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;


public sealed record GetClinicPatientsQuery(
    string? SearchTerm = null,
    bool? HasAlerts = null,
    string? VerificationStatus = null,
    string? FilterMode = null,
    int PageNumber = 1,
    int PageSize = 50,
    string? CursorLastName = null,
    string? CursorFirstName = null,
    Guid? CursorId = null,
    string? AfterLastName = null,
    string? AfterFirstName = null,
    Guid? AfterId = null,
    Guid? StaffId = null,
    Guid? DoctorId = null,
    IReadOnlyList<Guid>? RoomIds = null,
    DateOnly? QueueDate = null) : IRequest<IReadOnlyList<ClinicPatientDto>>
{
    public string? EffectiveCursorLastName => CursorLastName ?? AfterLastName;
    public string? EffectiveCursorFirstName => CursorFirstName ?? AfterFirstName;
    public Guid? EffectiveCursorId => CursorId ?? AfterId;
}

public sealed class GetClinicPatientsQueryHandler : IRequestHandler<GetClinicPatientsQuery, IReadOnlyList<ClinicPatientDto>>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<QueueItem>? _queueRepo;
    private readonly IRepository<ConsultationEncounter>? _encounterRepo;
    private readonly IRepository<Invoice>? _invoiceRepo;

    public GetClinicPatientsQueryHandler(
        IRepository<Patient> patientRepo,
        IRepository<QueueItem>? queueRepo = null,
        IRepository<ConsultationEncounter>? encounterRepo = null,
        IRepository<Invoice>? invoiceRepo = null)
    {
        _patientRepo = patientRepo;
        _queueRepo = queueRepo;
        _encounterRepo = encounterRepo;
        _invoiceRepo = invoiceRepo;
    }

    public async Task<IReadOnlyList<ClinicPatientDto>> Handle(GetClinicPatientsQuery request, CancellationToken ct)
    {
        IQueryable<Patient> baseQuery = ApplyRelationalBaseFilters(_patientRepo.Query().AsNoTracking(), request);

        var isMyPatients = string.Equals(request.FilterMode, "MY_PATIENTS", StringComparison.OrdinalIgnoreCase);
        var effectiveStaffId = request.StaffId ?? request.DoctorId;
        var relatedPatientIds = new List<Guid>();
        if (isMyPatients && effectiveStaffId.HasValue)
        {
            var tz = ClinicTimeZoneResolver.ResolveTimeZone("Asia/Manila");
            var localToday = request.QueueDate ?? DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
            var staffId = effectiveStaffId.Value;
            var queuePatientIds = _queueRepo != null
                ? await _queueRepo.Query()
                    .AsNoTracking()
                    .Where(q => (q.DoctorId == staffId || (request.RoomIds != null && q.RoomId.HasValue && request.RoomIds.Contains(q.RoomId.Value))) &&
                                (q.QueueDate == localToday || (request.QueueDate == null && q.QueueDate == DateOnly.FromDateTime(DateTime.UtcNow))) &&
                                q.Status != QueueStatus.Completed &&
                                q.Status != QueueStatus.Cancelled &&
                                q.Status != QueueStatus.NoShow &&
                                q.Status != QueueStatus.DischargedNonDoctor &&
                                q.Status != QueueStatus.Diverted)
                    .Select(q => q.PatientId)
                    .Distinct()
                    .ToListAsync(ct)
                : new List<Guid>();

            var encounterPatientIds = _encounterRepo != null
                ? await _encounterRepo.Query()
                    .AsNoTracking()
                    .Where(e => e.DoctorId == staffId)
                    .Select(e => e.PatientId)
                    .Distinct()
                    .ToListAsync(ct)
                : new List<Guid>();

            relatedPatientIds = queuePatientIds.Concat(encounterPatientIds).Distinct().ToList();
        }

        try
        {
            var pgQuery = ApplyPostgresFilterMode(baseQuery, request.FilterMode, effectiveStaffId, relatedPatientIds);
            return await ExecuteProjectedQuery(pgQuery, request, _queueRepo, _encounterRepo, _invoiceRepo, ct);
        }
        catch
        {
            var memQuery = baseQuery;
            if (isMyPatients)
            {
                if (!effectiveStaffId.HasValue)
                {
                    memQuery = memQuery.Where(_ => false);
                }
                else
                {
                    var staffId = effectiveStaffId.Value;
                    var staffIdStr = staffId.ToString();

                    var patientVitalsAndCustom = await baseQuery
                        .Select(p => new
                        {
                            p.Id,
                            HasNurseVitals = p.Vitals.Any(v => !v.IsDeleted && v.NurseId == staffId),
                            p.CustomFields
                        })
                        .ToListAsync(ct);

                    var matchedIds = patientVitalsAndCustom
                        .Where(p =>
                            (relatedPatientIds.Count > 0 && relatedPatientIds.Contains(p.Id)) ||
                            p.HasNurseVitals ||
                            IsStaffAssignedCustomFields(p.CustomFields, staffIdStr))
                        .Select(p => p.Id)
                        .ToHashSet();

                    memQuery = memQuery.Where(p => matchedIds.Contains(p.Id));
                }
            }
            else if (string.Equals(request.FilterMode, "STUDENTS", StringComparison.OrdinalIgnoreCase))
            {
                var patientCustoms = await baseQuery.Select(p => new { p.Id, p.CustomFields }).ToListAsync(ct);
                var studentIds = patientCustoms
                    .Where(p => IsStudentCustomFields(p.CustomFields))
                    .Select(p => p.Id)
                    .ToHashSet();
                memQuery = memQuery.Where(p => studentIds.Contains(p.Id));
            }
            else if (string.Equals(request.FilterMode, "EMPLOYEES", StringComparison.OrdinalIgnoreCase))
            {
                var patientCustoms = await baseQuery.Select(p => new { p.Id, p.CustomFields }).ToListAsync(ct);
                var empIds = patientCustoms
                    .Where(p => IsEmployeeCustomFields(p.CustomFields))
                    .Select(p => p.Id)
                    .ToHashSet();
                memQuery = memQuery.Where(p => empIds.Contains(p.Id));
            }

            return await ExecuteProjectedQuery(memQuery, request, _queueRepo, _encounterRepo, _invoiceRepo, ct);
        }
    }

    public static IQueryable<Patient> ApplyRelationalBaseFilters(IQueryable<Patient> query, GetClinicPatientsQuery request)
    {
        query = query.WhereMatchesSearchTerm(request.SearchTerm);

        if (request.HasAlerts == true || string.Equals(request.FilterMode, "ALERTS", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(p =>
                p.HasActiveSafetyAlert ||
                p.Alerts.Any(a => !a.IsDeleted && a.Status == PatientAlertStatus.Active) ||
                p.Allergies!.Any(a => !a.IsDeleted && a.Status == AllergyStatus.Active));
        }

        if (string.Equals(request.FilterMode, "SENIOR_PWD", StringComparison.OrdinalIgnoreCase))
        {
            var seniorCutoff = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-60));
            query = query.Where(p =>
                (!string.IsNullOrWhiteSpace(p.SeniorCitizenId) && p.SeniorCitizenId.Trim().Length > 0) ||
                (!string.IsNullOrWhiteSpace(p.PwdId) && p.PwdId.Trim().Length > 0) ||
                p.DateOfBirth <= seniorCutoff);
        }

        if (!string.IsNullOrWhiteSpace(request.VerificationStatus) && Enum.TryParse<PatientVerificationStatus>(request.VerificationStatus, true, out var filterVs))
        {
            query = query.Where(p => p.VerificationStatus == filterVs);
        }

        return query;
    }

    public static IQueryable<Patient> ApplyPostgresFilterMode(
        IQueryable<Patient> baseQuery,
        string? filterMode,
        Guid? effectiveStaffId,
        IReadOnlyList<Guid> relatedPatientIds)
    {
        if (string.Equals(filterMode, "STUDENTS", StringComparison.OrdinalIgnoreCase))
        {
            return baseQuery.Where(p =>
                EF.Functions.JsonContains(p.CustomFields, "{\"classification\":\"Student\"}") ||
                EF.Functions.JsonContains(p.CustomFields, "{\"classification\":\"student\"}") ||
                EF.Functions.JsonContains(p.CustomFields, "{\"classification\":\"STUDENT\"}") ||
                EF.Functions.JsonContains(p.CustomFields, "{\"category\":\"Student\"}") ||
                EF.Functions.JsonContains(p.CustomFields, "{\"category\":\"student\"}") ||
                EF.Functions.JsonContains(p.CustomFields, "{\"category\":\"STUDENT\"}") ||
                (EF.Functions.JsonExists(p.CustomFields, "student_id") &&
                 !EF.Functions.JsonContains(p.CustomFields, "{\"student_id\":\"\"}") &&
                 !EF.Functions.JsonContains(p.CustomFields, "{\"student_id\":null}")));
        }

        if (string.Equals(filterMode, "EMPLOYEES", StringComparison.OrdinalIgnoreCase))
        {
            return baseQuery.Where(p =>
                EF.Functions.JsonContains(p.CustomFields, "{\"classification\":\"Employee\"}") ||
                EF.Functions.JsonContains(p.CustomFields, "{\"classification\":\"employee\"}") ||
                EF.Functions.JsonContains(p.CustomFields, "{\"classification\":\"EMPLOYEE\"}") ||
                EF.Functions.JsonContains(p.CustomFields, "{\"category\":\"Employee\"}") ||
                EF.Functions.JsonContains(p.CustomFields, "{\"category\":\"employee\"}") ||
                EF.Functions.JsonContains(p.CustomFields, "{\"category\":\"EMPLOYEE\"}") ||
                (EF.Functions.JsonExists(p.CustomFields, "employee_id") &&
                 !EF.Functions.JsonContains(p.CustomFields, "{\"employee_id\":\"\"}") &&
                 !EF.Functions.JsonContains(p.CustomFields, "{\"employee_id\":null}")));
        }

        if (string.Equals(filterMode, "MY_PATIENTS", StringComparison.OrdinalIgnoreCase))
        {
            if (!effectiveStaffId.HasValue)
            {
                return baseQuery.Where(_ => false);
            }

            var staffId = effectiveStaffId.Value;
            var staffIdStr = staffId.ToString();
            var assignedDoctorJson = $"{{\"assigned_doctor_id\":\"{staffIdStr}\"}}";
            var doctorJson = $"{{\"doctor_id\":\"{staffIdStr}\"}}";
            var nurseJson = $"{{\"nurse_id\":\"{staffIdStr}\"}}";
            var assignedNurseJson = $"{{\"assigned_nurse_id\":\"{staffIdStr}\"}}";

            return baseQuery.Where(p =>
                (relatedPatientIds.Count > 0 && relatedPatientIds.Contains(p.Id)) ||
                p.Vitals.Any(v => !v.IsDeleted && v.NurseId == staffId) ||
                EF.Functions.JsonContains(p.CustomFields, assignedDoctorJson) ||
                EF.Functions.JsonContains(p.CustomFields, doctorJson) ||
                EF.Functions.JsonContains(p.CustomFields, nurseJson) ||
                EF.Functions.JsonContains(p.CustomFields, assignedNurseJson));
        }

        return baseQuery;
    }

    public static bool IsStudentCustomFields(IReadOnlyDictionary<string, object?>? cf)
    {
        if (cf == null || cf.Count == 0) return false;
        if (cf.TryGetValue("classification", out var c) && string.Equals(c?.ToString()?.Trim(), "Student", StringComparison.OrdinalIgnoreCase))
            return true;
        if (cf.TryGetValue("category", out var cat) && string.Equals(cat?.ToString()?.Trim(), "Student", StringComparison.OrdinalIgnoreCase))
            return true;
        if (cf.TryGetValue("student_id", out var sid) && HasNonWhitespaceCustomFieldValue(sid))
            return true;
        return false;
    }

    public static bool IsEmployeeCustomFields(IReadOnlyDictionary<string, object?>? cf)
    {
        if (cf == null || cf.Count == 0) return false;
        if (cf.TryGetValue("classification", out var c) && string.Equals(c?.ToString()?.Trim(), "Employee", StringComparison.OrdinalIgnoreCase))
            return true;
        if (cf.TryGetValue("category", out var cat) && string.Equals(cat?.ToString()?.Trim(), "Employee", StringComparison.OrdinalIgnoreCase))
            return true;
        if (cf.TryGetValue("employee_id", out var eid) && HasNonWhitespaceCustomFieldValue(eid))
            return true;
        return false;
    }

    public static bool IsStaffAssignedCustomFields(IReadOnlyDictionary<string, object?>? cf, string staffIdStr)
    {
        if (cf == null || cf.Count == 0 || string.IsNullOrWhiteSpace(staffIdStr)) return false;
        if (cf.TryGetValue("assigned_doctor_id", out var ad) && string.Equals(ad?.ToString(), staffIdStr, StringComparison.OrdinalIgnoreCase))
            return true;
        if (cf.TryGetValue("doctor_id", out var d) && string.Equals(d?.ToString(), staffIdStr, StringComparison.OrdinalIgnoreCase))
            return true;
        if (cf.TryGetValue("nurse_id", out var n) && string.Equals(n?.ToString(), staffIdStr, StringComparison.OrdinalIgnoreCase))
            return true;
        if (cf.TryGetValue("assigned_nurse_id", out var an) && string.Equals(an?.ToString(), staffIdStr, StringComparison.OrdinalIgnoreCase))
            return true;
        return cf.Values.Any(v => HasNonWhitespaceCustomFieldValue(v) && v!.ToString()!.Contains(staffIdStr, StringComparison.OrdinalIgnoreCase));
    }

    private static bool HasNonWhitespaceCustomFieldValue(object? raw)
    {
        if (raw == null) return false;
        if (raw is JsonElement je && (je.ValueKind == JsonValueKind.Null || je.ValueKind == JsonValueKind.Undefined))
            return false;
        return !string.IsNullOrWhiteSpace(raw.ToString());
    }

    public static IQueryable<Patient> ApplyOrderingAndPagination(IQueryable<Patient> query, GetClinicPatientsQuery request)
    {
        var pageSize = Math.Max(1, request.PageSize);
        var cursorLastName = request.EffectiveCursorLastName;
        var cursorFirstName = request.EffectiveCursorFirstName;
        var cursorId = request.EffectiveCursorId;
        var isCursorPaging = !string.IsNullOrEmpty(cursorLastName) || cursorId.HasValue;

        if (isCursorPaging)
        {
            if (!string.IsNullOrEmpty(cursorLastName) && cursorId.HasValue)
            {
                var cLastName = cursorLastName;
                var cFirstName = cursorFirstName ?? string.Empty;
                var cId = cursorId.Value;

                query = query.Where(p =>
                    string.Compare(p.LastName, cLastName) > 0 ||
                    (p.LastName == cLastName && string.Compare(p.FirstName, cFirstName) > 0) ||
                    (p.LastName == cLastName && p.FirstName == cFirstName && p.Id.CompareTo(cId) > 0));
            }
            else if (!string.IsNullOrEmpty(cursorLastName))
            {
                var cLastName = cursorLastName;
                var cFirstName = cursorFirstName ?? string.Empty;
                query = query.Where(p =>
                    string.Compare(p.LastName, cLastName) > 0 ||
                    (p.LastName == cLastName && string.Compare(p.FirstName, cFirstName) > 0));
            }
            else if (cursorId.HasValue)
            {
                var cId = cursorId.Value;
                query = query.Where(p => p.Id.CompareTo(cId) > 0);
            }

            return query
                .OrderBy(p => p.LastName)
                .ThenBy(p => p.FirstName)
                .ThenBy(p => p.Id)
                .Take(pageSize);
        }

        var pageNumber = Math.Max(1, request.PageNumber);
        return query
            .OrderBy(p => p.LastName)
            .ThenBy(p => p.FirstName)
            .ThenBy(p => p.Id)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize);
    }

    private static async Task<IReadOnlyList<ClinicPatientDto>> ExecuteProjectedQuery(
        IQueryable<Patient> query,
        GetClinicPatientsQuery request,
        IRepository<QueueItem>? queueRepo,
        IRepository<ConsultationEncounter>? encounterRepo,
        IRepository<Invoice>? invoiceRepo,
        CancellationToken ct)
    {
        query = ApplyOrderingAndPagination(query, request);

        var projected = await query
            .Select(p => new
            {
                p.Id,
                p.TenantId,
                p.ClinicId,
                p.PatientCode,
                p.FirstName,
                p.LastName,
                p.MiddleName,
                p.Suffix,
                p.DateOfBirth,
                p.Sex,
                p.GenderIdentity,
                p.CivilStatus,
                p.ContactNumber,
                p.Email,
                p.PhilHealthNumber,
                p.SeniorCitizenId,
                p.PwdId,
                p.BloodType,
                p.CreatedAt,
                p.CustomFields,
                p.VerificationStatus,
                p.ClinicEzId,
                p.LandlineNumber,
                p.MaidenLastName,
                p.PreferredName,
                p.Nationality,
                p.Religion,
                p.IsDeceased,
                p.DeceasedAt,
                p.HasActiveSafetyAlert,
                p.CloudPatientId,
                Addresses = p.Addresses
                    .Where(a => !a.IsDeleted)
                    .Select(a => new PatientAddressDto(
                        a.AddressType.ToString(),
                        a.IsSameAsPermanent,
                        a.RegionPsgc,
                        a.ProvincePsgc,
                        a.CityMunicipalityPsgc,
                        a.BarangayPsgc,
                        a.RegionName,
                        a.ProvinceName,
                        a.CityMunicipalityName,
                        a.BarangayName,
                        a.StreetAddress,
                        a.ZipCode,
                        a.Id))
                    .ToList(),
                Guardians = p.Guardians
                    .Where(g => !g.IsDeleted)
                    .Select(g => new PatientGuardianDto(
                        g.FirstName,
                        g.LastName,
                        g.RelationshipCode,
                        g.ContactNumber,
                        g.MiddleName,
                        g.Suffix,
                        g.BirthDate,
                        g.Sex != null ? g.Sex.Value.ToString() : null,
                        g.RelationshipOtherSpecify,
                        g.PhilHealthPin,
                        g.IsPrimaryGuardian,
                        g.IsEmergencyContact,
                        g.Id))
                    .ToList()
            })
            .ToListAsync(ct);

        Dictionary<Guid, List<PatientActiveQueueTicketDto>>? activeTicketGroupMap = null;
        var tz = ClinicTimeZoneResolver.ResolveTimeZone("Asia/Manila");
        var localToday = request.QueueDate ?? DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));

        if (queueRepo != null && projected.Count > 0)
        {
            var pIds = projected.Select(p => p.Id).ToList();
            var rawActiveTickets = await queueRepo.Query()
                .AsNoTracking()
                .Where(q => pIds.Contains(q.PatientId) &&
                            q.QueueDate == localToday &&
                            q.VisitType != VisitType.RetailPurchase &&
                            q.VisitType != VisitType.CashierSettlement &&
                            q.VisitType != VisitType.LaboratorySpecimen &&
                            q.Status != QueueStatus.Completed &&
                            q.Status != QueueStatus.Cancelled &&
                            q.Status != QueueStatus.NoShow &&
                            q.Status != QueueStatus.DischargedNonDoctor &&
                            q.Status != QueueStatus.Diverted)
                .OrderBy(q => q.CheckInTime)
                .Select(q => new
                {
                    q.PatientId,
                    q.QueueNumber,
                    q.Id,
                    q.DoctorId,
                    q.DoctorName,
                    q.Status,
                    q.VisitType,
                    q.ChiefComplaint,
                    q.CheckInTime,
                    q.IsDirectVisit
                })
                .ToListAsync(ct);

            if (rawActiveTickets.Count > 0)
            {
                var candidateIds = rawActiveTickets.Select(t => t.Id).ToList();
                var signedQueueIds = encounterRepo != null
                    ? (await encounterRepo.Query()
                        .AsNoTracking()
                        .Where(e => e.QueueItemId.HasValue && candidateIds.Contains(e.QueueItemId.Value) && e.IsSigned)
                        .Select(e => e.QueueItemId!.Value)
                        .ToListAsync(ct))
                        .ToHashSet()
                    : new HashSet<Guid>();

                var paidQueueIds = invoiceRepo != null
                    ? (await invoiceRepo.Query()
                        .AsNoTracking()
                        .Where(i => i.QueueItemId.HasValue && candidateIds.Contains(i.QueueItemId.Value) && i.Status == InvoiceStatus.Paid && !i.IsDeleted)
                        .Select(i => i.QueueItemId!.Value)
                        .ToListAsync(ct))
                        .ToHashSet()
                    : new HashSet<Guid>();

                var eligibleTickets = rawActiveTickets
                    .Where(t => !signedQueueIds.Contains(t.Id) && !paidQueueIds.Contains(t.Id))
                    .ToList();

                activeTicketGroupMap = eligibleTickets
                    .GroupBy(t => t.PatientId)
                    .ToDictionary(
                        g => g.Key,
                        g => g.Select(t => new PatientActiveQueueTicketDto(
                            t.Id,
                            t.QueueNumber,
                            t.Status.ToString(),
                            t.VisitType.ToString(),
                            t.ChiefComplaint,
                            t.DoctorId,
                            t.DoctorName,
                            t.CheckInTime,
                            t.IsDirectVisit
                        )).ToList());
            }
        }

        var today = localToday;
        return projected.Select(p =>
        {
            var age = today.Year - p.DateOfBirth.Year;
            if (p.DateOfBirth > today.AddYears(-age)) age--;

            var middleInitial = !string.IsNullOrWhiteSpace(p.MiddleName) ? $" {p.MiddleName[0]}." : "";
            var suffix = !string.IsNullOrWhiteSpace(p.Suffix) ? $" {p.Suffix}" : "";
            var fullName = $"{p.LastName}, {p.FirstName}{middleInitial}{suffix}";

            var hasActiveTicket = activeTicketGroupMap != null && activeTicketGroupMap.ContainsKey(p.Id);
            var activeTicketsList = hasActiveTicket ? activeTicketGroupMap![p.Id] : null;
            var primaryTicket = activeTicketsList?.FirstOrDefault();
            var customFields = p.CustomFields != null
                ? new Dictionary<string, object?>(p.CustomFields)
                : new Dictionary<string, object?>();

            if (hasActiveTicket && primaryTicket != null && primaryTicket.DoctorId.HasValue)
            {
                customFields["activeQueueDoctorId"] = primaryTicket.DoctorId.Value.ToString();
                customFields["doctorId"] = primaryTicket.DoctorId.Value.ToString();
            }

            return new ClinicPatientDto(
                p.Id,
                p.TenantId,
                p.ClinicId,
                p.PatientCode,
                p.FirstName,
                p.LastName,
                p.MiddleName,
                p.Suffix,
                fullName,
                p.DateOfBirth,
                age,
                p.Sex.ToString(),
                p.CivilStatus?.ToString(),
                p.ContactNumber,
                p.Email,
                p.PhilHealthNumber,
                p.SeniorCitizenId,
                p.PwdId,
                p.BloodType?.ToString(),
                p.CreatedAt,
                customFields.Count > 0 ? customFields : null,
                p.VerificationStatus.ToString(),
                ActiveQueueTicket: hasActiveTicket ? primaryTicket?.QueueNumber : null,
                ActiveQueueItemId: hasActiveTicket ? primaryTicket?.Id : null,
                PastMedicalHistories: null,
                ClinicEzId: p.ClinicEzId,
                LandlineNumber: p.LandlineNumber,
                MaidenLastName: p.MaidenLastName,
                PreferredName: p.PreferredName,
                Nationality: p.Nationality,
                Religion: p.Religion,
                IsDeceased: p.IsDeceased,
                DeceasedAt: p.DeceasedAt,
                PhilHealthMembership: null,
                YakapEnlistments: null,
                AlertsList: null,
                MedicalHistories: null,
                Allergies: null,
                ChronicConditions: null,
                Alerts: p.HasActiveSafetyAlert ? "Active Safety Alert" : null,
                SyncPatientId: p.CloudPatientId,
                GenderIdentity: p.GenderIdentity,
                Addresses: p.Addresses.Count > 0 ? p.Addresses : null,
                Guardians: p.Guardians.Count > 0 ? p.Guardians : null,
                ActiveQueueTickets: activeTicketsList);
        }).ToList().AsReadOnly();
    }
}

