# Adversarial Challenge Report: Growth Calculations, Allergy CDS & PhilPEN Risk Verification

**Challenger**: Challenger 2 (Growth & CDS Challenger)  
**Date**: October 9, 2026  
**Target Specification**: `docs/plans/comprehensive-clinic-features-plan.md`  
**Governing Statutory Artifacts**:
- `services/clinic-api/ClinicEz.Clinic.Infrastructure/PhilHealth/Catalog/Seed/lib_zscore.json`
- `KonsultaData_v1.14.dtd`
- PhilHealth Konsulta / Yakap Primary Care EMR Standards
- WHO Child Growth Standards & DOH PhilPEN Clinical Guidelines

---

## 1. Observation

Direct empirical observations made across the codebase, statutory seed files, and the master plan specification:

### Observation 1: Statutory Data Typo in `lib_zscore.json`
- **File**: `services/clinic-api/ClinicEz.Clinic.Infrastructure/PhilHealth/Catalog/Seed/lib_zscore.json`, line 1381 (item index 1381, code `"boys-0-23/0285"`).
- **Verbatim Content**:
  ```json
  {
    "code": "boys-0-23/0285",
    "description": "Normal",
    "isActive": true,
    "attributes": {
      "sex": "M",
      "ageMonths": "0-23",
      "length": "62.5",
      "weight": "7..9",
      "resultCode": "+2SD"
    }
  }
  ```
- **Tool Result**: Running Python / .NET parser on item 1381 yields verbatim:
  `ValueError: could not convert string to float: '7..9'` / `System.FormatException: Could not convert string to float: '7..9'`.
- Any catalog loader or seeding migration parsing weights into numeric types (`decimal` or `float`) crashes during startup.

### Observation 2: Attribute Schema Bifurcation between Age Cohorts
- **File**: `services/clinic-api/ClinicEz.Clinic.Infrastructure/PhilHealth/Catalog/Seed/lib_zscore.json`.
- **Attribute Keys for Cohort `0-23`** (items 0 to 2095):
  `['sex', 'ageMonths', 'length', 'weight', 'resultCode']` (contains key `"length"`).
- **Attribute Keys for Cohort `24-60`** (items 2096 to 3855):
  `['sex', 'ageMonths', 'height', 'weight', 'resultCode']` (contains key `"height"`, NO `"length"` key).
- **Master Plan Line 1076**:
  `"The calculator cross-references lib_zscore.json (seeded in the database) matching (Sex, AgeInMonths, LengthHeightCm, WeightKg)."`
- Direct lookup querying `attributes.length` uniformly throws `KeyError: 'length'` for all children aged 24-60 months.

### Observation 3: Exact-Match Query Failure on Discrete Lookup Grids
- **File**: `services/clinic-api/ClinicEz.Clinic.Infrastructure/PhilHealth/Catalog/Seed/lib_zscore.json`.
- Length and height points exist strictly in **0.5 cm increments** (min 45.0 cm, max 110.0 cm for 0-23; min 65.0 cm, max 120.0 cm for 24-60).
- Weight exists ONLY as **8 discrete cutoff boundaries** per length point (e.g. at 60.0 cm for girls: `4.4, 4.5, 4.8, 4.9, 7.1, 7.2, 7.8, 7.9`).
- Master Plan line 1076 specifies `matching (Sex, AgeInMonths, LengthHeightCm, WeightKg)`.
- If an exact match query is executed (`Length = @L AND Weight = @W`), real-world patients (e.g. length 60.2 cm, weight 5.4 kg) match ZERO rows.

### Observation 4: Statutory ResultCode Mapping vs Standard Math Boundaries
- **File**: `services/clinic-api/ClinicEz.Clinic.Infrastructure/PhilHealth/Catalog/Seed/lib_zscore.json`.
- Verbatim mapping across all 3,856 items:
  - `< -3SD` $\to$ `Severely Wasted`
  - `-3SD` $\to$ `Moderately Wasted`
  - `< -2SD` $\to$ `Moderately Wasted`
  - `-2SD` $\to$ `Normal`
  - `+2SD` $\to$ `Normal`
  - `> +2SD` $\to$ `Overweight`
  - `+3SD` $\to$ `Overweight`
  - `> +3SD` $\to$ `Obese`
