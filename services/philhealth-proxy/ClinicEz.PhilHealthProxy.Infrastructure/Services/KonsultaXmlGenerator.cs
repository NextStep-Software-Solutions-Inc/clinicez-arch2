using System.Text;
using System.Xml.Linq;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models.Yakap;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Services;

/// <summary>
/// Generates strictly compliant XML documents conforming to PhilHealth KonsultaData_v1.14.dtd.
/// </summary>
public sealed class KonsultaXmlGenerator : IKonsultaXmlGenerator
{
    public string GenerateTranche1Xml(YakapReportDocument doc)
    {
        var root = BuildPcbRoot(doc, isTranche1: true);

        // 1. ENLISTMENTS
        root.Add(BuildEnlistmentsElement(doc.Enlistments));

        // 2. PROFILING
        root.Add(BuildProfilingElement(doc.Profiles));

        // 3. SOAPS — DTD mandates SOAPS+, emit required placeholder for Tranche 1
        root.Add(BuildPlaceholderSoapsElement());

        // 4. DIAGNOSTICEXAMRESULTS — Optional in DTD (*), emit if profiling labs exist
        if (doc.DiagnosticResults.Count > 0)
        {
            root.Add(BuildDiagnosticExamResultsElement(doc.DiagnosticResults));
        }

        // 5. MEDICINES — DTD mandates MEDICINES+, emit required placeholder for Tranche 1
        root.Add(BuildPlaceholderMedicinesElement());

        return SerializeXml(root);
    }

    public string GenerateTranche2Xml(YakapReportDocument doc)
    {
        var root = BuildPcbRoot(doc, isTranche1: false);

        // 1. ENLISTMENTS
        root.Add(BuildEnlistmentsElement(doc.Enlistments));

        // 2. PROFILING
        root.Add(BuildProfilingElement(doc.Profiles));

        // 3. SOAPS — full consultations
        root.Add(doc.Soaps.Count > 0 ? BuildSoapsElement(doc.Soaps) : BuildPlaceholderSoapsElement());

        // 4. DIAGNOSTICEXAMRESULTS
        if (doc.DiagnosticResults.Count > 0)
        {
            root.Add(BuildDiagnosticExamResultsElement(doc.DiagnosticResults));
        }

        // 5. MEDICINES — full dispensed GAMOT medications
        root.Add(doc.Medicines.Count > 0 ? BuildMedicinesElement(doc.Medicines) : BuildPlaceholderMedicinesElement());

        return SerializeXml(root);
    }

    // ── Helper Formatting Utilities ──────────────────────────────────────────

    public static string FormatTransmittalNumber(string accreNo, DateTime date, int sequence) =>
        $"R{accreNo.Trim()}{date:yyyyMM}{sequence:D5}";

    public static string FormatCaseNumber(string accreNo, DateTime date, int sequence) =>
        $"T{accreNo.Trim()}{date:yyyyMM}{sequence:D5}";

    public static string FormatEnlistmentTransNumber(string accreNo, DateTime date, int sequence) =>
        $"E{accreNo.Trim()}{date:yyyyMM}{sequence:D5}";

    public static string FormatProfileTransNumber(string accreNo, DateTime date, int sequence) =>
        $"P{accreNo.Trim()}{date:yyyyMM}{sequence:D5}";

    public static string FormatSoapTransNumber(string accreNo, DateTime date, int sequence) =>
        $"S{accreNo.Trim()}{date:yyyyMM}{sequence:D5}";

    public static string FormatDrugCode(string generic, string salt, string strength, string form, string unit, string package)
    {
        string PadOrTrunc(string val) => (val ?? string.Empty).PadRight(5)[..5].ToUpperInvariant();
        return $"{PadOrTrunc(generic)}{PadOrTrunc(salt)}{PadOrTrunc(strength)}{PadOrTrunc(form)}{PadOrTrunc(unit)}{PadOrTrunc(package)}";
    }

    public static string FormatAgeString(DateTime dateOfBirth, DateTime asOfDate)
    {
        int years = asOfDate.Year - dateOfBirth.Year;
        int months = asOfDate.Month - dateOfBirth.Month;
        int days = asOfDate.Day - dateOfBirth.Day;

        if (days < 0)
        {
            months--;
            var prevMonth = asOfDate.AddMonths(-1);
            days += DateTime.DaysInMonth(prevMonth.Year, prevMonth.Month);
        }

        if (months < 0)
        {
            years--;
            months += 12;
        }

        return $"{Math.Max(0, years)} YR(S), {Math.Max(0, months)} MO(S), {Math.Max(0, days)} DAY(S)";
    }

    // ── XML Tree Builders ───────────────────────────────────────────────────

    private static XElement BuildPcbRoot(YakapReportDocument doc, bool isTranche1)
    {
        int soapCount = isTranche1 ? doc.Profiles.Count : doc.Soaps.Count;
        return new XElement("PCB",
            new XAttribute("pUsername", doc.Username ?? string.Empty),
            new XAttribute("pPassword", doc.Password ?? string.Empty),
            new XAttribute("pHciAccreNo", doc.HciAccreNo),
            new XAttribute("pPMCCNo", doc.PmccNo),
            new XAttribute("pEnlistTotalCnt", doc.Enlistments.Count.ToString()),
            new XAttribute("pProfileTotalCnt", doc.Profiles.Count.ToString()),
            new XAttribute("pSoapTotalCnt", soapCount.ToString()),
            new XAttribute("pCertificationId", doc.CertificationId),
            new XAttribute("pHciTransmittalNumber", doc.HciTransmittalNumber));
    }

