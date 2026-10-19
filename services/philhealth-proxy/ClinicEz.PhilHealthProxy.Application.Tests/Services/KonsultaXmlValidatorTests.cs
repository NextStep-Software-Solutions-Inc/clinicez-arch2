using ClinicEz.PhilHealthProxy.Infrastructure.Services;
using FluentAssertions;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Services;

public sealed class KonsultaXmlValidatorTests
{
    private readonly KonsultaXmlValidator _validator = new();

    private const string ValidMasterlistXml = """
        <?xml version="1.0" encoding="UTF-8"?>
        <ASSIGNMENTS pUsername="H90000001" pPassword="password" pHciAccreNo="H90000001" pAssignmentTotalCnt="1" pReportTransmittalNumber="RH9000000120261000001">
            <ASSIGNMENT pAssignedPin="030263078507" pAssignedLastName="DELA CRUZ" pAssignedFirstName="JUAN" pAssignedMiddleName="SANTOS" pAssignedExtName="" pAssignedDateOfBirth="1985-05-15" pAssignedSex="M" pAssignedType="MM" pPrimaryPIN="030263078507" pPrimaryLastName="DELA CRUZ" pPrimaryFirstName="JUAN" pPrimaryMiddleName="SANTOS" pPrimaryExtName="" pPrimaryDateOfBirth="1985-05-15" pPrimarySex="M" pMobileNumber="09171234567" pLandlineNumber="" pMemberNewCat="DIRECT" pMemberNewCatDesc="Direct Contributor" pPackageType="K" pAssignedDate="2026-01-10" pAssignedStatus="1" pEffYear="2026" />
        </ASSIGNMENTS>
        """;

