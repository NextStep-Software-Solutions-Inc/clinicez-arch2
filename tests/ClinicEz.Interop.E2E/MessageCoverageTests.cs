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
    private const string Hub = InteropServices.Hub;

    private sealed record Route(string Type, string[] Senders, string[] Receivers);

    private static readonly Route[] Matrix =
    [
        new(InteropTypes.FacilityLicenseIssued, [Portal], [Clinic, Lab, Pharmacy, Organization]),
        new(InteropTypes.FacilityProvisioned, [Lab, Pharmacy, Organization], [Portal]),
        new(InteropTypes.FacilityDirectoryUpdated, [Portal], [Patient]),
        new(InteropTypes.WorkspaceProfileUpdated, [Portal], [Clinic, Lab, Pharmacy, Organization]),
        new(InteropTypes.EntitlementsChanged, [Portal], [Clinic, Lab, Pharmacy, Organization]),
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

        new(InteropTypes.LabOrderIssued, [Clinic], [Lab]),
        new(InteropTypes.LabOrderClaimed, [], []),
        new(InteropTypes.LabOrderAccepted, [], []),
        new(InteropTypes.LabOrderRejected, [], []),
        new(InteropTypes.LabOrderStatusChanged, [Lab], [Clinic, Patient]),
        new(InteropTypes.LabOrderPaymentConfirmed, [], []),
        new(InteropTypes.LabResultFinalized, [Lab], [Clinic]),
        new(InteropTypes.LabResultPanic, [Lab], [Clinic]),
        new(InteropTypes.LabResultExternalSubmitted, [Patient, Portal], [Clinic]),
        new(InteropTypes.LabResultReviewed, [Clinic], [Lab, Patient]),

        new(InteropTypes.RxIssued, [Clinic], [Pharmacy]),
        new(InteropTypes.RxStatusChanged, [Pharmacy], [Clinic, Patient]),
        new(InteropTypes.RxDispensed, [Pharmacy], [Clinic]),
        new(InteropTypes.RxExternalDispensed, [Patient], [Clinic]),

        new(InteropTypes.MedcertIssued, [], []),

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
        Matrix.Select(r => r.Type).Should().BeEquivalentTo(declared, "every catalogued message type needs a route (or an explicit reserved row)");
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

    [Fact]
    public void ReservedTypes_AreDeclaredButNeitherSentNorHandled()
    {
        var reserved = Matrix.Where(r => r.Senders.Length == 0 && r.Receivers.Length == 0).Select(r => r.Type);

        reserved.Should().BeEquivalentTo(
        [
            InteropTypes.LabOrderClaimed,
            InteropTypes.LabOrderAccepted,
            InteropTypes.LabOrderRejected,
            InteropTypes.LabOrderPaymentConfirmed,
            InteropTypes.MedcertIssued
        ]);
        Matrix.Where(r => (r.Senders.Length == 0) != (r.Receivers.Length == 0)).Should().BeEmpty("a message is either fully wired or reserved");
    }
}