    private static XElement BuildEnlistmentsElement(IReadOnlyList<YakapEnlistment> enlistments)
    {
        var element = new XElement("ENLISTMENTS");
        foreach (var e in enlistments)
        {
            element.Add(new XElement("ENLISTMENT",
                new XAttribute("pHciCaseNo", e.HciCaseNo),
                new XAttribute("pHciTransNo", e.HciTransNo),
                new XAttribute("pEffYear", e.EffYear),
                new XAttribute("pEnlistStat", e.EnlistStat),
                new XAttribute("pEnlistDate", e.EnlistDate),
                new XAttribute("pPackageType", e.PackageType),
                new XAttribute("pMemPin", e.MemPin),
                new XAttribute("pMemFname", e.MemFname),
                new XAttribute("pMemMname", e.MemMname ?? string.Empty),
                new XAttribute("pMemLname", e.MemLname),
                new XAttribute("pMemExtname", e.MemExtname ?? string.Empty),
                new XAttribute("pMemDob", e.MemDob),
                new XAttribute("pPatientPin", e.PatientPin),
                new XAttribute("pPatientFname", e.PatientFname),
                new XAttribute("pPatientMname", e.PatientMname ?? string.Empty),
                new XAttribute("pPatientLname", e.PatientLname),
                new XAttribute("pPatientExtname", e.PatientExtname ?? string.Empty),
                new XAttribute("pPatientSex", e.PatientSex),
                new XAttribute("pPatientDob", e.PatientDob),
                new XAttribute("pPatientType", e.PatientType),
                new XAttribute("pPatientMobileNo", e.PatientMobileNo ?? string.Empty),
                new XAttribute("pPatientLandlineNo", e.PatientLandlineNo ?? string.Empty),
                new XAttribute("pWithConsent", e.WithConsent),
                new XAttribute("pTransDate", e.TransDate),
                new XAttribute("pCreatedBy", e.CreatedBy),
                new XAttribute("pReportStatus", e.ReportStatus),
                new XAttribute("pDeficiencyRemarks", e.DeficiencyRemarks)));
        }
        return element;
    }

