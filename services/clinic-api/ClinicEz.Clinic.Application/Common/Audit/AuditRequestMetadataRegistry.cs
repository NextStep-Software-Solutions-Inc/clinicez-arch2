namespace ClinicEz.Clinic.Application.Common.Audit;

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;
using System.Text.RegularExpressions;
using ClinicEz.Clinic.Domain.Entities;

public sealed record AuditRequestDescriptor
{
    public bool IsAuditable { get; init; }
    public string Action { get; init; } = string.Empty;
    public string Category { get; init; } = string.Empty;
    public string Severity { get; init; } = string.Empty;
    public string TargetEntityType { get; init; } = string.Empty;
    public Func<object, string?> TargetEntityIdGetter { get; init; } = _ => null;
    public Func<object, string?>? ResponseIdGetter { get; init; }
    public Func<object, Guid?> PatientIdGetter { get; init; } = _ => null;
    public Func<object, string?> PatientNameGetter { get; init; } = _ => null;
    public Func<object, string?> PatientPinGetter { get; init; } = _ => null;
    public Func<object, string?, string?, string> DescriptionFormatter { get; init; } = (_, id, _) => $"Executed operation on entity {id}";
}

/// <summary>
/// High-performance compiled property expression registry for fast, non-blocking MediatR audit interception.
/// Caches reflection property accessors as compiled delegates so property retrieval runs in O(1) time without runtime reflection overhead.
/// </summary>
public static class AuditRequestMetadataRegistry
{
    private static readonly ConcurrentDictionary<Type, AuditRequestDescriptor> Cache = new();

    public static AuditRequestDescriptor GetDescriptor<TRequest>() =>
        Cache.GetOrAdd(typeof(TRequest), BuildDescriptor);

    public static AuditRequestDescriptor GetDescriptor(Type requestType) =>
        Cache.GetOrAdd(requestType, BuildDescriptor);

    public static AuditRequestDescriptor BuildDescriptor(Type type)
    {
        var name = type.Name;

        // Skip non-command and non-audited requests
        if (!name.EndsWith("Command", StringComparison.OrdinalIgnoreCase) && !IsAuditableQuery(name))
        {
            return new AuditRequestDescriptor { IsAuditable = false };
        }

        var (category, action, severity, targetEntity, defaultDesc) = ResolveMetadata(name);

        return new AuditRequestDescriptor
        {
            IsAuditable = true,
            Action = action,
            Category = category,
            Severity = severity,
            TargetEntityType = targetEntity,
            TargetEntityIdGetter = CreatePropertyGetter(type, "Id", "InvoiceId", "PatientId", "AppointmentId", "ConsultationId", "QueueItemId", "StaffId", "RoleId", "RoomId", "NotificationId", "ResultId", "AllergyId", "TransmittalId", "LeaveId", "TemplateId", "PrescriptionItemId", "LabOrderId", "Token"),
            ResponseIdGetter = ExtractResponseId,
            PatientIdGetter = CreateGuidPropertyGetter(type, "PatientId"),
            PatientNameGetter = CreateStringPropertyGetter(type, "PatientName"),
            PatientPinGetter = CreateStringPropertyGetter(type, "PhilHealthPin", "PhilHealthNumber", "Pin"),
            DescriptionFormatter = (req, id, pName) =>
            {
                if (!string.IsNullOrWhiteSpace(id) && !string.IsNullOrWhiteSpace(pName))
                    return $"{defaultDesc} (Target ID: {id}, Patient: {pName})";
                if (!string.IsNullOrWhiteSpace(id))
                    return $"{defaultDesc} (Target ID: {id})";
                if (!string.IsNullOrWhiteSpace(pName))
                    return $"{defaultDesc} (Patient: {pName})";
                return defaultDesc;
            }
        };
    }

    private static bool IsAuditableQuery(string typeName) =>
        typeName is "GetPatientChartQuery" or "GetAuditLogsQuery" or "GetAuditLogDetailQuery" or "ExportAuditLogsQuery";

