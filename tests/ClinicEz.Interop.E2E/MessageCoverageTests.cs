using System.Reflection;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Shared.Interop;
using FluentAssertions;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// The message matrix (<c>docs/architecture/message-matrix.md</c>) as an executable table. Every <see cref="InteropTypes"/> constant
/// has exactly one row naming who sends it and who handles it, and each hosted service's REAL handler registry must equal the set
/// of rows that name it as a receiver - so a handler can be neither dropped nor added silently, and a new message type cannot be
/// introduced without deciding its route.
/// </summary>
public class MessageCoverageTests
{
    private const string Clinic = InteropServices.Clinic;
    private const string Lab = InteropServices.Laboratory;
    private const string Pharmacy = InteropServices.Pharmacy;
    private const string Billing = InteropServices.Billing;
    private const string Patient = InteropServices.Patient;
    private const string Portal = InteropServices.Portal;
    private const string Organization = InteropServices.Organization;
    private const string PhilHealth = InteropServices.Philhealth;
    private const string Hub = InteropServices.Hub;

    private sealed record Route(string Type, string[] Senders, string[] Receivers);

    private static readonly Route[] Matrix =
    [
        new(InteropTypes.FacilityLicenseIssued, [Portal], [Clinic, Lab, Pharmacy, Billing, Organization]),
        new(InteropTypes.FacilityProvisioned, [Lab, Pharmacy, Organization], [Portal]),
        new(InteropTypes.FacilityDirectoryUpdated, [Portal, Clinic], [Patient, Clinic]),
        new(InteropTypes.WorkspaceProfileUpdated, [Portal], [Clinic, Lab, Pharmacy, Organization]),
        new(InteropTypes.EntitlementsChanged, [Portal], [Clinic, Lab, Pharmacy, Billing, Organization]),
        new(InteropTypes.FacilityHeartbeat, [Clinic, Lab, Pharmacy, Organization], [Portal]),

        new(InteropTypes.DirectoryCellUpserted, [Portal], [Hub]),
        new(InteropTypes.DirectoryFacilityUpserted, [Portal], [Hub]),
        new(InteropTypes.DirectoryLinkUpserted, [Portal], [Hub]),

        new(InteropTypes.PatientAppointmentBooked, [Patient], [Clinic]),
        new(InteropTypes.ClinicAppointmentUpdated, [Clinic], [Patient]),
        new(InteropTypes.ClinicRecordVerified, [Clinic], [Patient]),
        new(InteropTypes.PatientRecordShared, [Patient], [Clinic]),
        new(InteropTypes.PatientShareRedeem, [Clinic], [Patient]),
        new(InteropTypes.PatientShareSnapshot, [Patient], [Clinic]),
        new(InteropTypes.PatientDocumentIssued, [Clinic, Lab, Pharmacy], [Patient]),
        new(InteropTypes.ClinicalImmunizationAdministered, [Clinic], [Patient]),
        new(InteropTypes.PatientJoinRequested, [Portal], [Clinic]),
        new(InteropTypes.PatientQueueAlert, [Clinic], [Patient]),
        new(InteropTypes.PatientAppointmentAlert, [Clinic], [Patient]),

        new(InteropTypes.LabOrderIssued, [Clinic], [Lab]),
        new(InteropTypes.LabOrderStatusChanged, [Lab], [Clinic, Patient]),
        new(InteropTypes.LabResultFinalized, [Lab], [Clinic]),
        new(InteropTypes.LabResultPanic, [Lab], [Clinic]),
        new(InteropTypes.LabResultExternalSubmitted, [Patient, Portal], [Clinic]),
        new(InteropTypes.LabResultReviewed, [Clinic], [Lab, Patient]),

        new(InteropTypes.RxIssued, [Clinic], [Pharmacy]),
        new(InteropTypes.RxStatusChanged, [Pharmacy], [Clinic, Patient]),
        new(InteropTypes.RxDispensed, [Pharmacy], [Clinic]),
        new(InteropTypes.RxExternalDispensed, [Patient], [Clinic]),

        new(InteropTypes.GamotLookupRequested, [Clinic], [Pharmacy]),
        new(InteropTypes.GamotLookupResponded, [Pharmacy], [Clinic]),

        new(InteropTypes.PhilHealthRequest, [Clinic], [PhilHealth]),
        new(InteropTypes.PhilHealthResponse, [PhilHealth], [Clinic]),
        new(InteropTypes.PhilHealthConfigRequested, [PhilHealth], [Portal]),
        new(InteropTypes.PhilHealthConfigResponded, [Portal], [PhilHealth]),
        new(InteropTypes.PhilHealthConfigUpsertRequested, [PhilHealth], [Portal]),
        new(InteropTypes.PhilHealthConfigUpsertResponded, [Portal], [PhilHealth]),

        new(InteropTypes.YakapTransmittalRequested, [Portal], [Clinic]),
        new(InteropTypes.YakapTransmittalResponded, [Clinic], [Portal]),

        new(InteropTypes.BillingInvoiceRequested, [Clinic, Lab, Pharmacy], [Billing]),
        new(InteropTypes.BillingPaymentConfirmed, [Billing], [Clinic, Lab, Pharmacy]),
        new(InteropTypes.BillingInvoicePaid, [Billing], [Portal]),
        new(InteropTypes.BillingInvoiceVoided, [Billing], [Clinic, Lab, Pharmacy, Portal]),

        new(InteropTypes.NotificationEmailRequested, [Portal], [Portal])
    ];

    [Fact]
    public void EveryInteropType_HasExactlyOneRouteInTheMatrix()
    {
        var declared = typeof(InteropTypes)
            .GetFields(BindingFlags.Public | BindingFlags.Static | BindingFlags.FlattenHierarchy)
            .Where(f => f.IsLiteral && f.FieldType == typeof(string))
            .Select(f => (string)f.GetRawConstantValue()!)
            .ToList();

        Matrix.Select(r => r.Type).Should().OnlyHaveUniqueItems("a message type is routed once");
        Matrix.Select(r => r.Type).Should().BeEquivalentTo(declared, "every catalogued message type needs a route");
    }

    [Fact]
    public void HubInternalTypes_AreOnlyHandledByTheHub()
    {
        foreach (var route in Matrix)
        {
            InteropTypes.IsHubInternal(route.Type).Should().Be(route.Receivers.SequenceEqual([Hub]), route.Type);
        }
    }

    [Fact]
    public async Task EveryHostedService_RegistersExactlyTheHandlersTheMatrixAssignsIt()
    {
        await using var cell = new TestCell();

        foreach (var host in cell.Hosts)
        {
            var expected = Matrix.Where(r => r.Receivers.Contains(host.Service)).Select(r => r.Type).ToList();

            host.Registry.RegisteredTypes.Should().BeEquivalentTo(expected, $"the {host.Service} handler registry must match the message matrix");
        }
    }
}
