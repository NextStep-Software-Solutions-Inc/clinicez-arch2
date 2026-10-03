using ClinicEz.PhilHealthProxy.Domain.Models.Yakap;
using ClinicEz.PhilHealthProxy.Infrastructure.Services;
using FluentAssertions;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Services;

public sealed class KonsultaXmlGeneratorTests
{
    private readonly KonsultaXmlGenerator _generator = new();
    private readonly KonsultaXmlValidator _validator = new();

    [Fact]
    public void GenerateTranche1Xml_ShouldProduceDtdValidXml()
    {
        // Arrange
        var doc = CreateSampleDocument();

        // Act
        var xml = _generator.GenerateTranche1Xml(doc);

        // Assert
        xml.Should().NotBeNullOrWhiteSpace();
        xml.Should().Contain("<!DOCTYPE PCB SYSTEM \"KonsultaData_v1.14.dtd\">");
        xml.Should().Contain("<ENLISTMENTS>");
        xml.Should().Contain("<PROFILING>");
        xml.Should().Contain("<SOAPS>");
        xml.Should().Contain("<MEDICINES>");

        // Validate generated XML strictly against embedded DTD schema!
        var valResult = _validator.ValidateReportXml(xml);
        valResult.IsValid.Should().BeTrue(string.Join("; ", valResult.Errors.Select(e => e.Message)));
    }

    [Fact]
    public void GenerateTranche2Xml_ShouldProduceDtdValidXml_WithPopulatedSoapAndMedicines()
    {
        // Arrange
        var doc = CreateSampleDocumentWithSoapAndMeds();

        // Act
        var xml = _generator.GenerateTranche2Xml(doc);

        // Assert
        xml.Should().NotBeNullOrWhiteSpace();
        xml.Should().Contain("<ICD pIcdCode=\"E11.9\"");
        xml.Should().Contain("<MEDICINE");
        xml.Should().Contain("pGenericCode=\"METFO\"");

        // Validate generated Tranche 2 XML strictly against DTD!
        var valResult = _validator.ValidateReportXml(xml);
        valResult.IsValid.Should().BeTrue(string.Join("; ", valResult.Errors.Select(e => e.Message)));
    }

    [Fact]
    public void FormatAgeString_ShouldComputeCorrectAge()
    {
        var dob = new DateTime(2000, 5, 10);
        var asOf = new DateTime(2026, 10, 3);

        var ageStr = KonsultaXmlGenerator.FormatAgeString(dob, asOf);
        ageStr.Should().Be("26 YR(S), 4 MO(S), 23 DAY(S)");
    }

    [Fact]
    public void FormatDrugCode_ShouldProduce30CharConcatenatedCode()
    {
        var code = KonsultaXmlGenerator.FormatDrugCode("METFO", "00000", "00500", "TAB50", "00000", "00100");
        code.Length.Should().Be(30);
        code.Should().Be("METFO0000000500TAB500000000100");
    }

    [Fact]
    public void FormatTransmittalNumbers_ShouldMatchPhilHealthConvention()
    {
        var date = new DateTime(2026, 10, 3);
        const string accreNo = "H90000001";

        KonsultaXmlGenerator.FormatTransmittalNumber(accreNo, date, 1).Should().Be("RH9000000120261000001");
        KonsultaXmlGenerator.FormatCaseNumber(accreNo, date, 1).Should().Be("TH9000000120261000001");
        KonsultaXmlGenerator.FormatEnlistmentTransNumber(accreNo, date, 1).Should().Be("EH9000000120261000001");
        KonsultaXmlGenerator.FormatProfileTransNumber(accreNo, date, 1).Should().Be("PH9000000120261000001");
        KonsultaXmlGenerator.FormatSoapTransNumber(accreNo, date, 1).Should().Be("SH9000000120261000001");
    }