    private static (string Category, string Action, string Severity, string TargetEntity, string DefaultDesc) ResolveMetadata(string name)
    {
        // 1. Specific known Command mappings
        switch (name)
        {
            // Security
            case "CreateStaffMemberCommand":
                return (ClinicAuditCategories.Security, "security.staff.created", ClinicAuditSeverities.Urgent, "StaffMember", "Created new clinic staff member account");
            case "UpdateStaffMemberCommand":
                return (ClinicAuditCategories.Security, "security.staff.updated", ClinicAuditSeverities.Urgent, "StaffMember", "Updated staff profile, roles, or room assignments");
            case "ActivateStaffMemberCommand":
                return (ClinicAuditCategories.Security, "security.staff.activated", ClinicAuditSeverities.Urgent, "StaffMember", "Activated staff member login and access permissions");
            case "DeactivateStaffMemberCommand":
                return (ClinicAuditCategories.Security, "security.staff.deactivated", ClinicAuditSeverities.Emergency, "StaffMember", "Deactivated staff member and terminated active sessions");
            case "ResetStaffPasswordCommand":
                return (ClinicAuditCategories.Security, "security.staff_password.reset", ClinicAuditSeverities.Emergency, "StaffMember", "Administrator reset password for staff member");
            case "UpdateMyProfileCommand":
                return (ClinicAuditCategories.Security, "security.profile.updated", ClinicAuditSeverities.Routine, "StaffMember", "Staff member updated own profile credentials");
            case "CreateClinicRoleCommand":
                return (ClinicAuditCategories.Security, "security.role.created", ClinicAuditSeverities.Urgent, "Role", "Created custom clinical role with specific permissions");
            case "UpdateClinicRoleCommand":
                return (ClinicAuditCategories.Security, "security.role.updated", ClinicAuditSeverities.Urgent, "Role", "Modified permissions assigned to clinic role");
            case "DeleteClinicRoleCommand":
                return (ClinicAuditCategories.Security, "security.role.deleted", ClinicAuditSeverities.Urgent, "Role", "Deleted clinic role definition");

            // Operations & Admin
            case "UpdateClinicSettingsCommand":
                return (ClinicAuditCategories.Operations, "operations.settings.updated", ClinicAuditSeverities.Urgent, "FacilitySettings", "Updated clinic profile, facility details, or queue config");
            case "CreateClinicRoomCommand":
                return (ClinicAuditCategories.Operations, "operations.room.created", ClinicAuditSeverities.Routine, "Room", "Created new clinic consultation room or station");
            case "UpdateClinicRoomCommand":
                return (ClinicAuditCategories.Operations, "operations.room.updated", ClinicAuditSeverities.Routine, "Room", "Updated clinic room details and staff coverage");
            case "DeleteClinicRoomCommand":
                return (ClinicAuditCategories.Operations, "operations.room.deleted", ClinicAuditSeverities.Urgent, "Room", "Deleted clinic consultation room");
            case "ReorderClinicRoomsCommand":
                return (ClinicAuditCategories.Operations, "operations.rooms.reordered", ClinicAuditSeverities.Routine, "Room", "Reordered clinic room workstation sequence");
            case "UpsertDoctorScheduleTemplateCommand":
                return (ClinicAuditCategories.Operations, "operations.doctor_schedule.upserted", ClinicAuditSeverities.Routine, "DoctorScheduleTemplate", "Configured recurring doctor shift availability template");
            case "DeleteDoctorScheduleTemplateCommand":
                return (ClinicAuditCategories.Operations, "operations.doctor_schedule.deleted", ClinicAuditSeverities.Emergency, "DoctorScheduleTemplate", "Deleted doctor shift availability template");
            case "CreateDoctorLeaveCommand":
                return (ClinicAuditCategories.Operations, "operations.doctor_leave.created", ClinicAuditSeverities.Urgent, "DoctorLeave", "Recorded doctor blackout leave / schedule override");
            case "DeleteDoctorLeaveCommand":
                return (ClinicAuditCategories.Operations, "operations.doctor_leave.deleted", ClinicAuditSeverities.Urgent, "DoctorLeave", "Cancelled doctor blackout leave");
            case "CreateClinicServiceItemCommand":
                return (ClinicAuditCategories.Operations, "operations.service_item.created", ClinicAuditSeverities.Routine, "ServiceItem", "Created new item in clinic fee schedule catalog");
            case "UpdateClinicServiceItemCommand":
                return (ClinicAuditCategories.Operations, "operations.service_item.updated", ClinicAuditSeverities.Routine, "ServiceItem", "Updated item pricing or PhilHealth code in fee catalog");
            case "BulkImportServicesCommand":
                return (ClinicAuditCategories.Operations, "operations.services.bulk_imported", ClinicAuditSeverities.Urgent, "ServiceItem", "Bulk imported service catalog fee items");
            case "CreateProductCommand":
                return (ClinicAuditCategories.Operations, "operations.product.created", ClinicAuditSeverities.Routine, "Product", "Created new inventory product record");
            case "CreateCustomFieldDefinitionCommand":
                return (ClinicAuditCategories.Operations, "operations.custom_field.created", ClinicAuditSeverities.Routine, "CustomFieldDefinition", "Defined new custom demographic/clinical intake field");
            case "UpdateCustomFieldDefinitionCommand":
                return (ClinicAuditCategories.Operations, "operations.custom_field.updated", ClinicAuditSeverities.Routine, "CustomFieldDefinition", "Updated custom field definition, visibility, or options");
            case "DeleteCustomFieldDefinitionCommand":
                return (ClinicAuditCategories.Operations, "operations.custom_field.deleted", ClinicAuditSeverities.Urgent, "CustomFieldDefinition", "Deleted custom intake field definition");
            case "InstallCustomFieldTemplateCommand":
                return (ClinicAuditCategories.Operations, "operations.custom_field_template.installed", ClinicAuditSeverities.Routine, "CustomFieldDefinition", "Installed pre-configured custom fields template bundle");
            case "ReorderCustomFieldsCommand":
                return (ClinicAuditCategories.Operations, "operations.custom_fields.reordered", ClinicAuditSeverities.Routine, "CustomFieldDefinition", "Reordered custom field display sequence");
            case "MarkStaffNotificationReadCommand":
                return (ClinicAuditCategories.Operations, "operations.notification.read", ClinicAuditSeverities.Routine, "StaffNotification", "Marked staff broadcast notification as read");
            case "MarkAllStaffNotificationsReadCommand":
                return (ClinicAuditCategories.Operations, "operations.notifications.all_read", ClinicAuditSeverities.Routine, "StaffNotification", "Marked all staff broadcast notifications as read");
            case "ReconcileEodCommand":
                return (ClinicAuditCategories.Operations, "operations.eod.reconciled", ClinicAuditSeverities.Urgent, "EodReconciliationAudit", "Executed End-of-Day clinic reconciliation closure");

            // Patient
            case "RegisterClinicPatientCommand":
                return (ClinicAuditCategories.Patient, "patient.registration.created", ClinicAuditSeverities.Routine, "Patient", "Registered new patient in clinic master directory");
            case "UpdateClinicPatientCommand":
                return (ClinicAuditCategories.Patient, "patient.demographics.updated", ClinicAuditSeverities.Routine, "Patient", "Updated patient demographics and PhilHealth identifiers");
            case "BulkRegisterClinicPatientsCommand":
                return (ClinicAuditCategories.Patient, "patient.bulk_registration.completed", ClinicAuditSeverities.Routine, "Patient", "Bulk registered patient cohort into directory");
            case "PublicStudentSelfEnrollCommand":
                return (ClinicAuditCategories.Patient, "patient.self_enrollment.created", ClinicAuditSeverities.Routine, "Patient", "Public self-intake registration completed");
            case "RedeemPatientShareCommand":
                return (ClinicAuditCategories.Patient, "patient.share.redeemed", ClinicAuditSeverities.Routine, "Patient", "Redeemed cross-facility patient shared record grant");
            case "AddPatientSurgicalHistoryCommand":
                return (ClinicAuditCategories.Patient, "patient.surgical_history.added", ClinicAuditSeverities.Routine, "PatientSurgicalHistory", "Recorded surgical history entry for patient");
            case "UpdatePatientSurgicalHistoryCommand":
                return (ClinicAuditCategories.Patient, "patient.surgical_history.updated", ClinicAuditSeverities.Routine, "PatientSurgicalHistory", "Updated patient surgical history findings");
            case "DeletePatientSurgicalHistoryCommand":
                return (ClinicAuditCategories.Patient, "patient.surgical_history.deleted", ClinicAuditSeverities.Urgent, "PatientSurgicalHistory", "Removed surgical history record");
            case "SavePatientMedicalHistoriesCommand":
                return (ClinicAuditCategories.Patient, "patient.medical_history.saved", ClinicAuditSeverities.Routine, "PatientPastMedicalHistory", "Updated personal past medical conditions (lib_mdiseases)");
            case "SavePatientFamilyHistoriesCommand":
                return (ClinicAuditCategories.Patient, "patient.family_history.saved", ClinicAuditSeverities.Routine, "PatientFamilyHistory", "Updated family hereditary conditions (lib_mdiseases)");
            case "UpdatePatientSocialHistoryCommand":
                return (ClinicAuditCategories.Patient, "patient.social_history.updated", ClinicAuditSeverities.Routine, "PatientSocialHistory", "Updated lifestyle/social risk factors (smoking/alcohol)");
            case "UpdatePatientReproductiveHistoryCommand":
                return (ClinicAuditCategories.Patient, "patient.reproductive_history.updated", ClinicAuditSeverities.Routine, "PatientReproductiveHistory", "Updated OB-GYN and reproductive health profile");
            case "UpdatePatientPhysicalExamCommand":
                return (ClinicAuditCategories.Patient, "patient.physical_exam.updated", ClinicAuditSeverities.Routine, "PatientPhysicalExamProfile", "Updated baseline 9-system physical examination profile");
            case "SaveNcdRiskAssessmentCommand":
                return (ClinicAuditCategories.Patient, "patient.ncd_assessment.saved", ClinicAuditSeverities.Routine, "NcdRiskAssessment", "Completed PhilHealth PhilPEN 24-question NCD assessment");
            case "UpdateNcdRiskAssessmentCommand":
                return (ClinicAuditCategories.Patient, "patient.ncd_assessment.updated", ClinicAuditSeverities.Routine, "NcdRiskAssessment", "Updated cardiometabolic NCD risk assessment");
            case "VoidNcdRiskAssessmentCommand":
                return (ClinicAuditCategories.Patient, "patient.ncd_assessment.voided", ClinicAuditSeverities.Emergency, "NcdRiskAssessment", "Voided cardiometabolic NCD risk assessment");
            case "CreatePatientAllergyCommand":
                return (ClinicAuditCategories.Patient, "patient.allergy.created", ClinicAuditSeverities.Routine, "PatientAllergy", "Documented patient drug/food/environmental allergy");
            case "DeletePatientAllergyCommand":
                return (ClinicAuditCategories.Patient, "patient.allergy.deleted", ClinicAuditSeverities.Urgent, "PatientAllergy", "Removed documented patient allergy");
            case "CreatePatientProblemCommand":
                return (ClinicAuditCategories.Patient, "patient.problem.created", ClinicAuditSeverities.Routine, "PatientProblem", "Documented active problem diagnosis (ICD-10)");
            case "UpdatePatientProblemStatusCommand":
                return (ClinicAuditCategories.Patient, "patient.problem.status_updated", ClinicAuditSeverities.Routine, "PatientProblem", "Updated problem lifecycle status (Active/Resolved)");
            case "GetPatientChartQuery":
                return (ClinicAuditCategories.Patient, "patient.chart.viewed", ClinicAuditSeverities.Routine, "Patient", "Clinician viewed comprehensive patient medical chart");

            // Appointments & Queue
            case "CreateAppointmentCommand":
                return (ClinicAuditCategories.Appointments, "appointments.appointment.created", ClinicAuditSeverities.Routine, "Appointment", "Booked scheduled clinic appointment");
            case "RescheduleAppointmentCommand":
                return (ClinicAuditCategories.Appointments, "appointments.appointment.rescheduled", ClinicAuditSeverities.Routine, "Appointment", "Rescheduled existing clinic appointment slot");
            case "CancelAppointmentCommand":
                return (ClinicAuditCategories.Appointments, "appointments.appointment.cancelled", ClinicAuditSeverities.Urgent, "Appointment", "Cancelled booked clinic appointment");
            case "CheckInPatientCommand":
                return (ClinicAuditCategories.Queue, "queue.patient.checked_in", ClinicAuditSeverities.Routine, "QueueItem", "Checked in patient and generated queue ticket");
            case "CallQueueItemCommand":
                return (ClinicAuditCategories.Queue, "queue.patient.called", ClinicAuditSeverities.Routine, "QueueItem", "Called patient ticket to consultation room/station");
            case "PutQueueItemOnHoldCommand":
                return (ClinicAuditCategories.Queue, "queue.patient.held", ClinicAuditSeverities.Routine, "QueueItem", "Placed patient queue ticket on temporary hold");
            case "ReactivateQueueItemCommand":
                return (ClinicAuditCategories.Queue, "queue.patient.reactivated", ClinicAuditSeverities.Routine, "QueueItem", "Reactivated on-hold patient queue ticket");
            case "MarkQueueItemNoShowCommand":
                return (ClinicAuditCategories.Queue, "queue.patient.no_show", ClinicAuditSeverities.Urgent, "QueueItem", "Marked patient as no-show in clinic queue");
            case "CancelQueueTicketCommand":
                return (ClinicAuditCategories.Queue, "queue.ticket.cancelled", ClinicAuditSeverities.Urgent, "QueueItem", "Cancelled active patient queue ticket");
            case "CompleteQueueItemCommand":
                return (ClinicAuditCategories.Queue, "queue.ticket.completed", ClinicAuditSeverities.Routine, "QueueItem", "Discharged and completed patient queue visit");

            // Clinical
            case "RecordTriageVitalsCommand":
                return (ClinicAuditCategories.Clinical, "clinical.triage_vitals.recorded", ClinicAuditSeverities.Routine, "PatientVitals", "Nurse recorded triage vitals and WHO Z-scores");
            case "UpdateTriageVitalsCommand":
                return (ClinicAuditCategories.Clinical, "clinical.triage_vitals.updated", ClinicAuditSeverities.Routine, "PatientVitals", "Nurse updated triage vitals and WHO Z-scores");
            case "CreateConsultationCommand":
                return (ClinicAuditCategories.Clinical, "clinical.consultation.created", ClinicAuditSeverities.Routine, "ConsultationEncounter", "Initiated clinical consultation encounter");
            case "UpdateConsultationCommand":
                return (ClinicAuditCategories.Clinical, "clinical.consultation.updated", ClinicAuditSeverities.Routine, "ConsultationEncounter", "Updated draft clinical consultation documentation");
            case "SignConsultationCommand":
                return (ClinicAuditCategories.Clinical, "clinical.consultation.signed", ClinicAuditSeverities.Routine, "ConsultationEncounter", "Doctor signed and finalized consultation encounter");
            case "AdministerVaccineCommand":
                return (ClinicAuditCategories.Clinical, "clinical.immunization.administered", ClinicAuditSeverities.Routine, "PatientImmunization", "Administered vaccine dose (lot, batch, expiry)");
            case "RecordHistoricalImmunizationCommand":
                return (ClinicAuditCategories.Clinical, "clinical.immunization.historical_recorded", ClinicAuditSeverities.Routine, "PatientImmunization", "Recorded outside historical immunization entry");
            case "RecordImmunizationAefiCommand":
                return (ClinicAuditCategories.Clinical, "clinical.immunization.aefi_recorded", ClinicAuditSeverities.Urgent, "PatientImmunization", "Documented Adverse Event Following Immunization");
            case "OrderProcedureCommand":
                return (ClinicAuditCategories.Clinical, "clinical.procedure.ordered", ClinicAuditSeverities.Routine, "Procedure", "Doctor ordered in-clinic nursing procedure");
            case "RecordProcedureExecutionCommand":
                return (ClinicAuditCategories.Clinical, "clinical.procedure.executed", ClinicAuditSeverities.Routine, "Procedure", "Nurse recorded completed procedure execution and vitals");
            case "CreateClinicLabOrderCommand":
                return (ClinicAuditCategories.Clinical, "clinical.lab_order.created", ClinicAuditSeverities.Routine, "LabOrder", "Ordered clinical diagnostic laboratory tests");
            case "AttachExternalLabResultCommand":
                return (ClinicAuditCategories.Clinical, "clinical.lab_result.attached", ClinicAuditSeverities.Routine, "LabOrder", "Attached external laboratory diagnostic report");
            case "AcknowledgePanicAlertCommand":
                return (ClinicAuditCategories.Clinical, "clinical.panic_alert.acknowledged", ClinicAuditSeverities.Urgent, "LabOrder", "Acknowledged critical panic lab value alert");
            case "ReviewLabResultCommand":
                return (ClinicAuditCategories.Clinical, "clinical.lab_result.reviewed", ClinicAuditSeverities.Routine, "LabResult", "Physician reviewed diagnostic laboratory results");
            case "RecordExternalDispenseCommand":
                return (ClinicAuditCategories.Clinical, "clinical.prescription.external_dispensed", ClinicAuditSeverities.Routine, "PrescriptionItem", "Recorded external pharmacy dispensation");
            case "SubmitPublicRxDispenseCommand":
                return (ClinicAuditCategories.Clinical, "clinical.prescription.public_dispensed", ClinicAuditSeverities.Routine, "PrescriptionItem", "Public pharmacy verified and dispensed prescription");
            case "IssueMedicalCertificateCommand":
                return (ClinicAuditCategories.Clinical, "clinical.medical_certificate.issued", ClinicAuditSeverities.Routine, "MedicalCertificate", "Issued authenticated clinical medical certificate");
            case "IssueReferralLetterCommand":
                return (ClinicAuditCategories.Clinical, "clinical.referral_letter.issued", ClinicAuditSeverities.Routine, "ReferralLetter", "Issued clinical specialist referral letter");
            case "UploadRecordAttachmentCommand":
                return (ClinicAuditCategories.Clinical, "clinical.record_attachment.uploaded", ClinicAuditSeverities.Routine, "RecordAttachment", "Uploaded document/film to patient medical chart");
            case "UploadAndEncryptRecordAttachmentCommand":
                return (ClinicAuditCategories.Clinical, "clinical.record_attachment.encrypted_uploaded", ClinicAuditSeverities.Routine, "RecordAttachment", "Uploaded and encrypted sensitive chart document");
            case "VerifyRecordAttachmentCommand":
                return (ClinicAuditCategories.Clinical, "clinical.record_attachment.verified", ClinicAuditSeverities.Routine, "RecordAttachment", "Clinician verified authenticity of attached document");
            case "IntakePatientSharedFileCommand":
                return (ClinicAuditCategories.Clinical, "clinical.shared_file.ingested", ClinicAuditSeverities.Routine, "RecordAttachment", "Ingested shared document from patient portal");

            // Billing
            case "CreateInvoiceCommand":
                return (ClinicAuditCategories.Billing, "billing.invoice.created", ClinicAuditSeverities.Routine, "Invoice", "Generated billing invoice with line items and discounts");
            case "RecordPaymentCommand":
                return (ClinicAuditCategories.Billing, "billing.payment.received", ClinicAuditSeverities.Routine, "Invoice", "Collected payment and issued official receipt number");
            case "VoidInvoiceCommand":
                return (ClinicAuditCategories.Billing, "billing.invoice.voided", ClinicAuditSeverities.Emergency, "Invoice", "Cashier voided official billing invoice with mandatory reason");
            case "RefundPaymentCommand":
                return (ClinicAuditCategories.Billing, "billing.payment.refunded", ClinicAuditSeverities.Urgent, "PaymentRecord", "Processed payment refund");

            // PhilHealth
            case "CreateYakapSubmissionCommand":
                return (ClinicAuditCategories.PhilHealth, "philhealth.submission.created", ClinicAuditSeverities.Routine, "YakapSubmission", "Created PhilHealth Yakap 2.0 direct API submission");
            case "SubmitYakapSubmissionCommand":
                return (ClinicAuditCategories.PhilHealth, "philhealth.submission.submitted", ClinicAuditSeverities.Routine, "YakapSubmission", "Transmitted PhilHealth Yakap 2.0 encrypted JSON payload");
            case "CancelYakapSubmissionCommand":
                return (ClinicAuditCategories.PhilHealth, "philhealth.submission.cancelled", ClinicAuditSeverities.Emergency, "YakapSubmission", "Cancelled PhilHealth Yakap 2.0 submission");

            // Auditing the Auditor
            case "GetAuditLogsQuery":
                return (ClinicAuditCategories.Audit, "audit.log.viewed", ClinicAuditSeverities.Routine, "AuditEntry", "Administrator queried clinic forensic audit trail");
            case "GetAuditLogDetailQuery":
                return (ClinicAuditCategories.Audit, "audit.log.viewed", ClinicAuditSeverities.Routine, "AuditEntry", "Administrator viewed single audit log entry detail");
            case "ExportAuditLogsQuery":
                return (ClinicAuditCategories.Audit, "audit.log.exported", ClinicAuditSeverities.Urgent, "AuditEntry", "Administrator exported forensic audit trail archive");
        }

        // 2. Generic heuristic fallback for any other command
        var cleanName = name.EndsWith("Command", StringComparison.OrdinalIgnoreCase)
            ? name[..^7]
            : (name.EndsWith("Query", StringComparison.OrdinalIgnoreCase) ? name[..^5] : name);

        var words = Regex.Split(cleanName, @"(?<!^)(?=[A-Z])");
        var verb = words.Length > 0 ? words[0].ToLowerInvariant() : "executed";
        var entity = words.Length > 1 ? string.Join("", words.Skip(1)) : cleanName;

        string category;
        if (cleanName.Contains("Staff", StringComparison.OrdinalIgnoreCase) || cleanName.Contains("Role", StringComparison.OrdinalIgnoreCase) || cleanName.Contains("Password", StringComparison.OrdinalIgnoreCase))
            category = ClinicAuditCategories.Security;
        else if (cleanName.Contains("Invoice", StringComparison.OrdinalIgnoreCase) || cleanName.Contains("Payment", StringComparison.OrdinalIgnoreCase) || cleanName.Contains("Billing", StringComparison.OrdinalIgnoreCase))
            category = ClinicAuditCategories.Billing;
        else if (cleanName.Contains("Appointment", StringComparison.OrdinalIgnoreCase))
            category = ClinicAuditCategories.Appointments;
        else if (cleanName.Contains("Queue", StringComparison.OrdinalIgnoreCase) || cleanName.Contains("CheckIn", StringComparison.OrdinalIgnoreCase))
            category = ClinicAuditCategories.Queue;
        else if (cleanName.Contains("Consultation", StringComparison.OrdinalIgnoreCase) || cleanName.Contains("Triage", StringComparison.OrdinalIgnoreCase) || cleanName.Contains("Lab", StringComparison.OrdinalIgnoreCase) || cleanName.Contains("Prescription", StringComparison.OrdinalIgnoreCase) || cleanName.Contains("Vaccine", StringComparison.OrdinalIgnoreCase) || cleanName.Contains("Procedure", StringComparison.OrdinalIgnoreCase))
            category = ClinicAuditCategories.Clinical;
        else if (cleanName.Contains("Yakap", StringComparison.OrdinalIgnoreCase) || cleanName.Contains("PhilHealth", StringComparison.OrdinalIgnoreCase))
            category = ClinicAuditCategories.PhilHealth;
        else if (cleanName.Contains("Patient", StringComparison.OrdinalIgnoreCase) || cleanName.Contains("Allergy", StringComparison.OrdinalIgnoreCase) || cleanName.Contains("Problem", StringComparison.OrdinalIgnoreCase) || cleanName.Contains("Ncd", StringComparison.OrdinalIgnoreCase))
            category = ClinicAuditCategories.Patient;
        else
            category = ClinicAuditCategories.Operations;

        var actionKey = $"{category.ToLowerInvariant()}.{entity.ToLowerInvariant()}.{verb}";
        var severity = verb is "delete" or "cancel" or "void" or "deactivate" or "reset"
            ? (verb is "void" or "deactivate" or "reset" ? ClinicAuditSeverities.Emergency : ClinicAuditSeverities.Urgent)
            : ClinicAuditSeverities.Routine;

        return (category, actionKey, severity, entity, $"Executed {cleanName}");
    }

