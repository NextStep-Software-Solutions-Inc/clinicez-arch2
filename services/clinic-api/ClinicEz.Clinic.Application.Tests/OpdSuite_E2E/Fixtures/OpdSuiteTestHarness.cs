using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Application.Tests.OpdSuite_E2E.Fixtures;

using static OpdSuiteContracts;

/// <summary>
/// Domain execution engines, state machines, and mathematical algorithms for E2E testing of the 24 OPD features.
/// Reflects the exact domain logic, validation constraints, and multi-tenant policies specified in PROJECT.md and TEST_INFRA.md.
/// </summary>
public static class OpdSuiteTestHarness
{
    // =========================================================================
    // 1. EOD Reconciliation Engine (Features F1.1 - F1.6)
    // =========================================================================
    public static class EodReconciliation
    {
        private static readonly Regex Time24HRegex = new(@"^(?:[01]\d|2[0-3]):[0-5]\d$", RegexOptions.Compiled);

        public static bool ValidateTimeFormat(string? time)
        {
            if (string.IsNullOrWhiteSpace(time)) return false;
            return Time24HRegex.IsMatch(time.Trim());
        }

        public static (ReconcileEodResultDto Result, EodReconciliationAuditDto Audit) ExecuteReconcile(
            Guid clinicId,
            string tenantId,
            DateOnly targetDate,
            string triggerType,
            List<E2EQueueTicket> allTickets,
            string? operatorName = "System",
            Guid? staffId = null,
            string? notes = null)
        {
            var nowUtc = DateTime.UtcNow;

            // Multi-tenant and date isolation
            var clinicDayTickets = allTickets
                .Where(t => t.ClinicId == clinicId && t.TenantId == tenantId && t.QueueDate == targetDate)
                .ToList();

            var reconcilableTickets = clinicDayTickets
                .Where(t => t.Status is QueueStatus.Waiting or QueueStatus.Triaged or QueueStatus.OnHold)
                .ToList();

            var affectedTicketNumbers = new List<string>();

            foreach (var ticket in reconcilableTickets)
            {
                ticket.Status = QueueStatus.NoShow;
                ticket.CompletedTime = nowUtc;
                affectedTicketNumbers.Add(ticket.QueueNumber);
            }

            var result = new ReconcileEodResultDto(
                ProcessedCount: clinicDayTickets.Count,
                ReconciledCount: reconcilableTickets.Count,
                TriggerType: triggerType,
                ReconciledAt: nowUtc,
                AffectedTicketNumbers: affectedTicketNumbers);

            var audit = new EodReconciliationAuditDto(
                Id: Guid.NewGuid(),
                TenantId: tenantId,
                ClinicId: clinicId,
                ReconciliationDate: targetDate,
                ReconciledAt: nowUtc,
                TriggerType: triggerType,
                ReconciledBy: operatorName ?? "System",
                StaffId: staffId,
                TotalTicketsProcessed: reconcilableTickets.Count,
                AffectedTicketNumbersJson: JsonSerializer.Serialize(affectedTicketNumbers),
                Notes: notes);

            return (result, audit);
        }
    }

    // =========================================================================
    // 2. Public TV Display Board Engine (Features F2.1 - F2.8)
    // =========================================================================
    public static class PublicTvDisplay
    {
        public static string MaskPatientName(string? fullName)
        {
            if (string.IsNullOrWhiteSpace(fullName)) return string.Empty;

            var parts = fullName.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0) return string.Empty;
            if (parts.Length == 1) return parts[0].Length > 0 ? $"{parts[0][0]}." : string.Empty;

            var firstName = parts[0];
            var lastNameInitial = parts[^1][0];
            return $"{firstName} {lastNameInitial}.";
        }

