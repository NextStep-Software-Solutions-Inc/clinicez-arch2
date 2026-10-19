using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Patient.Infrastructure.Persistence.Repositories;

public sealed class PatientDocumentRepository : IPatientDocumentRepository
{
    private readonly ApplicationDbContext _context;

    public PatientDocumentRepository(ApplicationDbContext context) => _context = context;

    public Task<LabRequestSlip?> GetLabSlipAsync(Guid patientId, Guid requisitionId, CancellationToken cancellationToken = default) =>
        _context.LabRequestSlips.FirstOrDefaultAsync(s => s.PatientId == patientId && s.RequisitionId == requisitionId, cancellationToken);

    public async Task AddLabSlipAsync(LabRequestSlip slip, CancellationToken cancellationToken = default) =>
        await _context.LabRequestSlips.AddAsync(slip, cancellationToken);

    public async Task<IReadOnlyList<LabRequestSlip>> GetLabSlipsAsync(Guid patientId, CancellationToken cancellationToken = default) =>
        await _context.LabRequestSlips.AsNoTracking()
            .Where(s => s.PatientId == patientId)
            .OrderByDescending(s => s.IssuedAt)
            .ToListAsync(cancellationToken);

    public Task<PrescriptionDocument?> GetPrescriptionAsync(Guid patientId, Guid prescriptionId, CancellationToken cancellationToken = default) =>
        _context.PrescriptionDocuments
            .Include(p => p.Lines)
            .FirstOrDefaultAsync(p => p.PatientId == patientId && p.PrescriptionId == prescriptionId, cancellationToken);

    public async Task AddPrescriptionAsync(PrescriptionDocument prescription, CancellationToken cancellationToken = default) =>
        await _context.PrescriptionDocuments.AddAsync(prescription, cancellationToken);

    public void RemovePrescriptionLines(IEnumerable<Prescription> lines) => _context.Prescriptions.RemoveRange(lines);

    public void AddPrescriptionLines(IEnumerable<Prescription> lines) => _context.Prescriptions.AddRange(lines);

    public async Task<IReadOnlyList<PrescriptionDocument>> GetPrescriptionsAsync(Guid patientId, CancellationToken cancellationToken = default) =>
        await _context.PrescriptionDocuments.AsNoTracking()
            .Include(p => p.Lines)
            .Where(p => p.PatientId == patientId)
            .OrderByDescending(p => p.IssuedAt)
            .ToListAsync(cancellationToken);

    public Task<LabResultReport?> GetLabReportAsync(Guid patientId, Guid reportId, CancellationToken cancellationToken = default) =>
        _context.LabResultReports
            .Include(r => r.Observations)
            .FirstOrDefaultAsync(r => r.PatientId == patientId && r.ReportId == reportId, cancellationToken);

    public Task<LabResultReport?> GetLabReportForRequisitionAsync(Guid patientId, Guid requisitionId, CancellationToken cancellationToken = default) =>
        _context.LabResultReports
            .Include(r => r.Observations)
            .Where(r => r.PatientId == patientId && r.RequisitionId == requisitionId)
            .OrderByDescending(r => r.ResultedAt)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task AddLabReportAsync(LabResultReport report, CancellationToken cancellationToken = default) =>
        await _context.LabResultReports.AddAsync(report, cancellationToken);

    public void RemoveLabObservations(IEnumerable<LabResult> observations) => _context.LabResults.RemoveRange(observations);

    public void AddLabObservations(IEnumerable<LabResult> observations) => _context.LabResults.AddRange(observations);

    public async Task<IReadOnlyList<LabResultReport>> GetLabReportsAsync(Guid patientId, CancellationToken cancellationToken = default) =>
        await _context.LabResultReports.AsNoTracking()
            .Include(r => r.Observations)
            .Where(r => r.PatientId == patientId)
            .OrderByDescending(r => r.ResultedAt)
            .ToListAsync(cancellationToken);

    public Task<MedicalCertificate?> GetCertificateAsync(Guid patientId, Guid certificateId, CancellationToken cancellationToken = default) =>
        _context.MedicalCertificates.FirstOrDefaultAsync(c => c.PatientId == patientId && c.CertificateId == certificateId, cancellationToken);

    public async Task AddCertificateAsync(MedicalCertificate certificate, CancellationToken cancellationToken = default) =>
        await _context.MedicalCertificates.AddAsync(certificate, cancellationToken);