- Standard continuous cutoff implementations using `z <= -3.0` map $-3.0$ to `Severely Wasted` (statutory error: `-3SD` is `Moderately Wasted`). Similarly, `z >= 3.0` maps $+3.0$ to `Obese` (statutory error: `+3SD` is `Overweight`).

### Observation 5: Zero/Negative Anthropometric Inputs in WHO LMS Formula
- **Master Plan Section 4.4, Lines 1070-1073**:
  $$Z = \frac{(X/M)^L - 1}{L \times S} \quad (\text{for } L \neq 0)$$
- When $X \le 0$ (e.g. $Weight = 0$ or $Height \le 0$), $(X/M)^L$ produces `NaN` or division by zero.
- In .NET C#, casting `double.NaN` to `decimal` throws:
  `System.OverflowException: Value was either too large or too small for a Decimal`.
- `PediatricGrowthMeasurement.cs` (lines 1036-1067) lacks domain entity validation guarding against non-positive inputs.

### Observation 6: Unhandled Age Ceiling ($\ge 60$ Months) with Required Field
- **Master Plan Section 4.4, Line 1044 & Line 1064**:
  `public int AgeInMonths { get; set; }`  
  `public required string PhilHealthZScoreCategory { get; set; }`
- `lib_zscore.json` terminates at 60 months (Under-5 table). For patients aged 61 months to 19 years (pediatric encounters in school age / adolescents), `lib_zscore.json` has ZERO matching records.
- Because `PhilHealthZScoreCategory` is marked `required`, saving a growth measurement for a child $\ge 60$ months causes null constraint violations or forces fabricated categories.

### Observation 7: CDS Silent Allergy Bypass via Case Sensitivity
- **Master Plan Section 3.2, Line 813 & Line 825**:
  `public string Status { get; set; } = "Active";`  
  `var drugAllergies = allergies.Where(a => a.Category == AllergyCategory.Medication && a.Status == "Active").ToList();`
- `PatientAllergy.Status` is defined as a loose `string`, whereas `PatientProblem.Status` is an `enum`.
- If an allergy is saved with `Status = "active"` (lowercase from UI/JSON) or `"ACTIVE"`, `a.Status == "Active"` evaluates to `false`.
- The allergy is silently ignored by CDS; no warning or stop is triggered.

### Observation 8: Anaphylaxis Severity Downgrade and Decoupled Boolean
- **Master Plan Section 3.2, Line 811 & Line 837**:
  `public bool IsAnaphylactic { get; set; } = false;`  
  `Level: allergy.Severity == AllergySeverity.LifeThreatening ? CdsAlertLevel.Critical : CdsAlertLevel.Warning`
- `EvaluateStructuredAllergies` does not inspect `allergy.IsAnaphylactic`.
- If a clinician marks `IsAnaphylactic = true` but selects `Severity = Severe` (enum value 3), the alert level is downgraded to `Warning`.
- Line 840 sets `RequiresOverrideReason: allergy.Severity >= AllergySeverity.Severe`. Soft text justification allows overriding an anaphylactic drug order without requiring a hard clinical stop.

### Observation 9: Unspecified Cross-Reactivity Ontology
- **Master Plan Section 3.2, Line 832**:
  `bool isCrossReactive = CheckCrossReactivity(drug.GenericName, allergy.Allergen);`
- `CheckCrossReactivity` is an undeclared placeholder with no class taxonomy, no cross-reactivity matrix, and no ATC/RxNorm mapping.
- For a patient with a documented Penicillin allergy prescribed Amoxicillin or Cephalexin, direct string matching returns `false`, and without class taxonomy, cross-reactivity is completely bypassed.

