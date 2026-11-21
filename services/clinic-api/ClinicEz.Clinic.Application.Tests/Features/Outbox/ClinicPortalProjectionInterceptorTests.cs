using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Interceptors;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Documents.Security;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Outbox;

public class ClinicPortalProjectionInterceptorTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-proj-test";
    private readonly IClinicContext _clinicContext;
    private readonly IDocumentSecurityService _securityService = new DocumentSecurityService();

    public ClinicPortalProjectionInterceptorTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    private ApplicationDbContext CreateContextWithInterceptor()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "public")
            })
            .Build();

        var interceptor = new ClinicPortalProjectionInterceptor(_securityService);

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"ClinicEz_ProjectionDb_{Guid.NewGuid()}")
            .AddInterceptors(interceptor)
            .Options;

        return new ApplicationDbContext(options, config, _clinicContext);
    }

    [Fact]
    public async Task AddFacilitySettings_Stages_FacilityJoinSettingsUpdated_With_4Char_Discriminator()
    {
        await using var db = CreateContextWithInterceptor();

        var settings = new FacilitySettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "St. Jude Clinic",
            IsJoinEnabled = true,
            JoinCode = "JOIN123",
            LetterheadAddress = "123 Main St, Manila",
            OperatingHours = "8am - 5pm"
        };

        db.Settings.Add(settings);
        await db.SaveChangesAsync();

        var expectedDisc = _clinicId.ToString("N")[..4].ToUpperInvariant();
        settings.JoinCode.Should().Be($"{expectedDisc}-JOIN123");

        var outbox = await db.InteropOutbox.ToListAsync();
        var joinMsg = outbox.FirstOrDefault(m => m.Type == InteropTypes.FacilityJoinSettingsUpdated);
        joinMsg.Should().NotBeNull();
        joinMsg!.CorrelationId.Should().Be(_clinicId);

        var envelope = InteropEnvelope.FromJson(joinMsg.EnvelopeJson);
        var payload = envelope.GetPayload<FacilityJoinSettingsUpdatedPayload>();
        payload.FacilityId.Should().Be(_clinicId);
        payload.JoinCode.Should().Be($"{expectedDisc}-JOIN123");
        payload.FacilityAddress.Should().Be("123 Main St, Manila");
    }

    [Fact]
    public async Task QueueItem_Mutations_Stages_QueueBoardUpdated_ZeroPhi_ManilaDay()
    {
        await using var db = CreateContextWithInterceptor();

        var tz = ClinicTimeZoneResolver.ResolveTimeZone("Asia/Manila");
        var todayManila = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));

        var settings = new FacilitySettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "St. Jude Clinic",
            IsJoinEnabled = true
        };
        db.Settings.Add(settings);

        var queueItem1 = new QueueItem
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = todayManila,
            PatientId = Guid.NewGuid(),
            PatientName = "Secret Patient John",
            Status = QueueStatus.InConsultation,
            CalledTime = DateTime.UtcNow,
            DoctorName = "Dr. Jose Rizal",
            RoomOrStation = "Room 101"
        };

        var queueItem2 = new QueueItem
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-002",
            SequenceNumber = 2,
            QueueDate = todayManila,
            PatientId = Guid.NewGuid(),
            PatientName = "Secret Patient Jane",
            Status = QueueStatus.Waiting,
            Priority = QueuePriority.Routine
        };

        db.QueueItems.AddRange(queueItem1, queueItem2);
        await db.SaveChangesAsync();

        var outbox = await db.InteropOutbox.ToListAsync();
        var queueMsg = outbox.FirstOrDefault(m => m.Type == InteropTypes.QueueBoardUpdated);
        queueMsg.Should().NotBeNull();

        var envelope = InteropEnvelope.FromJson(queueMsg!.EnvelopeJson);
        var payload = envelope.GetPayload<QueueBoardUpdatedPayload>();
        payload.FacilityId.Should().Be(_clinicId);
        payload.QueueDate.Should().Be(todayManila);
        payload.NowServing.Should().HaveCount(1);
        payload.NowServing[0].TicketNumber.Should().Be("Q-001");
        payload.NowServing[0].DoctorName.Should().Be("Dr. Jose Rizal");

        payload.UpNext.Should().HaveCount(1);
        payload.UpNext[0].TicketNumber.Should().Be("Q-002");
        payload.UpNext[0].DisplayName.Should().BeNull("Zero PHI must be strictly enforced on public queue board");
    }

    [Fact]
    public async Task Signed_MedicalCertificate_Stages_DocumentAttestationPublished_With_Valid_SecurityDigest()
    {
        await using var db = CreateContextWithInterceptor();

        var settings = new FacilitySettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "St. Jude Clinic"
        };
        db.Settings.Add(settings);

        var cert = new MedicalCertificate
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CertificateNumber = "MC-20261025-0001",
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Test",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Test",
            PrcLicenseNumber = "PRC-12345",
            Diagnosis = "Acute Bronchitis",
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };

        db.MedicalCertificates.Add(cert);
        await db.SaveChangesAsync();

        var outbox = await db.InteropOutbox.ToListAsync();
        var attestationMsg = outbox.FirstOrDefault(m => m.Type == InteropTypes.DocumentAttestationPublished && m.CorrelationId == cert.Id);
        attestationMsg.Should().NotBeNull();

        var envelope = InteropEnvelope.FromJson(attestationMsg!.EnvelopeJson);
        var payload = envelope.GetPayload<DocumentAttestationPublishedPayload>();
        payload.DocumentKind.Should().Be("medical-certificate");
        payload.DocumentNumber.Should().Be("MC-20261025-0001");
        payload.SecurityDigest.Should().StartWith("SEC-SHA256-");
        payload.Status.Should().Be("VALID");
        payload.ClinicName.Should().Be("St. Jude Clinic");
    }

    [Fact]
    public async Task Signed_ReferralLetter_Stages_DocumentAttestationPublished()
    {
        await using var db = CreateContextWithInterceptor();

        var settings = new FacilitySettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "St. Jude Clinic"
        };
        db.Settings.Add(settings);

        var referral = new ReferralLetter
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ReferralNumber = "REF-20261025-0001",
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Referral",
            ReferringDoctorId = Guid.NewGuid(),
            ReferringDoctorName = "Dr. Referrer",
            ReferredToFacility = "General Hospital",
            ReferredDepartment = "Cardiology",
            ReasonForReferral = "Chest Pain",
            ProvisionalDiagnosis = "Angina",
            ClinicalSummary = "Summary details",
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };

        db.ReferralLetters.Add(referral);
        await db.SaveChangesAsync();

        var outbox = await db.InteropOutbox.ToListAsync();
        var attestationMsg = outbox.FirstOrDefault(m => m.Type == InteropTypes.DocumentAttestationPublished && m.CorrelationId == referral.Id);
        attestationMsg.Should().NotBeNull();

        var envelope = InteropEnvelope.FromJson(attestationMsg!.EnvelopeJson);
        var payload = envelope.GetPayload<DocumentAttestationPublishedPayload>();
        payload.DocumentKind.Should().Be("referral");
        payload.DocumentNumber.Should().Be("REF-20261025-0001");
        payload.SecurityDigest.Should().StartWith("SEC-SHA256-");
        payload.Status.Should().Be("VALID");
    }

    [Fact]
    public async Task Signed_ConsultationEncounter_With_Rx_Mints_Token_And_Stages_Attestation()
    {
        await using var db = CreateContextWithInterceptor();

        var settings = new FacilitySettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "St. Jude Clinic"
        };
        db.Settings.Add(settings);

        var encounter = new ConsultationEncounter
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Rx",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Prescriber",
            DoctorPrcLicense = "PRC-9999",
            PrescriptionNumber = "RX-20261025-0001",
            IsSigned = true,
            SignedAt = DateTime.UtcNow,
            Prescriptions = new List<PrescriptionItem>
            {
                new()
                {
                    GenericName = "Amoxicillin",
                    Dosage = "500mg",
                    Form = "Capsule",
                    Sig = "TID",
                    Quantity = 21
                }
            }
        };

        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        encounter.RxPublicVerificationToken.Should().NotBeNullOrWhiteSpace();
        encounter.RxPublicVerificationToken.Should().StartWith(_clinicId.ToString("N"));
        encounter.RxPublicVerificationToken!.Length.Should().Be(65);

        var outbox = await db.InteropOutbox.ToListAsync();
        var attestationMsg = outbox.FirstOrDefault(m => m.Type == InteropTypes.DocumentAttestationPublished && m.CorrelationId == encounter.Id);
        attestationMsg.Should().NotBeNull();

        var envelope = InteropEnvelope.FromJson(attestationMsg!.EnvelopeJson);
        var payload = envelope.GetPayload<DocumentAttestationPublishedPayload>();
        payload.DocumentKind.Should().Be("rx");
        payload.DocumentNumber.Should().Be("RX-20261025-0001");
        payload.SecurityDigest.Should().StartWith("SEC-SHA256-");
        payload.VerificationTokenHash.Should().NotBeNull();
        payload.Status.Should().Be("VALID");
    }

    [Fact]
    public async Task SoftDeleted_Document_Stages_Revoked_Attestation()
    {
        await using var db = CreateContextWithInterceptor();

        var cert = new MedicalCertificate
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CertificateNumber = "MC-20261025-0099",
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Revoked",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Revoker",
            PrcLicenseNumber = "PRC-12345",
            Diagnosis = "Tonsillitis",
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };

        db.MedicalCertificates.Add(cert);
        await db.SaveChangesAsync();

        // Clear outbox from first save
        db.InteropOutbox.RemoveRange(db.InteropOutbox);
        await db.SaveChangesAsync();

        // Soft delete
        cert.IsDeleted = true;
        await db.SaveChangesAsync();

        var outbox = await db.InteropOutbox.ToListAsync();
        var revokeMsg = outbox.FirstOrDefault(m => m.Type == InteropTypes.DocumentAttestationPublished && m.CorrelationId == cert.Id);
        revokeMsg.Should().NotBeNull();

        var envelope = InteropEnvelope.FromJson(revokeMsg!.EnvelopeJson);
        var payload = envelope.GetPayload<DocumentAttestationPublishedPayload>();
        payload.Status.Should().Be("REVOKED");
    }

    [Fact]
    public async Task LabOrder_Stages_DocumentAttestationPublished()
    {
        await using var db = CreateContextWithInterceptor();

        var order = new LabOrder
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            OrderNumber = "LAB-20261025-0001",
            PatientId = Guid.NewGuid(),
            PatientName = "Lab Patient",
            OrderedByDoctorName = "Dr. Lab Orderer",
            OrderDate = DateTime.UtcNow
        };

        db.LabOrders.Add(order);
        await db.SaveChangesAsync();

        var outbox = await db.InteropOutbox.ToListAsync();
        var labMsg = outbox.FirstOrDefault(m => m.Type == InteropTypes.DocumentAttestationPublished && m.CorrelationId == order.Id);
        labMsg.Should().NotBeNull();

        var envelope = InteropEnvelope.FromJson(labMsg!.EnvelopeJson);
        var payload = envelope.GetPayload<DocumentAttestationPublishedPayload>();
        payload.DocumentKind.Should().Be("lab-order");
        payload.DocumentNumber.Should().Be("LAB-20261025-0001");
        payload.SecurityDigest.Should().StartWith("SEC-SHA256-");
        payload.Status.Should().Be("VALID");
    }

    [Fact]
    public async Task Paid_Invoice_Stages_OfficialReceipt_Attestation()
    {
        await using var db = CreateContextWithInterceptor();

        var invoice = new Invoice
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            InvoiceNumber = "OR-20261025-0001",
            PatientId = Guid.NewGuid(),
            PatientName = "Paying Patient",
            GrossAmount = 500,
            NetAmount = 500,
            AmountPaid = 500,
            Status = InvoiceStatus.Paid,
            BilledByStaffName = "Cashier Marie",
            InvoiceDate = DateTime.UtcNow
        };

        db.Invoices.Add(invoice);
        await db.SaveChangesAsync();

        var outbox = await db.InteropOutbox.ToListAsync();
        var receiptMsg = outbox.FirstOrDefault(m => m.Type == InteropTypes.DocumentAttestationPublished && m.CorrelationId == invoice.Id);
        receiptMsg.Should().NotBeNull();

        var envelope = InteropEnvelope.FromJson(receiptMsg!.EnvelopeJson);
        var payload = envelope.GetPayload<DocumentAttestationPublishedPayload>();
        payload.DocumentKind.Should().Be("receipt");
        payload.DocumentNumber.Should().Be("OR-20261025-0001");
        payload.SecurityDigest.Should().StartWith("SEC-SHA256-");
        payload.Status.Should().Be("VALID");
    }

    [Fact]
    public async Task ExternalPrescriptionDispensedHandler_PortalBranch_WithValidToken_AndReceipt_Succeeds()
    {
        await using var db = CreateContextWithInterceptor();

        var settings = new FacilitySettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "St. Jude Clinic"
        };
        db.Settings.Add(settings);

        var token = $"{_clinicId:N}.{Guid.NewGuid():N}";
        var encounter = new ConsultationEncounter
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Dispense Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Prescriber",
            PrescriptionNumber = "RX-20261025-0077",
            RxPublicVerificationToken = token,
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        // Clear outbox
        db.InteropOutbox.RemoveRange(db.InteropOutbox);
        await db.SaveChangesAsync();

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var storageMock = Substitute.For<IRecordAttachmentStorage>();
        storageMock.EncryptAndStoreAsync(
            Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<Guid>(), Arg.Any<Guid?>(),
            Arg.Any<string>(), Arg.Any<string>(), Arg.Any<byte[]>(), Arg.Any<string>(),
            Arg.Any<string?>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new RecordAttachment
            {
                TenantId = _tenantId,
                ClinicId = _clinicId,
                PatientId = encounter.PatientId,
                ConsultationId = encounter.Id,
                Title = "receipt.jpg",
                FileName = "receipt.jpg",
                StorageUri = "tenants/tenant/clinics/clinic/records/abc.cez"
            });

        var handler = new ExternalPrescriptionDispensedHandler(
            db, recipientResolver, NullLogger<ExternalPrescriptionDispensedHandler>.Instance, storageMock);

        var sampleReceiptBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes("fake receipt image bytes"));
        var dispenseEvent = new ExternalPrescriptionDispensedEvent
        {
            PrescriptionId = encounter.Id,
            VerificationToken = token,
            ExternalPharmacyName = "Mercury Drug",
            ExternalBranchLocation = "Ayala Ave, Makati",
            PharmacistName = "Maria Santos, RPh",
            PharmacistPrcLicense = "0088112",
            OfficialReceiptNumber = "OR-98765",
            DispensedAt = DateTime.UtcNow,
            ReceiptDocumentBase64 = sampleReceiptBase64,
            ReceiptFileName = "mercury-receipt.jpg",
            ReceiptContentType = "image/jpeg"
        };

        var inboundEnvelope = InteropEnvelope.Create(
            InteropTypes.RxExternalDispensed,
            Party.Portal,
            Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            encounter.Id,
            dispenseEvent);
        var messageContext = new InteropMessageContext(inboundEnvelope);

        await handler.HandleAsync(dispenseEvent, messageContext, CancellationToken.None);

        encounter.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.DispensedExternally);
        encounter.RxDispensedPharmacyName.Should().Be("Mercury Drug (Ayala Ave, Makati)");
        encounter.RxDispensedReceiptUrl.Should().Be("tenants/tenant/clinics/clinic/records/abc.cez");

        // Verify that interceptor automatically staged updated DocumentAttestationPublished with Status = DISPENSED
        var outbox = await db.InteropOutbox.ToListAsync();
        var attestationMsg = outbox.FirstOrDefault(m => m.Type == InteropTypes.DocumentAttestationPublished && m.CorrelationId == encounter.Id);
        attestationMsg.Should().NotBeNull();
        var envelope = InteropEnvelope.FromJson(attestationMsg!.EnvelopeJson);
        var payload = envelope.GetPayload<DocumentAttestationPublishedPayload>();
        payload.Status.Should().Be("DISPENSED");
        payload.IsAlreadyDispensed.Should().BeTrue();
    }

    [Fact]
    public async Task ExternalPrescriptionDispensedHandler_PortalBranch_WithMismatchedToken_IsIgnored()
    {
        await using var db = CreateContextWithInterceptor();

        var settings = new FacilitySettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "St. Jude Clinic"
        };
        db.Settings.Add(settings);

        var validToken = $"{_clinicId:N}.{Guid.NewGuid():N}";
        var wrongToken = $"{_clinicId:N}.{Guid.NewGuid():N}";

        var encounter = new ConsultationEncounter
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Dispense Patient 2",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Prescriber",
            PrescriptionNumber = "RX-20261025-0078",
            RxPublicVerificationToken = validToken,
            RxDispenseStatus = PrescriptionDispenseStatus.Issued,
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new ExternalPrescriptionDispensedHandler(
            db, recipientResolver, NullLogger<ExternalPrescriptionDispensedHandler>.Instance);

        var dispenseEvent = new ExternalPrescriptionDispensedEvent
        {
            PrescriptionId = encounter.Id,
            VerificationToken = wrongToken, // Mismatched token
            ExternalPharmacyName = "Mercury Drug",
            PharmacistName = "Maria Santos, RPh",
            DispensedAt = DateTime.UtcNow
        };

        var inboundEnvelope = InteropEnvelope.Create(
            InteropTypes.RxExternalDispensed,
            Party.Portal,
            Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            encounter.Id,
            dispenseEvent);
        var messageContext = new InteropMessageContext(inboundEnvelope);

        await handler.HandleAsync(dispenseEvent, messageContext, CancellationToken.None);

        encounter.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.Issued);
    }
}