    public async Task<IReadOnlyList<MedicalCertificate>> GetCertificatesAsync(Guid patientId, CancellationToken cancellationToken = default) =>
        await _context.MedicalCertificates.AsNoTracking()
            .Where(c => c.PatientId == patientId)
            .OrderByDescending(c => c.IssuedAt)
            .ToListAsync(cancellationToken);

    public async Task<PatientChangeSet> GetChangesAsync(Guid patientId, DateTime? since, int take, CancellationToken cancellationToken = default)
    {
        var floor = since ?? DateTime.MinValue;

        var slips = _context.LabRequestSlips.AsNoTracking().Where(s => s.PatientId == patientId);
        var prescriptions = _context.PrescriptionDocuments.AsNoTracking().Where(p => p.PatientId == patientId);
        var reports = _context.LabResultReports.AsNoTracking().Where(r => r.PatientId == patientId);
        var certificates = _context.MedicalCertificates.AsNoTracking().Where(c => c.PatientId == patientId);
        var grants = _context.PatientAccessGrants.AsNoTracking().Where(g => g.PatientId == patientId);
        var notifications = _context.Notifications.AsNoTracking().Where(n => n.PatientId == patientId);

        // A kind with more than a page of changes caps the whole response at the last row it returns, so the next
        // call resumes right after it and no kind is starved. Rows that share the boundary instant are all included.
        var boundaries = new[]
        {
            await BoundaryAsync(slips, floor, take, cancellationToken),
            await BoundaryAsync(prescriptions, floor, take, cancellationToken),
            await BoundaryAsync(reports, floor, take, cancellationToken),
            await BoundaryAsync(certificates, floor, take, cancellationToken),
            await BoundaryAsync(grants, floor, take, cancellationToken),
            await BoundaryAsync(notifications, floor, take, cancellationToken)
        };
        DateTime? ceiling = boundaries.Where(b => b is not null).Min();

        var slipRows = await ChangedAsync(slips, floor, ceiling, cancellationToken);
        var prescriptionRows = await ChangedAsync(prescriptions.Include(p => p.Lines), floor, ceiling, cancellationToken);
        var reportRows = await ChangedAsync(reports.Include(r => r.Observations), floor, ceiling, cancellationToken);
        var certificateRows = await ChangedAsync(certificates, floor, ceiling, cancellationToken);
        var grantRows = await ChangedAsync(grants, floor, ceiling, cancellationToken);
        var notificationRows = await ChangedAsync(notifications, floor, ceiling, cancellationToken);

        var cursor = ceiling ?? new[]
            {
                floor,
                slipRows.MaxOrDefault(), prescriptionRows.MaxOrDefault(), reportRows.MaxOrDefault(),
                certificateRows.MaxOrDefault(), grantRows.MaxOrDefault(), notificationRows.MaxOrDefault()
            }.Max();

        return new PatientChangeSet(
            slipRows, prescriptionRows, reportRows, certificateRows, grantRows, notificationRows,
            cursor, HasMore: ceiling is not null);
    }

    private static async Task<DateTime?> BoundaryAsync<T>(IQueryable<T> query, DateTime floor, int take, CancellationToken ct)
        where T : BaseEntity
    {
        var times = await query
            .Where(e => (e.UpdatedAt ?? e.CreatedAt) > floor)
            .OrderBy(e => e.UpdatedAt ?? e.CreatedAt)
            .Select(e => e.UpdatedAt ?? e.CreatedAt)
            .Skip(take - 1)
            .Take(2)
            .ToListAsync(ct);

        return times.Count == 2 ? times[0] : null;
    }

    private static async Task<List<T>> ChangedAsync<T>(IQueryable<T> query, DateTime floor, DateTime? ceiling, CancellationToken ct)
        where T : BaseEntity
    {
        var filtered = query.Where(e => (e.UpdatedAt ?? e.CreatedAt) > floor);
        if (ceiling is { } upper)
            filtered = filtered.Where(e => (e.UpdatedAt ?? e.CreatedAt) <= upper);

        return await filtered.OrderBy(e => e.UpdatedAt ?? e.CreatedAt).ToListAsync(ct);
    }
}

internal static class ChangeSetExtensions
{
    public static DateTime MaxOrDefault<T>(this List<T> rows) where T : BaseEntity =>
        rows.Count == 0 ? DateTime.MinValue : rows.Max(e => e.UpdatedAt ?? e.CreatedAt);
}
