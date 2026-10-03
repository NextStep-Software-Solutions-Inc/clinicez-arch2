namespace ClinicEz.PhilHealthProxy.Domain.Catalogs;

public sealed record CatalogItem(string Code, string Description, string? Category = null);

public static class PhilHealthCatalogs
{
    // ── lib_mdisease: Past Medical History & Family History ──────────────────
    public static readonly IReadOnlyList<CatalogItem> MedicalDiseases = new CatalogItem[]
    {
        new("001", "Allergy"),
        new("002", "Asthma"),
        new("003", "Cancer / Malignancy"),
        new("004", "Cerebrovascular Disease (Stroke)"),
        new("005", "Coronary Artery Disease"),
        new("006", "Diabetes Mellitus"),
        new("007", "Emphysema / Chronic Obstructive Pulmonary Disease"),
        new("008", "Epilepsy / Seizure Disorder"),
        new("009", "Hepatitis"),
        new("010", "Hyperlipidemia / Dyslipidemia"),
        new("011", "Hypertension"),
        new("012", "Peptic Ulcer Disease"),
        new("013", "Pneumonia"),
        new("014", "Thyroid Disease"),
        new("015", "Tuberculosis (Pulmonary / Extra-pulmonary)"),
        new("016", "Urinary Tract Infection"),
        new("999", "Others (Specify in Remarks)")
    };

    // ── lib_signssymptoms: Signs and Symptoms ─────────────────────────────────
    public static readonly IReadOnlyList<CatalogItem> SignsAndSymptoms = new CatalogItem[]
    {
        new("1", "Altered mental status"),
        new("2", "Abdominal pain / cramps"),
        new("3", "Anorexia / Loss of appetite"),
        new("4", "Bleeding (e.g. Epistaxis, GI)"),
        new("5", "Chest pain"),
        new("6", "Constipation"),
        new("7", "Cough"),
        new("8", "Diarrhea"),
        new("9", "Dizziness / Vertigo"),
        new("10", "Dyspnea / Shortness of breath"),
        new("11", "Dysuria / Painful urination"),
        new("12", "Epistaxis"),
        new("13", "Fever"),
        new("14", "Headache"),
        new("15", "Hematemesis"),
        new("16", "Hemoptysis"),
        new("17", "Jaundice"),
        new("18", "Myalgia / Body malaise"),
        new("19", "Nausea"),
        new("20", "Palpitations"),
        new("21", "Rash / Skin lesion"),
        new("22", "Seizures"),
        new("23", "Syncope / Fainting"),
        new("24", "Vomiting"),
        new("37", "Hypertension-related signs"),
        new("38", "Pain (Requires pPainSite)"),
        new("X", "Other complaint (Requires pOtherComplaint)")
    };

    // ── lib_diagnostic: 13 Yakap Laboratory & Imaging Services ────────────────
    public static readonly IReadOnlyList<CatalogItem> DiagnosticServices = new CatalogItem[]
    {
        new("1", "Complete Blood Count (CBC) with Platelet Count", "Lab"),
        new("2", "Urinalysis", "Lab"),
        new("3", "Fecalysis", "Lab"),
        new("4", "Sputum Microscopy / GeneXpert", "Lab"),
        new("5", "Fasting Blood Sugar (FBS)", "Lab"),
        new("6", "Random Blood Sugar (RBS)", "Lab"),
        new("7", "Oral Glucose Tolerance Test (OGTT)", "Lab"),
        new("8", "Lipid Profile (Total Cholesterol, HDL, LDL, Triglycerides)", "Lab"),
        new("9", "Serum Creatinine", "Lab"),
        new("10", "HbA1c (Glycated Hemoglobin)", "Lab"),
        new("11", "Chest X-Ray (PA/AP view)", "Imaging"),
        new("12", "Electrocardiogram (ECG, 12-lead)", "Cardio"),
        new("13", "Pap Smear / Visual Inspection with Acetic Acid (Cervical Screening)", "Screening"),
        new("14", "Fecal Occult Blood Test (FOBT)", "Screening"),
        new("15", "PPD / Tuberculin Mantoux Test", "Diagnostic"),
        new("99", "Other Laboratory / Diagnostic Exam", "Other")
    };

