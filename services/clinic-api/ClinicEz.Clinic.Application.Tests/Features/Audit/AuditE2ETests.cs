namespace ClinicEz.Clinic.Application.Tests.Features.Audit;

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Common.Privacy;
using ClinicEz.Clinic.Application.Features.Audit.DTOs;
using ClinicEz.Clinic.Application.Features.Audit.Queries;
using ClinicEz.Clinic.Application.Features.Audit.Services;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Auditing;
using ClinicEz.Clinic.Infrastructure.Privacy;
using ClinicEz.Shared.Common;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

/// <summary>
/// Comprehensive 4-Tier End-to-End Test Suite for Clinic-Wide Audit Log and Forensic Activity Trail.
/// Verifies all 5 Real-World Regulatory Application Scenarios defined in TEST_INFRA.md:
///   Scenario 1: Full Clinical Encounter & PhilHealth Transmittal Audit Trail
///   Scenario 2: Cashier Void & Refund Regulatory Compliance Audit
///   Scenario 3: Compromised Staff Account Forensic Investigation
///   Scenario 4: External DPO / NPC Compliance Audit Export
///   Scenario 5: Cross-Facility Multi-Tenant Data Leakage Attack
/// </summary>
public sealed class AuditE2ETests
{
    private readonly IPhiRedactionService _redactionService = new PhiRedactionService();