    private static XElement BuildProfilingElement(IReadOnlyList<YakapProfile> profiles)
    {
        var element = new XElement("PROFILING");
        foreach (var p in profiles)
        {
            var profileElem = new XElement("PROFILE",
                new XAttribute("pHciTransNo", p.HciTransNo),
                new XAttribute("pHciCaseNo", p.HciCaseNo),
                new XAttribute("pProfDate", p.ProfDate),
                new XAttribute("pPatientPin", p.PatientPin),
                new XAttribute("pPatientType", p.PatientType),
                new XAttribute("pPatientAge", p.PatientAge),
                new XAttribute("pMemPin", p.MemPin),
                new XAttribute("pEffYear", p.EffYear),
                new XAttribute("pATC", p.ATC),
                new XAttribute("pIsWalkedIn", p.IsWalkedIn),
                new XAttribute("pTransDate", p.TransDate),
                new XAttribute("pReportStatus", p.ReportStatus),
                new XAttribute("pDeficiencyRemarks", p.DeficiencyRemarks));

            // MEDHISTS (DTD mandates MEDHIST+)
            var medHistsElem = new XElement("MEDHISTS");
            if (p.MedicalHistories != null && p.MedicalHistories.Count > 0)
            {
                foreach (var mh in p.MedicalHistories)
                    medHistsElem.Add(new XElement("MEDHIST",
                        new XAttribute("pMdiseaseCode", mh.MdiseaseCode),
                        new XAttribute("pReportStatus", mh.ReportStatus),
                        new XAttribute("pDeficiencyRemarks", mh.DeficiencyRemarks)));
            }
            else
            {
                medHistsElem.Add(new XElement("MEDHIST",
                    new XAttribute("pMdiseaseCode", "99"),
                    new XAttribute("pReportStatus", "U"),
                    new XAttribute("pDeficiencyRemarks", string.Empty)));
            }
            profileElem.Add(medHistsElem);

            // MHSPECIFICS (DTD mandates MHSPECIFIC+)
            var mhSpecsElem = new XElement("MHSPECIFICS");
            if (p.MedicalSpecifics != null && p.MedicalSpecifics.Count > 0)
            {
                foreach (var mhs in p.MedicalSpecifics)
                    mhSpecsElem.Add(new XElement("MHSPECIFIC",
                        new XAttribute("pMdiseaseCode", mhs.MdiseaseCode),
                        new XAttribute("pSpecificDesc", mhs.SpecificDesc),
                        new XAttribute("pReportStatus", mhs.ReportStatus),
                        new XAttribute("pDeficiencyRemarks", mhs.DeficiencyRemarks)));
            }
            else
            {
                mhSpecsElem.Add(new XElement("MHSPECIFIC",
                    new XAttribute("pMdiseaseCode", "99"),
                    new XAttribute("pSpecificDesc", "None"),
                    new XAttribute("pReportStatus", "U"),
                    new XAttribute("pDeficiencyRemarks", string.Empty)));
            }
            profileElem.Add(mhSpecsElem);

            // SURGHISTS (DTD mandates SURGHIST+)
            var surgHistsElem = new XElement("SURGHISTS");
            if (p.SurgicalHistories != null && p.SurgicalHistories.Count > 0)
            {
                foreach (var sh in p.SurgicalHistories)
                    surgHistsElem.Add(new XElement("SURGHIST",
                        new XAttribute("pSurgDesc", sh.SurgDesc),
                        new XAttribute("pSurgDate", sh.SurgDate),
                        new XAttribute("pReportStatus", sh.ReportStatus),
                        new XAttribute("pDeficiencyRemarks", sh.DeficiencyRemarks)));
            }
            else
            {
                surgHistsElem.Add(new XElement("SURGHIST",
                    new XAttribute("pSurgDesc", "None"),
                    new XAttribute("pSurgDate", string.Empty),
                    new XAttribute("pReportStatus", "U"),
                    new XAttribute("pDeficiencyRemarks", string.Empty)));
            }
            profileElem.Add(surgHistsElem);

            // FAMHISTS (DTD mandates FAMHIST+)
            var famHistsElem = new XElement("FAMHISTS");
            if (p.FamilyHistories != null && p.FamilyHistories.Count > 0)
            {
                foreach (var fh in p.FamilyHistories)
                    famHistsElem.Add(new XElement("FAMHIST",
                        new XAttribute("pMdiseaseCode", fh.MdiseaseCode),
                        new XAttribute("pReportStatus", fh.ReportStatus),
                        new XAttribute("pDeficiencyRemarks", fh.DeficiencyRemarks)));
            }
            else
            {
                famHistsElem.Add(new XElement("FAMHIST",
                    new XAttribute("pMdiseaseCode", "99"),
                    new XAttribute("pReportStatus", "U"),
                    new XAttribute("pDeficiencyRemarks", string.Empty)));
            }
            profileElem.Add(famHistsElem);

            // FHSPECIFICS (DTD mandates FHSPECIFIC+)
            var fhSpecsElem = new XElement("FHSPECIFICS");
            if (p.FamilySpecifics != null && p.FamilySpecifics.Count > 0)
            {
                foreach (var fhs in p.FamilySpecifics)
                    fhSpecsElem.Add(new XElement("FHSPECIFIC",
                        new XAttribute("pMdiseaseCode", fhs.MdiseaseCode),
                        new XAttribute("pSpecificDesc", fhs.SpecificDesc),
                        new XAttribute("pReportStatus", fhs.ReportStatus),
                        new XAttribute("pDeficiencyRemarks", fhs.DeficiencyRemarks)));
            }
            else
            {
                fhSpecsElem.Add(new XElement("FHSPECIFIC",
                    new XAttribute("pMdiseaseCode", "99"),
                    new XAttribute("pSpecificDesc", "None"),
                    new XAttribute("pReportStatus", "U"),
                    new XAttribute("pDeficiencyRemarks", string.Empty)));
            }
            profileElem.Add(fhSpecsElem);

            // SOCHIST
            var shist = p.SocialHistory;
            profileElem.Add(new XElement("SOCHIST",
                new XAttribute("pIsSmoker", shist.IsSmoker),
                new XAttribute("pNoCigpk", shist.NoCigpk ?? string.Empty),
                new XAttribute("pIsAdrinker", shist.IsAdrinker),
                new XAttribute("pNoBottles", shist.NoBottles ?? string.Empty),
                new XAttribute("pIllDrugUser", shist.IllDrugUser),
                new XAttribute("pIsSexuallyActive", shist.IsSexuallyActive),
                new XAttribute("pReportStatus", shist.ReportStatus),
                new XAttribute("pDeficiencyRemarks", shist.DeficiencyRemarks)));

            // IMMUNIZATIONS (DTD mandates IMMUNIZATION+)
            var immElem = new XElement("IMMUNIZATIONS");
            if (p.Immunizations != null && p.Immunizations.Count > 0)
            {
                foreach (var imm in p.Immunizations)
                    immElem.Add(new XElement("IMMUNIZATION",
                        new XAttribute("pChildImmcode", imm.ChildImmcode ?? string.Empty),
                        new XAttribute("pYoungwImmcode", imm.YoungwImmcode ?? string.Empty),
                        new XAttribute("pPregwImmcode", imm.PregwImmcode ?? string.Empty),
                        new XAttribute("pElderlyImmcode", imm.ElderlyImmcode ?? string.Empty),
                        new XAttribute("pOtherImm", imm.OtherImm ?? string.Empty),
                        new XAttribute("pReportStatus", imm.ReportStatus),
                        new XAttribute("pDeficiencyRemarks", imm.DeficiencyRemarks)));
            }
            else
            {
                immElem.Add(new XElement("IMMUNIZATION",
                    new XAttribute("pChildImmcode", string.Empty),
                    new XAttribute("pYoungwImmcode", string.Empty),
                    new XAttribute("pPregwImmcode", string.Empty),
                    new XAttribute("pElderlyImmcode", string.Empty),
                    new XAttribute("pOtherImm", "999"),
                    new XAttribute("pReportStatus", "U"),
                    new XAttribute("pDeficiencyRemarks", string.Empty)));
            }
            profileElem.Add(immElem);

            // MENSHIST
            var m = p.MenstrualHistory;
            profileElem.Add(new XElement("MENSHIST",
                new XAttribute("pMenarchePeriod", m.MenarchePeriod ?? string.Empty),
                new XAttribute("pLastMensPeriod", m.LastMensPeriod ?? string.Empty),
                new XAttribute("pPeriodDuration", m.PeriodDuration ?? string.Empty),
                new XAttribute("pMensInterval", m.MensInterval ?? string.Empty),
                new XAttribute("pPadsPerDay", m.PadsPerDay ?? string.Empty),
                new XAttribute("pOnsetSexIc", m.OnsetSexIc ?? string.Empty),
                new XAttribute("pBirthCtrlMethod", m.BirthCtrlMethod ?? string.Empty),
                new XAttribute("pIsMenopause", m.IsMenopause ?? string.Empty),
                new XAttribute("pMenopauseAge", m.MenopauseAge ?? string.Empty),
                new XAttribute("pIsApplicable", m.IsApplicable),
                new XAttribute("pReportStatus", m.ReportStatus),
                new XAttribute("pDeficiencyRemarks", m.DeficiencyRemarks ?? string.Empty)));

            // PREGHIST
            var preg = p.PregnancyHistory;
            profileElem.Add(new XElement("PREGHIST",
                new XAttribute("pPregCnt", preg.PregCnt ?? string.Empty),
                new XAttribute("pDeliveryCnt", preg.DeliveryCnt ?? string.Empty),
                new XAttribute("pDeliveryTyp", preg.DeliveryTyp ?? string.Empty),
                new XAttribute("pFullTermCnt", preg.FullTermCnt ?? string.Empty),
                new XAttribute("pPrematureCnt", preg.PrematureCnt ?? string.Empty),
                new XAttribute("pAbortionCnt", preg.AbortionCnt ?? string.Empty),
                new XAttribute("pLivChildrenCnt", preg.LivChildrenCnt ?? string.Empty),
                new XAttribute("pWPregIndhyp", preg.WPregIndhyp ?? string.Empty),
                new XAttribute("pWFamPlan", preg.WFamPlan ?? string.Empty),
                new XAttribute("pIsApplicable", preg.IsApplicable),
                new XAttribute("pReportStatus", preg.ReportStatus),
                new XAttribute("pDeficiencyRemarks", preg.DeficiencyRemarks ?? string.Empty)));

            // PEPERT
            profileElem.Add(BuildPepertElement(p.PhysicalExam));

            // BLOODTYPE
            profileElem.Add(new XElement("BLOODTYPE",
                new XAttribute("pBloodType", p.BloodType),
                new XAttribute("pReportStatus", "U"),
                new XAttribute("pDeficiencyRemarks", string.Empty)));

            // PEGENSURVEY
            profileElem.Add(new XElement("PEGENSURVEY",
                new XAttribute("pGenSurveyId", p.GenSurveyId),
                new XAttribute("pGenSurveyRem", p.GenSurveyRem ?? string.Empty),
                new XAttribute("pReportStatus", "U"),
                new XAttribute("pDeficiencyRemarks", string.Empty)));

            // PEMISCS (DTD mandates PEMISC+)
            var pemiscsElem = new XElement("PEMISCS");
            if (p.PhysicalExamMiscs != null && p.PhysicalExamMiscs.Count > 0)
            {
                foreach (var misc in p.PhysicalExamMiscs)
                    pemiscsElem.Add(new XElement("PEMISC",
                        new XAttribute("pSkinId", misc.SkinId ?? string.Empty),
                        new XAttribute("pHeentId", misc.HeentId ?? string.Empty),
                        new XAttribute("pChestId", misc.ChestId ?? string.Empty),
                        new XAttribute("pHeartId", misc.HeartId ?? string.Empty),
                        new XAttribute("pAbdomenId", misc.AbdomenId ?? string.Empty),
                        new XAttribute("pNeuroId", misc.NeuroId ?? string.Empty),
                        new XAttribute("pGuId", misc.GuId ?? string.Empty),
                        new XAttribute("pRectalId", misc.RectalId ?? string.Empty),
                        new XAttribute("pReportStatus", misc.ReportStatus),
                        new XAttribute("pDeficiencyRemarks", misc.DeficiencyRemarks)));
            }
            else
            {
                pemiscsElem.Add(new XElement("PEMISC",
                    new XAttribute("pSkinId", "1"),
                    new XAttribute("pHeentId", "1"),
                    new XAttribute("pChestId", "1"),
                    new XAttribute("pHeartId", "1"),
                    new XAttribute("pAbdomenId", "1"),
                    new XAttribute("pNeuroId", "1"),
                    new XAttribute("pGuId", "1"),
                    new XAttribute("pRectalId", "1"),
                    new XAttribute("pReportStatus", "U"),
                    new XAttribute("pDeficiencyRemarks", string.Empty)));
            }
            profileElem.Add(pemiscsElem);

            // PESPECIFIC
            var pes = p.PhysicalExamSpecifics;
            profileElem.Add(new XElement("PESPECIFIC",
                new XAttribute("pSkinRem", pes.SkinRem ?? string.Empty),
                new XAttribute("pHeentRem", pes.HeentRem ?? string.Empty),
                new XAttribute("pChestRem", pes.ChestRem ?? string.Empty),
                new XAttribute("pHeartRem", pes.HeartRem ?? string.Empty),
                new XAttribute("pAbdomenRem", pes.AbdomenRem ?? string.Empty),
                new XAttribute("pNeuroRem", pes.NeuroRem ?? string.Empty),
                new XAttribute("pRectalRem", pes.RectalRem ?? string.Empty),
                new XAttribute("pGuRem", pes.GuRem ?? string.Empty),
                new XAttribute("pReportStatus", pes.ReportStatus),
                new XAttribute("pDeficiencyRemarks", pes.DeficiencyRemarks)));

            // NCDQANS
            var ncd = p.NcdAnswers;
            profileElem.Add(new XElement("NCDQANS",
                new XAttribute("pQid1_Yn", ncd.Qid1Yn ?? string.Empty),
                new XAttribute("pQid2_Yn", ncd.Qid2Yn ?? string.Empty),
                new XAttribute("pQid3_Yn", ncd.Qid3Yn ?? string.Empty),
                new XAttribute("pQid4_Yn", ncd.Qid4Yn ?? string.Empty),
                new XAttribute("pQid5_Ynx", ncd.Qid5Ynx ?? string.Empty),
                new XAttribute("pQid6_Yn", ncd.Qid6Yn ?? string.Empty),
                new XAttribute("pQid7_Yn", ncd.Qid7Yn ?? string.Empty),
                new XAttribute("pQid8_Yn", ncd.Qid8Yn ?? string.Empty),
                new XAttribute("pQid9_Yn", ncd.Qid9Yn ?? string.Empty),
                new XAttribute("pQid10_Yn", ncd.Qid10Yn ?? string.Empty),
                new XAttribute("pQid11_Yn", ncd.Qid11Yn ?? string.Empty),
                new XAttribute("pQid12_Yn", ncd.Qid12Yn ?? string.Empty),
                new XAttribute("pQid13_Yn", ncd.Qid13Yn ?? string.Empty),
                new XAttribute("pQid14_Yn", ncd.Qid14Yn ?? string.Empty),
                new XAttribute("pQid15_Yn", ncd.Qid15Yn ?? string.Empty),
                new XAttribute("pQid16_Yn", ncd.Qid16Yn ?? string.Empty),
                new XAttribute("pQid17_Abcde", ncd.Qid17Abcde ?? string.Empty),
                new XAttribute("pQid18_Yn", ncd.Qid18Yn ?? string.Empty),
                new XAttribute("pQid19_Yn", ncd.Qid19Yn ?? string.Empty),
                new XAttribute("pQid19_Fbsmg", ncd.Qid19Fbsmg ?? string.Empty),
                new XAttribute("pQid19_Fbsmmol", ncd.Qid19Fbsmmol ?? string.Empty),
                new XAttribute("pQid19_Fbsdate", ncd.Qid19Fbsdate ?? string.Empty),
                new XAttribute("pQid20_Yn", ncd.Qid20Yn ?? string.Empty),
                new XAttribute("pQid20_Choleval", ncd.Qid20Choleval ?? string.Empty),
                new XAttribute("pQid20_Choledate", ncd.Qid20Choledate ?? string.Empty),
                new XAttribute("pQid21_Yn", ncd.Qid21Yn ?? string.Empty),
                new XAttribute("pQid21_Ketonval", ncd.Qid21Ketonval ?? string.Empty),
                new XAttribute("pQid21_Ketondate", ncd.Qid21Ketondate ?? string.Empty),
                new XAttribute("pQid22_Yn", ncd.Qid22Yn ?? string.Empty),
                new XAttribute("pQid22_Proteinval", ncd.Qid22Proteinval ?? string.Empty),
                new XAttribute("pQid22_Proteindate", ncd.Qid22Proteindate ?? string.Empty),
                new XAttribute("pQid23_Yn", ncd.Qid23Yn ?? string.Empty),
                new XAttribute("pQid24_Yn", ncd.Qid24Yn ?? string.Empty),
                new XAttribute("pReportStatus", ncd.ReportStatus),
                new XAttribute("pDeficiencyRemarks", ncd.DeficiencyRemarks)));

            element.Add(profileElem);
        }
        return element;
    }

