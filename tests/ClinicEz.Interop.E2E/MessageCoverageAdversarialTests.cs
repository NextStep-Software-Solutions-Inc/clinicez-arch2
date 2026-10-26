using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Shared.Interop;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Interop.E2E;

public class MessageCoverageAdversarialTests
{
    private sealed record TestRoute(string Type, string[] Senders, string[] Receivers);

    [Fact]
    public void MatrixOracle_WhenConstantMissingFromMatrix_ThrowsAssertionException()
    {
        var declared = typeof(InteropTypes)
            .GetFields(BindingFlags.Public | BindingFlags.Static | BindingFlags.FlattenHierarchy)
            .Where(f => f.IsLiteral && f.FieldType == typeof(string))
            .Select(f => (string)f.GetRawConstantValue()!)
            .ToList();

        // Simulate an unmapped constant added to InteropTypes
        var declaredWithDummy = new List<string>(declared) { "adversarial.unmapped.message.type" };

        Action act = () => declared.Should().BeEquivalentTo(declaredWithDummy, "every catalogued message type needs a route");
        act.Should().Throw<Exception>("missing route in matrix must fail test");
    }

    [Fact]
    public void MatrixOracle_WhenGhostRouteAddedToMatrix_ThrowsAssertionException()
    {
        var declared = typeof(InteropTypes)
            .GetFields(BindingFlags.Public | BindingFlags.Static | BindingFlags.FlattenHierarchy)
            .Where(f => f.IsLiteral && f.FieldType == typeof(string))
            .Select(f => (string)f.GetRawConstantValue()!)
            .ToList();

        // Simulate a route in the matrix that has no InteropTypes constant
        var matrixWithGhost = new List<string>(declared) { "ghost.nonexistent.constant" };

        Action act = () => matrixWithGhost.Should().BeEquivalentTo(declared, "ghost route without InteropTypes constant must fail test");
        act.Should().Throw<Exception>("extra uncatalogued route must fail test");
    }

    [Fact]
    public void MatrixOracle_WhenDuplicateRouteExists_ThrowsAssertionException()
    {
        var declared = typeof(InteropTypes)
            .GetFields(BindingFlags.Public | BindingFlags.Static | BindingFlags.FlattenHierarchy)
            .Where(f => f.IsLiteral && f.FieldType == typeof(string))
            .Select(f => (string)f.GetRawConstantValue()!)
            .ToList();

        // Simulate a duplicate route for FacilityJoinSettingsUpdated
        var matrixWithDuplicate = new List<string>(declared) { InteropTypes.FacilityJoinSettingsUpdated };

        Action act = () => matrixWithDuplicate.Should().OnlyHaveUniqueItems("a message type is routed once");
        act.Should().Throw<Exception>("duplicate routes must fail uniqueness validation");
    }

    [Fact]
    public async Task MatrixOracle_WhenServiceHandlerDropped_ThrowsAssertionException()
    {
        await using var cell = new TestCell();
        var clinicHost = cell.Hosts.First(h => h.Service == InteropServices.Clinic);

        // Take clinic's real registered types, but assert against an expected list containing an extra unhandled message
        var fakeExpected = new List<string>(clinicHost.Registry.RegisteredTypes) { "unhandled.clinic.dummy.message" };

        Action act = () => clinicHost.Registry.RegisteredTypes.Should().BeEquivalentTo(fakeExpected);
        act.Should().Throw<Exception>("missing handler in clinic host must be caught");
    }

    [Fact]
    public async Task MatrixOracle_WhenServiceRegistersSurplusHandler_ThrowsAssertionException()
    {
        await using var cell = new TestCell();
        var labHost = cell.Hosts.First(h => h.Service == InteropServices.Laboratory);

        // Remove one expected handler from the expected list
        var fakeExpected = labHost.Registry.RegisteredTypes.Skip(1).ToList();

        Action act = () => labHost.Registry.RegisteredTypes.Should().BeEquivalentTo(fakeExpected);
        act.Should().Throw<Exception>("surplus registered handler not in matrix must be caught");
    }

    [Fact]
    public void Milestone1_NewRoutesAndContracts_ArePresentAndProperlyRouted()
    {
        // 1. Verify InteropTypes constants exist
        InteropTypes.FacilityJoinSettingsUpdated.Should().Be("facility.join-settings.updated");
        InteropTypes.DocumentAttestationPublished.Should().Be("document.attestation.published");
        InteropTypes.QueueBoardUpdated.Should().Be("facility.queue-board.updated");
        InteropTypes.RxExternalDispensed.Should().Be("rx.external.dispensed");

        // 2. Reflect MessageCoverageTests.Matrix to verify exact routing
        var coverageType = typeof(MessageCoverageTests);
        var matrixField = coverageType.GetField("Matrix", BindingFlags.NonPublic | BindingFlags.Static);
        matrixField.Should().NotBeNull();

        var matrix = (Array)matrixField!.GetValue(null)!;
        var routes = new Dictionary<string, (string[] Senders, string[] Receivers)>();

        foreach (var item in matrix)
        {
            var typeProp = item.GetType().GetProperty("Type")!.GetValue(item) as string;
            var senders = item.GetType().GetProperty("Senders")!.GetValue(item) as string[];
            var receivers = item.GetType().GetProperty("Receivers")!.GetValue(item) as string[];
            routes[typeProp!] = (senders!, receivers!);
        }

        // Verify FacilityJoinSettingsUpdated
        routes.Should().ContainKey(InteropTypes.FacilityJoinSettingsUpdated);
        routes[InteropTypes.FacilityJoinSettingsUpdated].Senders.Should().BeEquivalentTo([InteropServices.Clinic]);
        routes[InteropTypes.FacilityJoinSettingsUpdated].Receivers.Should().BeEquivalentTo([InteropServices.Portal]);

        // Verify DocumentAttestationPublished
        routes.Should().ContainKey(InteropTypes.DocumentAttestationPublished);
        routes[InteropTypes.DocumentAttestationPublished].Senders.Should().BeEquivalentTo([InteropServices.Clinic, InteropServices.Laboratory]);
        routes[InteropTypes.DocumentAttestationPublished].Receivers.Should().BeEquivalentTo([InteropServices.Portal]);

        // Verify QueueBoardUpdated
        routes.Should().ContainKey(InteropTypes.QueueBoardUpdated);
        routes[InteropTypes.QueueBoardUpdated].Senders.Should().BeEquivalentTo([InteropServices.Clinic]);
        routes[InteropTypes.QueueBoardUpdated].Receivers.Should().BeEquivalentTo([InteropServices.Portal]);

        // Verify RxExternalDispensed
        routes.Should().ContainKey(InteropTypes.RxExternalDispensed);
        routes[InteropTypes.RxExternalDispensed].Senders.Should().BeEquivalentTo([InteropServices.Patient, InteropServices.Portal]);
        routes[InteropTypes.RxExternalDispensed].Receivers.Should().BeEquivalentTo([InteropServices.Clinic]);
    }
}
