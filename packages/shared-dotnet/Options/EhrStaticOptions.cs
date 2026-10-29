using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;

namespace ClinicEz.Shared.Options;

/// <summary>
/// Tier A Static Option Registry for ClinicEZ EHR across all microservices (clinic-api, patient-api, portal-api).
/// Contains in-code canonical definitions for small, stable clinical and statutory option sets (~55 sets).
/// Large libraries (ICD-10, full drug database, PSA PSGC hierarchy, etc.) reside in Tier B (PhilHealthCatalogItem / PsgcLocation).
/// Precomputes deterministic SHA-256 version hashes for instant HTTP 304 Not Modified responses.
/// </summary>
public static class EhrStaticOptions
{
    private static readonly Dictionary<string, ReadOnlyCollection<EhrOptionDescriptor>> Registry;
    private static readonly Dictionary<(string Set, string Code), EhrOptionDescriptor> CodeLookup;
    private static readonly Dictionary<string, string> SetVersionLookup;
    private static readonly string ComputedManifestVersion;

    static EhrStaticOptions()
    {
        var dict = new Dictionary<string, ReadOnlyCollection<EhrOptionDescriptor>>(StringComparer.OrdinalIgnoreCase);

        void Add(string optionSet, IEnumerable<EhrOptionDescriptor> items)
        {
            dict[optionSet] = items.ToList().AsReadOnly();
        }

        // LIB-001: Sex (Biological Sex)
        Add("sex", new[]
        {
            new EhrOptionDescriptor { Code = "MALE", Label = "Male", PhilHealthCode = "M", PhilHealthLibrary = "lib_sex" },
            new EhrOptionDescriptor { Code = "FEMALE", Label = "Female", PhilHealthCode = "F", PhilHealthLibrary = "lib_sex" },
            new EhrOptionDescriptor { Code = "INTERSEX", Label = "Intersex", PhilHealthCode = null, PhilHealthLibrary = "lib_sex" },
            new EhrOptionDescriptor { Code = "UNKNOWN", Label = "Unknown", PhilHealthCode = null, PhilHealthLibrary = "lib_sex" }
        });

        // LIB-002: Gender Identity (SOGIE)
        Add("gender_identity", new[]
        {
            new EhrOptionDescriptor { Code = "MAN", Label = "Man / Cisgender Man", PhilHealthCode = "M", PhilHealthLibrary = "lib_gender" },
            new EhrOptionDescriptor { Code = "WOMAN", Label = "Woman / Cisgender Woman", PhilHealthCode = "W", PhilHealthLibrary = "lib_gender" },
            new EhrOptionDescriptor { Code = "LESBIAN", Label = "Lesbian", PhilHealthCode = "L", PhilHealthLibrary = "lib_gender" },
            new EhrOptionDescriptor { Code = "GAY", Label = "Gay", PhilHealthCode = "G", PhilHealthLibrary = "lib_gender" },
            new EhrOptionDescriptor { Code = "BISEXUAL", Label = "Bisexual", PhilHealthCode = "B", PhilHealthLibrary = "lib_gender" },
            new EhrOptionDescriptor { Code = "TRANSGENDER", Label = "Transgender", PhilHealthCode = "T", PhilHealthLibrary = "lib_gender" },
            new EhrOptionDescriptor { Code = "QUEER", Label = "Queer", PhilHealthCode = "Q", PhilHealthLibrary = "lib_gender" },
            new EhrOptionDescriptor { Code = "INTERSEX_IDENTITY", Label = "Intersex", PhilHealthCode = "I", PhilHealthLibrary = "lib_gender" },
            new EhrOptionDescriptor { Code = "ASEXUAL", Label = "Asexual", PhilHealthCode = "A", PhilHealthLibrary = "lib_gender" },
            new EhrOptionDescriptor { Code = "PANSEXUAL", Label = "Pansexual", PhilHealthCode = "P", PhilHealthLibrary = "lib_gender" },
            new EhrOptionDescriptor { Code = "NON_BINARY", Label = "Non-Binary", PhilHealthCode = "NB", PhilHealthLibrary = "lib_gender" },
            new EhrOptionDescriptor { Code = "OTHER_GENDER", Label = "Other Gender Identity", PhilHealthCode = "O", PhilHealthLibrary = "lib_gender", RequiresSpecifyText = true },
            new EhrOptionDescriptor { Code = "PREFER_NOT_TO_ANSWER", Label = "Prefer not to disclose", PhilHealthCode = "N", PhilHealthLibrary = "lib_gender" }
        });

        // LIB-003: Patient Type (Membership status)
        Add("patient_type", new[]
        {
            new EhrOptionDescriptor { Code = "MEMBER", Label = "Principal Member", PhilHealthCode = "M", PhilHealthLibrary = "lib_patient_type" },
            new EhrOptionDescriptor { Code = "DEPENDENT", Label = "Dependent", PhilHealthCode = "D", PhilHealthLibrary = "lib_patient_type" }
        });

        // LIB-004: Civil Status
        Add("civil_status", new[]
        {
            new EhrOptionDescriptor { Code = "SINGLE", Label = "Single", PhilHealthCode = "S", PhilHealthLibrary = "lib_civil_status" },
            new EhrOptionDescriptor { Code = "MARRIED", Label = "Married", PhilHealthCode = "M", PhilHealthLibrary = "lib_civil_status" },
            new EhrOptionDescriptor { Code = "WIDOWED", Label = "Widowed", PhilHealthCode = "W", PhilHealthLibrary = "lib_civil_status" },
            new EhrOptionDescriptor { Code = "SEPARATED", Label = "Separated", PhilHealthCode = "X", PhilHealthLibrary = "lib_civil_status" },
            new EhrOptionDescriptor { Code = "DIVORCED", Label = "Divorced", PhilHealthCode = "D", PhilHealthLibrary = "lib_civil_status" },
            new EhrOptionDescriptor { Code = "COHABITING", Label = "Cohabiting / Common-Law", PhilHealthCode = "C", PhilHealthLibrary = "lib_civil_status" },
            new EhrOptionDescriptor { Code = "ANNULLED", Label = "Annulled", PhilHealthCode = "A", PhilHealthLibrary = "lib_civil_status" },
            new EhrOptionDescriptor { Code = "OTHER_CIVIL_STATUS", Label = "Other Civil Status", PhilHealthCode = "O", PhilHealthLibrary = "lib_civil_status", RequiresSpecifyText = true }
        });

        // Blood Type
        Add("blood_type", new[]
        {
            new EhrOptionDescriptor { Code = "A_POSITIVE", Label = "A+", PhilHealthCode = null, PhilHealthLibrary = null },
            new EhrOptionDescriptor { Code = "A_NEGATIVE", Label = "A-", PhilHealthCode = null, PhilHealthLibrary = null },
            new EhrOptionDescriptor { Code = "B_POSITIVE", Label = "B+", PhilHealthCode = null, PhilHealthLibrary = null },
            new EhrOptionDescriptor { Code = "B_NEGATIVE", Label = "B-", PhilHealthCode = null, PhilHealthLibrary = null },
            new EhrOptionDescriptor { Code = "AB_POSITIVE", Label = "AB+", PhilHealthCode = null, PhilHealthLibrary = null },
            new EhrOptionDescriptor { Code = "AB_NEGATIVE", Label = "AB-", PhilHealthCode = null, PhilHealthLibrary = null },
            new EhrOptionDescriptor { Code = "O_POSITIVE", Label = "O+", PhilHealthCode = null, PhilHealthLibrary = null },
            new EhrOptionDescriptor { Code = "O_NEGATIVE", Label = "O-", PhilHealthCode = null, PhilHealthLibrary = null },
            new EhrOptionDescriptor { Code = "UNKNOWN", Label = "Unknown", PhilHealthCode = null, PhilHealthLibrary = null }
        });

        // Education Level
        Add("education_level", new[]
        {
            new EhrOptionDescriptor { Code = "NONE", Label = "None", PhilHealthCode = null, PhilHealthLibrary = null },
            new EhrOptionDescriptor { Code = "ELEMENTARY", Label = "Elementary", PhilHealthCode = null, PhilHealthLibrary = null },
            new EhrOptionDescriptor { Code = "HIGH_SCHOOL", Label = "High School", PhilHealthCode = null, PhilHealthLibrary = null },
            new EhrOptionDescriptor { Code = "VOCATIONAL", Label = "Vocational", PhilHealthCode = null, PhilHealthLibrary = null },
            new EhrOptionDescriptor { Code = "COLLEGE", Label = "College", PhilHealthCode = null, PhilHealthLibrary = null },
            new EhrOptionDescriptor { Code = "GRADUATE", Label = "Graduate", PhilHealthCode = null, PhilHealthLibrary = null },
            new EhrOptionDescriptor { Code = "POST_GRADUATE", Label = "Post Graduate", PhilHealthCode = null, PhilHealthLibrary = null }
        });

        // LIB-005: Assignment Status
        Add("assignment_status", new[]
        {
            new EhrOptionDescriptor { Code = "ASSIGNED", Label = "Assigned", PhilHealthCode = "1", PhilHealthLibrary = "lib_assignment_status" },
            new EhrOptionDescriptor { Code = "UNASSIGNED", Label = "Unassigned", PhilHealthCode = "2", PhilHealthLibrary = "lib_assignment_status" }
        });

        // LIB-006: Service Delivery Method
        Add("service_delivery_method", new[]
        {
            new EhrOptionDescriptor { Code = "HEALTH_FACILITY", Label = "Health Facility (Fixed Site)", PhilHealthCode = "1", PhilHealthLibrary = "lib_service_delivery" },
            new EhrOptionDescriptor { Code = "COMMUNITY_OUTREACH", Label = "Community Outreach / Mobile Clinic", PhilHealthCode = "2", PhilHealthLibrary = "lib_service_delivery" },
            new EhrOptionDescriptor { Code = "HOME_VISIT", Label = "Home Visit", PhilHealthCode = "3", PhilHealthLibrary = "lib_service_delivery" },
            new EhrOptionDescriptor { Code = "TELECONSULT", Label = "Telemedicine / Virtual Consult", PhilHealthCode = "4", PhilHealthLibrary = "lib_service_delivery" }
        });

        // LIB-007: Verification Mode
        Add("verification_mode", new[]
        {
            new EhrOptionDescriptor { Code = "PCU", Label = "Patient Care Unit (Facial Biometric Liveness)", PhilHealthCode = "PCU", PhilHealthLibrary = "lib_verification_mode" },
            new EhrOptionDescriptor { Code = "OTP", Label = "One-Time Password (SMS)", PhilHealthCode = "OTP", PhilHealthLibrary = "lib_verification_mode" },
            new EhrOptionDescriptor { Code = "VALID_ID", Label = "Government-Issued Valid ID", PhilHealthCode = "VALID_ID", PhilHealthLibrary = "lib_verification_mode" }
        });

        // LIB-008: FPE Classification
        Add("fpe_classification", new[]
        {
            new EhrOptionDescriptor { Code = "NEW_FPE", Label = "Initial / New FPE", PhilHealthCode = "1", PhilHealthLibrary = "lib_fpe_classification" },
            new EhrOptionDescriptor { Code = "REPEAT_FPE", Label = "Subsequent / Annual FPE", PhilHealthCode = "2", PhilHealthLibrary = "lib_fpe_classification" }
        });

        // LIB-009: Facilitator Type
        Add("facilitator_type", new[]
        {
            new EhrOptionDescriptor { Code = "PHYSICIAN", Label = "Licensed Physician", PhilHealthCode = "P", PhilHealthLibrary = "lib_facilitator_type" },
            new EhrOptionDescriptor { Code = "OTHER_HEALTH_PROFESSIONAL", Label = "Other Health Professional (Nurse/Midwife)", PhilHealthCode = "H", PhilHealthLibrary = "lib_facilitator_type" }
        });

        // LIB-011: Immunization Summary
        Add("immunization_summary", new[]
        {
            new EhrOptionDescriptor { Code = "FULLY_IMMUNIZED_CHILD", Label = "Fully Immunized Child (FIC)", PhilHealthCode = "01", PhilHealthLibrary = "lib_immunization_summary" },
            new EhrOptionDescriptor { Code = "COMPLETELY_IMMUNIZED_CHILD", Label = "Completely Immunized Child (CIC)", PhilHealthCode = "02", PhilHealthLibrary = "lib_immunization_summary" },
            new EhrOptionDescriptor { Code = "CHILD_PROTECTED_AT_BIRTH", Label = "Child Protected at Birth (CPAB)", PhilHealthCode = "03", PhilHealthLibrary = "lib_immunization_summary" },
            new EhrOptionDescriptor { Code = "NONE", Label = "None / Incomplete", PhilHealthCode = "04", PhilHealthLibrary = "lib_immunization_summary" }
        });

        // LIB-012: Smoking Status
        Add("smoking_status", new[]
        {
            new EhrOptionDescriptor { Code = "NEVER_SMOKED", Label = "Never Smoked", PhilHealthCode = "01", PhilHealthLibrary = "lib_smoking_status" },
            new EhrOptionDescriptor { Code = "FORMER_SMOKER", Label = "Former Smoker (Quit)", PhilHealthCode = "02", PhilHealthLibrary = "lib_smoking_status" },
            new EhrOptionDescriptor { Code = "CURRENT_SMOKER", Label = "Current Smoker", PhilHealthCode = "03", PhilHealthLibrary = "lib_smoking_status" }
        });

        // LIB-013: Secondhand Smoke Exposure
        Add("secondhand_smoke_exposure", new[]
        {
            new EhrOptionDescriptor { Code = "PERSONAL_HOME", Label = "Home / Personal Exposure", PhilHealthCode = "P", PhilHealthLibrary = "lib_secondhand_smoke" },
            new EhrOptionDescriptor { Code = "OCCUPATIONAL_WORK", Label = "Occupational / Workplace Exposure", PhilHealthCode = "O", PhilHealthLibrary = "lib_secondhand_smoke" },
            new EhrOptionDescriptor { Code = "BOTH", Label = "Both Home and Workplace Exposure", PhilHealthCode = "B", PhilHealthLibrary = "lib_secondhand_smoke" },
            new EhrOptionDescriptor { Code = "NONE", Label = "No Secondhand Smoke Exposure", PhilHealthCode = "N", PhilHealthLibrary = "lib_secondhand_smoke" }
        });

        // LIB-014: Vape Device
        Add("vape_device", new[]
        {
            new EhrOptionDescriptor { Code = "ELECTRONIC_NICOTINE_DELIVERY", Label = "Electronic Nicotine Delivery System (ENDS / E-Cigarette)", PhilHealthCode = "01", PhilHealthLibrary = "lib_vape_device" },
            new EhrOptionDescriptor { Code = "HEATED_TOBACCO_PRODUCT", Label = "Heated Tobacco Product (HTP)", PhilHealthCode = "02", PhilHealthLibrary = "lib_vape_device" },
            new EhrOptionDescriptor { Code = "OTHER_VAPE", Label = "Other Vapor / Inhalant Device", PhilHealthCode = "03", PhilHealthLibrary = "lib_vape_device", RequiresSpecifyText = true },
            new EhrOptionDescriptor { Code = "NONE", Label = "None", PhilHealthCode = "04", PhilHealthLibrary = "lib_vape_device" }
        });

        // LIB-015: Alcohol Drinker Subtype
        Add("alcohol_drinker_subtype", new[]
        {
            new EhrOptionDescriptor { Code = "NEVER_DRANK", Label = "Lifetime Abstainer (Never Drank)", PhilHealthCode = "01", PhilHealthLibrary = "lib_alcohol_drinker" },
            new EhrOptionDescriptor { Code = "FORMER_DRINKER", Label = "Former Drinker (Quit)", PhilHealthCode = "02", PhilHealthLibrary = "lib_alcohol_drinker" },
            new EhrOptionDescriptor { Code = "CURRENT_OCCASIONAL", Label = "Current Occasional Drinker", PhilHealthCode = "03", PhilHealthLibrary = "lib_alcohol_drinker" },
            new EhrOptionDescriptor { Code = "CURRENT_REGULAR", Label = "Current Regular / Heavy Drinker", PhilHealthCode = "04", PhilHealthLibrary = "lib_alcohol_drinker" }
        });

        // LIB-017: Alcohol Type
        Add("alcohol_type", new[]
        {
            new EhrOptionDescriptor { Code = "BEER", Label = "Beer", PhilHealthCode = "01", PhilHealthLibrary = "lib_alcohol_type" },
            new EhrOptionDescriptor { Code = "WINE", Label = "Wine", PhilHealthCode = "02", PhilHealthLibrary = "lib_alcohol_type" },
            new EhrOptionDescriptor { Code = "DISTILLED_SPIRITS", Label = "Distilled Spirits / Liquor", PhilHealthCode = "03", PhilHealthLibrary = "lib_alcohol_type" },
            new EhrOptionDescriptor { Code = "OTHER_ALCOHOL", Label = "Other Alcoholic Beverage", PhilHealthCode = "04", PhilHealthLibrary = "lib_alcohol_type", RequiresSpecifyText = true }
        });

        // LIB-018: Dietary Intake
        Add("dietary_intake", new[]
        {
            new EhrOptionDescriptor { Code = "BALANCED", Label = "Balanced Diet", PhilHealthCode = "01", PhilHealthLibrary = "lib_dietary_intake" },
            new EhrOptionDescriptor { Code = "HIGH_SODIUM", Label = "High Salt / Sodium Intake", PhilHealthCode = "02", PhilHealthLibrary = "lib_dietary_intake" },
            new EhrOptionDescriptor { Code = "HIGH_FAT", Label = "High Fat / Cholesterol Intake", PhilHealthCode = "03", PhilHealthLibrary = "lib_dietary_intake" },
            new EhrOptionDescriptor { Code = "HIGH_SUGAR", Label = "High Sugar / Calorie Intake", PhilHealthCode = "04", PhilHealthLibrary = "lib_dietary_intake" }
        });

        // LIB-019: Breastfeeding Status
        Add("breastfeeding_status", new[]
        {
            new EhrOptionDescriptor { Code = "EXCLUSIVE", Label = "Exclusive Breastfeeding (0-6 months)", PhilHealthCode = "01", PhilHealthLibrary = "lib_breastfeeding" },
            new EhrOptionDescriptor { Code = "MIXED", Label = "Mixed Feeding (Breastmilk + Formula/Food)", PhilHealthCode = "02", PhilHealthLibrary = "lib_breastfeeding" },
            new EhrOptionDescriptor { Code = "FORMULA_ONLY", Label = "Formula / Bottle Feeding Only", PhilHealthCode = "03", PhilHealthLibrary = "lib_breastfeeding" }
        });

        // LIB-020: Dental Checkup Status
        Add("dental_checkup_status", new[]
        {
            new EhrOptionDescriptor { Code = "NEVER", Label = "Never Visited a Dentist", PhilHealthCode = "01", PhilHealthLibrary = "lib_dental_checkup" },
            new EhrOptionDescriptor { Code = "WITHIN_LAST_YEAR", Label = "Dental Visit Within the Last 12 Months", PhilHealthCode = "02", PhilHealthLibrary = "lib_dental_checkup" },
            new EhrOptionDescriptor { Code = "MORE_THAN_A_YEAR", Label = "Dental Visit More Than 1 Year Ago", PhilHealthCode = "03", PhilHealthLibrary = "lib_dental_checkup" }
        });

        // LIB-021: Mental Health Event
        Add("mental_health_event", new[]
        {
            new EhrOptionDescriptor { Code = "NONE", Label = "None / No Significant Distress", PhilHealthCode = "01", PhilHealthLibrary = "lib_mental_health" },
            new EhrOptionDescriptor { Code = "ANXIETY", Label = "Persistent Anxiety or Panic", PhilHealthCode = "02", PhilHealthLibrary = "lib_mental_health" },
            new EhrOptionDescriptor { Code = "DEPRESSIVE_MOOD", Label = "Depressed Mood / Anhedonia", PhilHealthCode = "03", PhilHealthLibrary = "lib_mental_health" },
            new EhrOptionDescriptor { Code = "SLEEP_DISTURBANCE", Label = "Severe Sleep Disturbance", PhilHealthCode = "04", PhilHealthLibrary = "lib_mental_health" },
            new EhrOptionDescriptor { Code = "TRAUMA_STRESS", Label = "Trauma or Stressor-Related Reaction", PhilHealthCode = "05", PhilHealthLibrary = "lib_mental_health" },
            new EhrOptionDescriptor { Code = "OTHER_MENTAL_HEALTH", Label = "Other Mental Health Concern", PhilHealthCode = "06", PhilHealthLibrary = "lib_mental_health", RequiresSpecifyText = true }
        });

        // LIB-023: Sexual Consent Status
        Add("sexual_consent_status", new[]
        {
            new EhrOptionDescriptor { Code = "ALWAYS_CONSENSUAL", Label = "Consensual Sexual Activity", PhilHealthCode = "01", PhilHealthLibrary = "lib_sexual_consent" },
            new EhrOptionDescriptor { Code = "HISTORY_OF_COERCION", Label = "History of Coercion or Non-Consensual Experience", PhilHealthCode = "02", PhilHealthLibrary = "lib_sexual_consent" },
            new EhrOptionDescriptor { Code = "PREFER_NOT_TO_ANSWER", Label = "Prefer not to disclose", PhilHealthCode = "03", PhilHealthLibrary = "lib_sexual_consent" }
        });

        // LIB-025: Sexual Risk Behavior
        Add("sexual_risk_behavior", new[]
        {
            new EhrOptionDescriptor { Code = "MONOGAMOUS", Label = "Mutually Monogamous Partner", PhilHealthCode = "01", PhilHealthLibrary = "lib_sexual_risk" },
            new EhrOptionDescriptor { Code = "MULTIPLE_PARTNERS", Label = "Multiple Concurrent Sexual Partners", PhilHealthCode = "02", PhilHealthLibrary = "lib_sexual_risk" },
            new EhrOptionDescriptor { Code = "INCONSISTENT_CONDOM_USE", Label = "Inconsistent Condom / Barrier Use", PhilHealthCode = "03", PhilHealthLibrary = "lib_sexual_risk" },
            new EhrOptionDescriptor { Code = "SEX_UNDER_INFLUENCE", Label = "Sexual Activity Under Substance/Alcohol Influence", PhilHealthCode = "04", PhilHealthLibrary = "lib_sexual_risk" },
            new EhrOptionDescriptor { Code = "OTHER_RISK_BEHAVIOR", Label = "Other Risk Behavior", PhilHealthCode = "05", PhilHealthLibrary = "lib_sexual_risk", RequiresSpecifyText = true }
        });

        // Contraceptive Use Status
        Add("contraceptive_use_status", new[]
        {
            new EhrOptionDescriptor { Code = "CURRENT_USER", Label = "Currently Using Modern Contraception", PhilHealthCode = "1", PhilHealthLibrary = "lib_contraceptive_use" },
            new EhrOptionDescriptor { Code = "FORMER_USER", Label = "Former User (Discontinued)", PhilHealthCode = "2", PhilHealthLibrary = "lib_contraceptive_use" },
            new EhrOptionDescriptor { Code = "NEVER_USED", Label = "Never Used Contraception", PhilHealthCode = "3", PhilHealthLibrary = "lib_contraceptive_use" }
        });

        // Contraceptive Method
        Add("contraceptive_method", new[]
        {
            new EhrOptionDescriptor { Code = "ORAL_PILLS", Label = "Oral Contraceptive Pills (Combined / POP)", PhilHealthCode = "01", PhilHealthLibrary = "lib_contraceptive_method" },
            new EhrOptionDescriptor { Code = "DMPA_INJECTABLE", Label = "DMPA / Depo Injectable", PhilHealthCode = "02", PhilHealthLibrary = "lib_contraceptive_method" },
            new EhrOptionDescriptor { Code = "SUBDERMAL_IMPLANT", Label = "Subdermal Progestin Implant", PhilHealthCode = "03", PhilHealthLibrary = "lib_contraceptive_method" },
            new EhrOptionDescriptor { Code = "IUD", Label = "Intrauterine Device (Copper / LNG-IUD)", PhilHealthCode = "04", PhilHealthLibrary = "lib_contraceptive_method" },
            new EhrOptionDescriptor { Code = "CONDOM", Label = "Male / Female Condom", PhilHealthCode = "05", PhilHealthLibrary = "lib_contraceptive_method" },
            new EhrOptionDescriptor { Code = "BTL", Label = "Bilateral Tubal Ligation (BTL)", PhilHealthCode = "06", PhilHealthLibrary = "lib_contraceptive_method" },
            new EhrOptionDescriptor { Code = "NSV", Label = "No-Scalpel Vasectomy (NSV)", PhilHealthCode = "07", PhilHealthLibrary = "lib_contraceptive_method" },
            new EhrOptionDescriptor { Code = "NATURAL_FP", Label = "Natural / Fertility Awareness Methods (SDM, BUM, STM)", PhilHealthCode = "08", PhilHealthLibrary = "lib_contraceptive_method" },
            new EhrOptionDescriptor { Code = "OTHER_METHOD", Label = "Other Method", PhilHealthCode = "09", PhilHealthLibrary = "lib_contraceptive_method", RequiresSpecifyText = true }
        });

        // Prenatal Checkup Count
        Add("prenatal_checkup_count", new[]
        {
            new EhrOptionDescriptor { Code = "NONE", Label = "0 Checkups", PhilHealthCode = "0", PhilHealthLibrary = "lib_prenatal_count" },
            new EhrOptionDescriptor { Code = "ONE_TO_THREE", Label = "1 to 3 Checkups", PhilHealthCode = "1", PhilHealthLibrary = "lib_prenatal_count" },
            new EhrOptionDescriptor { Code = "FOUR_OR_MORE", Label = "4 or More Checkups (Complete)", PhilHealthCode = "2", PhilHealthLibrary = "lib_prenatal_count" }
        });

        // LIB-027: PE General Survey
        Add("pe_general_survey", new[]
        {
            new EhrOptionDescriptor { Code = "AWAKE_ALERT", Label = "Awake, Alert, Oriented", PhilHealthCode = "01", PhilHealthLibrary = "lib_pe_general_survey" },
            new EhrOptionDescriptor { Code = "CONSCIOUS_COHERENT", Label = "Conscious, Coherent, Ambulatory", PhilHealthCode = "02", PhilHealthLibrary = "lib_pe_general_survey" },
            new EhrOptionDescriptor { Code = "ALTERED_MENTAL_STATUS", Label = "Lethargic / Altered Mental Status", PhilHealthCode = "03", PhilHealthLibrary = "lib_pe_general_survey" },
            new EhrOptionDescriptor { Code = "ACUTE_DISTRESS", Label = "In Acute Cardiorespiratory / Pain Distress", PhilHealthCode = "04", PhilHealthLibrary = "lib_pe_general_survey" }
        });

        // LIB-028: Consultation Reason
        Add("consultation_reason", new[]
        {
            new EhrOptionDescriptor { Code = "GENERAL_CONSULTATION", Label = "General OPD Clinical Consultation", PhilHealthCode = "1", PhilHealthLibrary = "lib_consultation_reason" },
            new EhrOptionDescriptor { Code = "FOLLOW_UP", Label = "Scheduled Clinical Follow-up", PhilHealthCode = "2", PhilHealthLibrary = "lib_consultation_reason" },
            new EhrOptionDescriptor { Code = "ROUTINE_PREVENTIVE", Label = "Routine Health Maintenance / Wellness", PhilHealthCode = "3", PhilHealthLibrary = "lib_consultation_reason" }
        });

        // LIB-029: Visual Acuity Chart
        Add("visual_acuity_chart", new[]
        {
            new EhrOptionDescriptor { Code = "SNELLEN_LETTERS", Label = "Snellen Letter Chart", PhilHealthCode = "1", PhilHealthLibrary = "lib_visual_acuity" },
            new EhrOptionDescriptor { Code = "TUMBLING_E", Label = "Tumbling E Chart", PhilHealthCode = "2", PhilHealthLibrary = "lib_visual_acuity" },
            new EhrOptionDescriptor { Code = "LEA_SYMBOLS", Label = "LEA Pediatric Symbol Chart", PhilHealthCode = "3", PhilHealthLibrary = "lib_visual_acuity" }
        });

        // LIB-030: Specific Diagnosis Category
        Add("specific_diagnosis", new[]
        {
            new EhrOptionDescriptor { Code = "PRIMARY_DIAGNOSIS", Label = "Primary Diagnosis", PhilHealthCode = "1", PhilHealthLibrary = "lib_specific_diagnosis" },
            new EhrOptionDescriptor { Code = "SECONDARY_COMORBIDITY", Label = "Secondary / Comorbid Condition", PhilHealthCode = "2", PhilHealthLibrary = "lib_specific_diagnosis" }
        });

        // LIB-039: Counseling Topic
        Add("counseling_topic", new[]
        {
            new EhrOptionDescriptor { Code = "HEALTHY_LIFESTYLE", Label = "Healthy Diet & Physical Activity", PhilHealthCode = "01", PhilHealthLibrary = "lib_counseling_topic" },
            new EhrOptionDescriptor { Code = "SMOKING_CESSATION", Label = "Smoking & Vape Cessation", PhilHealthCode = "02", PhilHealthLibrary = "lib_counseling_topic" },
            new EhrOptionDescriptor { Code = "ALCOHOL_MODERATION", Label = "Alcohol Harm Reduction", PhilHealthCode = "03", PhilHealthLibrary = "lib_counseling_topic" },
            new EhrOptionDescriptor { Code = "MEDICATION_ADHERENCE", Label = "Chronic Disease Medication Adherence", PhilHealthCode = "04", PhilHealthLibrary = "lib_counseling_topic" },
            new EhrOptionDescriptor { Code = "FAMILY_PLANNING", Label = "Family Planning & Reproductive Health", PhilHealthCode = "05", PhilHealthLibrary = "lib_counseling_topic" },
            new EhrOptionDescriptor { Code = "BREASTFEEDING_NUTRITION", Label = "Infant & Young Child Feeding / Breastfeeding", PhilHealthCode = "06", PhilHealthLibrary = "lib_counseling_topic" },
            new EhrOptionDescriptor { Code = "MENTAL_HEALTH_COPING", Label = "Stress Management & Mental Wellness", PhilHealthCode = "07", PhilHealthLibrary = "lib_counseling_topic" },
            new EhrOptionDescriptor { Code = "OTHER_COUNSELING", Label = "Other Counseling Topic", PhilHealthCode = "08", PhilHealthLibrary = "lib_counseling_topic", RequiresSpecifyText = true }
        });

        // LIB-041: Diagnostic Plan Option
        Add("diagnostic_plan_option", new[]
        {
            new EhrOptionDescriptor { Code = "ORDER_NOW", Label = "Order In-Clinic or Reference Lab Now", PhilHealthCode = "1", PhilHealthLibrary = "lib_diagnostic_plan" },
            new EhrOptionDescriptor { Code = "SCHEDULE_FUTURE", Label = "Schedule for Future Visit / Preparation", PhilHealthCode = "2", PhilHealthLibrary = "lib_diagnostic_plan" }
        });

        // LIB-042: Routine Immunization Status
        Add("routine_immunization_status", new[]
        {
            new EhrOptionDescriptor { Code = "UP_TO_DATE", Label = "Age-Appropriate Vaccines Up-to-Date", PhilHealthCode = "1", PhilHealthLibrary = "lib_routine_imm_status" },
            new EhrOptionDescriptor { Code = "DELAYED_CATCH_UP", Label = "Delayed / Catch-Up Doses Needed", PhilHealthCode = "2", PhilHealthLibrary = "lib_routine_imm_status" },
            new EhrOptionDescriptor { Code = "REFUSED_CONTRAINDICATED", Label = "Vaccination Refused or Clinically Contraindicated", PhilHealthCode = "3", PhilHealthLibrary = "lib_routine_imm_status" }
        });

        // LIB-044: Vaccination Status
        Add("vaccination_status", new[]
        {
            new EhrOptionDescriptor { Code = "ADMINISTERED", Label = "Administered Today", PhilHealthCode = "1", PhilHealthLibrary = "lib_vaccination_status" },
            new EhrOptionDescriptor { Code = "HISTORICAL", Label = "Historical / Previously Administered Outside", PhilHealthCode = "2", PhilHealthLibrary = "lib_vaccination_status" },
            new EhrOptionDescriptor { Code = "DEFERRED", Label = "Deferred Due to Intercurrent Illness", PhilHealthCode = "3", PhilHealthLibrary = "lib_vaccination_status" }
        });

        // LIB-045: Milestone Visit Age
        Add("milestone_visit_age", new[]
        {
            new EhrOptionDescriptor { Code = "NEWBORN_FIRST_WEEK", Label = "Newborn / First Week (3-5 days)", PhilHealthCode = "01", PhilHealthLibrary = "lib_milestone_age" },
            new EhrOptionDescriptor { Code = "ONE_MONTH", Label = "1 Month", PhilHealthCode = "02", PhilHealthLibrary = "lib_milestone_age" },
            new EhrOptionDescriptor { Code = "TWO_MONTHS", Label = "2 Months", PhilHealthCode = "03", PhilHealthLibrary = "lib_milestone_age" },
            new EhrOptionDescriptor { Code = "FOUR_MONTHS", Label = "4 Months", PhilHealthCode = "04", PhilHealthLibrary = "lib_milestone_age" },
            new EhrOptionDescriptor { Code = "SIX_MONTHS", Label = "6 Months", PhilHealthCode = "05", PhilHealthLibrary = "lib_milestone_age" },
            new EhrOptionDescriptor { Code = "NINE_MONTHS", Label = "9 Months", PhilHealthCode = "06", PhilHealthLibrary = "lib_milestone_age" },
            new EhrOptionDescriptor { Code = "TWELVE_MONTHS", Label = "12 Months (1 Year)", PhilHealthCode = "07", PhilHealthLibrary = "lib_milestone_age" }
        });

        // LIB-047: SMR Assessment Result
        Add("smr_result", new[]
        {
            new EhrOptionDescriptor { Code = "STAGE_1", Label = "Tanner Stage 1 (Prepubertal)", PhilHealthCode = "1", PhilHealthLibrary = "lib_smr_result" },
            new EhrOptionDescriptor { Code = "STAGE_2", Label = "Tanner Stage 2", PhilHealthCode = "2", PhilHealthLibrary = "lib_smr_result" },
            new EhrOptionDescriptor { Code = "STAGE_3", Label = "Tanner Stage 3", PhilHealthCode = "3", PhilHealthLibrary = "lib_smr_result" },
            new EhrOptionDescriptor { Code = "STAGE_4", Label = "Tanner Stage 4", PhilHealthCode = "4", PhilHealthLibrary = "lib_smr_result" },
            new EhrOptionDescriptor { Code = "STAGE_5", Label = "Tanner Stage 5 (Mature Adult)", PhilHealthCode = "5", PhilHealthLibrary = "lib_smr_result" }
        });

        // LIB-048: HEADSSS Education Status
        Add("headsss_education_status", new[]
        {
            new EhrOptionDescriptor { Code = "CURRENTLY_ENROLLED", Label = "Currently Enrolled & Attending School", PhilHealthCode = "1", PhilHealthLibrary = "lib_headsss_education" },
            new EhrOptionDescriptor { Code = "OUT_OF_SCHOOL", Label = "Out of School / Not Enrolled", PhilHealthCode = "2", PhilHealthLibrary = "lib_headsss_education" },
            new EhrOptionDescriptor { Code = "WORKING_YOUTH", Label = "Working Youth / Employed", PhilHealthCode = "3", PhilHealthLibrary = "lib_headsss_education" }
        });

        // LIB-049: HEADSSS Relationship Status
        Add("headsss_relationship_status", new[]
        {
            new EhrOptionDescriptor { Code = "SUPPORTIVE_PEERS", Label = "Supportive Peer Network & Family", PhilHealthCode = "1", PhilHealthLibrary = "lib_headsss_relationship" },
            new EhrOptionDescriptor { Code = "BULLIED_ISOLATED", Label = "Experiencing Bullying or Social Isolation", PhilHealthCode = "2", PhilHealthLibrary = "lib_headsss_relationship" },
            new EhrOptionDescriptor { Code = "HIGH_CONFLICT", Label = "High Family or Peer Conflict", PhilHealthCode = "3", PhilHealthLibrary = "lib_headsss_relationship" }
        });

        // LIB-050: HEADSSS Living Arrangement
        Add("headsss_living_arrangement", new[]
        {
            new EhrOptionDescriptor { Code = "WITH_PARENTS", Label = "Living with Parents", PhilHealthCode = "1", PhilHealthLibrary = "lib_headsss_living" },
            new EhrOptionDescriptor { Code = "WITH_RELATIVES", Label = "Living with Relatives / Guardians", PhilHealthCode = "2", PhilHealthLibrary = "lib_headsss_living" },
            new EhrOptionDescriptor { Code = "INDEPENDENT_DORM", Label = "Living Independently / Boarding / Dorm", PhilHealthCode = "3", PhilHealthLibrary = "lib_headsss_living" },
            new EhrOptionDescriptor { Code = "OTHER_LIVING_ARRANGEMENT", Label = "Other Living Arrangement", PhilHealthCode = "4", PhilHealthLibrary = "lib_headsss_living", RequiresSpecifyText = true }
        });

        // LIB-053: BP Location
        Add("bp_location", new[]
        {
            new EhrOptionDescriptor { Code = "RIGHT_ARM", Label = "Right Upper Arm", PhilHealthCode = "RA", PhilHealthLibrary = "lib_bp_location" },
            new EhrOptionDescriptor { Code = "LEFT_ARM", Label = "Left Upper Arm", PhilHealthCode = "LA", PhilHealthLibrary = "lib_bp_location" }
        });

        // LIB-054: Recommendation Consent
        Add("recommendation_consent", new[]
        {
            new EhrOptionDescriptor { Code = "AGREED", Label = "Patient / Guardian Agreed to Plan", PhilHealthCode = "Y", PhilHealthLibrary = "lib_recommendation_consent" },
            new EhrOptionDescriptor { Code = "DECLINED", Label = "Patient / Guardian Declined / Deferred", PhilHealthCode = "N", PhilHealthLibrary = "lib_recommendation_consent" }
        });

        // LIB-055: Diagnostic Test Status
        Add("diagnostic_test_status", new[]
        {
            new EhrOptionDescriptor { Code = "COMPLETED", Label = "Test Performed & Resulted", PhilHealthCode = "C", PhilHealthLibrary = "lib_diagnostic_status" },
            new EhrOptionDescriptor { Code = "PENDING", Label = "Specimen Collected / Awaiting Result", PhilHealthCode = "P", PhilHealthLibrary = "lib_diagnostic_status" },
            new EhrOptionDescriptor { Code = "CANCELLED", Label = "Order Cancelled / Specimen Rejected", PhilHealthCode = "X", PhilHealthLibrary = "lib_diagnostic_status" }
        });

        // LIB-056: Diagnostic Test Location
        Add("diagnostic_test_location", new[]
        {
            new EhrOptionDescriptor { Code = "IN_CLINIC_LAB", Label = "In-Clinic Point-of-Care Laboratory", PhilHealthCode = "1", PhilHealthLibrary = "lib_diagnostic_location" },
            new EhrOptionDescriptor { Code = "OUTSIDE_ACCREDITED_LAB", Label = "Outside Accredited Diagnostic Facility", PhilHealthCode = "2", PhilHealthLibrary = "lib_diagnostic_location" }
        });

        // LIB-057: Qualitative Test Result
        Add("qualitative_test_result", new[]
        {
            new EhrOptionDescriptor { Code = "NEGATIVE", Label = "Negative / Non-Reactive", PhilHealthCode = "NEG", PhilHealthLibrary = "lib_qualitative_result" },
            new EhrOptionDescriptor { Code = "POSITIVE", Label = "Positive / Reactive", PhilHealthCode = "POS", PhilHealthLibrary = "lib_qualitative_result" },
            new EhrOptionDescriptor { Code = "EQUIVOCAL", Label = "Equivocal / Indeterminate", PhilHealthCode = "EQV", PhilHealthLibrary = "lib_qualitative_result" }
        });

        // LIB-062: Medicine Drug Grouping
        Add("medicine_drug_grouping", new[]
        {
            new EhrOptionDescriptor { Code = "ANTI_INFECTIVE", Label = "Anti-Infective Medicines (Antibiotics/Antivirals)", PhilHealthCode = "01", PhilHealthLibrary = "lib_drug_grouping" },
            new EhrOptionDescriptor { Code = "ANTIHYPERTENSIVE", Label = "Cardiovascular & Antihypertensive Medicines", PhilHealthCode = "02", PhilHealthLibrary = "lib_drug_grouping" },
            new EhrOptionDescriptor { Code = "ANTIDIABETIC", Label = "Oral Antidiabetic & Insulins", PhilHealthCode = "03", PhilHealthLibrary = "lib_drug_grouping" },
            new EhrOptionDescriptor { Code = "ANTIASTHMA", Label = "Respiratory / Bronchodilator Medicines", PhilHealthCode = "04", PhilHealthLibrary = "lib_drug_grouping" },
            new EhrOptionDescriptor { Code = "ANALGESIC_ANTIPYRETIC", Label = "Analgesics, Antipyretics & NSAIDs", PhilHealthCode = "05", PhilHealthLibrary = "lib_drug_grouping" },
            new EhrOptionDescriptor { Code = "GASTROINTESTINAL", Label = "Gastrointestinal Medicines", PhilHealthCode = "06", PhilHealthLibrary = "lib_drug_grouping" },
            new EhrOptionDescriptor { Code = "OTHER_MEDICINE_GROUP", Label = "Other Therapeutic Drug Group", PhilHealthCode = "07", PhilHealthLibrary = "lib_drug_grouping", RequiresSpecifyText = true }
        });

        // LIB-063: Referral Type
        Add("referral_type", new[]
        {
            new EhrOptionDescriptor { Code = "SPECIALIST_CONSULTATION", Label = "Specialist Clinical Consultation", PhilHealthCode = "1", PhilHealthLibrary = "lib_referral_type" },
            new EhrOptionDescriptor { Code = "DIAGNOSTIC_WORKUP", Label = "Advanced Diagnostic Workup / Imaging", PhilHealthCode = "2", PhilHealthLibrary = "lib_referral_type" },
            new EhrOptionDescriptor { Code = "EMERGENCY_TRANSFER", Label = "Emergency Facility Transfer", PhilHealthCode = "3", PhilHealthLibrary = "lib_referral_type" },
            new EhrOptionDescriptor { Code = "INPATIENT_ADMISSION", Label = "Inpatient Hospital Admission", PhilHealthCode = "4", PhilHealthLibrary = "lib_referral_type" }
        });

        // LIB-064: Referral Primary Care Service
        Add("referral_primary_care_service", new[]
        {
            new EhrOptionDescriptor { Code = "COMPREHENSIVE_FPE", Label = "Comprehensive First Patient Encounter", PhilHealthCode = "1", PhilHealthLibrary = "lib_referral_primary_service" },
            new EhrOptionDescriptor { Code = "CHRONIC_CARE_MANAGEMENT", Label = "Long-Term NCD Chronic Care Maintenance", PhilHealthCode = "2", PhilHealthLibrary = "lib_referral_primary_service" }
        });

        // LIB-065: Referral Facility Service
        Add("referral_facility_service", new[]
        {
            new EhrOptionDescriptor { Code = "INTERNAL_MEDICINE", Label = "Internal Medicine / Subspecialty", PhilHealthCode = "01", PhilHealthLibrary = "lib_referral_facility_service" },
            new EhrOptionDescriptor { Code = "PEDIATRICS", Label = "Pediatrics / Pediatric Subspecialty", PhilHealthCode = "02", PhilHealthLibrary = "lib_referral_facility_service" },
            new EhrOptionDescriptor { Code = "OB_GYNE", Label = "Obstetrics & Gynecology", PhilHealthCode = "03", PhilHealthLibrary = "lib_referral_facility_service" },
            new EhrOptionDescriptor { Code = "SURGERY", Label = "General Surgery / Subspecialty", PhilHealthCode = "04", PhilHealthLibrary = "lib_referral_facility_service" }
        });

        // LIB-067: Guardian Relationship
        Add("guardian_relationship", new[]
        {
            new EhrOptionDescriptor { Code = "MOTHER", Label = "Mother", PhilHealthCode = "1", PhilHealthLibrary = "lib_relationship" },
            new EhrOptionDescriptor { Code = "FATHER", Label = "Father", PhilHealthCode = "2", PhilHealthLibrary = "lib_relationship" },
            new EhrOptionDescriptor { Code = "SPOUSE", Label = "Spouse", PhilHealthCode = "3", PhilHealthLibrary = "lib_relationship" },
            new EhrOptionDescriptor { Code = "SIBLING", Label = "Brother / Sister", PhilHealthCode = "4", PhilHealthLibrary = "lib_relationship" },
            new EhrOptionDescriptor { Code = "GRANDPARENT", Label = "Grandmother / Grandfather", PhilHealthCode = "5", PhilHealthLibrary = "lib_relationship" },
            new EhrOptionDescriptor { Code = "LEGAL_GUARDIAN", Label = "Court-Appointed Legal Guardian", PhilHealthCode = "6", PhilHealthLibrary = "lib_relationship" },
            new EhrOptionDescriptor { Code = "NON_RELATIVE_CAREGIVER", Label = "Non-Relative Primary Caregiver", PhilHealthCode = "7", PhilHealthLibrary = "lib_relationship", RequiresSpecifyText = true }
        });

        // LIB-068: Medicine Route
        Add("medicine_route", new[]
        {
            new EhrOptionDescriptor { Code = "ORAL", Label = "Oral (PO)", PhilHealthCode = "PO", PhilHealthLibrary = "lib_medicine_route" },
            new EhrOptionDescriptor { Code = "SUBLINGUAL", Label = "Sublingual (SL)", PhilHealthCode = "SL", PhilHealthLibrary = "lib_medicine_route" },
            new EhrOptionDescriptor { Code = "TOPICAL", Label = "Topical / Dermal", PhilHealthCode = "TOP", PhilHealthLibrary = "lib_medicine_route" },
            new EhrOptionDescriptor { Code = "INHALATION", Label = "Inhalation / Nebulization", PhilHealthCode = "INH", PhilHealthLibrary = "lib_medicine_route" },
            new EhrOptionDescriptor { Code = "OPHTHALMIC", Label = "Ophthalmic (Eye Drops/Ointment)", PhilHealthCode = "OPH", PhilHealthLibrary = "lib_medicine_route" },
            new EhrOptionDescriptor { Code = "OTIC", Label = "Otic (Ear Drops)", PhilHealthCode = "OTIC", PhilHealthLibrary = "lib_medicine_route" },
            new EhrOptionDescriptor { Code = "NASAL", Label = "Nasal Spray / Drops", PhilHealthCode = "NAS", PhilHealthLibrary = "lib_medicine_route" },
            new EhrOptionDescriptor { Code = "INTRAMUSCULAR", Label = "Intramuscular Injection (IM)", PhilHealthCode = "IM", PhilHealthLibrary = "lib_medicine_route" },
            new EhrOptionDescriptor { Code = "INTRAVENOUS", Label = "Intravenous Infusion/Bolus (IV)", PhilHealthCode = "IV", PhilHealthLibrary = "lib_medicine_route" },
            new EhrOptionDescriptor { Code = "SUBCUTANEOUS", Label = "Subcutaneous Injection (SC)", PhilHealthCode = "SC", PhilHealthLibrary = "lib_medicine_route" }
        });

        // LIB-069: Medicine Frequency
        Add("medicine_frequency", new[]
        {
            new EhrOptionDescriptor { Code = "ONCE_DAILY", Label = "Once Daily (OD / Q24H)", PhilHealthCode = "01", PhilHealthLibrary = "lib_medicine_frequency" },
            new EhrOptionDescriptor { Code = "TWICE_DAILY", Label = "Twice Daily (BID / Q12H)", PhilHealthCode = "02", PhilHealthLibrary = "lib_medicine_frequency" },
            new EhrOptionDescriptor { Code = "THREE_TIMES_DAILY", Label = "Three Times Daily (TID / Q8H)", PhilHealthCode = "03", PhilHealthLibrary = "lib_medicine_frequency" },
            new EhrOptionDescriptor { Code = "FOUR_TIMES_DAILY", Label = "Four Times Daily (QID / Q6H)", PhilHealthCode = "04", PhilHealthLibrary = "lib_medicine_frequency" },
            new EhrOptionDescriptor { Code = "AS_NEEDED", Label = "As Needed / PRN (e.g. for pain/fever)", PhilHealthCode = "05", PhilHealthLibrary = "lib_medicine_frequency" },
            new EhrOptionDescriptor { Code = "AT_BEDTIME", Label = "At Bedtime (QHS)", PhilHealthCode = "06", PhilHealthLibrary = "lib_medicine_frequency" },
            new EhrOptionDescriptor { Code = "EVERY_OTHER_DAY", Label = "Every Other Day (QOD)", PhilHealthCode = "07", PhilHealthLibrary = "lib_medicine_frequency" },
            new EhrOptionDescriptor { Code = "ONCE_WEEKLY", Label = "Once Weekly", PhilHealthCode = "08", PhilHealthLibrary = "lib_medicine_frequency" },
            new EhrOptionDescriptor { Code = "STAT_DOSE", Label = "Single Immediate Dose (STAT)", PhilHealthCode = "09", PhilHealthLibrary = "lib_medicine_frequency" }
        });

        // LIB-070: PCU Status
        Add("pcu_status", new[]
        {
            new EhrOptionDescriptor { Code = "INITIATED", Label = "PCU Liveness Session Initiated", PhilHealthCode = "1", PhilHealthLibrary = "lib_pcu_status" },
            new EhrOptionDescriptor { Code = "PASSED", Label = "Facial Biometric Liveness Passed", PhilHealthCode = "2", PhilHealthLibrary = "lib_pcu_status" },
            new EhrOptionDescriptor { Code = "FAILED", Label = "Liveness Verification Failed", PhilHealthCode = "3", PhilHealthLibrary = "lib_pcu_status" }
        });

        // LIB-071: OTP Status
        Add("otp_status", new[]
        {
            new EhrOptionDescriptor { Code = "GENERATED", Label = "SMS OTP Dispatched to Patient", PhilHealthCode = "1", PhilHealthLibrary = "lib_otp_status" },
            new EhrOptionDescriptor { Code = "VERIFIED", Label = "OTP Successfully Validated", PhilHealthCode = "2", PhilHealthLibrary = "lib_otp_status" },
            new EhrOptionDescriptor { Code = "EXPIRED", Label = "OTP Expired / Timed Out", PhilHealthCode = "3", PhilHealthLibrary = "lib_otp_status" }
        });

        // LIB-072: Valid ID Type
        Add("valid_id_type", new[]
        {
            new EhrOptionDescriptor { Code = "PHILSYS_ID", Label = "Philippine National ID (PhilSys)", PhilHealthCode = "01", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "PASSPORT", Label = "Philippine Passport (DFA)", PhilHealthCode = "02", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "DRIVERS_LICENSE", Label = "Driver's License (LTO)", PhilHealthCode = "03", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "SSS_ID", Label = "Social Security System (SSS) ID", PhilHealthCode = "04", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "GSIS_E_CARD", Label = "GSIS e-Card / UMID", PhilHealthCode = "05", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "PRC_ID", Label = "Professional Regulation Commission (PRC) ID", PhilHealthCode = "06", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "POSTAL_ID", Label = "Postal ID (Digitized / PhilPost)", PhilHealthCode = "07", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "VOTERS_ID", Label = "Voter's ID / Certificate (COMELEC)", PhilHealthCode = "08", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "SENIOR_CITIZEN_ID", Label = "Senior Citizen Identification Card (OSCA)", PhilHealthCode = "09", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "PWD_ID", Label = "Persons with Disability (PWD) ID (NCDA)", PhilHealthCode = "10", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "SOLO_PARENT_ID", Label = "Solo Parent ID (DSWD / LGU)", PhilHealthCode = "11", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "UMID", Label = "Unified Multi-Purpose ID (UMID)", PhilHealthCode = "12", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "OFW_ID", Label = "Overseas Filipino Worker (OFW) ID", PhilHealthCode = "13", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "SEAMANS_BOOK", Label = "Seaman's Book (SIRB)", PhilHealthCode = "14", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "ALIEN_CERTIFICATE", Label = "Alien Certificate of Registration (ACR I-Card)", PhilHealthCode = "15", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "GOVERNMENT_OFFICE_ID", Label = "Government Office / Agency Employee ID", PhilHealthCode = "16", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "NBI_CLEARANCE", Label = "National Bureau of Investigation (NBI) Clearance", PhilHealthCode = "17", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "POLICE_CLEARANCE", Label = "Philippine National Police (PNP) Clearance", PhilHealthCode = "18", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "BARANGAY_ID", Label = "Barangay Identification Card / Certificate", PhilHealthCode = "19", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "IBP_ID", Label = "Integrated Bar of the Philippines (IBP) Card", PhilHealthCode = "20", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "SCHOOL_ID", Label = "Current School / University Student ID", PhilHealthCode = "21", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "COMPANY_ID", Label = "Current Employer / Company ID", PhilHealthCode = "22", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "PHILHEALTH_ID", Label = "PhilHealth Member Identification Card (PMIC)", PhilHealthCode = "23", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "TIN_ID", Label = "Taxpayer Identification Number (TIN) Card", PhilHealthCode = "24", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "PANTAWID_PAMILYA_ID", Label = "4Ps (Pantawid Pamilyang Pilipino Program) ID", PhilHealthCode = "25", PhilHealthLibrary = "lib_valid_id" },
            new EhrOptionDescriptor { Code = "OTHER_VALID_ID", Label = "Other Government-Issued Valid ID", PhilHealthCode = "26", PhilHealthLibrary = "lib_valid_id", RequiresSpecifyText = true }
        });

        // Allergy Severity
        Add("allergy_severity", new[]
        {
            new EhrOptionDescriptor { Code = "Mild", Label = "Mild", PhilHealthCode = "1" },
            new EhrOptionDescriptor { Code = "Moderate", Label = "Moderate", PhilHealthCode = "2" },
            new EhrOptionDescriptor { Code = "Severe", Label = "Severe", PhilHealthCode = "3" },
            new EhrOptionDescriptor { Code = "LifeThreatening", Label = "Life Threatening", PhilHealthCode = "4" }
        });

        // Disability Type
        Add("disability_type", new[]
        {
            new EhrOptionDescriptor { Code = "Physical", Label = "Physical", PhilHealthCode = "1" },
            new EhrOptionDescriptor { Code = "Sensory", Label = "Sensory", PhilHealthCode = "2" },
            new EhrOptionDescriptor { Code = "Intellectual", Label = "Intellectual", PhilHealthCode = "3" },
            new EhrOptionDescriptor { Code = "Psychosocial", Label = "Psychosocial", PhilHealthCode = "4" }
        });

        // HMO Plan Type
        Add("hmo_plan_type", new[]
        {
            new EhrOptionDescriptor { Code = "Individual", Label = "Individual", PhilHealthCode = "1" },
            new EhrOptionDescriptor { Code = "Family", Label = "Family", PhilHealthCode = "2" },
            new EhrOptionDescriptor { Code = "Group", Label = "Group", PhilHealthCode = "3" }
        });

        // Work Environment
        Add("work_environment", new[]
        {
            new EhrOptionDescriptor { Code = "Office", Label = "Office" },
            new EhrOptionDescriptor { Code = "Field", Label = "Field" },
            new EhrOptionDescriptor { Code = "Factory", Label = "Factory" },
            new EhrOptionDescriptor { Code = "Healthcare", Label = "Healthcare" },
            new EhrOptionDescriptor { Code = "Agriculture", Label = "Agriculture" },
            new EhrOptionDescriptor { Code = "Other", Label = "Other", RequiresSpecifyText = true }
        });

        // Family Side
        Add("family_side", new[]
        {
            new EhrOptionDescriptor { Code = "Paternal", Label = "Paternal" },
            new EhrOptionDescriptor { Code = "Maternal", Label = "Maternal" },
            new EhrOptionDescriptor { Code = "Both", Label = "Both" },
            new EhrOptionDescriptor { Code = "Unknown", Label = "Unknown" }
        });

        // Healthcare Provider Type
        Add("provider_type", new[]
        {
            new EhrOptionDescriptor { Code = "primary_care", Label = "Primary Care Physician" },
            new EhrOptionDescriptor { Code = "specialist_1", Label = "Specialist 1" },
            new EhrOptionDescriptor { Code = "specialist_2", Label = "Specialist 2" }
        });

        // Corrective Lenses
        Add("corrective_lenses", new[]
        {
            new EhrOptionDescriptor { Code = "None", Label = "None" },
            new EhrOptionDescriptor { Code = "Glasses", Label = "Eyeglasses" },
            new EhrOptionDescriptor { Code = "Contacts", Label = "Contact Lenses" },
            new EhrOptionDescriptor { Code = "Both", Label = "Both" }
        });

        // WHO/ISH CVD Risk Options (Q17)
        Add("cvd_risk_level", new[]
        {
            new EhrOptionDescriptor { Code = "A", Label = "A — Low Risk (< 10%)", PhilHealthCode = "A" },
            new EhrOptionDescriptor { Code = "B", Label = "B — Moderate Risk (10% to < 20%)", PhilHealthCode = "B" },
            new EhrOptionDescriptor { Code = "C", Label = "C — High Risk (20% to < 30%)", PhilHealthCode = "C" },
            new EhrOptionDescriptor { Code = "D", Label = "D — Very High Risk (30% to < 40%)", PhilHealthCode = "D" },
            new EhrOptionDescriptor { Code = "E", Label = "E — Critical Risk (≥ 40%)", PhilHealthCode = "E" }
        });

        // Common Drugstores for Rx Receipts
        Add("common_drugstore", new[]
        {
            new EhrOptionDescriptor { Code = "MERCURY_DRUG", Label = "Mercury Drug" },
            new EhrOptionDescriptor { Code = "WATSONS", Label = "Watsons" },
            new EhrOptionDescriptor { Code = "ROSE_PHARMACY", Label = "Rose Pharmacy" },
            new EhrOptionDescriptor { Code = "SOUTHSTAR_DRUG", Label = "Southstar Drug" },
            new EhrOptionDescriptor { Code = "TGP", Label = "The Generics Pharmacy (TGP)" },
            new EhrOptionDescriptor { Code = "GENERIKA", Label = "Generika Drugstore" },
            new EhrOptionDescriptor { Code = "OTHER", Label = "Other", RequiresSpecifyText = true }
        });

        // Delivery Type
        Add("delivery_type", new[]
        {
            new EhrOptionDescriptor { Code = "Normal Spontaneous Vaginal", Label = "Normal Spontaneous Vaginal (NSD)", PhilHealthCode = "N" },
            new EhrOptionDescriptor { Code = "Cesarean", Label = "Cesarean Delivery (CSD)", PhilHealthCode = "O" },
            new EhrOptionDescriptor { Code = "Both Normal and Cesarean", Label = "Both Normal & Cesarean (NSD & CSD)", PhilHealthCode = "B" },
            new EhrOptionDescriptor { Code = "Assisted Vaginal", Label = "Assisted Vaginal (Forceps / Vacuum)", PhilHealthCode = "N" },
            new EhrOptionDescriptor { Code = "NotApplicable", Label = "Not Applicable / Nulliparous", PhilHealthCode = "X" }
        });

        // PhilHealth Dependent Principal Relationship
        Add("dependent_relationship", new[]
        {
            new EhrOptionDescriptor { Code = "C", Label = "Child (C)", PhilHealthCode = "C", PhilHealthLibrary = "lib_relationship" },
            new EhrOptionDescriptor { Code = "S", Label = "Spouse (S)", PhilHealthCode = "S", PhilHealthLibrary = "lib_relationship" },
            new EhrOptionDescriptor { Code = "P", Label = "Parent (P)", PhilHealthCode = "P", PhilHealthLibrary = "lib_relationship" },
            new EhrOptionDescriptor { Code = "D", Label = "Disabled Dependent (D)", PhilHealthCode = "D", PhilHealthLibrary = "lib_relationship" }
        });

        Registry = dict;

        var lookup = new Dictionary<(string Set, string Code), EhrOptionDescriptor>();
        var setVersions = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var (setName, options) in Registry)
        {
            foreach (var opt in options)
            {
                lookup[(setName.ToLowerInvariant(), opt.Code.ToUpperInvariant())] = opt;
            }
            setVersions[setName] = EhrOptionVersionHelper.ComputeOptionsSha256(options);
        }