        public static PublicQueueDisplayDto GenerateDisplay(
            Guid clinicId,
            DateOnly queueDate,
            IReadOnlyList<E2EQueueTicket> allTickets,
            bool maskPatientNames = true,
            int maxUpcoming = 20)
        {
            var clinicTickets = allTickets
                .Where(t => t.ClinicId == clinicId && t.QueueDate == queueDate)
                .ToList();

            // NOW SERVING: InConsultation or actively called today
            var serving = clinicTickets
                .Where(t => t.Status == QueueStatus.InConsultation)
                .OrderByDescending(t => t.CalledTime ?? t.CheckInTime)
                .Select(t => new ServingTicketDto(
                    TicketNumber: t.QueueNumber,
                    DoctorName: t.DoctorName ?? "Attending Physician",
                    RoomOrStation: t.RoomOrStation ?? "Exam Room",
                    CalledTime: t.CalledTime))
                .ToList();

            // UP NEXT: Waiting or Triaged, ordered by Priority then Sequence
            var upcoming = clinicTickets
                .Where(t => t.Status is QueueStatus.Waiting or QueueStatus.Triaged)
                .OrderByDescending(t => t.Priority)
                .ThenBy(t => t.SequenceNumber)
                .Take(maxUpcoming)
                .Select(t => new UpcomingTicketDto(
                    TicketNumber: t.QueueNumber,
                    DisplayName: maskPatientNames ? MaskPatientName(t.PatientName) : t.PatientName,
                    Priority: t.Priority.ToString()))
                .ToList();

            return new PublicQueueDisplayDto(serving, upcoming, DateTime.UtcNow);
        }
    }

    // =========================================================================
    // 3. Patient App Push Notification Engine (Features F3.1 - F3.6)
    // =========================================================================
    public static class PushNotifications
    {
        public static List<InteropAlertEnvelope> EvaluateAndDispatch(
            Guid clinicId,
            ClinicEodSettingsDto settings,
            List<E2EQueueTicket> queue)
        {
            var dispatched = new List<InteropAlertEnvelope>();
            if (!settings.EnableQueuePushNotifications) return dispatched;

            var activeTickets = queue
                .Where(t => t.ClinicId == clinicId && t.Status != QueueStatus.Cancelled && t.Status != QueueStatus.NoShow)
                .OrderByDescending(t => t.Priority)
                .ThenBy(t => t.SequenceNumber)
                .ToList();

            // 1. Evaluate "Called to Room" alerts
            foreach (var ticket in activeTickets.Where(t => t.Status == QueueStatus.InConsultation))
            {
                if (!ticket.CalledNotificationSent)
                {
                    ticket.CalledNotificationSent = true;
                    var payload = new PatientQueueAlertPayload(
                        QueueTicketId: ticket.Id,
                        TicketNumber: ticket.QueueNumber,
                        AlertKind: "called_to_room",
                        Message: $"Ticket {ticket.QueueNumber} has been called to {ticket.RoomOrStation ?? "the clinic"}.",
                        DoctorName: ticket.DoctorName,
                        RoomOrStation: ticket.RoomOrStation,
                        AheadInLine: 0,
                        TimestampUtc: DateTime.UtcNow);

                    dispatched.Add(new InteropAlertEnvelope(
                        MessageId: Guid.NewGuid(),
                        MessageType: "patient.queue.alert",
                        SenderParty: $"facility:{clinicId}",
                        RecipientParty: $"patient:{ticket.PatientId}",
                        Payload: payload,
                        SentAtUtc: DateTime.UtcNow));
                }
            }

            // 2. Evaluate "Approaching Turn" alerts
            var waitingLine = activeTickets
                .Where(t => t.Status is QueueStatus.Waiting or QueueStatus.Triaged)
                .ToList();

            for (int i = 0; i < waitingLine.Count; i++)
            {
                var ticket = waitingLine[i];
                int aheadInLine = i; // 0 means next up, 1 means 1 person ahead, etc.

                if (aheadInLine <= settings.QueuePushNotificationThreshold && !ticket.ApproachingNotificationSent)
                {
                    ticket.ApproachingNotificationSent = true;
                    var payload = new PatientQueueAlertPayload(
                        QueueTicketId: ticket.Id,
                        TicketNumber: ticket.QueueNumber,
                        AlertKind: "approaching_turn",
                        Message: aheadInLine == 0
                            ? $"You are next in line! Please proceed near the examination rooms."
                            : $"You are {aheadInLine} patient{(aheadInLine > 1 ? "s" : "")} away in line. Please be ready.",
                        DoctorName: ticket.DoctorName,
                        RoomOrStation: ticket.RoomOrStation,
                        AheadInLine: aheadInLine,
                        TimestampUtc: DateTime.UtcNow);

                    dispatched.Add(new InteropAlertEnvelope(
                        MessageId: Guid.NewGuid(),
                        MessageType: "patient.queue.alert",
                        SenderParty: $"facility:{clinicId}",
                        RecipientParty: $"patient:{ticket.PatientId}",
                        Payload: payload,
                        SentAtUtc: DateTime.UtcNow));
                }
            }

            return dispatched;
        }
    }

    // =========================================================================
    // 4. Fuzzy Duplicate Matching Engine (Features F4.1 - F4.4)
    // =========================================================================
    public static class FuzzyMatching
    {
        public static int LevenshteinDistance(string? s, string? t)
        {
            if (string.IsNullOrEmpty(s)) return string.IsNullOrEmpty(t) ? 0 : t.Length;
            if (string.IsNullOrEmpty(t)) return s.Length;

            int n = s.Length;
            int m = t.Length;
            int[,] d = new int[n + 1, m + 1];

            for (int i = 0; i <= n; d[i, 0] = i++) { }
            for (int j = 0; j <= m; d[0, j] = j++) { }

            for (int i = 1; i <= n; i++)
            {
                for (int j = 1; j <= m; j++)
                {
                    int cost = (char.ToLowerInvariant(t[j - 1]) == char.ToLowerInvariant(s[i - 1])) ? 0 : 1;
                    d[i, j] = Math.Min(
                        Math.Min(d[i - 1, j] + 1, d[i, j - 1] + 1),
                        d[i - 1, j - 1] + cost);
                }
            }

            return d[n, m];
        }

        public static string Soundex(string? data)
        {
            if (string.IsNullOrWhiteSpace(data)) return string.Empty;
            string clean = new(data.Where(char.IsLetter).ToArray());
            if (string.IsNullOrEmpty(clean)) return string.Empty;

            StringBuilder result = new();
            result.Append(char.ToUpperInvariant(clean[0]));

            string previousCode = GetSoundexCode(clean[0]);

            for (int i = 1; i < clean.Length && result.Length < 4; i++)
            {
                string currentCode = GetSoundexCode(clean[i]);
                if (currentCode != "0" && currentCode != previousCode)
                {
                    result.Append(currentCode);
                }
                previousCode = currentCode;
            }

            while (result.Length < 4)
            {
                result.Append('0');
            }

            return result.ToString();
        }

        private static string GetSoundexCode(char c)
        {
            return char.ToUpperInvariant(c) switch
            {
                'B' or 'F' or 'P' or 'V' => "1",
                'C' or 'G' or 'J' or 'K' or 'Q' or 'S' or 'X' or 'Z' => "2",
                'D' or 'T' => "3",
                'L' => "4",
                'M' or 'N' => "5",
                'R' => "6",
                _ => "0"
            };
        }

        public static string NormalizePhone(string? phone)
        {
            if (string.IsNullOrWhiteSpace(phone)) return string.Empty;
            string digits = new(phone.Where(char.IsDigit).ToArray());
            if (digits.StartsWith("63") && digits.Length == 12)
            {
                digits = "0" + digits[2..];
            }
            if (digits.Length == 10 && digits.StartsWith("9"))
            {
                digits = "0" + digits;
            }
            return digits;
        }

        public static string NormalizePin(string? pin)
        {
            if (string.IsNullOrWhiteSpace(pin)) return string.Empty;
            return new string(pin.Where(char.IsDigit).ToArray());
        }

        public static (bool IsMatch, string Reason, double Score, string Confidence) EvaluateMatch(
            string? searchFirst,
            string? searchLast,
            DateOnly? searchDob,
            string? searchPhone,
            string? searchPin,
            string candidateFirst,
            string candidateLast,
            DateOnly candidateDob,
            string? candidatePhone,
            string? candidatePin)
        {
            // 1. Strict PhilHealth PIN match
            var normSearchPin = NormalizePin(searchPin);
            var normCandPin = NormalizePin(candidatePin);
            if (!string.IsNullOrEmpty(normSearchPin) && !string.IsNullOrEmpty(normCandPin) && normSearchPin == normCandPin)
            {
                return (true, "PhilHealth Identification Number (PIN) match", 1.0, "High");
            }

            // 2. Strict Phone number match
            var normSearchPhone = NormalizePhone(searchPhone);
            var normCandPhone = NormalizePhone(candidatePhone);
            if (!string.IsNullOrEmpty(normSearchPhone) && !string.IsNullOrEmpty(normCandPhone) && normSearchPhone == normCandPhone)
            {
                return (true, "Contact phone number match", 0.95, "High");
            }

            // 3. Name + DOB combination
            if (!string.IsNullOrWhiteSpace(searchFirst) && !string.IsNullOrWhiteSpace(searchLast) && searchDob.HasValue)
            {
                bool dobMatches = searchDob.Value == candidateDob;

                int firstDist = LevenshteinDistance(searchFirst.Trim(), candidateFirst.Trim());
                int lastDist = LevenshteinDistance(searchLast.Trim(), candidateLast.Trim());
                int totalDist = firstDist + lastDist;

                bool soundexFirst = Soundex(searchFirst) == Soundex(candidateFirst);
                bool soundexLast = Soundex(searchLast) == Soundex(candidateLast);

                if (dobMatches)
                {
                    if (totalDist == 0)
                    {
                        return (true, "Exact Name and Date of Birth match", 1.0, "High");
                    }
                    if (totalDist <= 2 || (soundexFirst && soundexLast))
                    {
                        double score = Math.Max(0.70, 1.0 - (totalDist * 0.1));
                        return (true, $"Fuzzy Name match (edit distance {totalDist}) with identical Date of Birth", score, "High");
                    }
                }
                else
                {
                    // Names match but different DOB
                    if (totalDist == 0)
                    {
                        return (true, "Identical Name but differing Date of Birth (possible family member / Jr / Sr)", 0.50, "Medium");
                    }
                }
            }

            return (false, "No similarity detected", 0.0, "Low");
        }
    }
}
