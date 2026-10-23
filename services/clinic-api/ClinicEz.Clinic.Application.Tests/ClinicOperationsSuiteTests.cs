using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Application.Features.Documents.Commands;
using ClinicEz.Clinic.Application.Features.Documents.Queries;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Features.Records.Commands;
using ClinicEz.Clinic.Application.Features.Records.Queries;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicOperationsSuiteTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-ops-test";

    public ClinicOperationsSuiteTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    [Fact]
    public async Task RegisterPatient_ShouldGenerateSequentialCode_AndStoreHealthcareIds()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var handler = new RegisterClinicPatientCommandHandler(repo, uow, _clinicContext);

        var command = new RegisterClinicPatientCommand(
            FirstName: "Maria",
            LastName: "Santos",
            MiddleName: "Delos",
            Suffix: null,
            DateOfBirth: new DateOnly(1955, 6, 15), // Senior Citizen
            Gender: "Female",
            CivilStatus: "Married",
            ContactNumber: "09171234567",
            Email: "maria.santos@email.com",
            AddressLine: "123 Mabini St",
            Barangay: "Poblacion",
            City: "Calamba",
            Province: "Laguna",
            EmergencyContactName: "Juan Santos",
            EmergencyContactPhone: "09187654321",
            EmergencyContactRelationship: "Spouse",
            PhilHealthNumber: "12-345678901-2",
            SeniorCitizenId: "SC-CAL-2020-0012",
            PwdId: null,
            BloodType: "O+",
            Allergies: "Penicillin, Aspirin",
            ChronicConditions: "Hypertension, T2DM",
            Alerts: "High fall risk");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.PatientCode.Should().StartWith($"PAT-{DateTime.UtcNow.Year}-");
        result.FullName.Should().Be("Santos, Maria D.");
        result.Age.Should().BeGreaterThan(60);
        result.PhilHealthNumber.Should().Be("12-345678901-2");
        result.SeniorCitizenId.Should().Be("SC-CAL-2020-0012");
        result.Allergies.Should().Be("Penicillin, Aspirin");
        result.Alerts.Should().Be("High fall risk");
    }

    [Fact]
    public async Task SearchPatients_ShouldFilterByNameAndPhilHealth()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var regHandler = new RegisterClinicPatientCommandHandler(repo, uow, _clinicContext);
        var searchHandler = new GetClinicPatientsQueryHandler(repo);

        await regHandler.Handle(new RegisterClinicPatientCommand("Juan", "Dela Cruz", null, null, new DateOnly(1985, 1, 1), "Male", null, "09111111111", null, null, null, null, null, null, null, null, "11-111111111-1", null, null, null, null, null, null), CancellationToken.None);
        await regHandler.Handle(new RegisterClinicPatientCommand("Elena", "Ramos", null, null, new DateOnly(1992, 5, 20), "Female", null, "09222222222", null, null, null, null, null, null, null, null, "22-222222222-2", null, null, null, "Seafood", null, "Allergic to shrimp"), CancellationToken.None);

        var searchByName = await searchHandler.Handle(new GetClinicPatientsQuery("Ramos"), CancellationToken.None);
        searchByName.Should().HaveCount(1);
        searchByName[0].LastName.Should().Be("Ramos");

        var searchByPhilHealth = await searchHandler.Handle(new GetClinicPatientsQuery("11-111111111-1"), CancellationToken.None);
        searchByPhilHealth.Should().HaveCount(1);
        searchByPhilHealth[0].LastName.Should().Be("Dela Cruz");

        var searchWithAlerts = await searchHandler.Handle(new GetClinicPatientsQuery(HasAlerts: true), CancellationToken.None);
        searchWithAlerts.Should().HaveCount(1);
        searchWithAlerts[0].LastName.Should().Be("Ramos");
    }

    [Fact]
    public async Task SearchPatients_ShouldMatchExactPartialAndUnhyphenatedClinicEzId_AndProjectClinicEzId()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var searchHandler = new GetClinicPatientsQueryHandler(repo);

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-2026-00077",
            FirstName = "Ely An",
            LastName = "Maureal",
            MiddleName = "Santos",
            Suffix = "Jr.",
            ClinicEzId = "CE-WDP9-FMBJ",
            DateOfBirth = new DateOnly(1993, 4, 12),
            Gender = "Male",
            ContactNumber = "09171112233",
            PhilHealthNumber = "12-345678901-2"
        };
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // 1. Exact ClinicEzId
        var exact = await searchHandler.Handle(new GetClinicPatientsQuery("CE-WDP9-FMBJ"), CancellationToken.None);
        exact.Should().HaveCount(1);
        exact[0].ClinicEzId.Should().Be("CE-WDP9-FMBJ");
        exact[0].FirstName.Should().Be("Ely An");
        exact[0].LastName.Should().Be("Maureal");

        // 2. Partial ClinicEzId
        var partial = await searchHandler.Handle(new GetClinicPatientsQuery("WDP9"), CancellationToken.None);
        partial.Should().HaveCount(1);
        partial[0].ClinicEzId.Should().Be("CE-WDP9-FMBJ");

        // 3. Unhyphenated ClinicEzId (lowercase and uppercase)
        var unhyphenatedLower = await searchHandler.Handle(new GetClinicPatientsQuery("cewdp9fmbj"), CancellationToken.None);
        unhyphenatedLower.Should().HaveCount(1);
        unhyphenatedLower[0].ClinicEzId.Should().Be("CE-WDP9-FMBJ");

        var unhyphenatedUpper = await searchHandler.Handle(new GetClinicPatientsQuery("CEWDP9FMBJ"), CancellationToken.None);
        unhyphenatedUpper.Should().HaveCount(1);
        unhyphenatedUpper[0].ClinicEzId.Should().Be("CE-WDP9-FMBJ");
    }

    [Fact]
    public async Task SearchPatients_ShouldMatchCompoundGivenNames_FullNames_AndInvertedNames()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var searchHandler = new GetClinicPatientsQueryHandler(repo);

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-2026-00088",
            FirstName = "Ely An",
            LastName = "Maureal",
            MiddleName = "Santos",
            Suffix = "Jr.",
            ClinicEzId = "CE-WDP9-FMBJ",
            DateOfBirth = new DateOnly(1993, 4, 12),
            Gender = "Male",
            ContactNumber = "09171112233",
            PhilHealthNumber = "12-345678901-2"
        };
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // 1. Compound Given Name: "Ely An"
        var compoundFirst = await searchHandler.Handle(new GetClinicPatientsQuery("Ely An"), CancellationToken.None);
        compoundFirst.Should().HaveCount(1);
        compoundFirst[0].LastName.Should().Be("Maureal");

        // 2. Full Name: "Ely An Maureal"
        var fullName = await searchHandler.Handle(new GetClinicPatientsQuery("Ely An Maureal"), CancellationToken.None);
        fullName.Should().HaveCount(1);
        fullName[0].LastName.Should().Be("Maureal");

        // 3. Full Name with Middle: "Ely An Santos Maureal"
        var fullNameWithMiddle = await searchHandler.Handle(new GetClinicPatientsQuery("Ely An Santos Maureal"), CancellationToken.None);
        fullNameWithMiddle.Should().HaveCount(1);

        // 4. Inverted Name with Comma: "Maureal, Ely An"
        var invertedComma = await searchHandler.Handle(new GetClinicPatientsQuery("Maureal, Ely An"), CancellationToken.None);
        invertedComma.Should().HaveCount(1);
        invertedComma[0].FirstName.Should().Be("Ely An");

        // 5. Inverted Name without Comma: "Maureal Ely An"
        var invertedNoComma = await searchHandler.Handle(new GetClinicPatientsQuery("Maureal Ely An"), CancellationToken.None);
        invertedNoComma.Should().HaveCount(1);
        invertedNoComma[0].FirstName.Should().Be("Ely An");

        // 6. Inverted Name with Middle: "Maureal, Ely An Santos" & "Maureal Ely An Santos"
        var invertedMiddleComma = await searchHandler.Handle(new GetClinicPatientsQuery("Maureal, Ely An Santos"), CancellationToken.None);
        invertedMiddleComma.Should().HaveCount(1);

        var invertedMiddleNoComma = await searchHandler.Handle(new GetClinicPatientsQuery("Maureal Ely An Santos"), CancellationToken.None);
        invertedMiddleNoComma.Should().HaveCount(1);

        // 7. Middle name lookup: "Santos"
        var middleOnly = await searchHandler.Handle(new GetClinicPatientsQuery("Santos"), CancellationToken.None);
        middleOnly.Should().HaveCount(1);

        // 8. Suffix lookup: "Jr." and "Jr"
        var suffixDot = await searchHandler.Handle(new GetClinicPatientsQuery("Jr."), CancellationToken.None);
        suffixDot.Should().HaveCount(1);

        var suffixNoDot = await searchHandler.Handle(new GetClinicPatientsQuery("Jr"), CancellationToken.None);
        suffixNoDot.Should().HaveCount(1);

        // 9. Unhyphenated PhilHealthNumber: "123456789012"
        var phUnhyphenated = await searchHandler.Handle(new GetClinicPatientsQuery("123456789012"), CancellationToken.None);
        phUnhyphenated.Should().HaveCount(1);
        phUnhyphenated[0].PhilHealthNumber.Should().Be("12-345678901-2");
    }

    [Fact]
    public async Task SearchPatients_FilterModeAndPaging_ShouldFilterCorrectly()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var regHandler = new RegisterClinicPatientCommandHandler(repo, uow, _clinicContext);
        var searchHandler = new GetClinicPatientsQueryHandler(repo);

        // Patient 1: Regular adult, no alerts, no senior/pwd
        await regHandler.Handle(new RegisterClinicPatientCommand(
            FirstName: "Carlos",
            LastName: "Tan",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1995, 3, 10),
            Gender: "Male",
            CivilStatus: null,
            ContactNumber: "09181111111",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null), CancellationToken.None);

        // Patient 2: Young adult with allergy alert
        await regHandler.Handle(new RegisterClinicPatientCommand(
            FirstName: "Bea",
            LastName: "Alonzo",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1998, 8, 12),
            Gender: "Female",
            CivilStatus: null,
            ContactNumber: "09182222222",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: null,
            Allergies: "Penicillin",
            ChronicConditions: null,
            Alerts: "Severe allergy"), CancellationToken.None);

        // Patient 3: Senior Citizen (>60 yrs old and SeniorCitizenId)
        await regHandler.Handle(new RegisterClinicPatientCommand(
            FirstName: "Danilo",
            LastName: "Santos",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1955, 1, 1),
            Gender: "Male",
            CivilStatus: null,
            ContactNumber: "09183333333",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: "OSCA-98765",
            PwdId: null,
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null), CancellationToken.None);

        // Patient 4: PWD patient
        await regHandler.Handle(new RegisterClinicPatientCommand(
            FirstName: "Eduardo",
            LastName: "Villar",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(2000, 4, 15),
            Gender: "Male",
            CivilStatus: null,
            ContactNumber: "09184444444",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: "PWD-44556",
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null), CancellationToken.None);

        // Test FilterMode = ALERTS
        var alertsResult = await searchHandler.Handle(new GetClinicPatientsQuery(FilterMode: "ALERTS"), CancellationToken.None);
        alertsResult.Should().HaveCount(1);
        alertsResult[0].LastName.Should().Be("Alonzo");

        // Test FilterMode = SENIOR_PWD
        var seniorPwdResult = await searchHandler.Handle(new GetClinicPatientsQuery(FilterMode: "SENIOR_PWD"), CancellationToken.None);
        seniorPwdResult.Should().HaveCount(2);
        seniorPwdResult.Select(p => p.LastName).Should().Contain(new[] { "Santos", "Villar" });

        // Test Pagination: PageSize = 2, PageNumber = 1
        var page1 = await searchHandler.Handle(new GetClinicPatientsQuery(PageNumber: 1, PageSize: 2), CancellationToken.None);
        page1.Should().HaveCount(2);

        // PageSize = 2, PageNumber = 2
        var page2 = await searchHandler.Handle(new GetClinicPatientsQuery(PageNumber: 2, PageSize: 2), CancellationToken.None);
        page2.Should().HaveCount(2);

        // Ensure page 1 and page 2 do not overlap
        var page1Ids = page1.Select(p => p.Id).ToHashSet();
        page2.All(p => !page1Ids.Contains(p.Id)).Should().BeTrue();
    }

    [Fact]
    public async Task Appointments_CreateRescheduleAndCancel_ShouldTransitionCorrectly()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var createHandler = new CreateAppointmentCommandHandler(repo, uow, _clinicContext);
        var rescheduleHandler = new RescheduleAppointmentCommandHandler(repo, uow);
        var cancelHandler = new CancelAppointmentCommandHandler(repo, uow);

        var patientId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();

        // 1. Create
        var created = await createHandler.Handle(new CreateAppointmentCommand(
            patientId, "Maria Santos", doctorId, "Dr. Cruz", DateTime.UtcNow.AddDays(2), 30, "Consultation", "Follow-up BP check"), CancellationToken.None);

        created.Status.Should().Be(AppointmentStatus.Confirmed);
        created.Reason.Should().Be("Follow-up BP check");

        // 2. Reschedule
        var newDate = DateTime.UtcNow.AddDays(4);
        var rescheduled = await rescheduleHandler.Handle(new RescheduleAppointmentCommand(created.Id, newDate, 45, "Patient request"), CancellationToken.None);

        rescheduled.ScheduledAt.Should().BeCloseTo(newDate, TimeSpan.FromSeconds(2));
        rescheduled.DurationMinutes.Should().Be(45);
        rescheduled.Notes.Should().Contain("Patient request");

        // 3. Cancel
        var cancelled = await cancelHandler.Handle(new CancelAppointmentCommand(created.Id, "Patient had emergency conflict"), CancellationToken.None);

        cancelled.Status.Should().Be(AppointmentStatus.Cancelled);
        cancelled.Notes.Should().Contain("emergency conflict");
    }

    [Fact]
    public async Task IssueMedicalCertificate_ShouldGenerateSequentialNumber_AndLockWithLicenses()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<MedicalCertificate>(context, sieve);
        var handler = Phase3TestKit.MedCert(repo, uow, _clinicContext, context);
        var queryHandler = new GetMedicalCertificatesQueryHandler(repo);

        var patientId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();

        var command = new IssueMedicalCertificateCommand(
            PatientId: patientId,
            PatientName: "Juan Dela Cruz",
            ConsultationId: Guid.NewGuid(),
            DoctorId: doctorId,
            DoctorName: "Dr. Roberto Cruz, MD",
            PrcLicenseNumber: "PRC-0098765",
            PtrNumber: "PTR-2026-1122",
            Diagnosis: "Acute Viral Upper Respiratory Tract Infection",
            ClinicalFindings: "Pharyngeal erythema, low-grade fever 38.1C, clear breath sounds",
            FitnessStatus: "UnfitToWork",
            RecommendedRestDays: 3,
            RestStartDate: DateOnly.FromDateTime(DateTime.UtcNow),
            RestEndDate: DateOnly.FromDateTime(DateTime.UtcNow.AddDays(3)),
            Purpose: "Employment / Sick Leave",
            Remarks: "Advised hydration and rest. Return if fever persists beyond 72h.");

        var cert = await handler.Handle(command, CancellationToken.None);

        cert.Should().NotBeNull();
        cert.CertificateNumber.Should().StartWith("MC-");
        cert.PrcLicenseNumber.Should().Be("PRC-0098765");
        cert.PtrNumber.Should().Be("PTR-2026-1122");
        cert.RecommendedRestDays.Should().Be(3);
        cert.IsSigned.Should().BeTrue();

        var list = await queryHandler.Handle(new GetMedicalCertificatesQuery(patientId), CancellationToken.None);
        list.Should().HaveCount(1);
        list[0].CertificateNumber.Should().Be(cert.CertificateNumber);
    }

    [Fact]
    public async Task IssueReferralLetter_ShouldGenerateSequentialNumber_AndStoreClinicalTransfer()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ReferralLetter>(context, sieve);
        var handler = new IssueReferralLetterCommandHandler(repo, uow, _clinicContext);
        var queryHandler = new GetReferralLettersQueryHandler(repo);

        var patientId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();

        var command = new IssueReferralLetterCommand(
            PatientId: patientId,
            PatientName: "Elena Ramos",
            ConsultationId: Guid.NewGuid(),
            ReferringDoctorId: doctorId,
            ReferringDoctorName: "Dr. Cruz",
            ReferredToDoctor: "Dr. Hernandez",
            ReferredToFacility: "Provincial General Hospital",
            ReferredDepartment: "Cardiology",
            Urgency: "Urgent",
            ReasonForReferral: "New onset atypical chest discomfort with ECG ST depression",
            ProvisionalDiagnosis: "Unstable Angina, rule out NSTEMI",
            ClinicalSummary: "58 yo female with 3 days retrosternal squeezing pain radiating to left arm",
            CurrentMedications: "Aspirin 80mg OD, Rosuvastatin 20mg OD",
            AttachedDiagnostics: "12-Lead ECG (Lead II, V4-V6 depression)");

        var referral = await handler.Handle(command, CancellationToken.None);

        referral.Should().NotBeNull();
        referral.ReferralNumber.Should().StartWith("REF-");
        referral.ReferredToFacility.Should().Be("Provincial General Hospital");
        referral.ReferredDepartment.Should().Be("Cardiology");
        referral.Urgency.Should().Be("Urgent");
        referral.IsSigned.Should().BeTrue();

        var list = await queryHandler.Handle(new GetReferralLettersQuery(patientId), CancellationToken.None);
        list.Should().HaveCount(1);
        list[0].ReferralNumber.Should().Be(referral.ReferralNumber);
    }

    [Fact]
    public async Task RecordsAttachment_UploadAndQuery_ShouldPersistFileMetadata()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicRecordAttachment>(context, sieve);
        var uploadHandler = new UploadRecordAttachmentCommandHandler(repo, uow, _clinicContext);
        var queryHandler = new GetPatientRecordAttachmentsQueryHandler(repo);

        var patientId = Guid.NewGuid();

        var attachment = await uploadHandler.Handle(new UploadRecordAttachmentCommand(
            PatientId: patientId,
            ConsultationId: null,
            RecordType: "LabResult",
            Title: "Complete Blood Count & Platelet Report",
            FileName: "cbc-report-2026.pdf",
            ContentType: "application/pdf",
            FileSizeBytes: 1048576,
            StorageUri: "https://storage.clinicez.net/records/cbc-report-2026.pdf",
            DocumentDate: DateOnly.FromDateTime(DateTime.UtcNow),
            Notes: "Normal hemoglobin and WBC count",
            UploadedByStaffName: "Nurse Joy"), CancellationToken.None);

        attachment.Should().NotBeNull();
        attachment.FileName.Should().Be("cbc-report-2026.pdf");
        attachment.UploadedByStaffName.Should().Be("Nurse Joy");

        var list = await queryHandler.Handle(new GetPatientRecordAttachmentsQuery(patientId), CancellationToken.None);
        list.Should().HaveCount(1);
        list[0].Title.Should().Be("Complete Blood Count & Platelet Report");
    }

    [Fact]
    public async Task ClinicSettings_GetDefaultAndEdit_ShouldPersistPreferences()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var getHandler = new GetClinicSettingsQueryHandler(repo, _clinicContext, uow);
        var updateHandler = new UpdateClinicSettingsCommandHandler(repo, _clinicContext, uow);

        // 1. Get default settings (auto-provisioned)
        var defaults = await getHandler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);
        defaults.Should().NotBeNull();
        defaults.DefaultConsultationFee.Should().Be(400.00m);
        defaults.QueuePrefix.Should().Be("Q");

        // 2. Update settings
        var updated = await updateHandler.Handle(new UpdateClinicSettingsCommand(
            ClinicName: "St. Jude Comprehensive Family Center",
            TaxIdentificationNumber: "123-456-789-000",
            AccreditationNumber: "PHIC-KONSULTA-99999",
            OperatingHours: "Mon-Fri 7:00 AM - 6:00 PM, Sat 8:00 AM - 1:00 PM",
            DefaultSlotDurationMinutes: 20,
            QueuePrefix: "SJ",
            InvoicePrefix: "INV-SJ",
            DefaultConsultationFee: 500.00m,
            VatRate: 0.12m,
            LetterheadHeader: "ST. JUDE COMPREHENSIVE FAMILY CENTER",
            LetterheadSubHeader: "Excellence in Primary Healthcare",
            LetterheadAddress: "San Pedro, Laguna",
            LetterheadContact: "0917-000-0000",
            LetterheadFooter: "Thank you for trusting St. Jude Clinic."), CancellationToken.None);

        updated.ClinicName.Should().Be("St. Jude Comprehensive Family Center");
        updated.DefaultSlotDurationMinutes.Should().Be(20);
        updated.DefaultConsultationFee.Should().Be(500.00m);
        updated.QueuePrefix.Should().Be("SJ");
    }
}
