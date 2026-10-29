using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class QueueItem : ClinicScopedEntity
{
    /// <summary>
    /// Formatted daily ticket number e.g. "Q-001"
    /// </summary>
    public required string QueueNumber { get; set; }
    public int SequenceNumber { get; set; }
    public DateOnly QueueDate { get; set; }

    public Guid PatientId { get; set; }
    public Patient? Patient { get; set; }
    public required string PatientName { get; set; }

    public Guid? AppointmentId { get; set; }
    public Appointment? Appointment { get; set; }

    public Guid? DoctorId { get; set; }
    public string? DoctorName { get; set; }

    /// <summary>
    /// Optional foreign key to the assigned Room entity.
    /// </summary>
    public Guid? RoomId { get; set; }
    public Room? Room { get; set; }

    /// <summary>
    /// Exam room or nursing station assignment (e.g. "Exam Room 1 - Dr. Santos", "Triage Station A", "Procedure Bay")
    /// </summary>
    public string? RoomOrStation { get; set; }

    /// <summary>
    /// Stored as string in database: "Routine", "Urgent", "Emergency"
    /// </summary>
    public QueuePriority Priority { get; set; } = QueuePriority.Routine;

    /// <summary>
    /// Stored as string in database: "Waiting", "Triaged", "InConsultation", "Completed", "Cancelled", "NoShow"
    /// </summary>
    public QueueStatus Status { get; set; } = QueueStatus.Waiting;
    public VisitWorkflowMode VisitWorkflowMode { get; set; } = VisitWorkflowMode.Regular;

    public DateTime CheckInTime { get; set; } = DateTime.UtcNow;
    public DateTime? CalledTime { get; set; }
    public DateTime? CompletedTime { get; set; }

    public string? ChiefComplaint { get; set; }

    /// <summary>
    /// Optional linkage to cloud Patient App ID if patient has synchronized.
    /// </summary>
    public Guid? CloudPatientId { get; set; }

    /// <summary>
    /// Indicates whether an approaching-turn alert notification has already been sent to the patient.
    /// </summary>
    public bool ApproachingNotificationSent { get; set; } = false;

    /// <summary>
    /// Indicates whether a called-to-room alert notification has already been sent to the patient.
    /// </summary>
    public bool CalledNotificationSent { get; set; } = false;

    /// <summary>
    /// Outpatient visit intent classification: Consultation, VitalsCheckOnly, RetailPurchase, StandaloneProcedure, LaboratorySpecimen, AdministrativeDocument, CashierSettlement
    /// </summary>
    public VisitType VisitType { get; set; } = VisitType.Consultation;

    /// <summary>
    /// Optional clinical or administrative remarks upon non-doctor discharge or cancellation
    /// </summary>
    public string? DischargeNotes { get; set; }

    /// <summary>
    /// Timestamp when patient was discharged by non-doctor staff
    /// </summary>
    public DateTime? DischargedAt { get; set; }

    /// <summary>
    /// Staff ID of nurse, receptionist, or cashier who discharged the visit
    /// </summary>
    public Guid? DischargedByStaffId { get; set; }

    /// <summary>
    /// Target destination hospital / ER facility for emergency diversion
    /// </summary>
    public string? DivertedToFacility { get; set; }

    /// <summary>
    /// Transport mode (e.g. Ambulance, Private Vehicle, Clinic Van)
    /// </summary>
    public string? TransportMode { get; set; }

    /// <summary>
    /// Accompanying paramedic, nurse escort, or driver name
    /// </summary>
    public string? ParamedicOrEscortName { get; set; }

    /// <summary>
    /// Clinical handover summary and acuity findings upon emergency diversion
    /// </summary>
    public string? HandoverSummary { get; set; }

    /// <summary>
    /// Timestamp when patient was transferred/diverted to emergency facility
    /// </summary>
    public DateTime? DivertedAt { get; set; }

    /// <summary>
    /// Staff ID of healthcare worker who authorized and executed diversion
    /// </summary>
    public Guid? DivertedByStaffId { get; set; }

    // Navigations
    public PatientVitals? PatientVitals { get; set; }
    public ConsultationEncounter? Consultation { get; set; }
}
