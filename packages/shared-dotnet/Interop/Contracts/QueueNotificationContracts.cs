using System;

namespace ClinicEz.Shared.Interop.Contracts;

public static class QueueAlertKinds
{
    public const string Called = "called_to_room";
    public const string ApproachingTurn = "approaching_turn";
    public const string CalledUpper = "Called";
    public const string ApproachingTurnPascal = "ApproachingTurn";

    public static bool IsCalled(string? kind) =>
        string.Equals(kind, Called, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(kind, CalledUpper, StringComparison.OrdinalIgnoreCase);

    public static bool IsApproachingTurn(string? kind) =>
        string.Equals(kind, ApproachingTurn, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(kind, ApproachingTurnPascal, StringComparison.OrdinalIgnoreCase);
}

public sealed record PatientQueueAlertPayload(
    Guid QueueTicketId,
    string TicketNumber,
    string AlertKind,
    string Message,
    string? DoctorName,
    string? RoomOrStation,
    int? AheadInLine,
    DateTime TimestampUtc
);
