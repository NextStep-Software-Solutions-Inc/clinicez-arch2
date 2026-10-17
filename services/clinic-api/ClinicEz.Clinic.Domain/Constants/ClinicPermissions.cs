using System.Collections.Generic;

namespace ClinicEz.Clinic.Domain.Constants;

public static class ClinicPermissions
{
    // Appointments
    public const string AppointmentsRead = "appointments:read";
    public const string AppointmentsManage = "appointments:manage";

    // Doctor Schedules & Rostering
    public const string SchedulesRead = "schedules:read";
    public const string SchedulesManage = "schedules:manage";

    // Queue
    public const string QueueRead = "queue:read";
    public const string QueueCheckIn = "queue:check-in";
    public const string QueueCall = "queue:call";
    public const string QueueComplete = "queue:complete";

    // Triage
    public const string TriageRead = "triage:read";
    public const string TriageWrite = "triage:write";

    // Consultations & EMR
    public const string ConsultationsRead = "consultations:read";
    public const string ConsultationsWrite = "consultations:write";
    public const string ConsultationsSign = "consultations:sign";

    // Billing & Cashier
    public const string BillingRead = "billing:read";
    public const string BillingWrite = "billing:write";
    public const string BillingVoid = "billing:void";

    // Fee Schedule & Services Catalog
    public const string ServicesRead = "services:read";
    public const string ServicesManage = "services:manage";

    // Clinical Procedures & Nursing Orders
    public const string ProceduresRead = "procedures:read";
    public const string ProceduresWrite = "procedures:write";

    // Lab Orders & Diagnostic Referrals
    public const string LabOrdersRead = "laborders:read";
    public const string LabOrdersWrite = "laborders:write";

    // Doctor review of unverified (external or patient-uploaded) lab results
    public const string LabResultsReview = "labresults:review";

    // Reports & End-of-Day Remittance
    public const string ReportsRead = "reports:read";

    // Patients Directory & Master Patient Index
    public const string PatientsRead = "patients:read";
    public const string PatientsWrite = "patients:write";

    // Documents & Clinical Certificates
    public const string DocumentsRead = "documents:read";
    public const string DocumentsIssue = "documents:issue";

    // Records & Clinical Attachments
    public const string RecordsRead = "records:read";
    public const string RecordsUpload = "records:upload";

    // Clinic Settings & Preferences
    public const string SettingsRead = "settings:read";
    public const string SettingsManage = "settings:manage";

    // Staff Roster
    public const string StaffRead = "staff:read";
    public const string StaffManage = "staff:manage";

    // Roles & Permissions
    public const string RolesRead = "roles:read";
    public const string RolesManage = "roles:manage";

    // PhilHealth Catalog (official lib_* libraries): importing a newer kit or a corrected library
    public const string PhilHealthCatalogImport = "philhealth.catalog.import";

    // PhilHealth Yakap Transmittals & Integration
    public const string YakapRead = "yakap:read";
    public const string YakapWrite = "yakap:write";
    public const string YakapSubmit = "yakap:submit";

    // Audit Log & Forensic Activity Trail
    public const string AuditRead = "audit:read";
    public const string AuditExport = "audit:export";

    /// <summary>
    /// Minimal permission set granted to trusted internal services (authenticated by the shared internal key),
    /// e.g. portal-api forwarding Yakap transmittal operations. Never includes staff/role/settings management.
    /// </summary>
    public static readonly IReadOnlyList<string> InternalService = new List<string>
    {
        YakapRead,
        YakapWrite,
        YakapSubmit,
        PatientsRead,
        ConsultationsRead,
        SettingsRead
    }.AsReadOnly();

    public static readonly IReadOnlyList<string> All = new List<string>
    {
        AppointmentsRead,
        AppointmentsManage,
        QueueRead,
        QueueCheckIn,
        QueueCall,
        QueueComplete,
        TriageRead,
        TriageWrite,
        ConsultationsRead,
        ConsultationsWrite,
        ConsultationsSign,
        PatientsRead,
        PatientsWrite,
        DocumentsRead,
        DocumentsIssue,
        RecordsRead,
        RecordsUpload,
        BillingRead,
        BillingWrite,
        BillingVoid,
        ServicesRead,
        ServicesManage,
        ProceduresRead,
        ProceduresWrite,
        LabOrdersRead,
        LabOrdersWrite,
        LabResultsReview,
        ReportsRead,
        SettingsRead,
        SettingsManage,
        StaffRead,
        StaffManage,
        RolesRead,
        RolesManage,
        YakapRead,
        YakapWrite,
        YakapSubmit,
        PhilHealthCatalogImport,
        SchedulesRead,
        SchedulesManage,
        AuditRead,
        AuditExport
    }.AsReadOnly();
}