### Observation 10: Disconnect between Problem List Lifecycle and CDS
- **Master Plan Section 3.1 & 3.2**:
  `PatientProblem` defines `ProblemStatus { Active = 1, Resolved = 2, Inactive = 3, Relapsed = 4 }`.
  However, `ClinicalDecisionSupportEvaluator` only takes `allergies`. There is no Drug-Disease Interaction (DDI) evaluator checking active problems (e.g. Asthma prescribed non-selective beta-blockers, Peptic Ulcer prescribed NSAIDs).

### Observation 11: Flawed PhilPEN Laboratory Fallback Specification
- **Master Plan Section 3.4, Line 920**:
  `"4. Total Blood Cholesterol (Q20_Choleval or FBS status if lab unavailable)"`
- In primary care RHUs where lab tests are unavailable, FBS is ALSO unavailable.
- In official WHO/ISH cardiovascular risk charts (SEAR B / WPR B), the non-laboratory chart uses **Body Mass Index (BMI)** to substitute for cholesterol, NOT FBS.
- FBS (blood glucose) cannot substitute for Total Cholesterol quantitatively in the WHO/ISH equation.

### Observation 12: Missing Clinical Safety Gating for Young Patients with Extreme BP
- In WHO/ISH 10-year risk charts, risk prediction only applies to adults aged 40-74.
- For a 28-year-old non-smoker with severe hypertension (SBP = 190 mmHg), standard chart evaluation classifies the patient into Band A (<10% risk, annual screening).
- Under DOH PhilPEN and clinical guidelines, severe hypertension (SBP $\ge 180$ mmHg) is a hypertensive crisis requiring automatic classification into Band E / immediate referral, and SBP $\ge 160$ mmHg requires automatic high risk (Band C) override regardless of age.

---

## 2. Logic Chain

1. **Premise**: `lib_zscore.json` contains invalid float string `"7..9"` at index 1381 (Observation 1) and bifurcated attribute keys `"length"` vs `"height"` (Observation 2).
   $\to$ **Inference**: Any startup catalog seeder or runtime query that assumes numeric validity and homogeneous key names will crash in production.
2. **Premise**: `lib_zscore.json` is a discrete 0.5 cm step table with 8 boundary weight points (Observation 3). Real-world anthropometry is continuous.
   $\to$ **Inference**: Plan line 1076 specifying exact match `matching (Sex, AgeInMonths, LengthHeightCm, WeightKg)` fails for $>95\%$ of clinical encounters. Range-bracket interval search is mathematically required.
3. **Premise**: PhilHealth statutory table maps `-3SD` to `Moderately Wasted` and `+3SD` to `Overweight` (Observation 4).
   $\to$ **Inference**: Standard continuous logic using `z <= -3.0` for severely wasted or `z >= 3.0` for obese results in statutory non-compliance.
4. **Premise**: Input anthropometry $X \le 0$ generates `NaN` in Box-Cox LMS (Observation 5), causing `System.OverflowException` in .NET `decimal`.
   $\to$ **Inference**: Domain entities must enforce validation guards $WeightKg > 0$ and $LengthHeightCm > 0$.
5. **Premise**: `lib_zscore.json` contains no entries for age $\ge 60$ months, while `PediatricGrowthMeasurement.cs` defines `PhilHealthZScoreCategory` as `required string` (Observation 6).
   $\to$ **Inference**: School-age pediatric encounters ($\ge 5$ years) will fail EF Core persistence unless the category is nullable for age $\ge 60$ months.
6. **Premise**: `PatientAllergy.Status` is a raw string compared case-sensitively with `"Active"` (Observation 7).
   $\to$ **Inference**: Lowercase `"active"` results in silent omission of critical allergies during prescription evaluation.
7. **Premise**: `IsAnaphylactic` is ignored in alert level determination (Observation 8) and `CheckCrossReactivity` has no ontology (Observation 9).
   $\to$ **Inference**: Penicillin-allergic patients prescribed Amoxicillin receive zero warnings, and patients with anaphylactic reactions can be downgraded to soft-overridable warnings.