    private static XElement BuildSoapsElement(IReadOnlyList<YakapSoap> soaps)
    {
        var element = new XElement("SOAPS");
        foreach (var s in soaps)
        {
            var soapElem = new XElement("SOAP",
                new XAttribute("pHciCaseNo", s.HciCaseNo),
                new XAttribute("pHciTransNo", s.HciTransNo),
                new XAttribute("pSoapDate", s.SoapDate),
                new XAttribute("pPatientPin", s.PatientPin),
                new XAttribute("pPatientType", s.PatientType),
                new XAttribute("pMemPin", s.MemPin),
                new XAttribute("pEffYear", s.EffYear),
                new XAttribute("pATC", s.ATC),
                new XAttribute("pIsWalkedIn", s.IsWalkedIn),
                new XAttribute("pCoPay", s.CoPay),
                new XAttribute("pTransDate", s.TransDate),
                new XAttribute("pReportStatus", s.ReportStatus),
                new XAttribute("pDeficiencyRemarks", s.DeficiencyRemarks));

            soapElem.Add(new XElement("SUBJECTIVE",
                new XAttribute("pIllnessHistory", s.IllnessHistory),
                new XAttribute("pSignsSymptoms", s.SignsSymptoms),
                new XAttribute("pOtherComplaint", s.OtherComplaint ?? string.Empty),
                new XAttribute("pPainSite", s.PainSite ?? string.Empty),
                new XAttribute("pReportStatus", "U"),
                new XAttribute("pDeficiencyRemarks", string.Empty)));

            soapElem.Add(BuildPepertElement(s.PhysicalExam));

            var pemiscsElem = new XElement("PEMISCS");
            if (s.PhysicalExamMiscs != null && s.PhysicalExamMiscs.Count > 0)
            {
                foreach (var m in s.PhysicalExamMiscs)
                    pemiscsElem.Add(new XElement("PEMISC",
                        new XAttribute("pSkinId", m.SkinId ?? string.Empty),
                        new XAttribute("pHeentId", m.HeentId ?? string.Empty),
                        new XAttribute("pChestId", m.ChestId ?? string.Empty),
                        new XAttribute("pHeartId", m.HeartId ?? string.Empty),
                        new XAttribute("pAbdomenId", m.AbdomenId ?? string.Empty),
                        new XAttribute("pNeuroId", m.NeuroId ?? string.Empty),
                        new XAttribute("pGuId", m.GuId ?? string.Empty),
                        new XAttribute("pRectalId", m.RectalId ?? string.Empty),
                        new XAttribute("pReportStatus", m.ReportStatus),
                        new XAttribute("pDeficiencyRemarks", m.DeficiencyRemarks)));
            }
            else
            {
                pemiscsElem.Add(new XElement("PEMISC",
                    new XAttribute("pSkinId", "1"),
                    new XAttribute("pHeentId", "1"),
                    new XAttribute("pChestId", "1"),
                    new XAttribute("pHeartId", "1"),
                    new XAttribute("pAbdomenId", "1"),
                    new XAttribute("pNeuroId", "1"),
                    new XAttribute("pGuId", "1"),
                    new XAttribute("pRectalId", "1"),
                    new XAttribute("pReportStatus", "U"),
                    new XAttribute("pDeficiencyRemarks", string.Empty)));
            }
            soapElem.Add(pemiscsElem);

            var pes = s.PhysicalExamSpecifics;
            soapElem.Add(new XElement("PESPECIFIC",
                new XAttribute("pSkinRem", pes.SkinRem ?? string.Empty),
                new XAttribute("pHeentRem", pes.HeentRem ?? string.Empty),
                new XAttribute("pChestRem", pes.ChestRem ?? string.Empty),
                new XAttribute("pHeartRem", pes.HeartRem ?? string.Empty),
                new XAttribute("pAbdomenRem", pes.AbdomenRem ?? string.Empty),
                new XAttribute("pNeuroRem", pes.NeuroRem ?? string.Empty),
                new XAttribute("pRectalRem", pes.RectalRem ?? string.Empty),
                new XAttribute("pGuRem", pes.GuRem ?? string.Empty),
                new XAttribute("pReportStatus", pes.ReportStatus),
                new XAttribute("pDeficiencyRemarks", pes.DeficiencyRemarks)));

            var icdsElem = new XElement("ICDS");
            if (s.IcdCodes != null && s.IcdCodes.Count > 0)
            {
                foreach (var code in s.IcdCodes)
                    icdsElem.Add(new XElement("ICD",
                        new XAttribute("pIcdCode", code),
                        new XAttribute("pReportStatus", "U"),
                        new XAttribute("pDeficiencyRemarks", string.Empty)));
            }
            else
            {
                icdsElem.Add(new XElement("ICD",
                    new XAttribute("pIcdCode", "Z00.0"),
                    new XAttribute("pReportStatus", "U"),
                    new XAttribute("pDeficiencyRemarks", string.Empty)));
            }
            soapElem.Add(icdsElem);

            var diagElem = new XElement("DIAGNOSTICS");
            foreach (var d in s.Diagnostics)
                diagElem.Add(new XElement("DIAGNOSTIC",
                    new XAttribute("pDiagnosticId", d.DiagnosticId),
                    new XAttribute("pOthRemarks", d.OthRemarks ?? string.Empty),
                    new XAttribute("pIsPhysicianRecommendation", d.IsPhysicianRecommendation),
                    new XAttribute("pPatientRemarks", d.PatientRemarks),
                    new XAttribute("pReportStatus", d.ReportStatus),
                    new XAttribute("pDeficiencyRemarks", d.DeficiencyRemarks)));
            soapElem.Add(diagElem);

            var mgmtElem = new XElement("MANAGEMENTS");
            if (s.Managements != null && s.Managements.Count > 0)
            {
                foreach (var mgmt in s.Managements)
                    mgmtElem.Add(new XElement("MANAGEMENT",
                        new XAttribute("pManagementId", mgmt.ManagementId),
                        new XAttribute("pOthRemarks", mgmt.OthRemarks ?? string.Empty),
                        new XAttribute("pReportStatus", mgmt.ReportStatus),
                        new XAttribute("pDeficiencyRemarks", mgmt.DeficiencyRemarks)));
            }
            else
            {
                mgmtElem.Add(new XElement("MANAGEMENT",
                    new XAttribute("pManagementId", "6"),
                    new XAttribute("pOthRemarks", "General counseling"),
                    new XAttribute("pReportStatus", "U"),
                    new XAttribute("pDeficiencyRemarks", string.Empty)));
            }
            soapElem.Add(mgmtElem);

            soapElem.Add(new XElement("ADVICE",
                new XAttribute("pRemarks", s.AdviceRemarks),
                new XAttribute("pReportStatus", "U"),
                new XAttribute("pDeficiencyRemarks", string.Empty)));

            element.Add(soapElem);
        }
        return element;
    }

