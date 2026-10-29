using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Interceptors;
using ClinicEz.Shared.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Challenger Stress Tests for Milestone M1:
/// Persistence, Multi-Tenancy & Referential Integrity.
/// 
/// Verifies:
/// 1. Multi-tenant query filtering: Child entities (LabObservation, PatientPhysicalExamFinding,
///    EncounterDiagnosis, PrescriptionItem, InvoiceLineItem) are never accessible across clinics.
/// 2. Soft-delete uniqueness: Filtered unique indexes (WHERE "IsDeleted" = false) allow inserting
///    records with identical unique keys after soft-deletion.
/// 3. Retail walk-in POS: Invoices with PatientId == null succeed cleanly.
/// 4. Referential integrity: Foreign keys on operational/clinical entities reference Patients with DeleteBehavior.Restrict.
/// 5. SoftDeleteSaveChangesInterceptor: Automatically intercepts physical deletes, converting them
///    to soft-delete updates with IsDeleted = true, DeletedAt, and DeletedBy, while enforcing WORM on AuditEntry.
/// </summary>
public class ChallengerM1PersistenceIntegrityStressTests
{
    private const string TenantA = "tenant-alpha";
    private const string TenantB = "tenant-beta";
    private static readonly Guid ClinicA = Guid.NewGuid();
    private static readonly Guid ClinicB = Guid.NewGuid();

    private static (ApplicationDbContext ContextA, ApplicationDbContext ContextB, ApplicationDbContext AdminContext)
        CreateTestCluster(string dbName, ICurrentUserService? currentUserService = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var clinicContextA = Substitute.For<IClinicContext>();
        clinicContextA.ClinicId.Returns(ClinicA);
        clinicContextA.TenantId.Returns(TenantA);

        var clinicContextB = Substitute.For<IClinicContext>();
        clinicContextB.ClinicId.Returns(ClinicB);
        clinicContextB.TenantId.Returns(TenantB);

        var adminClinicContext = Substitute.For<IClinicContext>();
        adminClinicContext.ClinicId.Returns(Guid.Empty);
        adminClinicContext.TenantId.Returns("admin-tenant");

        var interceptor = new SoftDeleteSaveChangesInterceptor(currentUserService);

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .AddInterceptors(interceptor)
            .Options;

        var contextA = new ApplicationDbContext(options, config, clinicContextA);
        var contextB = new ApplicationDbContext(options, config, clinicContextB);
        var adminContext = new ApplicationDbContext(options, config, adminClinicContext);

        return (contextA, contextB, adminContext);
    }

    #region 1. Multi-Tenant Query Filtering for Child Entities

    [Fact]
    public async Task MultiTenantQueryFilter_LabObservations_NeverAccessibleFromDifferentClinic()
    {
        var dbName = $"TestDb_LabObs_{Guid.NewGuid()}";
        var (contextA, contextB, adminContext) = CreateTestCluster(dbName);

        var labOrderA = new LabOrder
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            OrderNumber = "ORD-A-001",
            PatientName = "Patient Alpha",
            OrderDate = DateTime.UtcNow
        };
        var labOrderB = new LabOrder
        {
            TenantId = TenantB,
            ClinicId = ClinicB,
            OrderNumber = "ORD-B-001",
            PatientName = "Patient Beta",
            OrderDate = DateTime.UtcNow
        };
        adminContext.LabOrders.AddRange(labOrderA, labOrderB);
        await adminContext.SaveChangesAsync();

