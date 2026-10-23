using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.ServicesCatalog.Common;

public static class GeneralMedicalCatalogDefaults
{
    public static List<ClinicServiceItem> CreateDefaults(string? tenantId, Guid clinicId) => new()
    {
        new() { TenantId = tenantId, ClinicId = clinicId, Code = "CONS-GEN", Name = "General Consultation", Category = "Consultation", StandardPrice = 500m, Description = "Comprehensive outpatient primary care medical consultation" },
        new() { TenantId = tenantId, ClinicId = clinicId, Code = "CONS-PEDIA", Name = "Pediatric Consultation", Category = "Consultation", StandardPrice = 600m, Description = "Infant and child wellness and acute illness consultation" },
        new() { TenantId = tenantId, ClinicId = clinicId, Code = "CONS-FU", Name = "Follow-up Consultation", Category = "Consultation", StandardPrice = 350m, Description = "Return follow-up review within 14 days" },
        new() { TenantId = tenantId, ClinicId = clinicId, Code = "PROC-NEB", Name = "Nebulization Therapy", Category = "Procedure", StandardPrice = 250m, Description = "Inhalation bronchodilator nebulization session", IsNurseOrderable = true },
        new() { TenantId = tenantId, ClinicId = clinicId, Code = "PROC-WOUND", Name = "Wound Dressing & Debridement", Category = "Procedure", StandardPrice = 350m, Description = "Aseptic wound dressing, cleansing, and bandage application", IsNurseOrderable = true },
        new() { TenantId = tenantId, ClinicId = clinicId, Code = "PROC-ECG", Name = "12-Lead Electrocardiogram (ECG)", Category = "Diagnostic", StandardPrice = 450m, Description = "Standard 12-lead ECG tracing with physician interpretation", PhilHealthCode = "93000", PhilHealthDescription = "Electrocardiogram, routine ECG with at least 12 leads", IsPhilHealthFormulary = true },
        new() { TenantId = tenantId, ClinicId = clinicId, Code = "PROC-SUTURE", Name = "Minor Suture / Laceration Repair", Category = "Procedure", StandardPrice = 850m, Description = "Local anesthesia and primary closure of minor skin laceration" },
        new() { TenantId = tenantId, ClinicId = clinicId, Code = "PROC-VAX", Name = "Vaccine Administration Fee", Category = "NursingService", StandardPrice = 250m, Description = "Intramuscular or subcutaneous vaccine administration and observation", IsNurseOrderable = true },
        new() { TenantId = tenantId, ClinicId = clinicId, Code = "LAB-RBS", Name = "Random Blood Sugar (RBS) Rapid Test", Category = "Diagnostic", StandardPrice = 150m, Description = "Capillary blood glucose fingerstick test", PhilHealthCode = "82947", PhilHealthDescription = "Glucose; quantitative, blood (except reagent strip)", IsPhilHealthFormulary = true, IsNurseOrderable = true }
    };
}