    private static XElement BuildDiagnosticExamResultsElement(IReadOnlyList<YakapDiagnosticResult> results)
    {
        var element = new XElement("DIAGNOSTICEXAMRESULTS");
        foreach (var r in results)
        {
            var resElem = new XElement("DIAGNOSTICEXAMRESULT",
                new XAttribute("pHciCaseNo", r.HciCaseNo),
                new XAttribute("pHciTransNo", r.HciTransNo),
                new XAttribute("pPatientPin", r.PatientPin),
                new XAttribute("pPatientType", r.PatientType),
                new XAttribute("pMemPin", r.MemPin),
                new XAttribute("pEffYear", r.EffYear));

            if (r.FbsResults?.Count > 0)
            {
                var fbssElem = new XElement("FBSS");
                foreach (var fbs in r.FbsResults)
                    fbssElem.Add(new XElement("FBS",
                        new XAttribute("pReferralFacility", fbs.ReferralFacility),
                        new XAttribute("pLabDate", fbs.LabDate),
                        new XAttribute("pGlucoseMg", fbs.GlucoseMg),
                        new XAttribute("pGlucoseMmol", fbs.GlucoseMmol),
                        new XAttribute("pDateAdded", fbs.DateAdded),
                        new XAttribute("pStatus", fbs.Status),
                        new XAttribute("pDiagnosticLabFee", fbs.DiagnosticLabFee),
                        new XAttribute("pReportStatus", fbs.ReportStatus),
                        new XAttribute("pDeficiencyRemarks", fbs.DeficiencyRemarks)));
                resElem.Add(fbssElem);
            }

            if (r.RbsResults?.Count > 0)
            {
                var rbssElem = new XElement("RBSS");
                foreach (var rbs in r.RbsResults)
                    rbssElem.Add(new XElement("RBS",
                        new XAttribute("pReferralFacility", rbs.ReferralFacility),
                        new XAttribute("pLabDate", rbs.LabDate),
                        new XAttribute("pGlucoseMg", rbs.GlucoseMg),
                        new XAttribute("pGlucoseMmol", rbs.GlucoseMmol),
                        new XAttribute("pDateAdded", rbs.DateAdded),
                        new XAttribute("pStatus", rbs.Status),
                        new XAttribute("pDiagnosticLabFee", rbs.DiagnosticLabFee),
                        new XAttribute("pReportStatus", rbs.ReportStatus),
                        new XAttribute("pDeficiencyRemarks", rbs.DeficiencyRemarks)));
                resElem.Add(rbssElem);
            }

            if (r.CbcResults?.Count > 0)
            {
                var cbcsElem = new XElement("CBCS");
                foreach (var c in r.CbcResults)
                    cbcsElem.Add(new XElement("CBC",
                        new XAttribute("pReferralFacility", c.ReferralFacility),
                        new XAttribute("pLabDate", c.LabDate),
                        new XAttribute("pHematocrit", c.Hematocrit),
                        new XAttribute("pHemoglobinG", c.HemoglobinG),
                        new XAttribute("pHemoglobinMmol", c.HemoglobinMmol),
                        new XAttribute("pMhcPg", c.MhcPg),
                        new XAttribute("pMhcFmol", c.MhcFmol),
                        new XAttribute("pMchcGhb", c.MchcGhb),
                        new XAttribute("pMchcMmol", c.MchcMmol),
                        new XAttribute("pMcvUm", c.McvUm),
                        new XAttribute("pMcvFl", c.McvFl),
                        new XAttribute("pWbc1000", c.Wbc1000),
                        new XAttribute("pWbc10", c.Wbc10),
                        new XAttribute("pMyelocyte", c.Myelocyte),
                        new XAttribute("pNeutrophilsBnd", c.NeutrophilsBnd),
                        new XAttribute("pNeutrophilsSeg", c.NeutrophilsSeg),
                        new XAttribute("pLymphocytes", c.Lymphocytes),
                        new XAttribute("pMonocytes", c.Monocytes),
                        new XAttribute("pEosinophils", c.Eosinophils),
                        new XAttribute("pBasophils", c.Basophils),
                        new XAttribute("pPlatelet", c.Platelet),
                        new XAttribute("pDateAdded", c.DateAdded),
                        new XAttribute("pStatus", c.Status),
                        new XAttribute("pDiagnosticLabFee", c.DiagnosticLabFee),
                        new XAttribute("pReportStatus", c.ReportStatus),
                        new XAttribute("pDeficiencyRemarks", c.DeficiencyRemarks)));
                resElem.Add(cbcsElem);
            }

            if (r.UrinalysisResults?.Count > 0)
            {
                var uriElem = new XElement("URINALYSISS");
                foreach (var u in r.UrinalysisResults)
                    uriElem.Add(new XElement("URINALYSIS",
                        new XAttribute("pReferralFacility", u.ReferralFacility),
                        new XAttribute("pLabDate", u.LabDate),
                        new XAttribute("pGravity", u.Gravity),
                        new XAttribute("pAppearance", u.Appearance),
                        new XAttribute("pColor", u.Color),
                        new XAttribute("pGlucose", u.Glucose),
                        new XAttribute("pProteins", u.Proteins),
                        new XAttribute("pKetones", u.Ketones),
                        new XAttribute("pPh", u.Ph),
                        new XAttribute("pRbCells", u.RbCells),
                        new XAttribute("pWbCells", u.WbCells),
                        new XAttribute("pBacteria", u.Bacteria),
                        new XAttribute("pCrystals", u.Crystals),
                        new XAttribute("pBladderCell", u.BladderCell),
                        new XAttribute("pSquamousCell", u.SquamousCell),
                        new XAttribute("pTubularCell", u.TubularCell),
                        new XAttribute("pBroadCasts", u.BroadCasts),
                        new XAttribute("pEpithelialCast", u.EpithelialCast),
                        new XAttribute("pGranularCast", u.GranularCast),
                        new XAttribute("pHyalineCast", u.HyalineCast),
                        new XAttribute("pRbcCast", u.RbcCast),
                        new XAttribute("pWaxyCast", u.WaxyCast),
                        new XAttribute("pWcCast", u.WcCast),
                        new XAttribute("pAlbumin", u.Albumin),
                        new XAttribute("pPusCells", u.PusCells),
                        new XAttribute("pDateAdded", u.DateAdded),
                        new XAttribute("pStatus", u.Status),
                        new XAttribute("pDiagnosticLabFee", u.DiagnosticLabFee),
                        new XAttribute("pReportStatus", u.ReportStatus),
                        new XAttribute("pDeficiencyRemarks", u.DeficiencyRemarks)));
                resElem.Add(uriElem);
            }

            if (r.ChestXrayResults?.Count > 0)
            {
                var cxrElem = new XElement("CHESTXRAYS");
                foreach (var cxr in r.ChestXrayResults)
                    cxrElem.Add(new XElement("CHESTXRAY",
                        new XAttribute("pReferralFacility", cxr.ReferralFacility),
                        new XAttribute("pLabDate", cxr.LabDate),
                        new XAttribute("pFindings", cxr.Findings),
                        new XAttribute("pRemarksFindings", cxr.RemarksFindings ?? string.Empty),
                        new XAttribute("pObservation", cxr.Observation),
                        new XAttribute("pRemarksObservation", cxr.RemarksObservation ?? string.Empty),
                        new XAttribute("pDateAdded", cxr.DateAdded),
                        new XAttribute("pStatus", cxr.Status),
                        new XAttribute("pDiagnosticLabFee", cxr.DiagnosticLabFee),
                        new XAttribute("pReportStatus", cxr.ReportStatus),
                        new XAttribute("pDeficiencyRemarks", cxr.DeficiencyRemarks)));
                resElem.Add(cxrElem);
            }

            element.Add(resElem);
        }
        return element;
    }

