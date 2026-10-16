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
    public void GenerateTranche1Xml_PediatricMale_ShouldProduceDtdValidXml()
    {
        // Pediatric boy (age 3) with child immunizations, length & head circ
        var baseDoc = CreateSampleDocument();
        var pediatricProfile = baseDoc.Profiles[0] with
        {
            PatientAge = "3 YR(S), 2 MO(S), 10 DAY(S)",
            Immunizations = new[] { new YakapImmunization("BCG", "", "", "", "") },
            MenstrualHistory = new YakapMenstrualHistory("0", "", "0", "0", "0", "0", "", "", "", "N"),
            PregnancyHistory = new YakapPregnancyHistory("0", "0", "X", "0", "0", "0", "0", "N", "N", "N"),
            PhysicalExam = new YakapPhysicalExamPertinent("90", "60", "95", "22", "36.8", "95", "14", "15.5",
                Length: "95", HeadCirc: "49", MidUpperArmCirc: "14.5", ZScore: "0"),
            SocialHistory = new YakapSocialHistory("N", "", "N", "", "N", "N")
        };

        var doc = baseDoc with { Profiles = new[] { pediatricProfile } };
        var xml = _generator.GenerateTranche1Xml(doc);

        xml.Should().NotBeNullOrWhiteSpace();
        xml.Should().Contain("pChildImmcode=\"BCG\"");
        xml.Should().Contain("pLength=\"95\"");
        xml.Should().Contain("pHeadCirc=\"49\"");

        var valResult = _validator.ValidateReportXml(xml);
        valResult.IsValid.Should().BeTrue(string.Join("; ", valResult.Errors.Select(e => e.Message)));
    }

    [Fact]
    public void GenerateTranche1Xml_AdolescentFemale_ShouldProduceDtdValidXml()
    {
        // Adolescent girl (age 14) with active menstrual history and HPV immunization
        var baseDoc = CreateSampleDocument();
        var teenProfile = baseDoc.Profiles[0] with
        {
            PatientAge = "14 YR(S), 6 MO(S), 0 DAY(S)",
            Immunizations = new[] { new YakapImmunization("", "HPV", "", "", "") },
            MenstrualHistory = new YakapMenstrualHistory("12", "2026-09-15", "4", "28", "3", "0", "None", "N", "", "Y"),
            PregnancyHistory = new YakapPregnancyHistory("0", "0", "X", "0", "0", "0", "0", "N", "N", "N"),
            PhysicalExam = new YakapPhysicalExamPertinent("110", "70", "78", "18", "36.6", "155", "48", "20.0", Waist: "65", Hip: "85"),
            SocialHistory = new YakapSocialHistory("N", "", "N", "", "N", "N")
        };

        var doc = baseDoc with { Profiles = new[] { teenProfile } };
        var xml = _generator.GenerateTranche1Xml(doc);

        xml.Should().NotBeNullOrWhiteSpace();
        xml.Should().Contain("pYoungwImmcode=\"HPV\"");
        xml.Should().Contain("pMenarchePeriod=\"12\"");

        var valResult = _validator.ValidateReportXml(xml);
        valResult.IsValid.Should().BeTrue(string.Join("; ", valResult.Errors.Select(e => e.Message)));
    }

    [Fact]
    public void GenerateTranche1Xml_AdultFemalePregnant_ShouldProduceDtdValidXml()
    {
        // Pregnant woman (age 28, Gravida 2, Para 1) with TT immunization
        var baseDoc = CreateSampleDocument();
        var pregProfile = baseDoc.Profiles[0] with
        {
            PatientAge = "28 YR(S), 1 MO(S), 5 DAY(S)",
            Immunizations = new[] { new YakapImmunization("", "", "TT", "", "") },
            MenstrualHistory = new YakapMenstrualHistory("13", "2026-04-10", "3", "28", "2", "20", "None", "N", "", "Y"),
            PregnancyHistory = new YakapPregnancyHistory("2", "1", "V", "1", "0", "0", "1", "N", "Y", "Y"),
            PhysicalExam = new YakapPhysicalExamPertinent("115", "75", "80", "18", "36.5", "160", "62", "24.2", Waist: "88", Hip: "96")
        };

        var doc = baseDoc with { Profiles = new[] { pregProfile } };
        var xml = _generator.GenerateTranche1Xml(doc);

        xml.Should().NotBeNullOrWhiteSpace();
        xml.Should().Contain("pPregwImmcode=\"TT\"");
        xml.Should().Contain("pPregCnt=\"2\"");
        xml.Should().Contain("pDeliveryCnt=\"1\"");

        var valResult = _validator.ValidateReportXml(xml);
        valResult.IsValid.Should().BeTrue(string.Join("; ", valResult.Errors.Select(e => e.Message)));
    }

    [Fact]
    public void GenerateTranche1Xml_ElderlyPatient_ShouldProduceDtdValidXml()
    {
        // Senior patient (age 68) with menopause and elderly flu vaccine
        var baseDoc = CreateSampleDocument();
        var seniorProfile = baseDoc.Profiles[0] with
        {
            PatientAge = "68 YR(S), 8 MO(S), 12 DAY(S)",
            Immunizations = new[] { new YakapImmunization("", "", "", "FLU", "") },
            MenstrualHistory = new YakapMenstrualHistory("13", "", "0", "0", "0", "22", "None", "Y", "50", "Y"),
            PregnancyHistory = new YakapPregnancyHistory("3", "3", "V", "3", "0", "0", "3", "N", "Y", "Y"),
            PhysicalExam = new YakapPhysicalExamPertinent("135", "85", "70", "16", "36.4", "152", "55", "23.8", Waist: "82", Hip: "92")
        };

        var doc = baseDoc with { Profiles = new[] { seniorProfile } };
        var xml = _generator.GenerateTranche1Xml(doc);

        xml.Should().NotBeNullOrWhiteSpace();
        xml.Should().Contain("pElderlyImmcode=\"FLU\"");
        xml.Should().Contain("pIsMenopause=\"Y\"");
        xml.Should().Contain("pMenopauseAge=\"50\"");

        var valResult = _validator.ValidateReportXml(xml);
        valResult.IsValid.Should().BeTrue(string.Join("; ", valResult.Errors.Select(e => e.Message)));
    }

    [Fact]
    public void GenerateTranche1Xml_EmptyCollections_ShouldProduceDtdValidXml_ViaDefensiveFallbacks()
    {
        // Profile with empty lists (simulating patient with no prior history recorded)
        var baseDoc = CreateSampleDocument();
        var emptyProfile = baseDoc.Profiles[0] with
        {
            MedicalHistories = Array.Empty<YakapMedicalHistory>(),
            MedicalSpecifics = Array.Empty<YakapSpecificHistory>(),
            SurgicalHistories = Array.Empty<YakapSurgicalHistory>(),
            FamilyHistories = Array.Empty<YakapMedicalHistory>(),
            FamilySpecifics = Array.Empty<YakapSpecificHistory>(),
            Immunizations = Array.Empty<YakapImmunization>(),
            PhysicalExamMiscs = Array.Empty<YakapPhysicalExamMisc>()
        };

        var doc = baseDoc with { Profiles = new[] { emptyProfile } };
        var xml = _generator.GenerateTranche1Xml(doc);

        xml.Should().NotBeNullOrWhiteSpace();
        // Fallbacks must be emitted
        xml.Should().Contain("<MEDHIST pMdiseaseCode=\"99\"");
        xml.Should().Contain("<MHSPECIFIC pMdiseaseCode=\"99\" pSpecificDesc=\"None\"");
        xml.Should().Contain("<SURGHIST pSurgDesc=\"None\"");
        xml.Should().Contain("<FAMHIST pMdiseaseCode=\"99\"");
        xml.Should().Contain("<FHSPECIFIC pMdiseaseCode=\"99\" pSpecificDesc=\"None\"");
        xml.Should().Contain("<PEMISC pSkinId=\"1\"");

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

    [Fact]
    public void GenerateTranche1Xml_SkippedNcdQuestions_LeavesAttributesBlankAndPassesDtd()
    {
        var baseDoc = CreateSampleDocument();
        // Patient with No chest pain, No diabetes medication, No raised biomarkers (so child questions are skipped/blank)
        var skippedNcdAnswers = new YakapNcdAnswers(
            Qid1Yn: "Y",
            Qid2Yn: "N",
            Qid3Yn: "Y",
            Qid4Yn: "N",
            Qid5Ynx: "N",
            Qid6Yn: "N",
            Qid7Yn: "N",
            Qid8Yn: "N",
            Qid9Yn: "N", // Chest pain negative
            Qid10Yn: "", // Skipped
            Qid11Yn: "", // Skipped
            Qid12Yn: "", // Skipped
            Qid13Yn: "", // Skipped
            Qid14Yn: "", // Skipped
            Qid15Yn: "Y",
            Qid16Yn: "N",
            Qid17Abcde: "A",
            Qid18Yn: "", // Skipped (No diagnosed diabetes)
            Qid19Yn: "N",
            Qid19Fbsmg: "",
            Qid19Fbsmmol: "",
            Qid19Fbsdate: "",
            Qid20Yn: "N",
            Qid20Choleval: "",
            Qid20Choledate: "",
            Qid21Yn: "N",
            Qid21Ketonval: "",
            Qid21Ketondate: "",
            Qid22Yn: "N",
            Qid22Proteinval: "",
            Qid22Proteindate: "",
            Qid23Yn: "N",
            Qid24Yn: "N");

        var profileWithSkippedNcd = baseDoc.Profiles[0] with { NcdAnswers = skippedNcdAnswers };
        var doc = baseDoc with { Profiles = new[] { profileWithSkippedNcd } };

        var xml = _generator.GenerateTranche1Xml(doc);

        xml.Should().NotBeNullOrWhiteSpace();
        xml.Should().Contain("pQid9_Yn=\"N\"");
        xml.Should().Contain("pQid10_Yn=\"\"");
        xml.Should().Contain("pQid11_Yn=\"\"");
        xml.Should().Contain("pQid12_Yn=\"\"");
        xml.Should().Contain("pQid13_Yn=\"\"");
        xml.Should().Contain("pQid14_Yn=\"\"");
        xml.Should().Contain("pQid18_Yn=\"\"");
        xml.Should().Contain("pQid19_Fbsmg=\"\"");

        // Strict DTD validation confirms empty string satisfies CDATA #REQUIRED
        var valResult = _validator.ValidateReportXml(xml);
        valResult.IsValid.Should().BeTrue(string.Join("; ", valResult.Errors.Select(e => e.Message)));
    }

    public static YakapReportDocument CreateSampleDocument()
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
                    MenstrualHistory: new YakapMenstrualHistory("", "", "", "", "", "", "", "N", "", "N"),
                    PregnancyHistory: new YakapPregnancyHistory("", "", "", "", "", "", "", "", "", "N"),
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

    public static YakapReportDocument CreateSampleDocumentWithSoapAndMeds()
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