        CodeLookup = lookup;
        SetVersionLookup = setVersions;
        ComputedManifestVersion = EhrOptionVersionHelper.ComputeManifestSha256(
            Registry.ToDictionary(k => k.Key, v => (IReadOnlyList<EhrOptionDescriptor>)v.Value)
        );
    }

    /// <summary>Returns all option set names registered in the Tier A static catalog.</summary>
    public static IReadOnlyCollection<string> AllOptionSets => Registry.Keys;

    /// <summary>
    /// Gets the deterministic SHA-256 version hash for the entire static options manifest.
    /// Used for ETag generation and 304 Not Modified validation on GET /api/v1/options/manifest.
    /// </summary>
    public static string StaticManifestVersion => ComputedManifestVersion;

    /// <summary>Returns the collection of options for a given set, or empty if unknown.</summary>
    public static IReadOnlyCollection<EhrOptionDescriptor> GetOptions(string optionSet)
    {
        if (string.IsNullOrWhiteSpace(optionSet))
            return Array.Empty<EhrOptionDescriptor>();

        if (Registry.TryGetValue(optionSet, out var list))
            return list;
        return Array.Empty<EhrOptionDescriptor>();
    }

    /// <summary>Tries to find a specific option descriptor by set name and code (case-insensitive).</summary>
    public static bool TryGetOption(string optionSet, string code, out EhrOptionDescriptor? descriptor)
    {
        if (string.IsNullOrWhiteSpace(optionSet) || string.IsNullOrWhiteSpace(code))
        {
            descriptor = null;
            return false;
        }

        return CodeLookup.TryGetValue((optionSet.ToLowerInvariant(), code.ToUpperInvariant()), out descriptor);
    }

    /// <summary>
    /// Returns the deterministic SHA-256 version hash for a specific option set, or empty string if unknown.
    /// Used for ETag generation and 304 Not Modified validation on GET /api/v1/options/{optionSet}.
    /// </summary>
    public static string GetOptionSetVersion(string optionSet)
    {
        if (string.IsNullOrWhiteSpace(optionSet)) return string.Empty;
        return SetVersionLookup.TryGetValue(optionSet, out var version) ? version : string.Empty;
    }

    /// <summary>
    /// Returns a dictionary snapshot of all registered option sets and their descriptors.
    /// </summary>
    public static IReadOnlyDictionary<string, IReadOnlyList<EhrOptionDescriptor>> GetAllOptions()
    {
        return Registry.ToDictionary(k => k.Key, v => (IReadOnlyList<EhrOptionDescriptor>)v.Value);
    }
}
