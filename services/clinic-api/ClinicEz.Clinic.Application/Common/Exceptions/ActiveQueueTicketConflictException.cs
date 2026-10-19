using System;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Exceptions;

namespace ClinicEz.Clinic.Application.Common.Exceptions;

/// <summary>
/// Thrown when a patient attempts to check into the OPD queue while already holding an active queue ticket today.
/// </summary>
public sealed class ActiveQueueTicketConflictException : ConflictException
{
    public const string ErrorCode = "active_queue_ticket_exists";

    public Guid TicketId { get; }
    public string QueueNumber { get; }
    public string Status { get; }
    public string PatientName { get; }

    public ActiveQueueTicketConflictException(Guid ticketId, string queueNumber, string status, string patientName)
        : base($"Patient {patientName} is already checked in as {queueNumber} ({status})")
    {
        TicketId = ticketId;
        QueueNumber = queueNumber;
        Status = status;
        PatientName = patientName;
    }

    public ActiveQueueTicketConflictException(Guid ticketId, string queueNumber, QueueStatus status, string patientName)
        : this(ticketId, queueNumber, status.ToString(), patientName)
    {
    }
}

public sealed record ActiveQueueTicketConflictData(
    Guid TicketId,
    string QueueNumber,
    string Status,
    string PatientName);
