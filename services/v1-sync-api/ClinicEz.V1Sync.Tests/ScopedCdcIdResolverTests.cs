using System.Collections.Generic;
using ClinicEz.V1Sync.Api.Services;
using FluentAssertions;
using Xunit;

namespace ClinicEz.V1Sync.Tests;

public sealed class ScopedCdcIdResolverTests
{
    [Fact]
    public void ExtractKeys_RoutesPrescriptionPatientIdToClinicPatientIdsNotUserIds()
    {
        var entries = new[]
        {
            new CdcChangelogEntry(10, "Prescription", "I", "501", """{"id":501,"patientId":88,"clinicId":3,"consultationTicketId":99}"""),
            new CdcChangelogEntry(11, "Medication", "I", "601", """{"id":601,"patientId":77,"clinicId":3}"""),
            new CdcChangelogEntry(12, "PatientInsight", "U", "701", """{"id":701,"patientId":78}"""),
            new CdcChangelogEntry(13, "PatientNcdQuestionnaire", "I", "801", """{"id":801,"patientId":79}"""),
            new CdcChangelogEntry(14, "DiagnosticRequest", "I", "diag-1", """{"id":"diag-1","patientId":80,"consultationTicketId":100}""")
        };

        var keys = ScopedCdcIdResolver.ExtractKeys(entries);

        keys.ClinicPatientIds.Should().Contain(88);
        keys.UserIds.Should().NotContain(88);
        keys.UserIds.Should().Contain(new[] { 77, 78, 79, 80 });
        keys.PrescriptionIds.Should().Contain(501);
        keys.MedicationIds.Should().Contain(601);
        keys.ConsultIds.Should().Contain(new[] { 99, 100 });
        keys.MaxSeq.Should().Be(14);
        keys.RawEventCount.Should().Be(5);
    }

    [Fact]
    public void ExtractKeys_CapturesAllNineNewChildFkKeys()
    {
        var entries = new[]
        {
            new CdcChangelogEntry(1, "MedicineDispenseRecord", "I", "10", """{"id":10,"medicineId":101}"""),
            new CdcChangelogEntry(2, "MedicationDrug", "I", "11", """{"id":11,"medicationId":102}"""),
            new CdcChangelogEntry(3, "FileClinicShare", "I", "12", """{"id":12,"fileSettingId":103,"clinicId":3}"""),
            new CdcChangelogEntry(4, "FolderClinicShare", "I", "13", """{"id":13,"folderSettingId":104,"clinicId":3}"""),
            new CdcChangelogEntry(5, "OrgMemberRequirementFile", "I", "14", """{"id":14,"orgMemberId":105,"fileId":106}"""),
            new CdcChangelogEntry(6, "ClinicLaboratoryRequestProcedure", "I", "15", """{"id":15,"clinicLaboratoryRequestId":107}"""),
            new CdcChangelogEntry(7, "ClinicImagingRequestProcedure", "I", "16", """{"id":16,"clinicImagingRequestId":108}"""),
            new CdcChangelogEntry(8, "ClinicHeartStationRequestProcedure", "I", "17", """{"id":17,"clinicHeartStationRequestId":109}"""),
            new CdcChangelogEntry(9, "PhilHealthDependent", "I", "18", """{"id":18,"philHealthRecordId":110}""")
        };

        var keys = ScopedCdcIdResolver.ExtractKeys(entries);

        keys.MedicineIds.Should().Contain(101);
        keys.MedicationIds.Should().Contain(102);
        keys.FileSettingIds.Should().Contain(103);
        keys.FolderSettingIds.Should().Contain(104);
        keys.OrgMemberIds.Should().Contain(105);
        keys.FileIds.Should().Contain(106);
        keys.LabReqIds.Should().Contain(107);
        keys.ImgReqIds.Should().Contain(108);
        keys.HeartReqIds.Should().Contain(109);
        keys.PhilHealthRecordIds.Should().Contain(110);
    }