    private const string MinimalValidReportXml = """
        <?xml version="1.0" encoding="utf-8"?>
        <PCB pUsername="" pPassword="" pHciAccreNo="H90000001" pPMCCNo="P00001" pEnlistTotalCnt="1" pProfileTotalCnt="1" pSoapTotalCnt="1" pCertificationId="KON-TEST" pHciTransmittalNumber="RH9000000120261000001">
          <ENLISTMENTS>
            <ENLISTMENT pHciCaseNo="TH9000000120261000001" pHciTransNo="EH9000000120261000001" pEffYear="2026" pEnlistStat="1" pEnlistDate="2026-10-01" pPackageType="K" pMemPin="030263078507" pMemFname="JUAN" pMemMname="SANTOS" pMemLname="DELA CRUZ" pMemExtname="" pMemDob="1985-05-15" pPatientPin="030263078507" pPatientFname="JUAN" pPatientMname="SANTOS" pPatientLname="DELA CRUZ" pPatientExtname="" pPatientSex="M" pPatientDob="1985-05-15" pPatientType="MM" pPatientMobileNo="09171234567" pPatientLandlineNo="" pWithConsent="Y" pTransDate="2026-10-01" pCreatedBy="ADMIN" pReportStatus="U" pDeficiencyRemarks="" />
          </ENLISTMENTS>
          <PROFILING>
            <PROFILE pHciTransNo="PH9000000120261000001" pHciCaseNo="TH9000000120261000001" pProfDate="2026-10-01" pPatientPin="030263078507" pPatientType="MM" pPatientAge="41 YR(S), 4 MO(S), 16 DAY(S)" pMemPin="030263078507" pEffYear="2026" pATC="ATC123456789" pIsWalkedIn="N" pTransDate="2026-10-01" pReportStatus="U" pDeficiencyRemarks="">
              <MEDHISTS>
                <MEDHIST pMdiseaseCode="001" pReportStatus="U" pDeficiencyRemarks="" />
              </MEDHISTS>
              <MHSPECIFICS>
                <MHSPECIFIC pMdiseaseCode="001" pSpecificDesc="Asthma" pReportStatus="U" pDeficiencyRemarks="" />
              </MHSPECIFICS>
              <SURGHISTS>
                <SURGHIST pSurgDesc="Appendectomy" pSurgDate="2020-01-01" pReportStatus="U" pDeficiencyRemarks="" />
              </SURGHISTS>
              <FAMHISTS>
                <FAMHIST pMdiseaseCode="006" pReportStatus="U" pDeficiencyRemarks="" />
              </FAMHISTS>
              <FHSPECIFICS>
                <FHSPECIFIC pMdiseaseCode="006" pSpecificDesc="Diabetes" pReportStatus="U" pDeficiencyRemarks="" />
              </FHSPECIFICS>
              <SOCHIST pIsSmoker="N" pNoCigpk="" pIsAdrinker="N" pNoBottles="" pIllDrugUser="N" pIsSexuallyActive="Y" pReportStatus="U" pDeficiencyRemarks="" />
              <IMMUNIZATIONS>
                <IMMUNIZATION pChildImmcode="" pYoungwImmcode="" pPregwImmcode="" pElderlyImmcode="999" pOtherImm="" pReportStatus="U" pDeficiencyRemarks="" />
              </IMMUNIZATIONS>
              <MENSHIST pMenarchePeriod="0" pLastMensPeriod="" pPeriodDuration="0" pMensInterval="0" pPadsPerDay="0" pOnsetSexIc="0" pBirthCtrlMethod="" pIsMenopause="" pMenopauseAge="" pIsApplicable="N" pReportStatus="U" pDeficiencyRemarks="" />
              <PREGHIST pPregCnt="0" pDeliveryCnt="0" pDeliveryTyp="X" pFullTermCnt="0" pPrematureCnt="0" pAbortionCnt="0" pLivChildrenCnt="0" pWPregIndhyp="N" pWFamPlan="N" pIsApplicable="N" pReportStatus="U" pDeficiencyRemarks="" />
              <PEPERT pSystolic="120" pDiastolic="80" pHr="72" pRr="18" pTemp="36.5" pHeight="170" pWeight="68" pBMI="23.5" pZScore="" pLeftVision="20/20" pRightVision="20/20" pLength="" pHeadCirc="" pSkinfoldThickness="" pWaist="" pHip="" pLimbs="" pMidUpperArmCirc="" pReportStatus="U" pDeficiencyRemarks="" />
              <BLOODTYPE pBloodType="O+" pReportStatus="U" pDeficiencyRemarks="" />
              <PEGENSURVEY pGenSurveyId="1" pGenSurveyRem="" pReportStatus="U" pDeficiencyRemarks="" />
              <PEMISCS>
                <PEMISC pSkinId="" pHeentId="1" pChestId="" pHeartId="" pAbdomenId="" pNeuroId="" pGuId="" pRectalId="" pReportStatus="U" pDeficiencyRemarks="" />
              </PEMISCS>
              <PESPECIFIC pSkinRem="" pHeentRem="Normal" pChestRem="" pHeartRem="" pAbdomenRem="" pNeuroRem="" pRectalRem="" pGuRem="" pReportStatus="U" pDeficiencyRemarks="" />
              <NCDQANS pQid1_Yn="N" pQid2_Yn="N" pQid3_Yn="N" pQid4_Yn="N" pQid5_Ynx="N" pQid6_Yn="N" pQid7_Yn="N" pQid8_Yn="N" pQid9_Yn="N" pQid10_Yn="N" pQid11_Yn="N" pQid12_Yn="N" pQid13_Yn="N" pQid14_Yn="" pQid15_Yn="N" pQid16_Yn="N" pQid17_Abcde="" pQid18_Yn="N" pQid19_Yn="N" pQid19_Fbsmg="" pQid19_Fbsmmol="" pQid19_Fbsdate="" pQid20_Yn="N" pQid20_Choleval="" pQid20_Choledate="" pQid21_Yn="N" pQid21_Ketonval="" pQid21_Ketondate="" pQid22_Yn="N" pQid22_Proteinval="" pQid22_Proteindate="" pQid23_Yn="N" pQid24_Yn="N" pReportStatus="U" pDeficiencyRemarks="" />
            </PROFILE>
          </PROFILING>
          <SOAPS>
            <SOAP pHciCaseNo="" pHciTransNo="" pSoapDate="" pPatientPin="" pPatientType="" pMemPin="" pEffYear="" pATC="" pIsWalkedIn="" pCoPay="" pTransDate="" pReportStatus="U" pDeficiencyRemarks="">
              <SUBJECTIVE pIllnessHistory="" pSignsSymptoms="" pOtherComplaint="" pPainSite="" pReportStatus="U" pDeficiencyRemarks="" />
              <PEPERT pSystolic="" pDiastolic="" pHr="" pRr="" pTemp="" pHeight="" pWeight="" pBMI="" pZScore="" pLeftVision="" pRightVision="" pLength="" pHeadCirc="" pSkinfoldThickness="" pWaist="" pHip="" pLimbs="" pMidUpperArmCirc="" pReportStatus="U" pDeficiencyRemarks="" />
              <PEMISCS>
                <PEMISC pSkinId="" pHeentId="" pChestId="" pHeartId="" pAbdomenId="" pNeuroId="" pGuId="" pRectalId="" pReportStatus="U" pDeficiencyRemarks="" />
              </PEMISCS>
              <PESPECIFIC pSkinRem="" pHeentRem="" pChestRem="" pHeartRem="" pAbdomenRem="" pNeuroRem="" pRectalRem="" pGuRem="" pReportStatus="U" pDeficiencyRemarks="" />
              <ICDS>
                <ICD pIcdCode="" pReportStatus="U" pDeficiencyRemarks="" />
              </ICDS>
              <DIAGNOSTICS>
                <DIAGNOSTIC pDiagnosticId="" pOthRemarks="" pIsPhysicianRecommendation="" pPatientRemarks="" pReportStatus="U" pDeficiencyRemarks="" />
              </DIAGNOSTICS>
              <MANAGEMENTS>
                <MANAGEMENT pManagementId="" pOthRemarks="" pReportStatus="U" pDeficiencyRemarks="" />
              </MANAGEMENTS>
              <ADVICE pRemarks="" pReportStatus="U" pDeficiencyRemarks="" />
            </SOAP>
          </SOAPS>
          <MEDICINES>
            <MEDICINE pHciCaseNo="" pHciTransNo="" pCategory="" pDrugCode="" pGenericCode="" pSaltCode="" pStrengthCode="" pFormCode="" pUnitCode="" pPackageCode="" pOtherMedicine="" pRoute="" pQuantity="" pActualUnitPrice="" pTotalAmtPrice="" pInstructionQuantity="" pInstructionStrength="" pInstructionFrequency="" pPrescribingPhysician="" pIsDispensed="" pDateDispensed="" pDispensingPersonnel="" pIsApplicable="" pDateAdded="" pReportStatus="U" pDeficiencyRemarks="" />
          </MEDICINES>
        </PCB>
        """;

