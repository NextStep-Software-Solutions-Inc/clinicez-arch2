using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Application.Features.Prescriptions.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Domain.Services;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicalDecisionSupportTests
{
    [Fact]
    public void Evaluate_WhenPatientHasPenicillinAllergy_AndAmoxicillinPrescribed_FlagsCriticalContraindication()
    {
        // Arrange
        var candidates = new List<PrescriptionCandidate>
        {
            new() { GenericName = "Amoxicillin", Dosage = "500mg", BrandName = "Amoxil" }
        };

        // Act
        var alerts = ClinicalDecisionSupportEvaluator.Evaluate(candidates, patientAllergies: "Penicillin, Seafood");

        // Assert
        Assert.NotEmpty(alerts);
        var allergyAlert = alerts.FirstOrDefault(a => a.Type == CdsAlertType.DrugAllergy);
        Assert.NotNull(allergyAlert);
        Assert.Equal(CdsAlertSeverity.Critical, allergyAlert.Severity);
        Assert.True(allergyAlert.RequiresOverrideReason);
        Assert.Contains("Penicillin", allergyAlert.Title, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Evaluate_WhenPatientHasPenicillinAllergy_AndCephalosporinPrescribed_FlagsMajorCrossReactivityWarning()
    {
        // Arrange
        var candidates = new List<PrescriptionCandidate>
        {
            new() { GenericName = "Cephalexin", Dosage = "500mg" }
        };

        // Act
        var alerts = ClinicalDecisionSupportEvaluator.Evaluate(candidates, patientAllergies: "Penicillin");

        // Assert
        var crossAlert = alerts.FirstOrDefault(a => a.Title.Contains("CROSS-REACTIVITY"));
        Assert.NotNull(crossAlert);
        Assert.Equal(CdsAlertSeverity.Major, crossAlert.Severity);
        Assert.Equal("Cephalexin", crossAlert.OffendingDrug);
    }

    [Fact]
    public void Evaluate_WhenPatientHasAspirinAllergy_AndIbuprofenPrescribed_FlagsCriticalNsaidContraindication()
    {
        // Arrange
        var candidates = new List<PrescriptionCandidate>
        {
            new() { GenericName = "Ibuprofen", Dosage = "400mg" }
        };

        // Act
        var alerts = ClinicalDecisionSupportEvaluator.Evaluate(candidates, patientAllergies: "Aspirin");

        // Assert
        var nsaidAlert = alerts.FirstOrDefault(a => a.Title.Contains("Aspirin/NSAID-sensitive"));
        Assert.NotNull(nsaidAlert);
        Assert.Equal(CdsAlertSeverity.Critical, nsaidAlert.Severity);
    }

    [Fact]
    public void Evaluate_WhenWarfarinAndNsaidCoPrescribed_FlagsCriticalBleedingDdi()
    {
        // Arrange
        var candidates = new List<PrescriptionCandidate>
        {
            new() { GenericName = "Warfarin", Dosage = "2.5mg" },
            new() { GenericName = "Mefenamic Acid", Dosage = "500mg" }
        };

        // Act
        var alerts = ClinicalDecisionSupportEvaluator.Evaluate(candidates);

        // Assert
        var ddiAlert = alerts.FirstOrDefault(a => a.Type == CdsAlertType.DrugDrugInteraction && a.Title.Contains("BLEEDING"));
        Assert.NotNull(ddiAlert);
        Assert.Equal(CdsAlertSeverity.Critical, ddiAlert.Severity);
        Assert.True(ddiAlert.RequiresOverrideReason);
    }

    [Fact]
    public void Evaluate_WhenLosartanAndSpironolactoneCoPrescribed_FlagsHyperkalemiaWarning()
    {
        // Arrange
        var candidates = new List<PrescriptionCandidate>
        {
            new() { GenericName = "Losartan Potassium", Dosage = "50mg" },
            new() { GenericName = "Spironolactone", Dosage = "25mg" }
        };

        // Act
        var alerts = ClinicalDecisionSupportEvaluator.Evaluate(candidates);

        // Assert
        var ddiAlert = alerts.FirstOrDefault(a => a.Type == CdsAlertType.DrugDrugInteraction && a.Title.Contains("HYPERKALEMIA"));
        Assert.NotNull(ddiAlert);
        Assert.Equal(CdsAlertSeverity.Major, ddiAlert.Severity);
    }

    [Fact]
    public void Evaluate_WhenClopidogrelAndOmeprazoleCoPrescribed_FlagsAntiplateletAttenuation()
    {
        // Arrange
        var candidates = new List<PrescriptionCandidate>
        {
            new() { GenericName = "Clopidogrel", Dosage = "75mg" },
            new() { GenericName = "Omeprazole", Dosage = "20mg" }
        };

        // Act
        var alerts = ClinicalDecisionSupportEvaluator.Evaluate(candidates);

        // Assert
        var ddiAlert = alerts.FirstOrDefault(a => a.Title.Contains("ANTIPLATELET ATTENUATION"));
        Assert.NotNull(ddiAlert);
        Assert.Equal(CdsAlertSeverity.Major, ddiAlert.Severity);
    }

    [Fact]
    public void Evaluate_WhenMetforminPrescribed_AndEgfrUnder30_FlagsCriticalRenalContraindication()
    {
        // Arrange
        var candidates = new List<PrescriptionCandidate>
        {
            new() { GenericName = "Metformin HCl", Dosage = "500mg" }
        };

        // Act
        var alerts = ClinicalDecisionSupportEvaluator.Evaluate(candidates, egfrMlMin: 24.5);

        // Assert
        var renalAlert = alerts.FirstOrDefault(a => a.Type == CdsAlertType.RenalDoseAdjustment && a.Severity == CdsAlertSeverity.Critical);
        Assert.NotNull(renalAlert);
        Assert.Contains("Severe CKD", renalAlert.Title);
        Assert.True(renalAlert.RequiresOverrideReason);
    }

    [Fact]
    public void Evaluate_WhenMetforminPrescribed_AndEgfrBetween30And45_FlagsMajorDoseAdjustment()
    {
        // Arrange
        var candidates = new List<PrescriptionCandidate>
        {
            new() { GenericName = "Metformin HCl", Dosage = "850mg" }
        };

        // Act
        var alerts = ClinicalDecisionSupportEvaluator.Evaluate(candidates, egfrMlMin: 38.0);

        // Assert
        var renalAlert = alerts.FirstOrDefault(a => a.Type == CdsAlertType.RenalDoseAdjustment && a.Severity == CdsAlertSeverity.Major);
        Assert.NotNull(renalAlert);
        Assert.Contains("Moderate CKD", renalAlert.Title);
    }

    [Fact]
    public void Evaluate_WhenBaselinePotassiumIsElevated_AndAceInhibitorPrescribed_FlagsCriticalLabAlert()
    {
        // Arrange
        var candidates = new List<PrescriptionCandidate>
        {
            new() { GenericName = "Enalapril Maleate", Dosage = "10mg" }
        };

        // Act
        var alerts = ClinicalDecisionSupportEvaluator.Evaluate(candidates, serumPotassiumMmolL: 5.6);

        // Assert
        var kAlert = alerts.FirstOrDefault(a => a.Type == CdsAlertType.LabValueWarning);
        Assert.NotNull(kAlert);
        Assert.Equal(CdsAlertSeverity.Critical, kAlert.Severity);
        Assert.Contains("5.6", kAlert.Title);
    }

    [Fact]
    public async Task LabPanicResultAlertHandler_WhenMessageReceived_MarksOrderAsCriticalPanic()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<ClinicEz.Clinic.Domain.Interfaces.IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-default");

        var (context, unitOfWork, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        MessagingTestKit.SeedClinic(context, clinicId, "tenant-default");
        var orderRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var handler = new LabPanicResultAlertHandler(context, MessagingTestKit.Recipient(context), NullLogger<LabPanicResultAlertHandler>.Instance);

        var existingOrder = new LabOrder
        {
            TenantId = "tenant-default",
            ClinicId = clinicId,
            OrderNumber = "ACC-PANIC-001",
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Santos",
            Status = LabOrderStatus.Ordered
        };
        await orderRepo.AddAsync(existingOrder);
        await unitOfWork.SaveChangesAsync();

        var panicEvent = new LabPanicResultAlertEvent
        {
            AlertId = Guid.NewGuid(),
            RequisitionId = existingOrder.Id,
            AccessionNumber = "ACC-PANIC-001",
            PatientId = existingOrder.PatientId,
            PatientName = "Maria Santos",
            OrderingFacilityName = "Main Central Diagnostic Laboratory",
            OrderingDoctorName = "Dr. Cruz",
            TriggeredAt = DateTime.UtcNow,
            CriticalFindings = new List<CriticalFindingDto>
            {
                new()
                {
                    AnalyteCode = "K",
                    AnalyteName = "Serum Potassium",
                    ObservedValue = "6.8",
                    Unit = "mmol/L",
                    ReferenceInterval = "3.5 - 5.1",
                    AlertDescription = "Critical Hyperkalemia exceeding 6.2 mmol/L panic limit"
                }
            }
        };

        var delivered = MessagingTestKit.Delivered(
            InteropTypes.LabResultPanic, MessagingTestKit.LabParty(), MessagingTestKit.ClinicParty("tenant-default", clinicId),
            existingOrder.Id, panicEvent);

        // Act
        await handler.HandleAsync(panicEvent, delivered, CancellationToken.None);

        // Assert
        var updatedOrder = await orderRepo.GetByIdAsync(existingOrder.Id);
        Assert.NotNull(updatedOrder);
        Assert.True(updatedOrder.HasCriticalPanicAlert);
        Assert.NotNull(updatedOrder.PanicAlertTriggeredAt);

        // Doctor acknowledges panic finding
        var acknowledgeHandler = new AcknowledgePanicAlertCommandHandler(orderRepo, unitOfWork);
        var ackResult = await acknowledgeHandler.Handle(
            new AcknowledgePanicAlertCommand(updatedOrder.Id, "Dr. Cruz, MD", "Notified and ordered calcium gluconate STAT"),
            CancellationToken.None);

        Assert.NotNull(ackResult.PanicAcknowledgedAt);
        Assert.Equal("Dr. Cruz, MD", ackResult.PanicAcknowledgedBy);
    }
}