    // ── lib_management: Primary Care Management Actions ───────────────────────
    public static readonly IReadOnlyList<CatalogItem> ManagementActions = new CatalogItem[]
    {
        new("1", "Health Education / Lifestyle Modification Counseling"),
        new("2", "Diagnostic Laboratory / Imaging Work-up Ordered"),
        new("3", "Pharmacologic Therapy Prescribed / Dispensed (GAMOT)"),
        new("4", "Referral to Specialist / Higher Healthcare Facility"),
        new("5", "Supportive Care and Clinical Observation"),
        new("X", "Other Clinical Management (Specify in Remarks)")
    };

    // ── lib_pe_gensurvey: General Physical Survey ────────────────────────────
    public static readonly IReadOnlyList<CatalogItem> GeneralSurveys = new CatalogItem[]
    {
        new("1", "Conscious, coherent, oriented, not in acute cardiorespiratory distress"),
        new("2", "In acute cardiorespiratory distress"),
        new("3", "Lethargic / Stuporous / Drowsy"),
        new("4", "Comatose / Unresponsive"),
        new("99", "Other general physical survey finding")
    };

    // ── lib_medicine: Essential GAMOT Medications (Sample Selection of Core Formulary)
    public static readonly IReadOnlyList<CatalogItem> GamotFormulary = new CatalogItem[]
    {
        // Antihypertensives
        new("AMLOD0000000005TAB00000000100", "Amlodipine 5mg Tablet", "NCD"),
        new("AMLOD0000000010TAB00000000100", "Amlodipine 10mg Tablet", "NCD"),
        new("LOSAR0000000050TAB00000000100", "Losartan Potassium 50mg Tablet", "NCD"),
        new("LOSAR0000000100TAB00000000100", "Losartan Potassium 100mg Tablet", "NCD"),
        new("METOP0000000050TAB00000000100", "Metoprolol Tartrate 50mg Tablet", "NCD"),
        new("ENALA0000000010TAB00000000100", "Enalapril Maleate 10mg Tablet", "NCD"),

        // Antidiabetic Agents
        new("METFO0000000500TAB00000000100", "Metformin HCl 500mg Tablet", "NCD"),
        new("GLICL0000000080TAB00000000100", "Gliclazide 80mg Tablet", "NCD"),
        new("GLICL0000000030TAB00000000100", "Gliclazide 30mg MR Tablet", "NCD"),
        new("GLIME0000000002TAB00000000100", "Glimepiride 2mg Tablet", "NCD"),

        // Lipid Lowering Agents
        new("SIMVA0000000020TAB00000000100", "Simvastatin 20mg Tablet", "NCD"),
        new("SIMVA0000000040TAB00000000100", "Simvastatin 40mg Tablet", "NCD"),
        new("ATORV0000000020TAB00000000100", "Atorvastatin 20mg Tablet", "NCD"),
        new("ATORV0000000040TAB00000000100", "Atorvastatin 40mg Tablet", "NCD"),

        // Respiratory / Asthma
        new("SALBU0000000100INH00000000001", "Salbutamol 100mcg/dose MDI Inhaler", "NCD"),
        new("SALBU0000000002NEB00000000030", "Salbutamol 2mg/2.5mL Nebulizing Solution", "NCD"),

        // Antibiotics
        new("AMOXC0000000500CAP00000000100", "Amoxicillin 500mg Capsule", "ANTIBIOTIC"),
        new("COAMO0000000625TAB00000000100", "Co-Amoxiclav 625mg Tablet", "ANTIBIOTIC"),
        new("AZITH0000000500TAB00000000003", "Azithromycin 500mg Tablet", "ANTIBIOTIC"),
        new("CIPRO0000000500TAB00000000100", "Ciprofloxacin 500mg Tablet", "ANTIBIOTIC"),
        new("COTRI0000000800TAB00000000100", "Cotrimoxazole 800mg/160mg Tablet", "ANTIBIOTIC"),

        // Analgesics / Antipyretics
        new("PARAC0000000500TAB00000000100", "Paracetamol 500mg Tablet", "OTHERS"),
        new("IBUPR0000000200TAB00000000100", "Ibuprofen 200mg Tablet", "OTHERS"),
        new("MEFEN0000000500CAP00000000100", "Mefenamic Acid 500mg Capsule", "OTHERS"),

        // Gastrointestinal
        new("OMEPZ0000000020CAP00000000100", "Omeprazole 20mg Capsule", "OTHERS"),
        new("ORSOL0000000000SACH0000000025", "Oral Rehydration Salts (ORS) Sachet", "OTHERS")
    };
}