    private static YakapReportDocument CreateSampleDocument()
    {
        return new YakapReportDocument(
            Username: "H90000001",
            Password: "password",
            HciAccreNo: "H90000001",
            PmccNo: "P00001",
            CertificationId: "KON-DUMMYSCERTP00001",
            HciTransmittalNumber: "RH9000000120261000001",
            Enlistments: new[]
            {
                new YakapEnlistment(
                    HciCaseNo: "TH9000000120261000001",
                    HciTransNo: "EH9000000120261000001",
                    EffYear: "2026",
                    EnlistStat: "1",
                    EnlistDate: "2026-10-01",
                    PackageType: "K",
                    MemPin: "030263078507",
                    MemFname: "JUAN",
                    MemMname: "SANTOS",
                    MemLname: "DELA CRUZ",
                    MemExtname: "",
                    MemDob: "1985-05-15",
                    PatientPin: "030263078507",
                    PatientFname: "JUAN",
                    PatientMname: "SANTOS",
                    PatientLname: "DELA CRUZ",
                    PatientExtname: "",
                    PatientSex: "M",
                    PatientDob: "1985-05-15",
                    PatientType: "MM",
                    PatientMobileNo: "09171234567",
                    PatientLandlineNo: "",
                    WithConsent: "Y",
                    TransDate: "2026-10-01",
                    CreatedBy: "CLINICADMIN")
            },
            Profiles: new[]
            {
                new YakapProfile(
                    HciTransNo: "PH9000000120261000001",
                    HciCaseNo: "TH9000000120261000001",
                    ProfDate: "2026-10-01",
                    PatientPin: "030263078507",
                    PatientType: "MM",
                    PatientAge: "41 YR(S), 4 MO(S), 16 DAY(S)",
                    MemPin: "030263078507",
                    EffYear: "2026",
                    ATC: "WALKEDIN",
                    IsWalkedIn: "Y",
                    TransDate: "2026-10-01",
                    MedicalHistories: new[] { new YakapMedicalHistory("001") },
                    MedicalSpecifics: new[] { new YakapSpecificHistory("001", "Asthma") },
                    SurgicalHistories: new[] { new YakapSurgicalHistory("None", "2026-01-01") },
                    FamilyHistories: new[] { new YakapMedicalHistory("006") },
                    FamilySpecifics: new[] { new YakapSpecificHistory("006", "Type 2 Diabetes") },
                    SocialHistory: new YakapSocialHistory("N", "", "N", "", "N", "Y"),
                    Immunizations: new[] { new YakapImmunization("", "", "", "999", "") },
                    MenstrualHistory: new YakapMenstrualHistory("0", "", "0", "0", "0", "0", "", "", "", "N"),
                    PregnancyHistory: new YakapPregnancyHistory("0", "0", "X", "0", "0", "0", "0", "N", "N", "N"),
                    PhysicalExam: new YakapPhysicalExamPertinent("120", "80", "72", "18", "36.5", "170", "68", "23.5"),
                    BloodType: "O+",
                    GenSurveyId: "1",
                    GenSurveyRem: "",
                    PhysicalExamMiscs: new[] { new YakapPhysicalExamMisc("", "1", "", "", "", "", "", "") },
                    PhysicalExamSpecifics: new YakapPhysicalExamSpecific("", "Normal HEENT", "", "", "", "", "", ""),
                    NcdAnswers: new YakapNcdAnswers(Qid1Yn: "N", Qid2Yn: "N"))
            },
            Soaps: Array.Empty<YakapSoap>(),
            DiagnosticResults: Array.Empty<YakapDiagnosticResult>(),
            Medicines: Array.Empty<YakapMedicine>());
    }

    private static YakapReportDocument CreateSampleDocumentWithSoapAndMeds()
    {
        var baseDoc = CreateSampleDocument();
        return baseDoc with
        {
            Soaps = new[]
            {
                new YakapSoap(
                    HciCaseNo: "TH9000000120261000001",
                    HciTransNo: "SH9000000120261000001",
                    SoapDate: "2026-10-02",
                    PatientPin: "030263078507",
                    PatientType: "MM",
                    MemPin: "030263078507",
                    EffYear: "2026",
                    ATC: "WALKEDIN",
                    IsWalkedIn: "Y",
                    CoPay: "0",
                    TransDate: "2026-10-02",
                    IllnessHistory: "Hypertension follow up",
                    SignsSymptoms: "37;X",
                    OtherComplaint: "Mild headache",
                    PainSite: "",
                    PhysicalExam: new YakapPhysicalExamPertinent("130", "85", "74", "18", "36.6", "170", "68", "23.5"),
                    PhysicalExamMiscs: new[] { new YakapPhysicalExamMisc("", "1", "", "", "", "", "", "") },
                    PhysicalExamSpecifics: new YakapPhysicalExamSpecific("", "Clear", "", "", "", "", "", ""),
                    IcdCodes: new[] { "E11.9", "I10" },
                    Diagnostics: new[] { new YakapDiagnosticOrder("1", "", "Y", "RQ") },
                    Managements: new[] { new YakapManagement("1", "") },
                    AdviceRemarks: "Maintain low sodium diet and take medications regularly.")
            },
            Medicines = new[]
            {
                new YakapMedicine(
                    HciCaseNo: "TH9000000120261000001",
                    HciTransNo: "SH9000000120261000001",
                    Category: "GAMOT",
                    DrugCode: "METFO0000000500TAB500000000100",
                    GenericCode: "METFO",
                    SaltCode: "00000",
                    StrengthCode: "00500",
                    FormCode: "TAB50",
                    UnitCode: "00000",
                    PackageCode: "00100",
                    OtherMedicine: "",
                    OthMedDrugGrouping: "NCD",
                    Route: "Oral",
                    Quantity: "30",
                    ActualUnitPrice: "5.00",
                    TotalAmtPrice: "150.00",
                    InstructionQuantity: "1",
                    InstructionStrength: "500mg",
                    InstructionFrequency: "Once a day with meals",
                    PrescribingPhysician: "Dr. Maria Santos",
                    IsDispensed: "Y",
                    DateDispensed: "2026-10-02",
                    DispensingPersonnel: "Pharmacist Ana Cruz",
                    IsApplicable: "Y",
                    DateAdded: "2026-10-02")
            }
        };
    }
}