    [Fact]
    public void ValidateReportXml_ShouldPass_ForValidReport()
    {
        var result = _validator.ValidateReportXml(MinimalValidReportXml);
        result.IsValid.Should().BeTrue(string.Join("; ", result.Errors.Select(e => e.Message)));
        result.Errors.Should().BeEmpty();
    }

    [Fact]
    public void ValidateReportXml_ShouldFail_WhenMissingRequiredChildElement()
    {
        // Missing SOAPS element entirely (violates PCB DTD sequence)
        var invalidXml = """
            <PCB pUsername="" pPassword="" pHciAccreNo="H90000001" pPMCCNo="P00001" pEnlistTotalCnt="0" pProfileTotalCnt="0" pSoapTotalCnt="0" pCertificationId="KON-TEST" pHciTransmittalNumber="RH9000000120261000001">
              <ENLISTMENTS />
              <PROFILING />
            </PCB>
            """;

        var result = _validator.ValidateReportXml(invalidXml);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().NotBeEmpty();
    }

    [Fact]
    public void ValidateReportXml_ShouldFail_WhenXmlMalformed()
    {
        var malformedXml = "<PCB><ENLISTMENTS>"; // Unclosed tags
        var result = _validator.ValidateReportXml(malformedXml);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().NotBeEmpty();
    }

    [Fact]
    public void ValidateMasterlistXml_ShouldPass_ForValidMasterlist()
    {
        var result = _validator.ValidateMasterlistXml(ValidMasterlistXml);
        result.IsValid.Should().BeTrue(string.Join("; ", result.Errors.Select(e => e.Message)));
        result.Errors.Should().BeEmpty();
    }

    [Fact]
    public void ValidateMasterlistXml_ShouldFail_WhenAttributeInvalidPattern()
    {
        // pPackageType must be 'E' or 'K' according to schema; 'Z' is invalid
        var invalidXml = ValidMasterlistXml.Replace("pPackageType=\"K\"", "pPackageType=\"Z\"");
        var result = _validator.ValidateMasterlistXml(invalidXml);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().NotBeEmpty();
    }
}
