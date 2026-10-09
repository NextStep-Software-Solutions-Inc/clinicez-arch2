using System;
using System.Collections.Generic;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Domain.Constants;

/// <summary>
/// Permission names enforced on laboratory endpoints. They are granted per <see cref="LabStaffRole"/>
/// (see <see cref="LabRolePermissions"/>) and travel in the facility-local session as <c>permission</c> claims.
/// </summary>
public static class LabPermissions
{
    // Requisitions / worklist (intake)
    public const string RequisitionsRead = "requisitions:read";
    /// <summary>Claim a patient's QR slip, reject an order and refresh its payment status.</summary>
    public const string RequisitionsManage = "requisitions:manage";

    // Specimen handling
    /// <summary>Accession specimens against a requisition and print tube stickers.</summary>
    public const string SpecimensAccession = "specimens:accession";
    /// <summary>Reject specimens, store them in racks and read rack inventory.</summary>
    public const string SpecimensManage = "specimens:manage";

    // Analyte results and analyzers
    public const string ResultsRead = "results:read";
    public const string ResultsWrite = "results:write";
    public const string AnalyzersFeed = "analyzers:feed";

    // Quality control
    public const string QcRead = "qc:read";
    public const string QcWrite = "qc:write";

    // Diagnostic reports
    public const string ReportsRead = "reports:read";
    /// <summary>Verify, sign and release a diagnostic report.</summary>
    public const string ReportsVerify = "reports:verify";
    public const string ReportsPanicDispatch = "reports:panic-dispatch";

    // Staff administration
    public const string StaffRead = "staff:read";
    public const string StaffManage = "staff:manage";

    /// <summary>
    /// Minimal permission set granted to trusted internal services (authenticated by the shared internal key).
    /// Never includes staff, results or verification permissions.
    /// </summary>
    public static readonly IReadOnlyList<string> InternalService = new List<string>
    {
        RequisitionsRead,
        ReportsRead
    }.AsReadOnly();

    public static readonly IReadOnlyList<string> All = new List<string>
    {
        RequisitionsRead,
        RequisitionsManage,
        SpecimensAccession,
        SpecimensManage,
        ResultsRead,
        ResultsWrite,
        AnalyzersFeed,
        QcRead,
        QcWrite,
        ReportsRead,
        ReportsVerify,
        ReportsPanicDispatch,
        StaffRead,
        StaffManage
    }.AsReadOnly();
}

/// <summary>Role → permission map. Least privilege: only <see cref="LabStaffRole.LabAdmin"/> receives everything.</summary>
public static class LabRolePermissions
{
    private static readonly IReadOnlyList<string> Pathologist = new List<string>
    {
        LabPermissions.RequisitionsRead,
        LabPermissions.ResultsRead,
        LabPermissions.QcRead,
        LabPermissions.ReportsRead,
        LabPermissions.ReportsVerify,
        LabPermissions.ReportsPanicDispatch,
        LabPermissions.StaffRead
    }.AsReadOnly();

    private static readonly IReadOnlyList<string> MedicalTechnologist = new List<string>
    {
        LabPermissions.RequisitionsRead,
        LabPermissions.RequisitionsManage,
        LabPermissions.SpecimensAccession,
        LabPermissions.SpecimensManage,
        LabPermissions.ResultsRead,
        LabPermissions.ResultsWrite,
        LabPermissions.AnalyzersFeed,
        LabPermissions.QcRead,
        LabPermissions.QcWrite,
        LabPermissions.ReportsRead,
        LabPermissions.ReportsPanicDispatch,
        LabPermissions.StaffRead
    }.AsReadOnly();

    private static readonly IReadOnlyList<string> Phlebotomist = new List<string>
    {
        LabPermissions.RequisitionsRead,
        LabPermissions.SpecimensAccession,
        LabPermissions.SpecimensManage
    }.AsReadOnly();

    private static readonly IReadOnlyList<string> LabClerk = new List<string>
    {
        LabPermissions.RequisitionsRead,
        LabPermissions.RequisitionsManage,
        LabPermissions.SpecimensAccession
    }.AsReadOnly();

    public static IReadOnlyList<string> For(LabStaffRole role) => role switch
    {
        LabStaffRole.LabAdmin => LabPermissions.All,
        LabStaffRole.Pathologist => Pathologist,
        LabStaffRole.MedicalTechnologist => MedicalTechnologist,
        LabStaffRole.Phlebotomist => Phlebotomist,
        LabStaffRole.LabClerk => LabClerk,
        _ => Array.Empty<string>()
    };
}