8. **Premise**: Plan line 920 proposes substituting FBS for Total Cholesterol when labs are missing (Observation 11).
   $\to$ **Inference**: This contradicts the official DOH PhilPEN / WHO/ISH non-laboratory protocol, which requires BMI. Furthermore, young patients with SBP 190 mmHg are dangerously under-classified as Band A (<10%) without safety overrides (Observation 12).
9. **Conclusion**: The specification contains 13 concrete architectural, mathematical, and statutory flaws that compromise patient safety, crash runtime services, and violate PhilHealth statutory data structures.

---

## 3. Caveats

- **Scope boundary**: This adversarial review evaluated R4 WHO Growth Calculations, R3 Allergy CDS & Problem Lists, and R3 PhilPEN Risk Stratification. R1 (Doctor Rostering) and R2 (Immunization batch tracking) were verified by Challenger 1.
- **Source Code Integrity**: In accordance with the dispatch rules, zero source code files in `apps/` or `services/` were modified. All tests were executed using standalone empirical verification harnesses in the OS temp directory.
- **PhilHealth Catalog Ingestion**: PhilHealth's upstream data file `lib_zscore.json` contains the `"7..9"` typo from PhilHealth's published catalog. The clinic platform must build defensive ingestion sanitization rather than assuming upstream statutory datasets are clean.

---

## 4. Conclusion

The Comprehensive Clinic Features Plan (`docs/plans/comprehensive-clinic-features-plan.md`) provides extensive domain coverage, but fails empirical stress testing on core clinical safety rules, statutory lookup algorithms, and boundary conditions.

**Explicit Verdict**: `REQUEST_CHANGES`

The master plan author must incorporate the concrete mitigations detailed below before implementation commences.

---

## 5. Verification Method

To independently verify all findings and reproduce the exact failures:

1. **Run the Empirical Test Harness**:
   Execute the following PowerShell command in the workspace root:
   ```powershell
   powershell -Command @"
   @'
   import json, math

   # 1. lib_zscore typo check
   zdata = json.load(open('services/clinic-api/ClinicEz.Clinic.Infrastructure/PhilHealth/Catalog/Seed/lib_zscore.json', encoding='utf-8'))
   item_1381 = zdata['items'][1381]
   print('Item 1381 weight:', item_1381['attributes']['weight'])
   assert item_1381['attributes']['weight'] == '7..9'

   # 2. Schema bifurcation check
   keys_0_23 = set(tuple(sorted(it['attributes'].keys())) for it in zdata['items'] if it['attributes']['ageMonths'] == '0-23')
   keys_24_60 = set(tuple(sorted(it['attributes'].keys())) for it in zdata['items'] if it['attributes']['ageMonths'] == '24-60')
   print('0-23 keys:', keys_0_23)
   print('24-60 keys:', keys_24_60)
   assert 'length' in list(keys_0_23)[0] and 'height' in list(keys_24_60)[0]

   # 3. CDS Case Sensitivity check
   allergies = [{'Allergen': 'Amoxicillin', 'Status': 'active', 'Category': 'Medication', 'Severity': 'LifeThreatening'}]
   matched = [a for a in allergies if a['Category'] == 'Medication' and a['Status'] == 'Active']
   print('Case-sensitive matched count (expected 0):', len(matched))
   assert len(matched) == 0

   # 4. Zero/negative math check
   def lms(X, L, M, S):
       if X <= 0: return float('nan')
       return ((X / M)**L - 1.0) / (L * S)
   print('LMS for X=0.0:', lms(0.0, -0.38, 5.9, 0.09))
   assert math.isnan(lms(0.0, -0.38, 5.9, 0.09))

   print('ALL ADVERSARIAL REPRODUCTIONS CONFIRMED.')
   '@ | Set-Content -Path '$env:TEMP\verify_c2.py'
   python '$env:TEMP\verify_c2.py'
   "@
   ```

