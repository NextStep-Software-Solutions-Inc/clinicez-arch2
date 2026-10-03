using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.CustomFields.Commands;
using ClinicEz.Clinic.Application.Features.CustomFields.Queries;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Records.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class TenantCustomFieldsAndVerificationTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_university_01";
    private readonly IClinicContext _clinicContext;

    public TenantCustomFieldsAndVerificationTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    [Fact]
    public async Task CreateCustomFieldDefinition_ShouldPersist_AndBeQueryableByCategory()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);

        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        // Act - Create Student ID and College fields
        var field1 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            "student_id", "Student ID Number", CustomFieldDataType.Text, "ClinicPatient", "Student", true, 1), CancellationToken.None);

        var field2 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            "college", "College / Department", CustomFieldDataType.Select, "ClinicPatient", "Student", true, 2, "[\"Engineering\",\"Nursing\"]"), CancellationToken.None);

        var field3 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            "employee_id", "Employee ID", CustomFieldDataType.Text, "ClinicPatient", "Employee", true, 1), CancellationToken.None);

        // Query by Category "Student"
        var studentFields = await queryHandler.Handle(new GetClinicCustomFieldsQuery("ClinicPatient", "Student"), CancellationToken.None);

        // Assert
        field1.FieldKey.Should().Be("student_id");
        field1.TenantId.Should().Be(_tenantId);
        studentFields.Should().HaveCount(2);
        studentFields.Should().Contain(f => f.FieldKey == "student_id");
        studentFields.Should().Contain(f => f.FieldKey == "college");
        studentFields.Should().NotContain(f => f.FieldKey == "employee_id");
    }

    [Fact]
    public async Task RegisterPatient_WithCustomFields_ShouldSaveAndMapCorrectly()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);

        var customFields = new Dictionary<string, object?>
        {
            ["student_id"] = "2026-00412",
            ["college"] = "College of Engineering",
            ["program"] = "BS Civil Engineering",
            ["year_level"] = "1st Year"
        };

        var command = new RegisterClinicPatientCommand(
            FirstName: "Juan",
            LastName: "Dela Cruz",
            MiddleName: "Bautista",
            Suffix: null,
            DateOfBirth: new DateOnly(2005, 8, 14),
            Gender: "Male",
            CivilStatus: "Single",
            ContactNumber: "0917-123-4567",
            Email: "juan.delacruz@school.edu",
            AddressLine: "123 Katipunan Ave",
            Barangay: "Loyola",
            City: "Quezon City",
            Province: "Metro Manila",
            EmergencyContactName: "Maria Dela Cruz",
            EmergencyContactPhone: "0917-999-8888",
            EmergencyContactRelationship: "Mother",
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: "O+",
            Allergies: "None",
            ChronicConditions: "None",
            Alerts: null,
            SyncPatientId: null,
            CustomFields: customFields,
            VerificationStatus: "Verified"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.FullName.Should().Be("Dela Cruz, Juan B.");
        result.CustomFields.Should().NotBeNull();
        result.CustomFields!["student_id"].Should().Be("2026-00412");
        result.CustomFields!["college"].Should().Be("College of Engineering");
        result.VerificationStatus.Should().Be("Verified");
    }

    [Fact]
    public async Task UploadAndVerifyRecordAttachment_ShouldSupportApprovalAndRejection()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var attachmentRepo = TestDbHelper.CreateRepository<ClinicRecordAttachment>(context, sieve);

        var uploadHandler = new UploadRecordAttachmentCommandHandler(attachmentRepo, uow, _clinicContext);
        var verifyHandler = new VerifyRecordAttachmentCommandHandler(attachmentRepo, uow, _clinicContext);

        var patientId = Guid.NewGuid();

        // Act 1 - Student self-uploads outside Chest X-Ray
        var uploadResult = await uploadHandler.Handle(new UploadRecordAttachmentCommand(
            PatientId: patientId,
            ConsultationId: null,
            RecordType: "ImagingReport",
            Title: "Chest X-Ray PA View",
            FileName: "xray_result_2026.pdf",
            ContentType: "application/pdf",
            FileSizeBytes: 1024 * 500,
            StorageUri: "https://r2.clinicez.ph/attachments/xray_result_2026.pdf",
            DocumentDate: new DateOnly(2026, 8, 15),
            Notes: "Hi-Precision Diliman - Normal",
            UploadedByStaffId: null,
            UploadedByStaffName: "StudentSelfUpload",
            VerificationStatus: "PendingVerification"
        ), CancellationToken.None);

        uploadResult.VerificationStatus.Should().Be("PendingVerification");

        // Act 2 - Clinic Staff reviews and approves the attachment
        var verifiedResult = await verifyHandler.Handle(new VerifyRecordAttachmentCommand(
            AttachmentId: uploadResult.Id,
            IsApproved: true
        ), CancellationToken.None);

        // Assert Approved
        verifiedResult.VerificationStatus.Should().Be("Verified");
        verifiedResult.RejectionReason.Should().BeNull();
        verifiedResult.VerifiedAt.Should().NotBeNull();

        // Act 3 - Another document rejected due to blurry scan
        var upload2 = await uploadHandler.Handle(new UploadRecordAttachmentCommand(
            PatientId: patientId,
            ConsultationId: null,
            RecordType: "LabResult",
            Title: "CBC Result",
            FileName: "cbc_blurry.jpg",
            ContentType: "image/jpeg",
            FileSizeBytes: 1024 * 100,
            StorageUri: "https://r2.clinicez.ph/attachments/cbc_blurry.jpg",
            DocumentDate: new DateOnly(2026, 8, 15),
            VerificationStatus: "PendingVerification"
        ), CancellationToken.None);

        var rejectedResult = await verifyHandler.Handle(new VerifyRecordAttachmentCommand(
            AttachmentId: upload2.Id,
            IsApproved: false,
            RejectionReason: "Photo is blurry. Please re-upload a clear copy."
        ), CancellationToken.None);

        // Assert Rejected
        rejectedResult.VerificationStatus.Should().Be("Rejected");
        rejectedResult.RejectionReason.Should().Be("Photo is blurry. Please re-upload a clear copy.");
    }

    [Fact]
    public async Task BulkRegisterPatients_ShouldBatchInsert_AndAssignSequentialCodes()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var bulkHandler = new BulkRegisterClinicPatientsCommandHandler(patientRepo, uow, _clinicContext);

        var students = new List<BulkPatientItemDto>
        {
            new("Alice", "Guerrero", "M", null, new DateOnly(2005, 3, 10), "Female", "Single", "09170000001", "alice@univ.edu.ph", null, null, null, null, null, null, null, null, null, null, "O+", null, null, null, new Dictionary<string, object?> { ["student_id"] = "2026-0001", ["college"] = "Engineering" }),
            new("Bob", "Tan", "K", null, new DateOnly(2005, 5, 12), "Male", "Single", "09170000002", "bob@univ.edu.ph", null, null, null, null, null, null, null, null, null, null, "A+", null, null, null, new Dictionary<string, object?> { ["student_id"] = "2026-0002", ["college"] = "Science" }),
            new("Charlie", "Sy", "L", null, new DateOnly(2005, 7, 24), "Male", "Single", "09170000003", "charlie@univ.edu.ph", null, null, null, null, null, null, null, null, null, null, "B+", null, null, null, new Dictionary<string, object?> { ["student_id"] = "2026-0003", ["college"] = "Arts" })
        };

        // Act
        var result = await bulkHandler.Handle(new BulkRegisterClinicPatientsCommand(students), CancellationToken.None);

        // Assert
        result.TotalProcessed.Should().Be(3);
        result.SuccessCount.Should().Be(3);
        result.CreatedPatients.Should().HaveCount(3);
        result.CreatedPatients[0].PatientCode.Should().StartWith($"PAT-{DateTime.UtcNow.Year}-");
        result.CreatedPatients[0].CustomFields.Should().ContainKey("student_id");
        result.CreatedPatients[0].VerificationStatus.Should().Be("PendingVerification");
    }

    [Fact]
    public async Task PublicStudentSelfEnroll_ShouldRegisterPatient_AndAttachDocuments_WithPendingVerification()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var attachmentRepo = TestDbHelper.CreateRepository<ClinicRecordAttachment>(context, sieve);
        var selfEnrollHandler = new PublicStudentSelfEnrollCommandHandler(patientRepo, attachmentRepo, uow, _clinicContext);

        var command = new PublicStudentSelfEnrollCommand(
            FirstName: "Kathryn",
            LastName: "Bernardo",
            MiddleName: "Manuel",
            DateOfBirth: new DateOnly(2006, 3, 26),
            Gender: "Female",
            ContactNumber: "0917-999-8888",
            Email: "kathryn@university.edu.ph",
            AddressLine: "10 Campus Drive",
            Barangay: "Loyola",
            City: "Quezon City",
            Province: "Metro Manila",
            EmergencyContactName: "Min Bernardo",
            EmergencyContactPhone: "0917-999-8889",
            EmergencyContactRelationship: "Mother",
            BloodType: "A+",
            StudentId: "2026-55102",
            College: "College of Communication",
            Program: "BA Broadcast Communication",
            YearLevel: "1st Year",
            Documents: new List<PublicUploadedDocumentDto>
            {
                new("OutsideChestXRay", "Chest X-Ray Film PA", "chest_xray.pdf", "https://r2.clinicez.ph/docs/xray.pdf", "Hi-Precision Diliman - Clear"),
                new("CertificateOfRegistration", "Certificate of Registration AY 2026", "cor_2026.pdf", "https://r2.clinicez.ph/docs/cor.pdf", "Official COR stamp present")
            }
        );

        // Act
        var result = await selfEnrollHandler.Handle(command, CancellationToken.None);

        // Assert
        result.Patient.Should().NotBeNull();
        result.Patient.FullName.Should().Be("Bernardo, Kathryn M.");
        result.Patient.VerificationStatus.Should().Be("PendingVerification");
        result.Patient.CustomFields.Should().ContainKey("student_id");
        result.Patient.CustomFields["student_id"].Should().Be("2026-55102");
        result.AttachedDocumentsCount.Should().Be(2);
        result.QueueToken.Should().StartWith("Q-");
    }
}