    private static XElement BuildMedicinesElement(IReadOnlyList<YakapMedicine> medicines)
    {
        var element = new XElement("MEDICINES");
        foreach (var med in medicines)
        {
            element.Add(new XElement("MEDICINE",
                new XAttribute("pHciCaseNo", med.HciCaseNo),
                new XAttribute("pHciTransNo", med.HciTransNo),
                new XAttribute("pCategory", med.Category),
                new XAttribute("pDrugCode", med.DrugCode),
                new XAttribute("pGenericCode", med.GenericCode),
                new XAttribute("pSaltCode", med.SaltCode),
                new XAttribute("pStrengthCode", med.StrengthCode),
                new XAttribute("pFormCode", med.FormCode),
                new XAttribute("pUnitCode", med.UnitCode),
                new XAttribute("pPackageCode", med.PackageCode),
                new XAttribute("pOtherMedicine", med.OtherMedicine ?? string.Empty),
                new XAttribute("pOthMedDrugGrouping", med.OthMedDrugGrouping ?? string.Empty),
                new XAttribute("pRoute", med.Route),
                new XAttribute("pQuantity", med.Quantity),
                new XAttribute("pActualUnitPrice", med.ActualUnitPrice),
                new XAttribute("pTotalAmtPrice", med.TotalAmtPrice),
                new XAttribute("pInstructionQuantity", med.InstructionQuantity),
                new XAttribute("pInstructionStrength", med.InstructionStrength),
                new XAttribute("pInstructionFrequency", med.InstructionFrequency),
                new XAttribute("pPrescribingPhysician", med.PrescribingPhysician),
                new XAttribute("pIsDispensed", med.IsDispensed),
                new XAttribute("pDateDispensed", med.DateDispensed ?? string.Empty),
                new XAttribute("pDispensingPersonnel", med.DispensingPersonnel ?? string.Empty),
                new XAttribute("pIsApplicable", med.IsApplicable),
                new XAttribute("pDateAdded", med.DateAdded),
                new XAttribute("pReportStatus", med.ReportStatus),
                new XAttribute("pDeficiencyRemarks", med.DeficiencyRemarks)));
        }
        return element;
    }

