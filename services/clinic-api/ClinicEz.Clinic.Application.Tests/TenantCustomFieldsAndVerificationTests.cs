using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.CustomFields.Commands;
using ClinicEz.Clinic.Application.Features.CustomFields.DTOs;
using ClinicEz.Clinic.Application.Features.CustomFields.Queries;
using ClinicEz.Clinic.Application.Features.CustomFields.Templates;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Records.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
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
        var verifyHandler = new VerifyRecordAttachmentCommandHandler(
            attachmentRepo, uow, _clinicContext, Substitute.For<ClinicEz.Clinic.Application.Common.Interfaces.IClinicRecordEventPublisher>());

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

    [Fact]
    public async Task CustomFields_GetTemplates_ShouldReturnPresetBundlesWithExactMetadata()
    {
        // Arrange
        var queryHandler = new GetCustomFieldTemplatesQueryHandler();

        // Act
        var templates = await queryHandler.Handle(new GetCustomFieldTemplatesQuery("ClinicPatient"), CancellationToken.None);

        // Assert
        templates.Should().NotBeNull();
        templates.Should().HaveCount(6);

        var ustp = templates.FirstOrDefault(t => t.Key == "university_ustp");
        ustp.Should().NotBeNull();
        ustp!.Name.Should().Be("University / School Clinic");
        ustp.FieldCount.Should().Be(8);
        ustp.Fields.Should().Contain(f => f.FieldKey == "affiliation" && f.IsRequired && f.DisplayOrder == 1);
        ustp.Fields.Should().Contain(f => f.FieldKey == "student_id" && f.VisibilityRuleJson != null);
        ustp.Fields.Should().Contain(f => f.FieldKey == "program" && f.ConditionalOptionsJson != null);

        var workplace = templates.FirstOrDefault(t => t.Key == "workplace_corporate");
        workplace.Should().NotBeNull();
        workplace!.FieldCount.Should().Be(4);
        workplace.Fields.Should().Contain(f => f.FieldKey == "employment_type");
        workplace.Fields.Should().Contain(f => f.FieldKey == "hmo_provider");

        var demo = templates.FirstOrDefault(t => t.Key == "general_demographics");
        demo.Should().NotBeNull();
        demo!.FieldCount.Should().Be(3);
        demo.Fields.Should().Contain(f => f.FieldKey == "spouse_information" && f.VisibilityRuleJson != null);

        var intake = templates.FirstOrDefault(t => t.Key == "patient_intake_contacts");
        intake.Should().NotBeNull();
        intake!.FieldCount.Should().Be(14);
        intake.Fields.Should().Contain(f => f.FieldKey == "primary_address_line" && f.IsRequired && f.Category == "Address");
        intake.Fields.Should().Contain(f => f.FieldKey == "emergency_contact_name" && f.IsRequired && f.Category == "Emergency Contacts");
    }

    [Fact]
    public async Task CustomFields_InstallTemplate_UniversityPreset_ShouldPersistAllEightFieldsWithExactVisibilityAndCascadingJson()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);
        var installHandler = new InstallCustomFieldTemplateCommandHandler(repo, uow, _clinicContext);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        // Act
        var installed = await installHandler.Handle(new InstallCustomFieldTemplateCommand("university_ustp"), CancellationToken.None);

        // Assert returned DTOs
        installed.Should().HaveCount(8);
        installed.Select(f => f.DisplayOrder).Should().ContainInOrder(1, 2, 3, 4, 5, 6, 7, 8);

        // Verify Student ID conditional visibility
        var studentIdField = installed.First(f => f.FieldKey == "student_id");
        studentIdField.IsRequired.Should().BeTrue();
        studentIdField.VisibilityRuleJson.Should().NotBeNull();
        studentIdField.VisibilityRuleJson.Should().Contain("\"field\":\"affiliation\"");
        studentIdField.VisibilityRuleJson.Should().Contain("\"value\":\"Student\"");

        // Verify Program cascading options JSON
        var programField = installed.First(f => f.FieldKey == "program");
        programField.ConditionalOptionsJson.Should().NotBeNull();
        programField.ConditionalOptionsJson.Should().Contain("\"parentField\":\"college\"");
        programField.ConditionalOptionsJson.Should().Contain("BS Civil Engineering");
        programField.ConditionalOptionsJson.Should().Contain("BS Information Technology");

        // Verify Employee ID condition
        var employeeIdField = installed.First(f => f.FieldKey == "employee_id");
        employeeIdField.VisibilityRuleJson.Should().Contain("\"value\":\"Employee/Faculty\"");

        // Verify query returns ordered list
        var queried = await queryHandler.Handle(new GetClinicCustomFieldsQuery("ClinicPatient"), CancellationToken.None);
        queried.Should().HaveCount(8);
        queried[0].FieldKey.Should().Be("affiliation");
        queried[1].FieldKey.Should().Be("student_id");
        queried[7].FieldKey.Should().Be("campus_location");
    }

    [Fact]
    public async Task CustomFields_InstallTemplate_ShouldBeIdempotent_WhenInstalledMultipleTimes()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);
        var installHandler = new InstallCustomFieldTemplateCommandHandler(repo, uow, _clinicContext);

        // Act - Run 1
        var firstInstall = await installHandler.Handle(new InstallCustomFieldTemplateCommand("university_ustp"), CancellationToken.None);
        firstInstall.Should().HaveCount(8);

        // Act - Run 2 (re-installing the same template)
        var secondInstall = await installHandler.Handle(new InstallCustomFieldTemplateCommand("university_ustp"), CancellationToken.None);

        // Assert - Count must remain exactly 8, no duplicates created
        secondInstall.Should().HaveCount(8);
        var allInDb = await repo.Query().ToListAsync();
        allInDb.Should().HaveCount(8);
    }

    [Fact]
    public async Task CustomFields_InstallTemplate_WithInvalidKey_ShouldThrowKeyNotFoundException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);
        var installHandler = new InstallCustomFieldTemplateCommandHandler(repo, uow, _clinicContext);

        // Act & Assert
        var act = () => installHandler.Handle(new InstallCustomFieldTemplateCommand("non_existent_preset"), CancellationToken.None);
        await act.Should().ThrowAsync<KeyNotFoundException>()
            .WithMessage("*non_existent_preset*");
    }

    [Fact]
    public async Task CustomFields_ReorderCustomFields_WithOrderedIds_ShouldUpdateDisplayOrders_Deterministically()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var reorderHandler = new ReorderCustomFieldsCommandHandler(repo, uow, _clinicContext);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        var f1 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("f_alpha", "Alpha", CustomFieldDataType.Text, "ClinicPatient", null, false, 1), CancellationToken.None);
        var f2 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("f_beta", "Beta", CustomFieldDataType.Text, "ClinicPatient", null, false, 2), CancellationToken.None);
        var f3 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("f_gamma", "Gamma", CustomFieldDataType.Text, "ClinicPatient", null, false, 3), CancellationToken.None);

        // Act - Reverse order via orderedIds: Gamma (3), Alpha (1), Beta (2)
        var reordered = await reorderHandler.Handle(new ReorderCustomFieldsCommand("ClinicPatient", orderedIds: new List<Guid> { f3.Id, f1.Id, f2.Id }), CancellationToken.None);

        // Assert
        reordered.Should().HaveCount(3);
        reordered[0].FieldKey.Should().Be("f_gamma");
        reordered[0].DisplayOrder.Should().Be(1);
        reordered[1].FieldKey.Should().Be("f_alpha");
        reordered[1].DisplayOrder.Should().Be(2);
        reordered[2].FieldKey.Should().Be("f_beta");
        reordered[2].DisplayOrder.Should().Be(3);

        // Verify querying respects the new order
        var queryResult = await queryHandler.Handle(new GetClinicCustomFieldsQuery("ClinicPatient"), CancellationToken.None);
        queryResult[0].FieldKey.Should().Be("f_gamma");
        queryResult[1].FieldKey.Should().Be("f_alpha");
        queryResult[2].FieldKey.Should().Be("f_beta");
    }

    [Fact]
    public async Task CustomFields_ReorderCustomFields_WithExplicitItems_ShouldUpdateDisplayOrders()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var reorderHandler = new ReorderCustomFieldsCommandHandler(repo, uow);

        var f1 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("order_a", "Item A", CustomFieldDataType.Text, "ClinicPatient", null, false, 10), CancellationToken.None);
        var f2 = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("order_b", "Item B", CustomFieldDataType.Text, "ClinicPatient", null, false, 20), CancellationToken.None);

        // Act - Explicitly swap display orders
        var items = new List<CustomFieldOrderItem>
        {
            new(f1.Id, 50),
            new(f2.Id, 5)
        };
        var reordered = await reorderHandler.Handle(new ReorderCustomFieldsCommand(items: items, entityType: "ClinicPatient"), CancellationToken.None);

        // Assert - f2 (5) before f1 (50)
        reordered.Should().HaveCount(2);
        reordered[0].FieldKey.Should().Be("order_b");
        reordered[0].DisplayOrder.Should().Be(5);
        reordered[1].FieldKey.Should().Be("order_a");
        reordered[1].DisplayOrder.Should().Be(50);
    }

    [Fact]
    public async Task CustomFields_UpdateDefinition_ShouldPersistVisibilityAndConditionalOptions()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);
        var updateHandler = new UpdateCustomFieldDefinitionCommandHandler(repo, uow);
        var queryHandler = new GetClinicCustomFieldsQueryHandler(repo);

        var created = await createHandler.Handle(new CreateCustomFieldDefinitionCommand("department", "Old Dept", CustomFieldDataType.Text, "ClinicPatient", null, false, 1), CancellationToken.None);

        // Act
        var updated = await updateHandler.Handle(new UpdateCustomFieldDefinitionCommand(
            Id: created.Id,
            Label: "Updated Department",
            DataType: CustomFieldDataType.Select,
            Category: "Corporate",
            IsRequired: true,
            DisplayOrder: 5,
            OptionsJson: "[\"HR\",\"IT\"]",
            Placeholder: "Choose department",
            IsActive: true,
            VisibilityRuleJson: "{\"source\":\"custom_field\",\"field\":\"affiliation\",\"operator\":\"equals\",\"value\":\"Employee\"}",
            ConditionalOptionsJson: null
        ), CancellationToken.None);

        // Assert
        updated.Label.Should().Be("Updated Department");
        updated.IsRequired.Should().BeTrue();
        updated.DisplayOrder.Should().Be(5);
        updated.VisibilityRuleJson.Should().Contain("\"value\":\"Employee\"");

        var queried = await queryHandler.Handle(new GetClinicCustomFieldsQuery("ClinicPatient"), CancellationToken.None);
        var found = queried.First(f => f.Id == created.Id);
        found.Label.Should().Be("Updated Department");
        found.VisibilityRuleJson.Should().Contain("\"value\":\"Employee\"");
    }

    [Fact]
    public async Task CustomFields_UpdateDefinition_WhenNotFound_ThrowsNotFoundException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);
        var updateHandler = new UpdateCustomFieldDefinitionCommandHandler(repo, uow);

        // Act & Assert
        var act = () => updateHandler.Handle(new UpdateCustomFieldDefinitionCommand(
            Id: Guid.NewGuid(),
            Label: "Non Existent",
            DataType: CustomFieldDataType.Text
        ), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task CustomFields_DynamicDictionary_ShouldPersistAndQueryCorrectlyOnClinicPatient()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var registerHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);

        var customFields = new Dictionary<string, object?>
        {
            ["affiliation"] = "Student",
            ["student_id"] = "2026-11982",
            ["college"] = "College of Information Technology and Computing",
            ["program"] = "BS Information Technology",
            ["year_level"] = "2nd Year",
            ["campus_location"] = "Cagayan de Oro (Main)"
        };

        var command = new RegisterClinicPatientCommand(
            FirstName: "Bea",
            LastName: "Alonzo",
            MiddleName: "Phils",
            Suffix: null,
            DateOfBirth: new DateOnly(2004, 10, 17),
            Gender: "Female",
            CivilStatus: "Single",
            ContactNumber: "0918-123-4567",
            Email: "bea.alonzo@ustp.edu.ph",
            AddressLine: "Lapasan Highway",
            Barangay: "Lapasan",
            City: "Cagayan de Oro",
            Province: "Misamis Oriental",
            EmergencyContactName: "Mary Alonzo",
            EmergencyContactPhone: "0918-999-1111",
            EmergencyContactRelationship: "Mother",
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: "B+",
            Allergies: "None",
            ChronicConditions: "None",
            Alerts: null,
            SyncPatientId: null,
            CustomFields: customFields,
            VerificationStatus: "Verified"
        );

        // Act
        var patient = await registerHandler.Handle(command, CancellationToken.None);

        // Assert
        patient.Should().NotBeNull();
        patient.CustomFields.Should().NotBeNull();
        patient.CustomFields!["affiliation"].Should().Be("Student");
        patient.CustomFields!["college"].Should().Be("College of Information Technology and Computing");
        patient.CustomFields!["program"].Should().Be("BS Information Technology");

        // Verify in DB directly to ensure JSON conversion and retrieval roundtrip
        var savedPatient = await patientRepo.Query().FirstAsync(p => p.Id == patient.Id);
        savedPatient.CustomFields.Should().ContainKey("student_id");
        savedPatient.CustomFields["student_id"]!.ToString().Should().Be("2026-11982");
    }

    [Fact]
    public async Task CustomFields_CreateDefinition_WithVisibilityAndConditionalOptions_ShouldPersist()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicCustomFieldDefinition>(context, sieve);
        var createHandler = new CreateCustomFieldDefinitionCommandHandler(repo, uow, _clinicContext);

        var visJson = "{\"source\":\"static\",\"field\":\"gender\",\"operator\":\"equals\",\"value\":\"Female\"}";
        var condJson = "{\"parentField\":\"college\",\"mapping\":{\"Nursing\":[\"BSN\"]},\"defaultOptions\":[]}";

        // Act
        var created = await createHandler.Handle(new CreateCustomFieldDefinitionCommand(
            FieldKey: "special_track",
            Label: "Special Track",
            DataType: CustomFieldDataType.Select,
            EntityType: "ClinicPatient",
            Category: "Student",
            IsRequired: true,
            DisplayOrder: 10,
            OptionsJson: "[]",
            Placeholder: "Choose track",
            VisibilityRuleJson: visJson,
            ConditionalOptionsJson: condJson
        ), CancellationToken.None);

        // Assert
        created.VisibilityRuleJson.Should().Be(visJson);
        created.ConditionalOptionsJson.Should().Be(condJson);

        var inDb = await repo.Query().FirstAsync(f => f.Id == created.Id);
        inDb.VisibilityRuleJson.Should().Be(visJson);
        inDb.ConditionalOptionsJson.Should().Be(condJson);
    }
}

