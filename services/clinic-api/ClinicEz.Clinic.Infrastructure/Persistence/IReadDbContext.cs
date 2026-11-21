using System.Linq;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Infrastructure.Persistence;

/// <summary>
/// Read-only database context interface for high-throughput query offloading.
/// </summary>
public interface IReadDbContext
{
    IQueryable<Patient> Patients { get; }
    IQueryable<Appointment> Appointments { get; }
    IQueryable<QueueItem> QueueItems { get; }
    IQueryable<ConsultationEncounter> Consultations { get; }
    IQueryable<LabOrder> LabOrders { get; }
    IQueryable<PrescriptionItem> PrescriptionItems { get; }
    IQueryable<PatientAddress> PatientAddresses { get; }
    IQueryable<PhilHealthDailySequence> PhilHealthDailySequences { get; }
}