    private static XElement BuildPepertElement(YakapPhysicalExamPertinent pe) =>
        new("PEPERT",
            new XAttribute("pSystolic", pe.Systolic),
            new XAttribute("pDiastolic", pe.Diastolic),
            new XAttribute("pHr", pe.Hr),
            new XAttribute("pRr", pe.Rr),
            new XAttribute("pTemp", pe.Temp),
            new XAttribute("pHeight", pe.Height),
            new XAttribute("pWeight", pe.Weight),
            new XAttribute("pBMI", pe.BMI),
            new XAttribute("pZScore", pe.ZScore ?? string.Empty),
            new XAttribute("pLeftVision", pe.LeftVision ?? string.Empty),
            new XAttribute("pRightVision", pe.RightVision ?? string.Empty),
            new XAttribute("pLength", pe.Length ?? string.Empty),
            new XAttribute("pHeadCirc", pe.HeadCirc ?? string.Empty),
            new XAttribute("pSkinfoldThickness", pe.SkinfoldThickness ?? string.Empty),
            new XAttribute("pWaist", pe.Waist ?? string.Empty),
            new XAttribute("pHip", pe.Hip ?? string.Empty),
            new XAttribute("pLimbs", pe.Limbs ?? string.Empty),
            new XAttribute("pMidUpperArmCirc", pe.MidUpperArmCirc ?? string.Empty),
            new XAttribute("pReportStatus", pe.ReportStatus),
            new XAttribute("pDeficiencyRemarks", pe.DeficiencyRemarks));