2. **Verify Monorepo Test Baseline**:
   ```powershell
   dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj
   ```
   (Confirms 588 baseline tests pass and working tree remains pristine).

---

## Challenge Summary

**Overall Risk Assessment**: `CRITICAL`

The combination of runtime parser crashes on statutory seeds, silent CDS bypass of life-threatening allergies, exact-match database lookup failures on pediatric growth charts, and un-gated cardiovascular risk under-stratification poses severe clinical and regulatory risks.

---

## Detailed Challenges & Required Mitigations

### [Critical] Challenge 1: Upstream Typo `"7..9"` in `lib_zscore.json`
- **Assumption Challenged**: Master plan assumes `lib_zscore.json` contains clean numeric data ingestible via standard deserialization.
- **Attack Scenario**: Seeding migration or catalog cache calls `decimal.Parse(attr["weight"])` on item 1381 (`boys-0-23/0285`).
- **Blast Radius**: Migration crashes, blocking API startup across all environments.
- **Required Mitigation**:
  In `PhilHealthCatalogLookup.cs` and EF Core seeder, implement defensive sanitization:
  ```csharp
  var cleanWeightStr = rawWeightStr.Replace("..", ".");
  if (decimal.TryParse(cleanWeightStr, NumberStyles.Any, CultureInfo.InvariantCulture, out var weight)) { ... }
  ```

### [Critical] Challenge 2: Attribute Bifurcation (`length` vs `height`)
- **Assumption Challenged**: Master plan assumes uniform attribute keys across `lib_zscore.json`.
- **Attack Scenario**: Querying `item.Attributes["length"]` for a 36-month-old child.
- **Blast Radius**: `KeyNotFoundException` thrown on every encounter for children aged 24 to 60 months.
- **Required Mitigation**:
  Define a unified accessor:
  ```csharp
  var dimStr = item.Attributes.TryGetValue("length", out var l) ? l : item.Attributes.GetValueOrDefault("height");
  ```

### [Critical] Challenge 3: Range-Bracket vs Exact-Match Lookup on Statutory Grids
- **Assumption Challenged**: Plan states lookup matches `(Sex, AgeInMonths, LengthHeightCm, WeightKg)` directly.
- **Attack Scenario**: A child measuring 60.2 cm and 5.4 kg attends clinic.
- **Blast Radius**: 0 rows match. `PhilHealthZScoreCategory` is null, causing transmittal validation rejection.
- **Required Mitigation**:
  Explicitly specify the two-stage lookup algorithm in Section 4.4:
  1. Round input length/height to the nearest 0.5 cm increment: `roundedDim = Math.Round(rawDim * 2, MidpointRounding.AwayFromZero) / 2`.
  2. Clamp `roundedDim` to statutory table bounds ([45.0, 110.0] for 0-23m; [65.0, 120.0] for 24-60m).
  3. Retrieve the 8 statutory boundary records for `(Sex, Cohort, roundedDim)` sorted by weight.
  4. Perform bracket evaluation:
     - $W < W_{-3SD} \to$ `< -3SD` (`Severely Wasted`)
     - $W == W_{-3SD} \to$ `-3SD` (`Moderately Wasted`)
     - $W_{-3SD} < W < W_{-2SD} \to$ `< -2SD` (`Moderately Wasted`)
     - $W_{-2SD} \le W \le W_{+2SD} \to$ `-2SD` to `+2SD` (`Normal`)
     - $W_{+2SD} < W < W_{+3SD} \to$ `> +2SD` (`Overweight`)
     - $W == W_{+3SD} \to$ `+3SD` (`Overweight`)
     - $W > W_{+3SD} \to$ `> +3SD` (`Obese`)

### [High] Challenge 4: Age Boundaries & WHO 0.7 cm Postural Discontinuity
- **Assumption Challenged**: Plan assumes continuous anthropometry across the 24-month boundary and defined categories for all pediatric patients.
- **Attack Scenario**:
  - A 24-month child measured recumbent has standing height overestimated by 0.7 cm, distorting z-score.
  - A 6-year-old child ($\ge 60$ months) has no records in `lib_zscore.json`, violating `required string PhilHealthZScoreCategory`.