    private static Func<object, string?> CreatePropertyGetter(Type type, params string[] propertyNames)
    {
        foreach (var name in propertyNames)
        {
            var prop = type.GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
            if (prop != null)
            {
                var param = Expression.Parameter(typeof(object), "obj");
                var castParam = Expression.Convert(param, type);
                var propAccess = Expression.Property(castParam, prop);

                Expression body;
                if (prop.PropertyType == typeof(string))
                {
                    body = propAccess;
                }
                else if (prop.PropertyType == typeof(Guid))
                {
                    var toStringMethod = typeof(object).GetMethod("ToString", Type.EmptyTypes)!;
                    body = Expression.Call(Expression.Convert(propAccess, typeof(object)), toStringMethod);
                }
                else if (prop.PropertyType == typeof(Guid?))
                {
                    var hasValueProp = Expression.Property(propAccess, "HasValue");
                    var valueProp = Expression.Property(propAccess, "Value");
                    var toStringMethod = typeof(object).GetMethod("ToString", Type.EmptyTypes)!;
                    var callToString = Expression.Call(Expression.Convert(valueProp, typeof(object)), toStringMethod);
                    body = Expression.Condition(hasValueProp, callToString, Expression.Constant(null, typeof(string)));
                }
                else
                {
                    var toStringMethod = typeof(object).GetMethod("ToString", Type.EmptyTypes)!;
                    body = Expression.Condition(
                        Expression.Equal(Expression.Convert(propAccess, typeof(object)), Expression.Constant(null, typeof(object))),
                        Expression.Constant(null, typeof(string)),
                        Expression.Call(Expression.Convert(propAccess, typeof(object)), toStringMethod));
                }

                return Expression.Lambda<Func<object, string?>>(body, param).Compile();
            }
        }

        return _ => null;
    }