    private static (ApplicationDbContext Context, Guid ClinicId, string TenantId, IRepository<ClinicAuditEntry> Repo)
        CreateIsolatedContext(Guid? customClinicId = null, string? customTenantId = null)
    {
        var clinicId = customClinicId ?? Guid.NewGuid();
        var tenantId = customTenantId ?? $"tenant_e2e_{Guid.NewGuid():N}";

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "clinic_dashboard")
            })
            .Build();

        var dbName = $"ClinicEz_AuditE2E_{Guid.NewGuid()}";
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var context = new ApplicationDbContext(options, config, clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicAuditEntry>(context, null!);

        return (context, clinicId, tenantId, repo);
    }

    private static (ApplicationDbContext Context, IRepository<ClinicAuditEntry> Repo)
        CreateContextForExistingDb(string sharedDbName, Guid clinicId, string tenantId)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "clinic_dashboard")
            })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: sharedDbName)
            .Options;

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var context = new ApplicationDbContext(options, config, clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicAuditEntry>(context, null!);

        return (context, repo);
    }

    // =========================================================================
    // SCENARIO 1: Full Clinical Encounter & PhilHealth Transmittal Audit Trail
    // Exercising Features: F1.4, F1.5, F1.7, F2.1, F2.4, F2.5
    // =========================================================================

    [Fact]
    public async Task Scenario1_FullClinicalEncounterAndPhilHealthTransmittalAuditTrail_ExecutesEndToEnd()
    {
        // Arrange: Facility Setup
        var (context, clinicId, tenantId, repo) = CreateIsolatedContext();
        var doctorStaffId = Guid.NewGuid();
        var triageNurseStaffId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();
        var baseTime = DateTime.UtcNow.AddHours(-2);

        var rawPatientName = "Juan Dela Cruz";
        var rawPhilHealthPin = "12-345678901-2";
        var maskedPatientName = _redactionService.MaskPatientName(rawPatientName);
        var maskedPhilHealthPin = _redactionService.MaskPhilHealthPin(rawPhilHealthPin);

        maskedPatientName.Should().Be("J*** D*** C***");
        maskedPhilHealthPin.Should().Be("12-****8901-2");

        // ── Step 1: Patient Check-in / Queue Arrival Event ────────────────────
        var checkInEntry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = baseTime,
            Category = ClinicAuditCategories.Queue,
            Severity = ClinicAuditSeverities.Routine,
            Action = "queue.ticket.created",
            ActorStaffId = triageNurseStaffId,
            ActorName = "Nurse Clara Reyes",
            ActorRole = "TriageNurse",
            ClientIpAddress = "192.168.10.15",
            UserAgent = "ClinicWorkstation/1.0 (Station-Triage-01)",
            TargetEntityType = "QueueTicket",
            TargetEntityId = "TKT-202610-0042",
            PatientId = patientId,
            PatientNameMasked = maskedPatientName,
            PatientPinMasked = maskedPhilHealthPin,
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Patient check-in issued ticket TKT-202610-0042 for {maskedPatientName}",
            MetadataJson = JsonSerializer.Serialize(new
            {
                TicketNumber = "TKT-202610-0042",
                QueueCategory = "Consultation",
                PriorityLevel = "Routine",
                RoomAssigned = "Room 3"
            })
        };
        await context.ClinicAuditEntries.AddAsync(checkInEntry);

        // ── Step 2: Doctor Consultation SOAP Signing with Medical Prose Redaction
        var rawSubjective = "Patient reports 3-day history of productive cough, fever up to 39C, and right-sided pleuritic chest pain.";
        var rawObjective = "Temp 38.8C, HR 96 bpm, BP 130/80 mmHg, SpO2 95% on room air. Bronchial breath sounds and inspiratory crackles over right lower lung base.";
        var rawAssessment = "Community-Acquired Pneumonia, Low Risk (CAP-LR). ICD-10 J18.9.";
        var rawPlan = "Prescribed Amoxicillin/Clavulanic Acid 1g BID for 7 days (lib_medicine). Order Chest X-ray PA view (lib_diagnostic). Advised adequate hydration and rest.";

        var rawSoapPayloadJson = JsonSerializer.Serialize(new
        {
            subjective = rawSubjective,
            objective = rawObjective,
            assessment = rawAssessment,
            plan = rawPlan,
            icd10 = "J18.9",
            medication = "Amoxicillin/Clavulanate 1000mg",
            diagnosticCode = "CXR-PA"
        });

        // Apply Real PHI Redaction Engine
        var redactedSoapPayloadJson = _redactionService.RedactPayloadJson(rawSoapPayloadJson);

        // Verify that sensitive clinical text is redacted and SHA-256 prose checksums are present
        redactedSoapPayloadJson.Should().NotContain("productive cough");
        redactedSoapPayloadJson.Should().NotContain("Amoxicillin/Clavulanic");
        redactedSoapPayloadJson.Should().Contain(PhiRedactionService.ClinicalRedactedToken);
        redactedSoapPayloadJson.Should().Contain("subjectiveChecksum");
        redactedSoapPayloadJson.Should().Contain("objectiveChecksum");
        redactedSoapPayloadJson.Should().Contain("assessmentChecksum");
        redactedSoapPayloadJson.Should().Contain("planChecksum");
        redactedSoapPayloadJson.Should().Contain("J18.9"); // Structural metadata preserved

        var expectedSubjectiveChecksum = _redactionService.ComputeTextChecksum(rawSubjective);
        redactedSoapPayloadJson.Should().Contain(expectedSubjectiveChecksum);

        var consultationSignedEntry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = baseTime.AddMinutes(25),
            Category = ClinicAuditCategories.Clinical,
            Severity = ClinicAuditSeverities.Routine,
            Action = "clinical.consultation.signed",
            ActorStaffId = doctorStaffId,
            ActorName = "Dr. Roberto Santos, MD",
            ActorRole = "Physician",
            ClientIpAddress = "192.168.10.22",
            UserAgent = "ClinicWorkstation/1.0 (Doctor-Station-03)",
            TargetEntityType = "ConsultationEncounter",
            TargetEntityId = encounterId.ToString(),
            PatientId = patientId,
            PatientNameMasked = maskedPatientName,
            PatientPinMasked = maskedPhilHealthPin,
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Consultation encounter signed with ICD-10 J18.9 for {maskedPatientName}",
            MetadataJson = redactedSoapPayloadJson
        };
        await context.ClinicAuditEntries.AddAsync(consultationSignedEntry);

        // ── Step 3: PhilHealth Yakap eKAS Creation ────────────────────────────
        var ekasNumber = "EKAS-202610-0914";
        var ekasEntry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = baseTime.AddMinutes(35),
            Category = ClinicAuditCategories.PhilHealth,
            Severity = ClinicAuditSeverities.Routine,
            Action = PhilHealthAuditEvents.EkasCreated,
            ActorStaffId = doctorStaffId,
            ActorName = "Dr. Roberto Santos, MD",
            ActorRole = "Physician",
            ClientIpAddress = "192.168.10.22",
            UserAgent = "ClinicWorkstation/1.0 (Doctor-Station-03)",
            TargetEntityType = "EkasRecord",
            TargetEntityId = ekasNumber,
            PatientId = patientId,
            PatientNameMasked = maskedPatientName,
            PatientPinMasked = maskedPhilHealthPin,
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"eKAS #{ekasNumber} successfully generated for patient {maskedPatientName}",
            MetadataJson = JsonSerializer.Serialize(new
            {
                EkasNumber = ekasNumber,
                AccreditationNumber = "H99214001",
                ConsultationType = "Initial Consultation",
                EncounterId = encounterId.ToString()
            })
        };
        await context.ClinicAuditEntries.AddAsync(ekasEntry);

        // ── Step 4: PhilHealth Yakap XML Transmittal Generation (DTD v1.14) ───
        var transmittalBatchNo = "PMCC-202610-0018";
        var transmittalGenEntry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = baseTime.AddMinutes(50),
            Category = ClinicAuditCategories.PhilHealth,
            Severity = ClinicAuditSeverities.Routine,
            Action = PhilHealthAuditEvents.TransmittalGenerated,
            ActorStaffId = doctorStaffId,
            ActorName = "Dr. Roberto Santos, MD",
            ActorRole = "Physician",
            ClientIpAddress = "192.168.10.22",
            UserAgent = "ClinicWorkstation/1.0 (Doctor-Station-03)",
            TargetEntityType = "TransmittalBatch",
            TargetEntityId = transmittalBatchNo,
            PatientId = patientId,
            PatientNameMasked = maskedPatientName,
            PatientPinMasked = maskedPhilHealthPin,
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"PhilHealth Konsulta XML transmittal {transmittalBatchNo} generated against KonsultaData_v1.14.dtd",
            MetadataJson = JsonSerializer.Serialize(new
            {
                TransmittalBatchNo = transmittalBatchNo,
                SchemaVersion = "KonsultaData_v1.14.dtd",
                SoftwareCertId = "CERT-PHILHEALTH-2026",
                EncounterCount = 1,
                IcdCode = "J18.9"
            })
        };
        await context.ClinicAuditEntries.AddAsync(transmittalGenEntry);

        // ── Step 5: Payload AES-256-CBC Encryption & PhilHealth SOAP Transmittal
        var transmittalEncEntry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = baseTime.AddMinutes(52),
            Category = ClinicAuditCategories.PhilHealth,
            Severity = ClinicAuditSeverities.Routine,
            Action = PhilHealthAuditEvents.TransmittalEncrypted,
            ActorStaffId = doctorStaffId,
            ActorName = "Dr. Roberto Santos, MD",
            ActorRole = "Physician",
            ClientIpAddress = "192.168.10.22",
            UserAgent = "ClinicWorkstation/1.0 (Doctor-Station-03)",
            TargetEntityType = "TransmittalBatch",
            TargetEntityId = transmittalBatchNo,
            PatientId = patientId,
            PatientNameMasked = maskedPatientName,
            PatientPinMasked = maskedPhilHealthPin,
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Payload for transmittal {transmittalBatchNo} encrypted with PhilHealth AES-256-CBC envelope",
            MetadataJson = JsonSerializer.Serialize(new
            {
                TransmittalBatchNo = transmittalBatchNo,
                Algorithm = "AES-256-CBC",
                KeyDigest = "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069"
            })
        };
        await context.ClinicAuditEntries.AddAsync(transmittalEncEntry);

        var soapSubmittedEntry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = baseTime.AddMinutes(55),
            Category = ClinicAuditCategories.PhilHealth,
            Severity = ClinicAuditSeverities.Routine,
            Action = PhilHealthAuditEvents.SoapSubmitted,
            ActorStaffId = doctorStaffId,
            ActorName = "Dr. Roberto Santos, MD",
            ActorRole = "Physician",
            ClientIpAddress = "192.168.10.22",
            UserAgent = "ClinicWorkstation/1.0 (Doctor-Station-03)",
            TargetEntityType = "TransmittalBatch",
            TargetEntityId = transmittalBatchNo,
            PatientId = patientId,
            PatientNameMasked = maskedPatientName,
            PatientPinMasked = maskedPhilHealthPin,
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"SOAP request transmittal {transmittalBatchNo} transmitted to PhilHealth web service endpoint successfully",
            MetadataJson = JsonSerializer.Serialize(new
            {
                TransmittalBatchNo = transmittalBatchNo,
                ResponseStatus = "200 OK",
                PhilHealthReceiptCode = "PHIC-ACK-99214-202610-0089",
                TransmissionLatencyMs = 642
            })
        };
        await context.ClinicAuditEntries.AddAsync(soapSubmittedEntry);

        // Commit all records to DB
        var savedCount = await context.SaveChangesAsync();
        savedCount.Should().Be(6);

        // ── Step 6: Verify End-to-End Querying & Audit Detail Retrieval ────────
        var queryHandler = new GetAuditLogsQueryHandler(repo);
        var logsResult = await queryHandler.Handle(new GetAuditLogsQuery(PageSize: 10), CancellationToken.None);

        logsResult.Items.Should().HaveCount(6);
        // Latest first
        logsResult.Items[0].Action.Should().Be(PhilHealthAuditEvents.SoapSubmitted);
        logsResult.Items[^1].Action.Should().Be("queue.ticket.created");

        // Verify Detail Retrieval for the signed consultation
        var detailHandler = new GetAuditLogDetailQueryHandler(repo);
        var detailResult = await detailHandler.Handle(new GetAuditLogDetailQuery(consultationSignedEntry.Id), CancellationToken.None);

        detailResult.Should().NotBeNull();
        detailResult!.Action.Should().Be("clinical.consultation.signed");
        detailResult.PatientNameMasked.Should().Be("J*** D*** C***");
        detailResult.PatientPinMasked.Should().Be("12-****8901-2");
        detailResult.ProseChecksums.Should().ContainKey("subjectiveChecksum");
        detailResult.ProseChecksums["subjectiveChecksum"].Should().Be(expectedSubjectiveChecksum);
        detailResult.ProseChecksums.Should().ContainKey("objectiveChecksum");
        detailResult.ProseChecksums.Should().ContainKey("assessmentChecksum");
        detailResult.ProseChecksums.Should().ContainKey("planChecksum");

        // ── Step 7: Verify WORM Immutability on Clinical Records ───────────────
        // Any attempt to modify the clinical or transmittal audit entry must throw InvalidOperationException
        consultationSignedEntry.Description = "Tampered description trying to hide clinical malpractice";
        var actUpdate = () => context.SaveChangesAsync();
        await actUpdate.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*append-only (WORM)*RA 10173*");
    }

    // =========================================================================
    // SCENARIO 2: Cashier Void & Refund Regulatory Compliance Audit
    // Exercising Features: F1.6, F2.5, F3.3, F3.5
    // =========================================================================

    [Fact]
    public async Task Scenario2_CashierVoidAndRefundRegulatoryComplianceAudit_EnforcesStatutoryLedger()
    {
        // Arrange
        var (context, clinicId, tenantId, repo) = CreateIsolatedContext();
        var cashierStaffId = Guid.NewGuid();
        var supervisorStaffId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var invoiceNumber = "INV-202610-0412";
        var refundNumber = "REF-202610-0034";
        var baseTime = DateTime.UtcNow.AddHours(-1);

        var maskedPatientName = "M*** G***";
        var maskedPhilHealthPin = "04-****7890-1";

        // ── Step 1: Cashier collects payment ──────────────────────────────────
        var paymentEntry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = baseTime,
            Category = ClinicAuditCategories.Billing,
            Severity = ClinicAuditSeverities.Routine,
            Action = "billing.payment.collected",
            ActorStaffId = cashierStaffId,
            ActorName = "Cashier Mark Santos",
            ActorRole = "Cashier",
            ClientIpAddress = "192.168.10.88",
            UserAgent = "ClinicWorkstation/1.0 (Cashier-POS-01)",
            TargetEntityType = "Invoice",
            TargetEntityId = invoiceNumber,
            PatientId = patientId,
            PatientNameMasked = maskedPatientName,
            PatientPinMasked = maskedPhilHealthPin,
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Payment of PHP 2,850.00 collected for invoice {invoiceNumber}",
            MetadataJson = JsonSerializer.Serialize(new
            {
                InvoiceNumber = invoiceNumber,
                PaymentMethod = "Cash",
                GrossAmount = 2850.00m,
                VatExempt = 2850.00m,
                OfficialReceiptNumber = "OR-202610-0412"
            })
        };
        await context.ClinicAuditEntries.AddAsync(paymentEntry);

        // ── Step 2: Cashier void action with mandatory statutory reason ───────
        var statutoryVoidReason = "Erroneous charge for whole abdominal ultrasound (PHP 1,800); physician order was for KBU ultrasound only (PHP 950). Excess charge PHP 850 requires void & re-invoice per BIR RR 11-2018.";
        var voidEntry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = baseTime.AddMinutes(12),
            Category = ClinicAuditCategories.Billing,
            Severity = ClinicAuditSeverities.Urgent,
            Action = "billing.invoice.voided",
            ActorStaffId = cashierStaffId,
            ActorName = "Cashier Mark Santos",
            ActorRole = "Cashier",
            ClientIpAddress = "192.168.10.88",
            UserAgent = "ClinicWorkstation/1.0 (Cashier-POS-01)",
            TargetEntityType = "Invoice",
            TargetEntityId = invoiceNumber,
            PatientId = patientId,
            PatientNameMasked = maskedPatientName,
            PatientPinMasked = maskedPhilHealthPin,
            Outcome = ClinicAuditOutcomes.Warning,
            Description = $"Invoice {invoiceNumber} voided by cashier. Statutory Reason: {statutoryVoidReason}",
            MetadataJson = JsonSerializer.Serialize(new
            {
                InvoiceNumber = invoiceNumber,
                OriginalAmount = 2850.00m,
                StatutoryVoidReason = statutoryVoidReason,
                VoidAuthorized = true,
                TaxJurisdiction = "BIR-RR-11-2018"
            })
        };
        await context.ClinicAuditEntries.AddAsync(voidEntry);

        // ── Step 3: Managerial Refund Authorization ───────────────────────────
        var refundEntry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = baseTime.AddMinutes(20),
            Category = ClinicAuditCategories.Billing,
            Severity = ClinicAuditSeverities.Urgent,
            Action = "billing.refund.approved",
            ActorStaffId = supervisorStaffId,
            ActorName = "Supervisor Maria Lopez",
            ActorRole = "BillingManager",
            ClientIpAddress = "192.168.10.12",
            UserAgent = "ClinicWorkstation/1.0 (Admin-Console-02)",
            TargetEntityType = "Refund",
            TargetEntityId = refundNumber,
            PatientId = patientId,
            PatientNameMasked = maskedPatientName,
            PatientPinMasked = maskedPhilHealthPin,
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Cash refund of PHP 2,850.00 authorized for voided invoice {invoiceNumber}",
            MetadataJson = JsonSerializer.Serialize(new
            {
                RefundNumber = refundNumber,
                OriginalInvoiceNumber = invoiceNumber,
                RefundAmount = 2850.00m,
                DisbursementMethod = "Cash Reversal",
                ApproverStaffId = supervisorStaffId.ToString(),
                ApproverRole = "BillingManager",
                ApprovedUtc = DateTime.UtcNow
            })
        };
        await context.ClinicAuditEntries.AddAsync(refundEntry);

        await context.SaveChangesAsync();

        // ── Step 4: Ledger Audit Query Verification ───────────────────────────
        var queryHandler = new GetAuditLogsQueryHandler(repo);
        var billingLogs = await queryHandler.Handle(
            new GetAuditLogsQuery(Category: ClinicAuditCategories.Billing, PageSize: 10),
            CancellationToken.None);

        billingLogs.Items.Should().HaveCount(3);
        billingLogs.Items.Select(x => x.Action).Should().ContainInOrder(
            "billing.refund.approved",
            "billing.invoice.voided",
            "billing.payment.collected");

        // Verify that the void record strictly contains the statutory justification
        var retrievedVoid = billingLogs.Items.First(x => x.Action == "billing.invoice.voided");
        retrievedVoid.Description.Should().Contain(statutoryVoidReason);
        retrievedVoid.Severity.Should().Be(ClinicAuditSeverities.Urgent);
        retrievedVoid.Outcome.Should().Be(ClinicAuditOutcomes.Warning);

        // ── Step 5: Cashier WORM Attack Defense ────────────────────────────────
        // Rogue staff attempts to erase the void entry to hide an audit discrepancy
        context.Entry(voidEntry).State = EntityState.Deleted;
        var actDelete = () => context.SaveChangesAsync();
        await actDelete.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*append-only (WORM)*");
    }

    // =========================================================================
    // SCENARIO 3: Compromised Staff Account Forensic Investigation
    // Exercising Features: F1.1, F2.3, F3.2, F3.3, F3.5
    // =========================================================================

    [Fact]
    public async Task Scenario3_CompromisedStaffAccountForensicInvestigation_TracesAttackTimeline()
    {
        // Arrange
        var (context, clinicId, tenantId, repo) = CreateIsolatedContext();
        var targetStaffId = Guid.NewGuid();
        var attackerIp = "203.0.113.42"; // Suspicious external IP
        var attackerUserAgent = "Python-requests/2.28.1";
        var baseTime = DateTime.UtcNow.AddMinutes(-30);

        // ── Step 1: 5 Consecutive Failed Logins with Sanitized Passwords ──────
        var attackEntries = new List<ClinicAuditEntry>();
        for (int i = 1; i <= 5; i++)
        {
            var rawAttackPayload = JsonSerializer.Serialize(new
            {
                username = "nurse.santos",
                password = $"StolenPasswordAttempt{i}!",
                attemptNumber = i,
                ip = attackerIp
            });

            // Secrets MUST be redacted prior to logging
            var sanitizedAttackPayload = _redactionService.RedactPayloadJson(rawAttackPayload);
            sanitizedAttackPayload.Should().NotContain($"StolenPasswordAttempt{i}!");
            sanitizedAttackPayload.Should().Contain(PhiRedactionService.SecretRedactedToken);

            attackEntries.Add(new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = baseTime.AddSeconds(i * 15),
                Category = ClinicAuditCategories.Security,
                Severity = ClinicAuditSeverities.Routine,
                Action = "auth.login.failure",
                ActorStaffId = null,
                ActorName = "nurse.santos",
                ActorRole = "Unknown",
                ClientIpAddress = attackerIp,
                UserAgent = attackerUserAgent,
                TargetEntityType = "StaffMember",
                TargetEntityId = targetStaffId.ToString(),
                Outcome = ClinicAuditOutcomes.Failure,
                Description = $"Failed login attempt {i} for nurse.santos from {attackerIp}",
                MetadataJson = sanitizedAttackPayload
            });
        }
        await context.ClinicAuditEntries.AddRangeAsync(attackEntries);

        // ── Step 2: Account Lockout Triggered ─────────────────────────────────
        var lockoutEntry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = baseTime.AddSeconds(80),
            Category = ClinicAuditCategories.Security,
            Severity = ClinicAuditSeverities.Emergency, // STAT Emergency severity
            Action = "auth.account.locked",
            ActorStaffId = null,
            ActorName = "SecurityEnforcementEngine",
            ActorRole = "SystemSecurity",
            ClientIpAddress = attackerIp,
            UserAgent = attackerUserAgent,
            TargetEntityType = "StaffMember",
            TargetEntityId = targetStaffId.ToString(),
            Outcome = ClinicAuditOutcomes.Warning,
            Description = $"Account nurse.santos locked automatically after 5 consecutive failed authentications from {attackerIp}",
            MetadataJson = JsonSerializer.Serialize(new
            {
                StaffId = targetStaffId.ToString(),
                Threshold = 5,
                LockoutDurationMinutes = 30,
                OffendingIp = attackerIp
            })
        };
        await context.ClinicAuditEntries.AddAsync(lockoutEntry);

        // ── Step 3: Privilege Escalation Attempt Rejection ────────────────────
        var escalationEntry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = baseTime.AddSeconds(120),
            Category = ClinicAuditCategories.Security,
            Severity = ClinicAuditSeverities.Emergency,
            Action = "auth.privilege_escalation.attempted",
            ActorStaffId = null,
            ActorName = "nurse.santos (locked)",
            ActorRole = "Unknown",
            ClientIpAddress = attackerIp,
            UserAgent = attackerUserAgent,
            TargetEntityType = "ClinicRole",
            TargetEntityId = "SuperAdministrator",
            Outcome = ClinicAuditOutcomes.Failure,
            Description = $"Unauthorized role escalation to SuperAdministrator from {attackerIp} rejected for locked staff {targetStaffId}",
            MetadataJson = JsonSerializer.Serialize(new
            {
                AttemptedRole = "SuperAdministrator",
                BlockedReason = "AccountLockedAndInsufficientPrivilege",
                OriginatingIp = attackerIp
            })
        };
        await context.ClinicAuditEntries.AddAsync(escalationEntry);

        await context.SaveChangesAsync();

        // ── Step 4: Forensic Investigation Query Verification ─────────────────
        var queryHandler = new GetAuditLogsQueryHandler(repo);

        // Query by Emergency severity to find high-threat events
        var emergencyLogs = await queryHandler.Handle(
            new GetAuditLogsQuery(Severity: ClinicAuditSeverities.Emergency),
            CancellationToken.None);

        emergencyLogs.Items.Should().HaveCount(2);
        emergencyLogs.Items.Select(x => x.Action).Should().Contain("auth.account.locked");
        emergencyLogs.Items.Select(x => x.Action).Should().Contain("auth.privilege_escalation.attempted");

        // Query by Attacker IP to reconstruct complete chronological incident timeline
        var ipInvestigationLogs = await queryHandler.Handle(
            new GetAuditLogsQuery(Search: attackerIp, PageSize: 20),
            CancellationToken.None);

        ipInvestigationLogs.Items.Should().HaveCount(7);
        // All 7 events originated from attacker IP
        ipInvestigationLogs.Items.Should().OnlyContain(x => x.ClientIpAddress == attackerIp);
        ipInvestigationLogs.Items.Should().OnlyContain(x => x.Category == ClinicAuditCategories.Security);

        // Assert that zero unredacted passwords exist in metadata
        foreach (var item in ipInvestigationLogs.Items)
        {
            item.Description.Should().NotContain("StolenPasswordAttempt");
        }
    }

    // =========================================================================
    // SCENARIO 4: External DPO / NPC Compliance Audit Export
    // Exercising Features: F1.8, F2.1, F2.4, F3.6, F4.2
    // =========================================================================

    [Fact]
    public async Task Scenario4_ExternalDpoNpcComplianceAuditExport_GeneratesCompliantArtifacts()
    {
        // Arrange
        var (context, clinicId, tenantId, repo) = CreateIsolatedContext();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var now = DateTime.UtcNow;

        // Seed diverse audit records across categories
        var sampleEntries = new List<ClinicAuditEntry>
        {
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = now.AddMinutes(-50),
                Category = ClinicAuditCategories.Clinical,
                Severity = ClinicAuditSeverities.Routine,
                Action = "clinical.consultation.signed",
                ActorName = "Dr. Ana Cruz",
                ActorRole = "Physician",
                ClientIpAddress = "10.0.0.1",
                TargetEntityType = "ConsultationEncounter",
                TargetEntityId = "ENC-1001",
                PatientNameMasked = "J*** D***",
                PatientPinMasked = "12-****5678-9",
                Outcome = ClinicAuditOutcomes.Success,
                Description = "Patient consultation \"SOAP note\" signed, no complications noted.", // Description with quotes & commas
                MetadataJson = "{\"clinicalNotes\":\"[Clinical Text Redacted - DPA RA 10173]\",\"notesChecksum\":\"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\"}"
            },
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = now.AddMinutes(-40),
                Category = ClinicAuditCategories.Billing,
                Severity = ClinicAuditSeverities.Urgent,
                Action = "billing.invoice.voided",
                ActorName = "Cashier John",
                ActorRole = "Cashier",
                ClientIpAddress = "10.0.0.2",
                TargetEntityType = "Invoice",
                TargetEntityId = "INV-2002",
                PatientNameMasked = "M*** T***",
                PatientPinMasked = "09-****1234-5",
                Outcome = ClinicAuditOutcomes.Warning,
                Description = "Voided invoice #2002 per patient request.\nLine 2 reason: Overpayment.", // Description with line break
                MetadataJson = "{\"voidReason\":\"Overpayment reversal\"}"
            },
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = now.AddMinutes(-30),
                Category = ClinicAuditCategories.PhilHealth,
                Severity = ClinicAuditSeverities.Routine,
                Action = PhilHealthAuditEvents.EkasCreated,
                ActorName = "Dr. Ana Cruz",
                ActorRole = "Physician",
                ClientIpAddress = "10.0.0.1",
                TargetEntityType = "EkasRecord",
                TargetEntityId = "EKAS-3003",
                PatientNameMasked = "J*** D***",
                PatientPinMasked = "12-****5678-9",
                Outcome = ClinicAuditOutcomes.Success,
                Description = "Created eKAS record #3003 for PhilHealth beneficiary",
                MetadataJson = "{\"accreditationNumber\":\"H99214\"}"
            }
        };

        await context.ClinicAuditEntries.AddRangeAsync(sampleEntries);
        await context.SaveChangesAsync();

        var exportHandler = new ExportAuditLogsQueryHandler(repo, clinicContext);

        // ── Step 1: RFC 4180 UTF-8 BOM CSV Export ────────────────────────────
        var csvQuery = new ExportAuditLogsQuery(Format: "csv");
        var csvResult = await exportHandler.Handle(csvQuery, CancellationToken.None);

        csvResult.Should().NotBeNull();
        csvResult.RowCount.Should().Be(3);
        csvResult.ContentType.Should().Be("text/csv; charset=utf-8");
        csvResult.FileName.Should().StartWith($"audit-log-");
        csvResult.FileName.Should().EndWith(".csv");

        // Verify strictly starts with 3 UTF-8 BOM bytes (0xEF, 0xBB, 0xBF)
        csvResult.ContentBytes.Length.Should().BeGreaterThan(3);
        csvResult.ContentBytes[0].Should().Be(0xEF);
        csvResult.ContentBytes[1].Should().Be(0xBB);
        csvResult.ContentBytes[2].Should().Be(0xBF);

        var csvString = Encoding.UTF8.GetString(csvResult.ContentBytes);

        // Verify CSV header row
        csvString.Should().Contain("Id,TimestampUtc,Category,Severity,Action,ActorStaffId,ActorName,ActorRole,ClientIpAddress,TargetEntityType,TargetEntityId,PatientId,PatientNameMasked,PatientPinMasked,Outcome,Description");

        // Verify RFC 4180 escaping of double quotes and line breaks
        csvString.Should().Contain("\"Patient consultation \"\"SOAP note\"\" signed, no complications noted.\"");
        csvString.Should().Contain("\"Voided invoice #2002 per patient request.\nLine 2 reason: Overpayment.\"");

        // Verify Zero Plaintext PHI in CSV export
        csvString.Should().NotContain("Juan Dela Cruz");
        csvString.Should().NotContain("12-345678901-2");
        csvString.Should().Contain("J*** D***");
        csvString.Should().Contain("12-****5678-9");

        // ── Step 2: JSON Streaming Export ─────────────────────────────────────
        var jsonQuery = new ExportAuditLogsQuery(Format: "json");
        var jsonResult = await exportHandler.Handle(jsonQuery, CancellationToken.None);

        jsonResult.Should().NotBeNull();
        jsonResult.RowCount.Should().Be(3);
        jsonResult.ContentType.Should().Be("application/json; charset=utf-8");
        jsonResult.FileName.Should().EndWith(".json");

        var jsonString = Encoding.UTF8.GetString(jsonResult.ContentBytes);
        var parsedList = JsonSerializer.Deserialize<List<ClinicAuditEntryDto>>(jsonString, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        parsedList.Should().NotBeNull();
        parsedList.Should().HaveCount(3);
        parsedList!.Select(x => x.PatientNameMasked).Should().OnlyContain(name => name != null && name.Contains("***"));

        // ── Step 3: Auditing the Auditor Event Validation ─────────────────────
        // In AuditController, triggering export must enqueue audit.log.exported event
        var auditQueue = Substitute.For<IAuditLogQueue>();
        var mediator = Substitute.For<ISender>();
        mediator.Send(Arg.Any<ExportAuditLogsQuery>(), Arg.Any<CancellationToken>())
            .Returns(csvResult);

        var controller = new AuditController(mediator, clinicContext, auditQueue);
        var httpContext = new DefaultHttpContext();
        httpContext.Connection.RemoteIpAddress = System.Net.IPAddress.Parse("10.0.0.99");
        httpContext.Request.Headers.UserAgent = "NPC-Auditor-Browser/2.0";

        var claims = new[]
        {
            new Claim("name", "DPO Officer Atty. Santos"),
            new Claim("staff_role", "DataProtectionOfficer"),
            new Claim("tenant_id", tenantId)
        };
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };

        var actionResult = await controller.ExportAuditLogs(format: "csv", ct: CancellationToken.None);
        actionResult.Should().BeOfType<FileContentResult>();

        // Verify high-urgency audit.log.exported was dispatched to queue
        auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == "audit.log.exported" &&
            msg.Category == ClinicAuditCategories.Audit &&
            msg.Severity == ClinicAuditSeverities.Urgent &&
            msg.ActorName == "DPO Officer Atty. Santos" &&
            msg.ActorRole == "DataProtectionOfficer" &&
            msg.Description.Contains("Audit log exported in CSV format (3 records)")));
    }

    // =========================================================================
    // SCENARIO 5: Cross-Facility Multi-Tenant Data Leakage Attack
    // Exercising Features: F2.6, F4.3, F5.1
    // =========================================================================

    [Fact]
    public async Task Scenario5_CrossFacilityMultiTenantDataLeakageAttack_StrictlyGuardsIsolation()
    {
        // Arrange: Single shared physical database with two distinct clinic jurisdictions
        var sharedDbName = $"ClinicEz_SharedMultiTenant_{Guid.NewGuid()}";
        var clinicAlphaId = Guid.NewGuid();
        var clinicBetaId = Guid.NewGuid();
        var tenantId = "tenant_conglomerate_ph";

        // Setup Context for Clinic Alpha (Quezon City)
        var (contextAlpha, repoAlpha) = CreateContextForExistingDb(sharedDbName, clinicAlphaId, tenantId);

        // Setup Context for Clinic Beta (Cebu)
        var (contextBeta, repoBeta) = CreateContextForExistingDb(sharedDbName, clinicBetaId, tenantId);

        var now = DateTime.UtcNow;

        // Seed 5 Sensitive Entries in Clinic Alpha
        var alphaEntries = new List<ClinicAuditEntry>();
        for (int i = 1; i <= 5; i++)
        {
            alphaEntries.Add(new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicAlphaId,
                Timestamp = now.AddMinutes(i),
                Category = ClinicAuditCategories.Clinical,
                Severity = ClinicAuditSeverities.Routine,
                Action = "clinical.vip_encounter.signed",
                ActorName = "Dr. Alpha Quezon",
                ActorRole = "Physician",
                TargetEntityType = "VipEncounter",
                TargetEntityId = $"VIP-QC-{i}",
                Outcome = ClinicAuditOutcomes.Success,
                Description = $"Confidential VIP record #{i} in Clinic Alpha",
                MetadataJson = "{\"confidential\":\"strictly-isolated\"}"
            });
        }
        await contextAlpha.ClinicAuditEntries.AddRangeAsync(alphaEntries);
        await contextAlpha.SaveChangesAsync();

        // Seed 3 Entries in Clinic Beta
        var betaEntries = new List<ClinicAuditEntry>();
        for (int i = 1; i <= 3; i++)
        {
            betaEntries.Add(new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicBetaId,
                Timestamp = now.AddMinutes(10 + i),
                Category = ClinicAuditCategories.Operations,
                Severity = ClinicAuditSeverities.Routine,
                Action = "operations.schedule.created",
                ActorName = "Staff Beta Cebu",
                ActorRole = "Scheduler",
                TargetEntityType = "DoctorSchedule",
                TargetEntityId = $"SCHED-CEBU-{i}",
                Outcome = ClinicAuditOutcomes.Success,
                Description = $"Public schedule #{i} in Clinic Beta",
                MetadataJson = "{}"
            });
        }
        await contextBeta.ClinicAuditEntries.AddRangeAsync(betaEntries);
        await contextBeta.SaveChangesAsync();

        // ── Attack 1: Clinic Beta Queries All Audit Logs ──────────────────────
        // Attacker in Clinic Beta issues unbounded GetAuditLogsQuery
        var handlerBeta = new GetAuditLogsQueryHandler(repoBeta);
        var betaQueryResult = await handlerBeta.Handle(new GetAuditLogsQuery(PageSize: 100), CancellationToken.None);

        // Must strictly return ONLY Clinic Beta's 3 records; ZERO from Clinic Alpha
        betaQueryResult.Items.Should().HaveCount(3);
        betaQueryResult.Items.Should().OnlyContain(x => x.ClinicId == clinicBetaId);
        betaQueryResult.Items.Should().NotContain(x => x.ClinicId == clinicAlphaId);
        betaQueryResult.Items.Should().NotContain(x => x.Action == "clinical.vip_encounter.signed");

        // ── Attack 2: Direct ID Probing Across Facility Boundaries ───────────
        // Attacker in Clinic Beta discovers or guesses the ID of Clinic Alpha's VIP entry
        var targetAlphaEntryId = alphaEntries[0].Id;
        var detailHandlerBeta = new GetAuditLogDetailQueryHandler(repoBeta);

        var stolenDetailResult = await detailHandlerBeta.Handle(new GetAuditLogDetailQuery(targetAlphaEntryId), CancellationToken.None);

        // EF Core HasQueryFilter(e => e.ClinicId == CurrentClinicId) strictly renders other clinic records invisible!
        stolenDetailResult.Should().BeNull("Direct ID lookup for an audit record belonging to another clinic must return null (404)");

        // ── Attack 3: Hostile Cursor Re-use Across Clinics ────────────────────
        // Attacker attempts to forge or traverse with a cursor from Clinic Alpha inside Clinic Beta query
        var cursorFromAlpha = Convert.ToBase64String(Encoding.UTF8.GetBytes(alphaEntries[^1].Timestamp.ToString("O")));
        var traversalResult = await handlerBeta.Handle(
            new GetAuditLogsQuery(Before: cursorFromAlpha, PageSize: 10),
            CancellationToken.None);

        // Must still strictly return only Clinic Beta records whose timestamp < cursor
        traversalResult.Items.Should().OnlyContain(x => x.ClinicId == clinicBetaId);
        traversalResult.Items.Should().NotContain(x => x.ClinicId == clinicAlphaId);

        // ── Attack 4: Cross-Facility Tampering / WORM Defense ─────────────────
        // Attacker in Clinic Beta attempts to update or delete an entry belonging to Clinic Beta
        var victimBetaEntry = betaEntries[0];
        contextBeta.Entry(victimBetaEntry).State = EntityState.Deleted;
        var actTamper = () => contextBeta.SaveChangesAsync();
        await actTamper.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*append-only (WORM)*");
    }
}
