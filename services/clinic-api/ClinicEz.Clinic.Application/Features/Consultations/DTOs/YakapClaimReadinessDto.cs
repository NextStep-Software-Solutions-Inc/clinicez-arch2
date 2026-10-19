using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Consultations.DTOs;

public sealed record YakapClaimReadinessDto(
    bool IsReady,
    Guid EncounterId,
    bool DoctorPanValid,
    bool DoctorPrcValid,
    bool PatientPinValid,
    bool AtcValid,
    bool SymptomsValid,
    bool PhysicalExamComplete,
    bool PrimaryDiagnosisPresent,
    bool VitalsComplete,
    bool MedicinesValid,
    List<string> MissingFields,
    List<string> Warnings,
    bool GeneralSurveyValid = true,
    bool S2LicenseValid = true);