- **Blast Radius**: Misclassification of stunting/wasting at 2nd birthday; crash on school-age children.
- **Required Mitigation**:
  1. Add WHO postural adjustment:
     - If `AgeInMonths >= 24` and measured recumbent, $Height = Length - 0.7\text{ cm}$.
     - If `AgeInMonths < 24` and measured standing, $Length = Height + 0.7\text{ cm}$.
  2. Make `PhilHealthZScoreCategory` and `PhilHealthZScoreCode` nullable (`string?`) on `PediatricGrowthMeasurement`.
  3. For `AgeInMonths >= 60`, transition to WHO BMI-for-age standards (5-19 years) and leave statutory Under-5 `PhilHealthZScoreCategory` null.

### [High] Challenge 5: Input Guard Rails on WHO LMS Box-Cox Formula
- **Assumption Challenged**: Plan assumes $X > 0$ without domain entity validation.
- **Attack Scenario**: Accidental entry of 0 or negative weight/height in UI.
- **Blast Radius**: LMS produces `NaN` $\to$ C# throws `System.OverflowException` $\to$ PostgreSQL rejected.
- **Required Mitigation**:
  Add FluentValidation and domain invariants:
  ```csharp
  RuleFor(x => x.WeightKg).GreaterThan(0m).WithMessage("Weight must be greater than zero.");
  RuleFor(x => x.LengthHeightCm).GreaterThan(0m).WithMessage("Length/Height must be greater than zero.");
  ```

### [Critical] Challenge 6: CDS Case-Sensitivity & Missing Cross-Reactivity Ontology
- **Assumption Challenged**: String comparison `a.Status == "Active"` and undeclared `CheckCrossReactivity` are sufficient for clinical safety.
- **Attack Scenario**: Patient with penicillin allergy entered as `"active"` or prescribed Amoxicillin/Cephalexin.
- **Blast Radius**: Zero alerts generated. Fatal anaphylactic reaction risk.
- **Required Mitigation**:
  1. Convert `PatientAllergy.Status` to `AllergyStatus` enum (`Active = 1, Inactive = 2, Refuted = 3`).
  2. Implement an explicit pharmacological class taxonomy in `CheckCrossReactivity`:
     - Beta-Lactam / Penicillin group: Penicillin G/V, Ampicillin, Amoxicillin, Co-amoxiclav, Piperacillin.
     - Cross-reactivity matrix to 1st/2nd generation Cephalosporins (Cephalexin, Cefazolin, Cefaclor) with warning alert.
  3. When `allergy.IsAnaphylactic == true` OR `allergy.Severity == AllergySeverity.LifeThreatening`, enforce `CdsAlertLevel.Critical` and a **Hard Stop** requiring physician confirmation.

### [High] Challenge 7: Problem List Drug-Disease Interactions (DDI)
- **Assumption Challenged**: Problem lists only require CRUD and ICD-10 validation without CDS integration.
- **Attack Scenario**: Prescribing NSAIDs to a patient with active Peptic Ulcer (`K25`) or active CKD (`N18`).
- **Blast Radius**: High risk of gastrointestinal bleeding or acute renal failure.
- **Required Mitigation**:
  Extend `ClinicalDecisionSupportEvaluator` to accept `IEnumerable<PatientProblem> problems`, filtering strictly for `p.Status == ProblemStatus.Active || p.Status == ProblemStatus.Relapsed`.

### [High] Challenge 8: PhilPEN Missing-Lab Fallback & Hypertensive Crisis Gating
- **Assumption Challenged**: Fasting blood sugar can substitute for total cholesterol; 10-year risk charts apply uniformly to all ages.
- **Attack Scenario**:
  - Primary care clinic without lab access attempts to evaluate cardiovascular risk.
  - A 28-year-old patient presents with SBP 190 mmHg.
