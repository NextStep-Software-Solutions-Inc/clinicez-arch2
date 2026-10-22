using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Appointments.Search;
using ClinicEz.Clinic.Application.Features.Billing.Search;
using ClinicEz.Clinic.Application.Features.Consultations.Search;
using ClinicEz.Clinic.Application.Features.LabOrders.Search;
using ClinicEz.Clinic.Application.Features.Patients.Search;
using ClinicEz.Clinic.Application.Features.Queue.Search;
using ClinicEz.Clinic.Application.Features.Settings.Search;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Search;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Search;

public class DomainSearchProvidersTests
{
    private readonly Guid _clinicIdA = Guid.NewGuid();
    private readonly Guid _clinicIdB = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;

    public DomainSearchProvidersTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicIdA);
        _clinicContext.HasPermission(Arg.Any<string>()).Returns(true);
    }

    // ==========================================
    // 1. PatientSearchProvider Tests
    // ==========================================
    [Fact]
    public async Task PatientSearchProvider_MatchesNameCodePinAndEnforcesTenantIsolation()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var provider = new PatientSearchProvider(patientRepo);

        var patientA = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-2026-00001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            MiddleName = "Santos",
            ContactNumber = "09171234567",
            DateOfBirth = new DateOnly(1985, 5, 20),
            PhilHealthNumber = "12-345678901-2"
        };

        var patientB = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-b",
            ClinicId = _clinicIdB, // Different clinic tenant
            PatientCode = "PAT-2026-00002",
            FirstName = "Juanita",
            LastName = "Dela Cruz",
            ContactNumber = "09181234567",
            DateOfBirth = new DateOnly(1990, 8, 15)
        };

        var softDeleted = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-2026-00003",
            FirstName = "Juan",
            LastName = "Deleted",
            ContactNumber = "09191234567",
            DateOfBirth = new DateOnly(1975, 1, 1),
            IsDeleted = true
        };

        context.Patients.AddRange(patientA, patientB, softDeleted);
        await context.SaveChangesAsync();

        // Act - search for "Dela Cruz" in Clinic A
        var results = await provider.SearchAsync("Dela Cruz", _clinicIdA, 20, CancellationToken.None);

        // Assert
        results.Should().HaveCount(1);
        results[0].Id.Should().Be(patientA.Id.ToString());
        results[0].Category.Should().Be("Patients");
        results[0].Title.Should().Be("Dela Cruz, Juan Santos");
        results[0].TargetRoute.Should().Be("Patients");
        results[0].RouteParams.Should().ContainKey("patientId").WhoseValue.Should().Be(patientA.Id.ToString());

        // Substring PIN lookup
        var pinResults = await provider.SearchAsync("345678901", _clinicIdA, 20, CancellationToken.None);
        pinResults.Should().HaveCount(1);
        pinResults[0].Id.Should().Be(patientA.Id.ToString());
    }

    [Fact]
    public async Task PatientSearchProvider_ResolvesAlertSeniorAndPwdBadges()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var provider = new PatientSearchProvider(patientRepo);

        var alertPatient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-ALERT",
            FirstName = "Alert",
            LastName = "Patient",
            ContactNumber = "09170000001",
            Alerts = "Severe Penicillin Allergy"
        };

        var seniorPatient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-SENIOR",
            FirstName = "Senior",
            LastName = "Citizen",
            ContactNumber = "09170000002",
            SeniorCitizenId = "OSCA-12345"
        };

        var pwdPatient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-PWD",
            FirstName = "Pwd",
            LastName = "Person",
            ContactNumber = "09170000003",
            PwdId = "PWD-67890"
        };

        context.Patients.AddRange(alertPatient, seniorPatient, pwdPatient);
        await context.SaveChangesAsync();

        // Act & Assert
        var alertResults = await provider.SearchAsync("PAT-ALERT", _clinicIdA, 10, CancellationToken.None);
        alertResults[0].BadgeText.Should().Be("Alert");
        alertResults[0].BadgeVariant.Should().Be(SearchBadgeVariant.Emergency);

        var seniorResults = await provider.SearchAsync("PAT-SENIOR", _clinicIdA, 10, CancellationToken.None);
        seniorResults[0].BadgeText.Should().Be("Senior");
        seniorResults[0].BadgeVariant.Should().Be(SearchBadgeVariant.Neutral);

        var pwdResults = await provider.SearchAsync("PAT-PWD", _clinicIdA, 10, CancellationToken.None);
        pwdResults[0].BadgeText.Should().Be("PWD");
        pwdResults[0].BadgeVariant.Should().Be(SearchBadgeVariant.Neutral);
    }

    // ==========================================
    // 2. ConsultationSearchProvider Tests
    // ==========================================
    [Fact]
    public async Task ConsultationSearchProvider_MatchesSoapNotesAndClinicianNames()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var provider = new ConsultationSearchProvider(consultationRepo);

        var consult = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientName = "Maria Clara",
            DoctorName = "Dr. Jose Rizal",
            Subjective = "Severe persistent cough with evening low-grade fever",
            Assessment = "Suspected Pulmonary Tuberculosis (A15.0)",
            Objective = "Crackles heard in right upper lobe",
            Plan = "Order Chest X-Ray and GeneXpert MTB/RIF",
            IsSigned = true,
            EncounterDate = DateTime.UtcNow
        };

        var consultB = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-b",
            ClinicId = _clinicIdB,
            PatientName = "Maria Clara",
            DoctorName = "Dr. Other",
            Subjective = "Different clinic encounter"
        };

        context.Consultations.AddRange(consult, consultB);
        await context.SaveChangesAsync();

        // Act - search by SOAP symptom
        var results = await provider.SearchAsync("persistent cough", _clinicIdA, 10, CancellationToken.None);

        // Assert
        results.Should().HaveCount(1);
        results[0].Id.Should().Be(consult.Id.ToString());
        results[0].Category.Should().Be("Consultations");
        results[0].BadgeText.Should().Be("Signed");
        results[0].BadgeVariant.Should().Be(SearchBadgeVariant.Routine);
        results[0].TargetRoute.Should().Be("Consultations");
        results[0].RouteParams.Should().ContainKey("consultationId").WhoseValue.Should().Be(consult.Id.ToString());

        // Search by doctor name
        var docResults = await provider.SearchAsync("Jose Rizal", _clinicIdA, 10, CancellationToken.None);
        docResults.Should().HaveCount(1);
        docResults[0].Id.Should().Be(consult.Id.ToString());
    }

    // ==========================================
    // 3. AppointmentSearchProvider Tests
    // ==========================================
    [Fact]
    public async Task AppointmentSearchProvider_MatchesDoctorPatientReasonAndMapsBadges()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var provider = new AppointmentSearchProvider(apptRepo);

        var appt1 = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientName = "Pedro Penduko",
            DoctorName = "Dr. Santos",
            Reason = "Follow-up Diabetes Management",
            ServiceType = "Endocrinology",
            ScheduledAt = DateTime.UtcNow.AddHours(2),
            Status = AppointmentStatus.CheckedIn
        };

        var appt2 = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientName = "Andres Bonifacio",
            DoctorName = "Dr. Santos",
            Reason = "Wound Dressing Change",
            ServiceType = "General Care",
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            Status = AppointmentStatus.Confirmed
        };

        context.Appointments.AddRange(appt1, appt2);
        await context.SaveChangesAsync();

        // Act - search for "Diabetes"
        var results = await provider.SearchAsync("Diabetes", _clinicIdA, 10, CancellationToken.None);

        // Assert
        results.Should().HaveCount(1);
        results[0].Id.Should().Be(appt1.Id.ToString());
        results[0].BadgeText.Should().Be("Active");
        results[0].BadgeVariant.Should().Be(SearchBadgeVariant.Urgent);
        results[0].TargetRoute.Should().Be("Appointments");
        results[0].RouteParams.Should().ContainKey("appointmentId").WhoseValue.Should().Be(appt1.Id.ToString());
    }

    // ==========================================
    // 4. QueueSearchProvider Tests
    // ==========================================
    [Fact]
    public async Task QueueSearchProvider_MatchesTicketNumberAndPriority()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var provider = new QueueSearchProvider(queueRepo);

        var queueItem1 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            QueueNumber = "Q-001",
            PatientName = "Gabriela Silang",
            DoctorName = "Dr. Luna",
            RoomOrStation = "Exam Room 1",
            Priority = QueuePriority.Emergency,
            Status = QueueStatus.Waiting,
            ChiefComplaint = "Chest Pain"
        };

        var queueItem2 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            QueueNumber = "Q-002",
            PatientName = "Emilio Aguinaldo",
            DoctorName = "Dr. Luna",
            RoomOrStation = "Exam Room 2",
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Completed
        };

        context.QueueItems.AddRange(queueItem1, queueItem2);
        await context.SaveChangesAsync();

        // Act - search by queue ticket
        var results = await provider.SearchAsync("Q-001", _clinicIdA, 10, CancellationToken.None);

        // Assert
        results.Should().HaveCount(1);
        results[0].Id.Should().Be(queueItem1.Id.ToString());
        results[0].BadgeText.Should().Be("Emergency");
        results[0].BadgeVariant.Should().Be(SearchBadgeVariant.Emergency);
        results[0].TargetRoute.Should().Be("Queue");
        results[0].RouteParams.Should().ContainKey("queueId").WhoseValue.Should().Be(queueItem1.Id.ToString());
    }

    // ==========================================
    // 5. LabOrderSearchProvider Tests
    // ==========================================
    [Fact]
    public async Task LabOrderSearchProvider_MatchesTestNameAndPanicFlags()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var provider = new LabOrderSearchProvider(labRepo);

        var panicOrder = new ClinicLabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            OrderNumber = "LAB-2026-9901",
            PatientId = Guid.NewGuid(),
            PatientName = "Apolinario Mabini",
            HasCriticalPanicAlert = true,
            Status = LabOrderStatus.Ordered,
            Items = new List<ClinicLabOrderItem>
            {
                new() { TestName = "Potassium Serum", Category = "Chemistry" }
            }
        };

        var routineOrder = new ClinicLabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            OrderNumber = "LAB-2026-9902",
            PatientId = Guid.NewGuid(),
            PatientName = "Melchora Aquino",
            HasCriticalPanicAlert = false,
            Status = LabOrderStatus.Completed,
            Items = new List<ClinicLabOrderItem>
            {
                new() { TestName = "Complete Blood Count (CBC)", Category = "Hematology" }
            }
        };

        context.LabOrders.AddRange(panicOrder, routineOrder);
        await context.SaveChangesAsync();

        // Act - search by test name "Potassium"
        var results = await provider.SearchAsync("Potassium", _clinicIdA, 10, CancellationToken.None);

        // Assert
        results.Should().HaveCount(1);
        results[0].Id.Should().Be(panicOrder.Id.ToString());
        results[0].BadgeText.Should().Be("PANIC");
        results[0].BadgeVariant.Should().Be(SearchBadgeVariant.Emergency);
        results[0].TargetRoute.Should().Be("LabOrders");
        results[0].RouteParams.Should().ContainKey("orderId").WhoseValue.Should().Be(panicOrder.Id.ToString());
        results[0].RouteParams.Should().ContainKey("patientId").WhoseValue.Should().Be(panicOrder.PatientId.ToString());

        // Routine order status check
        var cbcResults = await provider.SearchAsync("CBC", _clinicIdA, 10, CancellationToken.None);
        cbcResults.Should().HaveCount(1);
        cbcResults[0].BadgeText.Should().Be("Completed");
        cbcResults[0].BadgeVariant.Should().Be(SearchBadgeVariant.Routine);
    }

    // ==========================================
    // 6. BillingSearchProvider Tests
    // ==========================================
    [Fact]
    public async Task BillingSearchProvider_MatchesInvoiceNumberPatientAndLineItems()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var provider = new BillingSearchProvider(invoiceRepo);

        var unpaidInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            InvoiceNumber = "INV-2026-0042",
            PatientName = "Marcelo Del Pilar",
            GrossAmount = 1500m,
            NetAmount = 1500m,
            BalanceDue = 1500m,
            Status = InvoiceStatus.Draft,
            LineItems = new List<InvoiceLineItem>
            {
                new() { Description = "Comprehensive Comprehensive Consultation", Category = "Consultation", TotalPrice = 1500m }
            }
        };

        var paidInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            InvoiceNumber = "INV-2026-0043",
            PatientName = "Diego Silang",
            GrossAmount = 500m,
            NetAmount = 500m,
            AmountPaid = 500m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid,
            LineItems = new List<InvoiceLineItem>
            {
                new() { Description = "Vaccine Administration Fee", Category = "Procedure", TotalPrice = 500m }
            }
        };

        context.Invoices.AddRange(unpaidInvoice, paidInvoice);
        await context.SaveChangesAsync();

        // Act - search by invoice number
        var results = await provider.SearchAsync("INV-2026-0042", _clinicIdA, 10, CancellationToken.None);

        // Assert
        results.Should().HaveCount(1);
        results[0].Id.Should().Be(unpaidInvoice.Id.ToString());
        results[0].BadgeText.Should().Be("Bal: ₱1,500");
        results[0].BadgeVariant.Should().Be(SearchBadgeVariant.Urgent);
        results[0].TargetRoute.Should().Be("Billing");
        results[0].RouteParams.Should().ContainKey("invoiceId").WhoseValue.Should().Be(unpaidInvoice.Id.ToString());

        // Search by line item description
        var feeResults = await provider.SearchAsync("Vaccine Administration", _clinicIdA, 10, CancellationToken.None);
        feeResults.Should().HaveCount(1);
        feeResults[0].BadgeText.Should().Be("Paid");
        feeResults[0].BadgeVariant.Should().Be(SearchBadgeVariant.Routine);

        // Search by keyword "unpaid" or "unsettled"
        var unpaidResults = await provider.SearchAsync("unpaid", _clinicIdA, 10, CancellationToken.None);
        unpaidResults.Should().HaveCount(1);
        unpaidResults[0].Id.Should().Be(unpaidInvoice.Id.ToString());
        unpaidResults[0].BadgeText.Should().Be("Bal: ₱1,500");
        unpaidResults[0].RouteParams.Should().ContainKey("patientId");

        var balanceResults = await provider.SearchAsync("balance", _clinicIdA, 10, CancellationToken.None);
        balanceResults.Should().HaveCount(1);
        balanceResults[0].Id.Should().Be(unpaidInvoice.Id.ToString());
    }

    // ==========================================
    // 7. SettingSearchProvider Tests
    // ==========================================
    [Fact]
    public async Task SettingSearchProvider_MatchesRoomsServicesStaffAndDeepLinksToTabs()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<ClinicRoom>(context, sieve);
        var serviceRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var provider = new SettingSearchProvider(roomRepo, serviceRepo, staffRepo, settingsRepo);

        var room = new ClinicRoom
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            Name = "Pediatric Suite 101",
            Code = "PED-101",
            Type = ClinicRoomType.Consultation
        };

        var service = new ClinicServiceItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            Name = "Pediatric Immunization Consult",
            Code = "SRV-PEDI-01",
            Category = "Consultation",
            StandardPrice = 650.00m
        };

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            FirstName = "Maria",
            LastName = "Santos",
            Title = "MD, FPPS",
            Role = StaffRole.Doctor,
            Specialty = "Pediatrics"
        };

        var facilitySettings = new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            ClinicName = "St. Jude Family Pediatric Clinic",
            OperatingHours = "Mon-Sat 8:00 AM - 5:00 PM",
            AccreditationNumber = "PHIC-ACC-99214",
            PlanTier = "Growth"
        };

        context.ClinicRooms.Add(room);
        context.ServiceItems.Add(service);
        context.StaffMembers.Add(staff);
        context.ClinicSettings.Add(facilitySettings);
        await context.SaveChangesAsync();

        // Act - search by keyword "Pediatric"
        var results = await provider.SearchAsync("Pediatric", _clinicIdA, 20, CancellationToken.None);

        // Assert - should match room, service, staff, and facility configuration
        results.Should().NotBeEmpty();

        var roomResult = results.FirstOrDefault(r => r.Title == "Pediatric Suite 101");
        roomResult.Should().NotBeNull();
        roomResult!.RouteParams!["tab"].Should().Be("general");

        var serviceResult = results.FirstOrDefault(r => r.Title == "Pediatric Immunization Consult");
        serviceResult.Should().NotBeNull();
        serviceResult!.RouteParams!["tab"].Should().Be("services");

        var staffResult = results.FirstOrDefault(r => r.Title.Contains("Santos"));
        staffResult.Should().NotBeNull();
        staffResult!.RouteParams!["tab"].Should().Be("staff");

        var facilityResult = results.FirstOrDefault(r => r.Title == "St. Jude Family Pediatric Clinic");
        facilityResult.Should().NotBeNull();
        facilityResult!.RouteParams!["tab"].Should().Be("general");

        // PhilHealth keyword search
        var phResults = await provider.SearchAsync("philhealth", _clinicIdA, 10, CancellationToken.None);
        phResults.Should().NotBeEmpty();
        phResults[0].RouteParams!["tab"].Should().Be("philhealth");
    }
}