        var obsA = new LabObservation
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            LabOrderId = labOrderA.Id,
            AnalyteCode = "GLU",
            AnalyteName = "Glucose",
            ValueText = "95 mg/dL",
            NumericValue = 95m,
            Unit = "mg/dL"
        };
        var obsB = new LabObservation
        {
            TenantId = TenantB,
            ClinicId = ClinicB,
            LabOrderId = labOrderB.Id,
            AnalyteCode = "CHOL",
            AnalyteName = "Cholesterol",
            ValueText = "180 mg/dL",
            NumericValue = 180m,
            Unit = "mg/dL"
        };
        adminContext.LabObservations.AddRange(obsA, obsB);
        await adminContext.SaveChangesAsync();

        // Context A should see only obsA
        var itemsForClinicA = await contextA.LabObservations.ToListAsync();
        itemsForClinicA.Should().ContainSingle();
        itemsForClinicA[0].AnalyteCode.Should().Be("GLU");
        itemsForClinicA[0].ClinicId.Should().Be(ClinicA);

        // Context B should see only obsB
        var itemsForClinicB = await contextB.LabObservations.ToListAsync();
        itemsForClinicB.Should().ContainSingle();
        itemsForClinicB[0].AnalyteCode.Should().Be("CHOL");
        itemsForClinicB[0].ClinicId.Should().Be(ClinicB);

        // Admin context with IgnoreQueryFilters sees both
        var allObs = await adminContext.LabObservations.IgnoreQueryFilters().ToListAsync();
        allObs.Should().HaveCount(2);
    }

    [Fact]
    public async Task MultiTenantQueryFilter_PatientPhysicalExamFindings_NeverAccessibleFromDifferentClinic()
    {
        var dbName = $"TestDb_ExamFindings_{Guid.NewGuid()}";
        var (contextA, contextB, adminContext) = CreateTestCluster(dbName);

        var examA = new PatientPhysicalExam
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            ExamDate = DateTime.UtcNow,
            ExaminedByStaffName = "Dr. Alpha"
        };
        var examB = new PatientPhysicalExam
        {
            TenantId = TenantB,
            ClinicId = ClinicB,
            ExamDate = DateTime.UtcNow,
            ExaminedByStaffName = "Dr. Beta"
        };
        adminContext.PatientPhysicalExams.AddRange(examA, examB);
        await adminContext.SaveChangesAsync();

        var findingA = new PatientPhysicalExamFinding
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            PhysicalExamId = examA.Id,
            System = PhysicalExamSystem.Chest,
            FindingTitle = "Clear breath sounds",
            IsNormal = true
        };
        var findingB = new PatientPhysicalExamFinding
        {
            TenantId = TenantB,
            ClinicId = ClinicB,
            PhysicalExamId = examB.Id,
            System = PhysicalExamSystem.Heart,
            FindingTitle = "Systolic murmur Grade II/VI",
            IsNormal = false
        };
        adminContext.PatientPhysicalExamFindings.AddRange(findingA, findingB);
        await adminContext.SaveChangesAsync();

        // Verification
        var resultsA = await contextA.PatientPhysicalExamFindings.ToListAsync();
        resultsA.Should().ContainSingle();
        resultsA[0].FindingTitle.Should().Be("Clear breath sounds");
        resultsA[0].ClinicId.Should().Be(ClinicA);

        var resultsB = await contextB.PatientPhysicalExamFindings.ToListAsync();
        resultsB.Should().ContainSingle();
        resultsB[0].FindingTitle.Should().Be("Systolic murmur Grade II/VI");
        resultsB[0].ClinicId.Should().Be(ClinicB);
    }

    [Fact]
    public async Task MultiTenantQueryFilter_EncounterDiagnoses_NeverAccessibleFromDifferentClinic()
    {
        var dbName = $"TestDb_Diagnoses_{Guid.NewGuid()}";
        var (contextA, contextB, adminContext) = CreateTestCluster(dbName);

        var encounterA = new ConsultationEncounter
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            DoctorName = "Dr. Alpha",
            PatientName = "Patient Alpha",
            EncounterDate = DateTime.UtcNow
        };
        var encounterB = new ConsultationEncounter
        {
            TenantId = TenantB,
            ClinicId = ClinicB,
            DoctorName = "Dr. Beta",
            PatientName = "Patient Beta",
            EncounterDate = DateTime.UtcNow
        };
        adminContext.Consultations.AddRange(encounterA, encounterB);
        await adminContext.SaveChangesAsync();

        var diagA = new EncounterDiagnosis
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            ConsultationEncounterId = encounterA.Id,
            Icd10Code = "I10",
            Description = "Essential (primary) hypertension",
            IsPrimary = true
        };
        var diagB = new EncounterDiagnosis
        {
            TenantId = TenantB,
            ClinicId = ClinicB,
            ConsultationEncounterId = encounterB.Id,
            Icd10Code = "E11.9",
            Description = "Type 2 diabetes mellitus without complications",
            IsPrimary = true
        };
        adminContext.Diagnoses.AddRange(diagA, diagB);
        await adminContext.SaveChangesAsync();

        var diagnosesA = await contextA.Diagnoses.ToListAsync();
        diagnosesA.Should().ContainSingle();
        diagnosesA[0].Icd10Code.Should().Be("I10");
        diagnosesA[0].ClinicId.Should().Be(ClinicA);

        var diagnosesB = await contextB.Diagnoses.ToListAsync();
        diagnosesB.Should().ContainSingle();
        diagnosesB[0].Icd10Code.Should().Be("E11.9");
        diagnosesB[0].ClinicId.Should().Be(ClinicB);
    }

    [Fact]
    public async Task MultiTenantQueryFilter_PrescriptionItems_NeverAccessibleFromDifferentClinic()
    {
        var dbName = $"TestDb_Rx_{Guid.NewGuid()}";
        var (contextA, contextB, adminContext) = CreateTestCluster(dbName);

        var encounterA = new ConsultationEncounter
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            DoctorName = "Dr. Alpha",
            PatientName = "Patient Alpha",
            EncounterDate = DateTime.UtcNow
        };
        var encounterB = new ConsultationEncounter
        {
            TenantId = TenantB,
            ClinicId = ClinicB,
            DoctorName = "Dr. Beta",
            PatientName = "Patient Beta",
            EncounterDate = DateTime.UtcNow
        };
        adminContext.Consultations.AddRange(encounterA, encounterB);
        await adminContext.SaveChangesAsync();

        var rxA = new PrescriptionItem
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            ConsultationEncounterId = encounterA.Id,
            GenericName = "Amlodipine",
            Dosage = "5mg",
            Form = "Tablet",
            Sig = "1 tab once daily in the morning",
            Quantity = 30
        };
        var rxB = new PrescriptionItem
        {
            TenantId = TenantB,
            ClinicId = ClinicB,
            ConsultationEncounterId = encounterB.Id,
            GenericName = "Metformin",
            Dosage = "500mg",
            Form = "Tablet",
            Sig = "1 tab twice daily with meals",
            Quantity = 60
        };
        adminContext.Prescriptions.AddRange(rxA, rxB);
        await adminContext.SaveChangesAsync();

        var prescriptionsA = await contextA.Prescriptions.ToListAsync();
        prescriptionsA.Should().ContainSingle();
        prescriptionsA[0].GenericName.Should().Be("Amlodipine");
        prescriptionsA[0].ClinicId.Should().Be(ClinicA);

        var prescriptionsB = await contextB.Prescriptions.ToListAsync();
        prescriptionsB.Should().ContainSingle();
        prescriptionsB[0].GenericName.Should().Be("Metformin");
        prescriptionsB[0].ClinicId.Should().Be(ClinicB);
    }

    [Fact]
    public async Task MultiTenantQueryFilter_InvoiceLineItems_NeverAccessibleFromDifferentClinic()
    {
        var dbName = $"TestDb_LineItems_{Guid.NewGuid()}";
        var (contextA, contextB, adminContext) = CreateTestCluster(dbName);

        var invA = new Invoice
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            InvoiceNumber = "INV-A-101",
            PatientName = "Patient Alpha",
            GrossAmount = 500m,
            NetAmount = 500m
        };
        var invB = new Invoice
        {
            TenantId = TenantB,
            ClinicId = ClinicB,
            InvoiceNumber = "INV-B-202",
            PatientName = "Patient Beta",
            GrossAmount = 750m,
            NetAmount = 750m
        };
        adminContext.Invoices.AddRange(invA, invB);
        await adminContext.SaveChangesAsync();

        var lineA = new InvoiceLineItem
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            InvoiceId = invA.Id,
            Description = "General Consultation Fee",
            Category = "Consultation",
            UnitPrice = 500m,
            Quantity = 1,
            TotalPrice = 500m
        };
        var lineB = new InvoiceLineItem
        {
            TenantId = TenantB,
            ClinicId = ClinicB,
            InvoiceId = invB.Id,
            Description = "CBC with Platelet Count",
            Category = "Laboratory",
            UnitPrice = 750m,
            Quantity = 1,
            TotalPrice = 750m
        };
        adminContext.InvoiceLineItems.AddRange(lineA, lineB);
        await adminContext.SaveChangesAsync();

        var linesA = await contextA.InvoiceLineItems.ToListAsync();
        linesA.Should().ContainSingle();
        linesA[0].Description.Should().Be("General Consultation Fee");
        linesA[0].ClinicId.Should().Be(ClinicA);

        var linesB = await contextB.InvoiceLineItems.ToListAsync();
        linesB.Should().ContainSingle();
        linesB[0].Description.Should().Be("CBC with Platelet Count");
        linesB[0].ClinicId.Should().Be(ClinicB);
    }

    #endregion

    #region 2. Soft-Delete Uniqueness & Filtered Unique Indexes

    [Fact]
    public void FilteredUniqueIndexes_ConfiguredWithIsDeletedFalseFilter()
    {
        var (contextA, _, _) = CreateTestCluster($"TestDb_Metadata_{Guid.NewGuid()}");
        var model = contextA.Model;

        void AssertFilteredUniqueIndex<T>(params string[] propertyNames)
        {
            var entity = model.FindEntityType(typeof(T));
            entity.Should().NotBeNull($"Entity {typeof(T).Name} should exist in EF model");

            var matchedIndex = entity!.GetIndexes().FirstOrDefault(idx =>
                idx.IsUnique &&
                idx.Properties.Select(p => p.Name).SequenceEqual(propertyNames));

            matchedIndex.Should().NotBeNull(
                $"Unique index on {typeof(T).Name} ({string.Join(", ", propertyNames)}) must exist");
            
            var filter = matchedIndex!.GetFilter();
            filter.Should().NotBeNullOrWhiteSpace(
                $"Unique index on {typeof(T).Name} must define a partial filter");
            filter.Should().Contain("\"IsDeleted\" = false",
                $"Filter on {typeof(T).Name} must ensure soft-deleted records do not collide");
        }

        // Room -> (ClinicId, Name)
        AssertFilteredUniqueIndex<Room>("ClinicId", "Name");

        // ServiceItem -> (TenantId, ClinicId, Code)
        AssertFilteredUniqueIndex<ServiceItem>("TenantId", "ClinicId", "Code");

        // Invoice -> (TenantId, ClinicId, InvoiceNumber)
        AssertFilteredUniqueIndex<Invoice>("TenantId", "ClinicId", "InvoiceNumber");

        // LabOrder -> (TenantId, ClinicId, OrderNumber)
        AssertFilteredUniqueIndex<LabOrder>("TenantId", "ClinicId", "OrderNumber");

        // Patient -> (TenantId, ClinicId, PatientCode)
        AssertFilteredUniqueIndex<Patient>("TenantId", "ClinicId", "PatientCode");

        // Patient -> (ClinicId, CloudPatientId)
        AssertFilteredUniqueIndex<Patient>("ClinicId", "CloudPatientId");

        // PatientPhilHealthMembership -> (ClinicId, PatientId)
        AssertFilteredUniqueIndex<PatientPhilHealthMembership>("ClinicId", "PatientId");

        // PatientYakapEnlistment -> (ClinicId, PatientId, EffectiveYear)
        AssertFilteredUniqueIndex<PatientYakapEnlistment>("ClinicId", "PatientId", "EffectiveYear");

        // CustomFieldDefinition -> (TenantId, ClinicId, EntityType, FieldKey)
        AssertFilteredUniqueIndex<CustomFieldDefinition>("TenantId", "ClinicId", "EntityType", "FieldKey");

        // FacilitySettings -> (TenantId, ClinicId)
        AssertFilteredUniqueIndex<FacilitySettings>("TenantId", "ClinicId");

        // MedicalCertificate -> (TenantId, ClinicId, CertificateNumber)
        AssertFilteredUniqueIndex<MedicalCertificate>("TenantId", "ClinicId", "CertificateNumber");

        // ReferralLetter -> (TenantId, ClinicId, ReferralNumber)
        AssertFilteredUniqueIndex<ReferralLetter>("TenantId", "ClinicId", "ReferralNumber");

        // StaffMember -> (ClinicId, Email)
        AssertFilteredUniqueIndex<StaffMember>("ClinicId", "Email");

        // TeleconsultRecordingSegment -> (SessionId, SegmentIndex)
        AssertFilteredUniqueIndex<TeleconsultRecordingSegment>("SessionId", "SegmentIndex");
    }

    [Fact]
    public async Task SoftDeleteUniqueness_ReinsertingSameUniqueKeyAfterSoftDelete_Succeeds()
    {
        var dbName = $"TestDb_SoftDeleteReuse_{Guid.NewGuid()}";
        var currentUserService = Substitute.For<ICurrentUserService>();
        currentUserService.UserId.Returns("dr-audit");

        var (contextA, _, adminContext) = CreateTestCluster(dbName, currentUserService);

        // 1. Insert initial Room
        var room1 = new Room
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            Name = "Consultation Room 101",
            Code = "CR-101"
        };
        contextA.Rooms.Add(room1);
        await contextA.SaveChangesAsync();

        // 2. Soft-delete room1 via interceptor
        contextA.Rooms.Remove(room1);
        await contextA.SaveChangesAsync();

        room1.IsDeleted.Should().BeTrue();
        room1.DeletedAt.Should().NotBeNull();
        room1.DeletedBy.Should().Be("dr-audit");

        // In normal tenant context, room1 is now invisible
        var visibleRooms = await contextA.Rooms.ToListAsync();
        visibleRooms.Should().BeEmpty();

        // 3. Insert new active Room with the EXACT same unique key (ClinicId, Name)
        var room2 = new Room
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            Name = "Consultation Room 101",
            Code = "CR-101-NEW"
        };
        contextA.Rooms.Add(room2);
        var saveAction = () => contextA.SaveChangesAsync();
        await saveAction.Should().NotThrowAsync();

        // 4. Verification: Only room2 is active and returned
        var activeRooms = await contextA.Rooms.ToListAsync();
        activeRooms.Should().ContainSingle();
        activeRooms[0].Id.Should().Be(room2.Id);
        activeRooms[0].Name.Should().Be("Consultation Room 101");
        activeRooms[0].Code.Should().Be("CR-101-NEW");

        // 5. With IgnoreQueryFilters, both records coexist in the database store
        var allRooms = await adminContext.Rooms.IgnoreQueryFilters().ToListAsync();
        allRooms.Should().HaveCount(2);
        allRooms.Should().Contain(r => r.Id == room1.Id && r.IsDeleted);
        allRooms.Should().Contain(r => r.Id == room2.Id && !r.IsDeleted);
    }

    #endregion

    #region 3. Retail Walk-in POS & Referential Integrity

    [Fact]
    public async Task RetailWalkInPOS_InvoiceWithPatientIdNull_SucceedsWithLineItems()
    {
        var dbName = $"TestDb_WalkInPOS_{Guid.NewGuid()}";
        var (contextA, _, _) = CreateTestCluster(dbName);

        var walkInInvoice = new Invoice
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            InvoiceNumber = "POS-2026-00001",
            InvoiceDate = DateTime.UtcNow,
            PatientId = null, // Walk-in retail purchase without registered patient
            PatientName = "Walk-in Retail Customer",
            IsWalkInRetail = true,
            GrossAmount = 450m,
            NetAmount = 450m,
            AmountPaid = 450m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid
        };

        var lineItem1 = new InvoiceLineItem
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            Description = "Paracetamol 500mg Strip of 10",
            Category = "Pharmacy",
            UnitPrice = 50m,
            Quantity = 3,
            TotalPrice = 150m
        };

        var lineItem2 = new InvoiceLineItem
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            Description = "Digital Thermometer OTC",
            Category = "MedicalSupplies",
            UnitPrice = 300m,
            Quantity = 1,
            TotalPrice = 300m
        };

        walkInInvoice.LineItems.Add(lineItem1);
        walkInInvoice.LineItems.Add(lineItem2);

        contextA.Invoices.Add(walkInInvoice);
        await contextA.SaveChangesAsync();

        // Query back through a fresh query
        var retrievedInvoice = await contextA.Invoices
            .Include(i => i.LineItems)
            .FirstOrDefaultAsync(i => i.InvoiceNumber == "POS-2026-00001");

        retrievedInvoice.Should().NotBeNull();
        retrievedInvoice!.PatientId.Should().BeNull();
        retrievedInvoice.IsWalkInRetail.Should().BeTrue();
        retrievedInvoice.PatientName.Should().Be("Walk-in Retail Customer");
        retrievedInvoice.LineItems.Should().HaveCount(2);
        retrievedInvoice.LineItems.Sum(l => l.TotalPrice).Should().Be(450m);
    }

    [Fact]
    public void ReferentialIntegrity_PatientForeignKeys_ConfiguredWithDeleteBehaviorRestrict()
    {
        var (contextA, _, _) = CreateTestCluster($"TestDb_FkRestrict_{Guid.NewGuid()}");
        var model = contextA.Model;
        var patientEntity = model.FindEntityType(typeof(Patient));
        patientEntity.Should().NotBeNull();

        void AssertPatientForeignKeyRestrict<TDependent>(string? foreignKeyPropertyName = null)
        {
            var dependentEntity = model.FindEntityType(typeof(TDependent));
            dependentEntity.Should().NotBeNull($"Dependent entity {typeof(TDependent).Name} should exist in model");

            var fk = dependentEntity!.GetForeignKeys().FirstOrDefault(f =>
                f.PrincipalEntityType == patientEntity &&
                (foreignKeyPropertyName == null || f.Properties.Any(p => p.Name == foreignKeyPropertyName)));

            fk.Should().NotBeNull(
                $"Foreign key from {typeof(TDependent).Name} to Patient must exist");
            fk!.DeleteBehavior.Should().Be(DeleteBehavior.Restrict,
                $"Foreign key on {typeof(TDependent).Name} must enforce DeleteBehavior.Restrict to prevent orphan/accidental cascading deletion of clinical/financial records");
        }

        // Operational & Billing
        AssertPatientForeignKeyRestrict<Invoice>("PatientId");
        AssertPatientForeignKeyRestrict<Procedure>("PatientId");
        AssertPatientForeignKeyRestrict<Appointment>("PatientId");
        AssertPatientForeignKeyRestrict<QueueItem>("PatientId");
        AssertPatientForeignKeyRestrict<ConsultationEncounter>("PatientId");
        AssertPatientForeignKeyRestrict<LabOrder>("PatientId");

        // Clinical Profile & Statutory Records
        AssertPatientForeignKeyRestrict<PatientPhilHealthMembership>("PatientId");
        AssertPatientForeignKeyRestrict<PatientYakapEnlistment>("PatientId");
        AssertPatientForeignKeyRestrict<PatientAlert>("PatientId");
        AssertPatientForeignKeyRestrict<PatientAllergy>("PatientId");
        AssertPatientForeignKeyRestrict<PatientMedicalHistory>("PatientId");
        AssertPatientForeignKeyRestrict<PatientPhysicalExam>("PatientId");
        AssertPatientForeignKeyRestrict<PatientVitals>("PatientId");
        AssertPatientForeignKeyRestrict<PatientImmunization>("PatientId");
        AssertPatientForeignKeyRestrict<PatientSocialHistory>("PatientId");
        AssertPatientForeignKeyRestrict<PatientReproductiveHistory>("PatientId");
        AssertPatientForeignKeyRestrict<PatientFamilyHistory>("PatientId");
        AssertPatientForeignKeyRestrict<PatientSurgicalHistory>("PatientId");
        AssertPatientForeignKeyRestrict<NcdRiskAssessment>("PatientId");
        AssertPatientForeignKeyRestrict<DentalToothRecord>("PatientId");
    }

    #endregion

    #region 4. SoftDeleteSaveChangesInterceptor & WORM Protection

    [Fact]
    public async Task SoftDeleteSaveChangesInterceptor_ConvertsPhysicalDeleteToSoftDeleteUpdate()
    {
        var dbName = $"TestDb_Interceptor_{Guid.NewGuid()}";
        var currentUserService = Substitute.For<ICurrentUserService>();
        currentUserService.UserId.Returns("nurse-joy");

        var (contextA, _, adminContext) = CreateTestCluster(dbName, currentUserService);

        var patient = new Patient
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            PatientCode = "PAT-A-0001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1985, 3, 15),
            Gender = Gender.Male,
            ContactNumber = "0917-123-4567"
        };

        var beforeAdd = DateTime.UtcNow;
        contextA.Patients.Add(patient);
        await contextA.SaveChangesAsync();
        var afterAdd = DateTime.UtcNow;

        patient.CreatedAt.Should().BeOnOrAfter(beforeAdd).And.BeOnOrBefore(afterAdd);
        patient.CreatedBy.Should().Be("nurse-joy");
        patient.IsDeleted.Should().BeFalse();
        patient.DeletedAt.Should().BeNull();
        patient.DeletedBy.Should().BeNull();

        // Execute physical Remove
        var beforeDelete = DateTime.UtcNow;
        contextA.Patients.Remove(patient);
        await contextA.SaveChangesAsync();
        var afterDelete = DateTime.UtcNow;

        // In-memory verification: Entity was soft-deleted, NOT purged
        patient.IsDeleted.Should().BeTrue();
        patient.DeletedAt.Should().NotBeNull();
        patient.DeletedAt.Should().BeOnOrAfter(beforeDelete).And.BeOnOrBefore(afterDelete);
        patient.DeletedBy.Should().Be("nurse-joy");

        // Filtered out of standard queries
        var activeQuery = await contextA.Patients.FirstOrDefaultAsync(p => p.Id == patient.Id);
        activeQuery.Should().BeNull();

        // Present when querying with IgnoreQueryFilters
        var directQuery = await adminContext.Patients.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.Id == patient.Id);
        directQuery.Should().NotBeNull();
        directQuery!.IsDeleted.Should().BeTrue();
    }

    [Fact]
    public async Task SoftDeleteSaveChangesInterceptor_ExplicitIsDeletedModification_SetsDeletedAtAndBy()
    {
        var dbName = $"TestDb_ExplicitDelete_{Guid.NewGuid()}";
        var currentUserService = Substitute.For<ICurrentUserService>();
        currentUserService.UserId.Returns("admin-user");

        var (contextA, _, _) = CreateTestCluster(dbName, currentUserService);

        var serviceItem = new ServiceItem
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            Code = "SRV-TEST-01",
            Name = "Test Service",
            Category = "Consultation",
            StandardPrice = 300m
        };
        contextA.ServiceItems.Add(serviceItem);
        await contextA.SaveChangesAsync();

        // Mutate IsDeleted directly
        var beforeSoftDelete = DateTime.UtcNow;
        serviceItem.IsDeleted = true;
        await contextA.SaveChangesAsync();
        var afterSoftDelete = DateTime.UtcNow;

        serviceItem.DeletedAt.Should().NotBeNull();
        serviceItem.DeletedAt.Should().BeOnOrAfter(beforeSoftDelete).And.BeOnOrBefore(afterSoftDelete);
        serviceItem.DeletedBy.Should().Be("admin-user");
    }

    [Fact]
    public async Task SoftDeleteSaveChangesInterceptor_AllowHardDelete_AllowsPhysicalPurge()
    {
        var dbName = $"TestDb_HardDelete_{Guid.NewGuid()}";
        var (contextA, _, adminContext) = CreateTestCluster(dbName);

        var tempRoom = new Room
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            Name = "Temporary Storage",
            Code = "TMP-STORE"
        };
        contextA.Rooms.Add(tempRoom);
        await contextA.SaveChangesAsync();

        // Opt in to hard delete
        tempRoom.AllowHardDelete = true;
        contextA.Rooms.Remove(tempRoom);
        await contextA.SaveChangesAsync();

        // Physical deletion occurred
        var allRooms = await adminContext.Rooms.IgnoreQueryFilters().ToListAsync();
        allRooms.Should().NotContain(r => r.Id == tempRoom.Id);
    }

    [Fact]
    public async Task SoftDeleteSaveChangesInterceptor_AuditEntryWORMProtection_ThrowsOnModificationOrDeletion()
    {
        var dbName = $"TestDb_WORM_{Guid.NewGuid()}";
        var (contextA, _, _) = CreateTestCluster(dbName);

        var audit = new AuditEntry
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            Category = ClinicAuditCategories.Operations,
            Severity = ClinicAuditSeverities.Routine,
            Action = "PATIENT_CREATED",
            ActorName = "Dr. Smith",
            ActorRole = "Physician",
            TargetEntityType = "Patient",
            TargetEntityId = Guid.NewGuid().ToString(),
            Outcome = ClinicAuditOutcomes.Success,
            Description = "Patient record created",
            Timestamp = DateTime.UtcNow
        };
        contextA.AuditEntries.Add(audit);
        await contextA.SaveChangesAsync();

        // Attempt deletion of immutable WORM AuditEntry
        contextA.AuditEntries.Remove(audit);
        var deleteAction = () => contextA.SaveChangesAsync();
        await deleteAction.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*AuditEntry is append-only (WORM)*RA 10173*");

        // Detach or reset
        contextA.Entry(audit).State = EntityState.Unchanged;

        // Attempt modification of immutable WORM AuditEntry
        audit.Action = "MUTATED_ACTION";
        var modifyAction = () => contextA.SaveChangesAsync();
        await modifyAction.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*AuditEntry is append-only (WORM)*RA 10173*");
    }

    #endregion

    #region 5. Additional Adversarial Boundary Stress Tests

    [Fact]
    public async Task MultiTenantQueryFilter_DirectQueryWithMismatchedClinicId_ReturnsZeroResults()
    {
        var dbName = $"TestDb_MismatchedQuery_{Guid.NewGuid()}";
        var (contextA, _, adminContext) = CreateTestCluster(dbName);

        var obs = new LabObservation
        {
            TenantId = TenantB,
            ClinicId = ClinicB,
            AnalyteCode = "HEM",
            AnalyteName = "Hemoglobin",
            ValueText = "14.2 g/dL",
            NumericValue = 14.2m
        };
        adminContext.LabObservations.Add(obs);
        await adminContext.SaveChangesAsync();

        // Querying specifically for ClinicB through contextA returns empty due to global filter ClinicId == ClinicA
        var result = await contextA.LabObservations.Where(o => o.ClinicId == ClinicB).ToListAsync();
        result.Should().BeEmpty();
    }

    [Fact]
    public async Task SoftDeleteUniqueness_MultipleSuccessiveSoftDeletesAndReinserts_Succeeds()
    {
        var dbName = $"TestDb_MultiReinsert_{Guid.NewGuid()}";
        var currentUserService = Substitute.For<ICurrentUserService>();
        currentUserService.UserId.Returns("supervisor-1");

        var (contextA, _, adminContext) = CreateTestCluster(dbName, currentUserService);

        const string code = "SRV-STANDARD-CONSULT";

        // Cycle 1: Insert & Soft-delete
        var s1 = new ServiceItem
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            Code = code,
            Name = "Initial Consult V1",
            Category = "Consultation",
            StandardPrice = 400m
        };
        contextA.ServiceItems.Add(s1);
        await contextA.SaveChangesAsync();
        contextA.ServiceItems.Remove(s1);
        await contextA.SaveChangesAsync();

        // Cycle 2: Insert & Soft-delete
        var s2 = new ServiceItem
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            Code = code,
            Name = "Initial Consult V2",
            Category = "Consultation",
            StandardPrice = 450m
        };
        contextA.ServiceItems.Add(s2);
        await contextA.SaveChangesAsync();
        contextA.ServiceItems.Remove(s2);
        await contextA.SaveChangesAsync();

        // Cycle 3: Insert active
        var s3 = new ServiceItem
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            Code = code,
            Name = "Initial Consult V3",
            Category = "Consultation",
            StandardPrice = 500m
        };
        contextA.ServiceItems.Add(s3);
        await contextA.SaveChangesAsync();

        // Verification: Only s3 is visible
        var visible = await contextA.ServiceItems.ToListAsync();
        visible.Should().ContainSingle();
        visible[0].Id.Should().Be(s3.Id);
        visible[0].StandardPrice.Should().Be(500m);

        // Store contains all 3 versions
        var all = await adminContext.ServiceItems.IgnoreQueryFilters().Where(s => s.Code == code).ToListAsync();
        all.Should().HaveCount(3);
        all.Count(s => s.IsDeleted).Should().Be(2);
        all.Count(s => !s.IsDeleted).Should().Be(1);
    }

    [Fact]
    public async Task SoftDeleteUniqueness_InvoiceAndPatientCodeReuse_Succeeds()
    {
        var dbName = $"TestDb_InvoiceCodeReuse_{Guid.NewGuid()}";
        var (contextA, _, _) = CreateTestCluster(dbName);

        // 1. Invoice Number reuse
        var inv1 = new Invoice
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            InvoiceNumber = "INV-REUSE-001",
            PatientName = "Patient One",
            GrossAmount = 100m,
            NetAmount = 100m
        };
        contextA.Invoices.Add(inv1);
        await contextA.SaveChangesAsync();

        contextA.Invoices.Remove(inv1);
        await contextA.SaveChangesAsync();

        var inv2 = new Invoice
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            InvoiceNumber = "INV-REUSE-001",
            PatientName = "Patient Two",
            GrossAmount = 200m,
            NetAmount = 200m
        };
        contextA.Invoices.Add(inv2);
        await contextA.SaveChangesAsync();

        var activeInvoices = await contextA.Invoices.Where(i => i.InvoiceNumber == "INV-REUSE-001").ToListAsync();
        activeInvoices.Should().ContainSingle();
        activeInvoices[0].PatientName.Should().Be("Patient Two");

        // 2. Patient Code reuse
        var pat1 = new Patient
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            PatientCode = "PAT-CODE-REUSE-01",
            FirstName = "Maria",
            LastName = "Santos",
            DateOfBirth = new DateOnly(1992, 4, 10),
            Gender = Gender.Female,
            ContactNumber = "0918-000-0001"
        };
        contextA.Patients.Add(pat1);
        await contextA.SaveChangesAsync();

        contextA.Patients.Remove(pat1);
        await contextA.SaveChangesAsync();

        var pat2 = new Patient
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            PatientCode = "PAT-CODE-REUSE-01",
            FirstName = "Rosa",
            LastName = "Santos",
            DateOfBirth = new DateOnly(1994, 8, 22),
            Gender = Gender.Female,
            ContactNumber = "0918-000-0002"
        };
        contextA.Patients.Add(pat2);
        await contextA.SaveChangesAsync();

        var activePatients = await contextA.Patients.Where(p => p.PatientCode == "PAT-CODE-REUSE-01").ToListAsync();
        activePatients.Should().ContainSingle();
        activePatients[0].FirstName.Should().Be("Rosa");
    }

    [Fact]
    public async Task RetailWalkInPOS_InvoiceWithPaymentsAndDiscounts_Succeeds()
    {
        var dbName = $"TestDb_POSPayments_{Guid.NewGuid()}";
        var (contextA, _, _) = CreateTestCluster(dbName);

        var walkInInvoice = new Invoice
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            InvoiceNumber = "POS-WALKIN-999",
            PatientId = null,
            PatientName = "Senior Walk-in Citizen",
            IsWalkInRetail = true,
            DiscountType = DiscountType.SeniorCitizen,
            DiscountIdNumber = "OSCA-12345",
            GrossAmount = 1000m,
            DiscountPercentage = 20m,
            DiscountAmount = 200m,
            NetAmount = 800m,
            AmountPaid = 800m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid
        };

        var payment = new PaymentRecord
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            PaymentNumber = "PAY-WALKIN-001",
            Amount = 800m,
            Method = PaymentMethod.Cash,
            ReferenceNumber = "CASH-REC-001"
        };

        walkInInvoice.Payments.Add(payment);

        contextA.Invoices.Add(walkInInvoice);
        await contextA.SaveChangesAsync();

        var loadedInvoice = await contextA.Invoices
            .Include(i => i.Payments)
            .FirstOrDefaultAsync(i => i.InvoiceNumber == "POS-WALKIN-999");

        loadedInvoice.Should().NotBeNull();
        loadedInvoice!.PatientId.Should().BeNull();
        loadedInvoice.DiscountType.Should().Be(DiscountType.SeniorCitizen);
        loadedInvoice.DiscountAmount.Should().Be(200m);
        loadedInvoice.NetAmount.Should().Be(800m);
        loadedInvoice.Payments.Should().ContainSingle();
        loadedInvoice.Payments.First().Amount.Should().Be(800m);
    }

    [Fact]
    public async Task ReferentialIntegrity_DeletingPatientWithActiveInvoices_EnforcesRestrictBehavior()
    {
        var dbName = $"TestDb_RestrictRuntime_{Guid.NewGuid()}";
        var (contextA, _, _) = CreateTestCluster(dbName);

        var patient = new Patient
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            PatientCode = "PAT-RESTRICT-01",
            FirstName = "Pedro",
            LastName = "Penduko",
            DateOfBirth = new DateOnly(1980, 1, 1),
            Gender = Gender.Male,
            ContactNumber = "0917-000-1111"
        };
        contextA.Patients.Add(patient);
        await contextA.SaveChangesAsync();

        var history = new PatientMedicalHistory
        {
            TenantId = TenantA,
            ClinicId = ClinicA,
            PatientId = patient.Id,
            Category = MedicalHistoryCategory.MedicalHistory,
            ConditionTitle = "Hypertension",
            SpecificDescription = "Essential hypertension",
            Status = ProblemStatus.Active
        };
        patient.MedicalHistories.Add(history);
        await contextA.SaveChangesAsync();

        // Attempt physical delete with AllowHardDelete = true while dependent PatientMedicalHistory is tracked
        patient.AllowHardDelete = true;
        var removeAction = () => contextA.Patients.Remove(patient);
        removeAction.Should().Throw<InvalidOperationException>()
            .WithMessage("*association between entity types 'Patient' and 'PatientMedicalHistory' has been severed*");
    }

    #endregion
}