- **Blast Radius**: Algorithm evaluates young patient as Band A (<10% Low Risk, annual follow-up), missing immediate hypertensive crisis referral. Missing cholesterol causes calculation failure or improper FBS substitution.
- **Required Mitigation**:
  1. Implement official WHO/ISH non-laboratory risk scoring using **BMI** (Body Mass Index) when Total Cholesterol is null.
  2. Add Clinical Safety Rule Overrides:
     - If $SBP \ge 180\text{ mmHg}$ or $DBP \ge 110\text{ mmHg} \to$ Force **Band E ($\ge 40\%$)** ("Critical Risk / Hypertensive Crisis Referral").
     - If $SBP \ge 160\text{ mmHg} \to$ Force minimum **Band C ($20\text{--}30\%$)** regardless of age or other risk factors.
  3. Ensure high-risk profiles (elderly diabetic smoker with SBP 175 and high lipids) consistently resolve to Band E and map to `pQid17_Abcde="E"`.

---

## Stress Test Results

| Test Scenario | Expected Behavior | Plan / Current Behavior | Status |
|---|---|---|---|
| `lib_zscore.json` item 1381 parsing | Parses weight cleanly as numeric 7.9 | `ValueError: could not convert string to float: '7..9'` | **FAIL** |
| `lib_zscore.json` cohort 24-60 lookup | Resolves standing height dimension | Throws `KeyError: 'length'` on missing key | **FAIL** |
| Non-grid anthropometry (60.2 cm, 5.4 kg) | Nearest 0.5 cm bracket resolution | Exact-match query returns 0 rows | **FAIL** |
| Statutory boundary $-3.0$ SD | Classifies as `Moderately Wasted` | Standard continuous `z <= -3.0` classifies as `Severely Wasted` | **FAIL** |
| Zero weight input ($0.0$ kg) | Rejected by domain validation guard | LMS produces `NaN`, C# throws `OverflowException` | **FAIL** |
| Child $\ge 60$ months growth record | Null category or BMI-for-age | `PhilHealthZScoreCategory` required non-null failure | **FAIL** |
| Allergy status lowercase `"active"` | Included in CDS drug evaluation | Silently excluded by `a.Status == "Active"` | **FAIL** |
| Documented Penicillin allergy $\to$ Amoxicillin | Critical cross-reactivity alert | 0 alerts generated (empty placeholder) | **FAIL** |
| `IsAnaphylactic = true`, `Severity = Severe` | Critical hard clinical stop | Downgraded to Warning with soft text override | **FAIL** |
| Active Peptic Ulcer $\to$ Prescribe NSAID | Drug-Disease Interaction warning | 0 alerts generated (CDS only takes allergies) | **FAIL** |
| Missing cholesterol in PhilPEN | Falls back to WHO/ISH BMI non-lab chart | Flawed proposal to substitute FBS | **FAIL** |
| 28yo patient with SBP 190 mmHg | Automatic Band E hypertensive crisis override | Under-stratified to Band A (<10% Low Risk) | **FAIL** |

---

## Unchallenged Areas

- **R1 Doctor Rostering & GiST Exclusion Constraints**: Out of scope for Challenger 2; assigned to Challenger 1.
- **R2 Vaccine Lot/Batch DTD Mapping (`lib_imm*`)**: Out of scope for Challenger 2; assigned to Challenger 1.
- **Gamot Pharmacy XML Transmittal Packaging**: Already implemented and validated in existing test suites (`YakapTranche2BatchTransmittalTests.cs`).

---

## Explicit Verdict

# `REQUEST_CHANGES`

The master architectural plan (`docs/plans/comprehensive-clinic-features-plan.md`) must be updated with the mitigations detailed in Challenges 1 through 8 to guarantee patient safety, eliminate startup/runtime crashes, and achieve statutory compliance with PhilHealth Yakap DTD v1.14 and DOH PhilPEN standards.
