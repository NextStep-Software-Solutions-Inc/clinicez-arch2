using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Comms.Application.Common.Helpers;

/// <summary>
/// Shared display formatting and patient-name resolution helpers for patient-to-facility inquiries.
/// </summary>
public static class CommsInquiryDisplayHelper
{
    public static string FormatCategoryLabel(MessageCategory category) => category switch
    {
        MessageCategory.PostVisitFollowUp => "Post-Visit Follow-Up",
        MessageCategory.PrescriptionRefill => "Prescription Refill",
        MessageCategory.LabResultQuestion => "Lab Result Question",
        MessageCategory.Billing => "Billing",
        MessageCategory.Scheduling => "Scheduling",
        MessageCategory.OrderStatus => "Order Status",
        MessageCategory.MedicineQuestion => "Medicine Question",
        MessageCategory.CollectionAndAppointment => "Collection & Appointment",
        MessageCategory.ReportCopy => "Report Copy",
        MessageCategory.Other => "General",
        _ => category.ToString()
    };

    public static string ResolvePatientDisplayName(string? patientDisplayName) =>
        !string.IsNullOrWhiteSpace(patientDisplayName)
            ? patientDisplayName.Trim()
            : "Patient";

    public static string ResolveInitialConversationTitle(string? patientDisplayName, MessageCategory category) =>
        !string.IsNullOrWhiteSpace(patientDisplayName)
            ? patientDisplayName.Trim()
            : $"{FormatCategoryLabel(category)} Inquiry";

    public static bool IsLegacyRawCategoryInquiryTitle(string? title)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            return false;
        }

        const string suffix = " Inquiry";
        var trimmed = title.Trim();
        if (!trimmed.EndsWith(suffix, StringComparison.OrdinalIgnoreCase) || trimmed.Length <= suffix.Length)
        {
            return false;
        }

        var prefix = trimmed[..^suffix.Length].Trim();
        return Enum.TryParse<MessageCategory>(prefix, ignoreCase: true, out _);
    }

    public static string? ResolvePatientParticipantName(IEnumerable<Participant>? participants)
    {
        if (participants == null)
        {
            return null;
        }

        var patient = participants.FirstOrDefault(p =>
            p.LeftAtUtc == null &&
            (string.Equals(p.ParticipantType, "Patient", StringComparison.OrdinalIgnoreCase) ||
             string.Equals(p.Role, "Patient", StringComparison.OrdinalIgnoreCase)) &&
            !string.IsNullOrWhiteSpace(p.DisplayName) &&
            !string.Equals(p.DisplayName.Trim(), "Patient", StringComparison.OrdinalIgnoreCase));

        return patient?.DisplayName.Trim();
    }
}