    private static Func<object, string?> CreateStringPropertyGetter(Type type, params string[] propertyNames)
    {
        foreach (var name in propertyNames)
        {
            var prop = type.GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
            if (prop != null && prop.PropertyType == typeof(string))
            {
                var param = Expression.Parameter(typeof(object), "obj");
                var castParam = Expression.Convert(param, type);
                var propAccess = Expression.Property(castParam, prop);
                return Expression.Lambda<Func<object, string?>>(propAccess, param).Compile();
            }
        }

        return _ => null;
    }

    private static Func<object, Guid?> CreateGuidPropertyGetter(Type type, params string[] propertyNames)
    {
        foreach (var name in propertyNames)
        {
            var prop = type.GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
            if (prop != null)
            {
                if (prop.PropertyType == typeof(Guid))
                {
                    var param = Expression.Parameter(typeof(object), "obj");
                    var castParam = Expression.Convert(param, type);
                    var propAccess = Expression.Property(castParam, prop);
                    var body = Expression.Convert(propAccess, typeof(Guid?));
                    return Expression.Lambda<Func<object, Guid?>>(body, param).Compile();
                }

                if (prop.PropertyType == typeof(Guid?))
                {
                    var param = Expression.Parameter(typeof(object), "obj");
                    var castParam = Expression.Convert(param, type);
                    var propAccess = Expression.Property(castParam, prop);
                    return Expression.Lambda<Func<object, Guid?>>(propAccess, param).Compile();
                }

                if (prop.PropertyType == typeof(string))
                {
                    return req =>
                    {
                        var str = prop.GetValue(req) as string;
                        return Guid.TryParse(str, out var g) ? g : null;
                    };
                }
            }
        }

        return _ => null;
    }

    public static string? ExtractResponseId(object? response)
    {
        if (response == null) return null;
        if (response is Guid g && g != Guid.Empty) return g.ToString();

        var type = response.GetType();
        if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(ClinicEz.Shared.Common.ApiResponse<>))
        {
            var dataProp = type.GetProperty("Data");
            var dataVal = dataProp?.GetValue(response);
            if (dataVal == null) return null;
            if (dataVal is Guid dg && dg != Guid.Empty) return dg.ToString();

            var idProp = dataVal.GetType().GetProperty("Id", BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
            var idVal = idProp?.GetValue(dataVal);
            if (idVal != null) return idVal.ToString();
        }

        var directIdProp = type.GetProperty("Id", BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
        if (directIdProp != null)
        {
            var idVal = directIdProp.GetValue(response);
            if (idVal != null) return idVal.ToString();
        }

        return null;
    }
}