    [Fact]
    public void ExtractKeys_SurfacesDeletedEventsAndMapsTrack1AndTrack2SyncIdMapKeys()
    {
        var entries = new[]
        {
            new CdcChangelogEntry(20, "User", "D", "42", """{"id":42}"""),
            new CdcChangelogEntry(21, "PhilHealthRecord", "D", "91", """{"id":91,"userId":42}"""),
            new CdcChangelogEntry(22, "VitalSign", "D", "303", """{"id":303,"consultationTicketId":55}"""),
            new CdcChangelogEntry(23, "ClinicLaboratoryRequest", "D", "404", """{"id":404,"clinicPatientId":12}"""),
            new CdcChangelogEntry(24, "File", "D", "505", """{"id":505,"folderId":9}"""),
            new CdcChangelogEntry(25, "UserHealthCondition", "D", "606", """{"id":606,"userId":42}""")
        };

        var keys = ScopedCdcIdResolver.ExtractKeys(entries);
        keys.DeletedEvents.Should().HaveCount(6);
        keys.UserIds.Should().Contain(42);

        ScopedCdcIdResolver.GetTrack1DeleteMapKeys(keys.DeletedEvents[0])
            .Should().Contain(("Patient", "42"));
        ScopedCdcIdResolver.GetTrack2DeleteMapKeys(keys.DeletedEvents[0])
            .Should().Contain(("PatientAccount", "42"));

        ScopedCdcIdResolver.GetTrack1DeleteMapKeys(keys.DeletedEvents[1])
            .Should().Contain(("PatientPhilHealth", "91"));
        ScopedCdcIdResolver.GetTrack2DeleteMapKeys(keys.DeletedEvents[1])
            .Should().Contain(new[]
            {
                ("PatientGovernmentId", "91:pin"),
                ("PatientGovernmentId", "91:tin"),
                ("PatientGovernmentId", "91:psn")
            });

        ScopedCdcIdResolver.GetTrack1DeleteMapKeys(keys.DeletedEvents[2])
            .Should().Contain(("PatientVitals", "vital:303"));
        ScopedCdcIdResolver.GetTrack2DeleteMapKeys(keys.DeletedEvents[2])
            .Should().Contain(("PatientVitalSign", "303"));

        ScopedCdcIdResolver.GetTrack1DeleteMapKeys(keys.DeletedEvents[3])
            .Should().Contain(("LabOrder", "lab:404"));

        ScopedCdcIdResolver.GetTrack1DeleteMapKeys(keys.DeletedEvents[4])
            .Should().Contain(("RecordAttachment", "file:505"));
        ScopedCdcIdResolver.GetTrack2DeleteMapKeys(keys.DeletedEvents[4])
            .Should().Contain(("FileRecord", "505"));

        ScopedCdcIdResolver.GetTrack1DeleteMapKeys(keys.DeletedEvents[5])
            .Should().Contain(("PatientMedicalHistory", "hc:606"));
        ScopedCdcIdResolver.GetTrack2DeleteMapKeys(keys.DeletedEvents[5])
            .Should().Contain(("PatientChronicCondition", "606"));
    }

    [Fact]
    public void GetTrack1DeleteMapKeys_FiltersOutCrossClinicClinicPatientDeletesWhenV1ClinicIdProvided()
    {
        var entries = new[]
        {
            new CdcChangelogEntry(30, "ClinicPatient", "D", "502", """{"id":502,"clinicId":99,"patientId":101}"""),
            new CdcChangelogEntry(31, "ClinicPatient", "D", "501", """{"id":501,"clinicId":10,"patientId":101}""")
        };

        var keys = ScopedCdcIdResolver.ExtractKeys(entries);
        keys.DeletedEvents.Should().HaveCount(2);

        // Cross-clinic ClinicPatient delete (clinicId=99) yields no keys for clinicId=10
        ScopedCdcIdResolver.GetTrack1DeleteMapKeys(keys.DeletedEvents[0], v1ClinicId: 10)
            .Should().BeEmpty();

        // Matching clinicId=10 yields ("Patient", "101")
        ScopedCdcIdResolver.GetTrack1DeleteMapKeys(keys.DeletedEvents[1], v1ClinicId: 10)
            .Should().ContainSingle().Which.Should().Be(("Patient", "101"));

        // Backward-compatible call without v1ClinicId still maps ("Patient", "101")
        ScopedCdcIdResolver.GetTrack1DeleteMapKeys(keys.DeletedEvents[0])
            .Should().ContainSingle().Which.Should().Be(("Patient", "101"));
    }
}