    private static XElement BuildPlaceholderSoapsElement() =>
        new("SOAPS",
            new XElement("SOAP",
                new XAttribute("pHciCaseNo", string.Empty),
                new XAttribute("pHciTransNo", string.Empty),
                new XAttribute("pSoapDate", string.Empty),
                new XAttribute("pPatientPin", string.Empty),
                new XAttribute("pPatientType", string.Empty),
                new XAttribute("pMemPin", string.Empty),
                new XAttribute("pEffYear", string.Empty),
                new XAttribute("pATC", string.Empty),
                new XAttribute("pIsWalkedIn", string.Empty),
                new XAttribute("pCoPay", string.Empty),
                new XAttribute("pTransDate", string.Empty),
                new XAttribute("pReportStatus", "U"),
                new XAttribute("pDeficiencyRemarks", string.Empty),
                new XElement("SUBJECTIVE",
                    new XAttribute("pIllnessHistory", string.Empty),
                    new XAttribute("pSignsSymptoms", string.Empty),
                    new XAttribute("pOtherComplaint", string.Empty),
                    new XAttribute("pPainSite", string.Empty),
                    new XAttribute("pReportStatus", "U"),
                    new XAttribute("pDeficiencyRemarks", string.Empty)),
                new XElement("PEPERT",
                    new XAttribute("pSystolic", string.Empty),
                    new XAttribute("pDiastolic", string.Empty),
                    new XAttribute("pHr", string.Empty),
                    new XAttribute("pRr", string.Empty),
                    new XAttribute("pTemp", string.Empty),
                    new XAttribute("pHeight", string.Empty),
                    new XAttribute("pWeight", string.Empty),
                    new XAttribute("pBMI", string.Empty),
                    new XAttribute("pZScore", string.Empty),
                    new XAttribute("pLeftVision", string.Empty),
                    new XAttribute("pRightVision", string.Empty),
                    new XAttribute("pLength", string.Empty),
                    new XAttribute("pHeadCirc", string.Empty),
                    new XAttribute("pSkinfoldThickness", string.Empty),
                    new XAttribute("pWaist", string.Empty),
                    new XAttribute("pHip", string.Empty),
                    new XAttribute("pLimbs", string.Empty),
                    new XAttribute("pMidUpperArmCirc", string.Empty),
                    new XAttribute("pReportStatus", "U"),
                    new XAttribute("pDeficiencyRemarks", string.Empty)),
                new XElement("PEMISCS",
                    new XElement("PEMISC",
                        new XAttribute("pSkinId", string.Empty),
                        new XAttribute("pHeentId", string.Empty),
                        new XAttribute("pChestId", string.Empty),
                        new XAttribute("pHeartId", string.Empty),
                        new XAttribute("pAbdomenId", string.Empty),
                        new XAttribute("pNeuroId", string.Empty),
                        new XAttribute("pGuId", string.Empty),
                        new XAttribute("pRectalId", string.Empty),
                        new XAttribute("pReportStatus", "U"),
                        new XAttribute("pDeficiencyRemarks", string.Empty))),
                new XElement("PESPECIFIC",
                    new XAttribute("pSkinRem", string.Empty),
                    new XAttribute("pHeentRem", string.Empty),
                    new XAttribute("pChestRem", string.Empty),
                    new XAttribute("pHeartRem", string.Empty),
                    new XAttribute("pAbdomenRem", string.Empty),
                    new XAttribute("pNeuroRem", string.Empty),
                    new XAttribute("pRectalRem", string.Empty),
                    new XAttribute("pGuRem", string.Empty),
                    new XAttribute("pReportStatus", "U"),
                    new XAttribute("pDeficiencyRemarks", string.Empty)),
                new XElement("ICDS",
                    new XElement("ICD",
                        new XAttribute("pIcdCode", string.Empty),
                        new XAttribute("pReportStatus", "U"),
                        new XAttribute("pDeficiencyRemarks", string.Empty))),
                new XElement("DIAGNOSTICS",
                    new XElement("DIAGNOSTIC",
                        new XAttribute("pDiagnosticId", string.Empty),
                        new XAttribute("pOthRemarks", string.Empty),
                        new XAttribute("pIsPhysicianRecommendation", string.Empty),
                        new XAttribute("pPatientRemarks", string.Empty),
                        new XAttribute("pReportStatus", "U"),
                        new XAttribute("pDeficiencyRemarks", string.Empty))),
                new XElement("MANAGEMENTS",
                    new XElement("MANAGEMENT",
                        new XAttribute("pManagementId", string.Empty),
                        new XAttribute("pOthRemarks", string.Empty),
                        new XAttribute("pReportStatus", "U"),
                        new XAttribute("pDeficiencyRemarks", string.Empty))),
                new XElement("ADVICE",
                    new XAttribute("pRemarks", string.Empty),
                    new XAttribute("pReportStatus", "U"),
                    new XAttribute("pDeficiencyRemarks", string.Empty))));

    private static XElement BuildPlaceholderMedicinesElement() =>
        new("MEDICINES",
            new XElement("MEDICINE",
                new XAttribute("pHciCaseNo", string.Empty),
                new XAttribute("pHciTransNo", string.Empty),
                new XAttribute("pCategory", string.Empty),
                new XAttribute("pDrugCode", string.Empty),
                new XAttribute("pGenericCode", string.Empty),
                new XAttribute("pSaltCode", string.Empty),
                new XAttribute("pStrengthCode", string.Empty),
                new XAttribute("pFormCode", string.Empty),
                new XAttribute("pUnitCode", string.Empty),
                new XAttribute("pPackageCode", string.Empty),
                new XAttribute("pOtherMedicine", string.Empty),
                new XAttribute("pOthMedDrugGrouping", string.Empty),
                new XAttribute("pRoute", string.Empty),
                new XAttribute("pQuantity", string.Empty),
                new XAttribute("pActualUnitPrice", string.Empty),
                new XAttribute("pTotalAmtPrice", string.Empty),
                new XAttribute("pInstructionQuantity", string.Empty),
                new XAttribute("pInstructionStrength", string.Empty),
                new XAttribute("pInstructionFrequency", string.Empty),
                new XAttribute("pPrescribingPhysician", string.Empty),
                new XAttribute("pIsDispensed", string.Empty),
                new XAttribute("pDateDispensed", string.Empty),
                new XAttribute("pDispensingPersonnel", string.Empty),
                new XAttribute("pIsApplicable", string.Empty),
                new XAttribute("pDateAdded", string.Empty),
                new XAttribute("pReportStatus", "U"),
                new XAttribute("pDeficiencyRemarks", string.Empty)));

    private static string SerializeXml(XElement root)
    {
        var doc = new XDocument(
            new XDeclaration("1.0", "utf-8", null),
            new XDocumentType("PCB", null, "KonsultaData_v1.14.dtd", null),
            root);

        var builder = new StringBuilder();
        using (var writer = new System.IO.StringWriter(builder))
        {
            doc.Save(writer, SaveOptions.None);
        }
        return builder.ToString();
    }
}
