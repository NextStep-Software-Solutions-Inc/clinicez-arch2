using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Persistence.Repositories;

public sealed class BookingDraftRepository : BaseRepository<BookingDraft>, IBookingDraftRepository
{
    public BookingDraftRepository(ApplicationDbContext context) : base(context) { }

    public async Task<IReadOnlyList<BookingDraft>> GetByPatientAsync(Guid patientId, BookingDraftStatus? status, CancellationToken ct = default)
    {
        var q = DbSet.Where(d => d.PatientId == patientId);
        if (status.HasValue) q = q.Where(d => d.Status == status.Value);
        return await q.OrderByDescending(d => d.CreatedAt).ToListAsync(ct);
    }
}
