# Schemas & Statutory Libraries Reference (`lib_*`)

This reference document details structural XML schemas, DTD element trees, XSD attributes, and PhilHealth statutory libraries (`lib_*`) exported from PhilHealth Excel (`.xlsx`) and JSON (`.json`) specifications.

---

## 1. Repository Paths for Statutory Dictionaries

- **Excel Source Files (`*.xlsx`)**: `services/clinic-api/ClinicEz.Clinic.Infrastructure/PhilHealth/Catalog/Source/`
- **Seed JSON Files (`*.json`)**: `services/clinic-api/ClinicEz.Clinic.Infrastructure/PhilHealth/Catalog/Seed/`

### Complete List of Statutory Dictionaries

| Catalog Name | Excel Source (`.xlsx`) | Seed JSON (`.json`) | Description |
|---|---|---|---|
| **`lib_immchild`** | `lib_immchild.xlsx` | `lib_immchild.json` | Pediatric vaccines (0-17 yrs): BCG, OPV, Pentavalent, Measles, Hep A |
| **`lib_immyoungw`** | `lib_immyoungw.xlsx` | `lib_immyoungw.json` | Adolescent/Young women vaccines: HPV, MMR |
| **`lib_immpregw`** | `lib_immpregw.xlsx` | `lib_immpregw.json` | Maternal vaccines: Tetanus Toxoid / Td |
| **`lib_immelderly`** | `lib_immelderly.xlsx` | `lib_immelderly.json` | Senior citizen vaccines: Pneumococcal, Seasonal Flu |
| **`lib_zscore`** | `lib_zscore.xlsx` | `lib_zscore.json` | WHO 2006 Under-5 pediatric growth z-scores dataset (656 KB) |
| **`lib_mdiseases`** | `lib_mdiseases.xlsx` | `lib_mdiseases.json` | Medical diseases catalog for Yakap `<MEDHIST>` XML elements |
| **`lib_ncdq`** | `lib_ncdq.xlsx` | `lib_ncdq.json` | NCD Risk Assessment statutory 24-question survey catalog |
| **`lib_icd`** | `lib_icd.xlsx` | `lib_icd.json` | PhilHealth ICD-10 diagnostic catalog (1.25 MB) |
| **`lib_medicine`** | `lib_medicine.xlsx` | `lib_medicine.json` | PhilHealth accredited medicine masterlist (675 KB) |
| **`lib_heent`** | `lib_heent.xlsx` | `lib_heent.json` | HEENT physical examination options |
| **`lib_chest`** | `lib_chest.xlsx` | `lib_chest.json` | Chest/Lungs physical examination options |
| **`lib_heart`** | `lib_heart.xlsx` | `lib_heart.json` | Heart/CVS physical examination options |
| **`lib_abdomen`** | `lib_abdomen.xlsx` | `lib_abdomen.json` | Abdomen physical examination options |
| **`lib_genitourinary`** | `lib_genitourinary.xlsx` | `lib_genitourinary.json` | Genitourinary physical examination options |
| **`lib_digital_rectal`** | `lib_digital_rectal.xlsx` | `lib_digital_rectal.json` | Digital rectal physical examination options |
| **`lib_skin_extremities`**| `lib_skin_extremities.xlsx` | `lib_skin_extremities.json` | Skin/Extremities physical examination options |
| **`lib_neuro`** | `lib_neuro.xlsx` | `lib_neuro.json` | Neurological physical examination options |

---

## 2. DTD Schema: `KonsultaData_v1.14.dtd`

Root element `<KONSULTADATA>`:

```xml
<!ELEMENT KONSULTADATA (HEADER, PATIENTS)>
<!ELEMENT HEADER (pHicAccreCode, pPMCCode, pReportDate, pReportTime, pSoftwareCertId)>
<!ELEMENT PATIENTS (PATIENT*)>
<!ELEMENT PATIENT (pPhicNo, pLastName, pFirstName, pMiddleName, pExtensionName, pDob, pGender, ENCOUNTERS)>
<!ELEMENT ENCOUNTERS (ENCOUNTER*)>
<!ELEMENT ENCOUNTER (pKasNo, pConsultDate, VITAL_SIGNS, IMMUNIZATIONS?, PHYSICAL_EXAM?, DIAGNOSES, MEDICINES?, DIAGNOSTIC_TESTS?)>
```

---

## 3. Masterlist DTD & XSD Schemas

### `KonsultaMasterlist_v1.4.dtd`

```xml
<!ELEMENT PATIENTMASTERLIST (HEADER, MEMBERS)>
<!ELEMENT MEMBERS (MEMBER*)>
<!ELEMENT MEMBER (pPhicNo, pLastName, pFirstName, pMiddleName, pDob, pGender, BENEFICIARIES?)>
```

### `KonsultaMasterlist_v1.5.xsd`

```xml
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="object">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="pPhicNo" type="xs:string" />
        <xs:element name="pMemberLastName" type="xs:string" />
        <xs:element name="pMemberFirstName" type="xs:string" />
        <xs:element name="pEffDate" type="xs:string" />
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
```

---

## 4. Encryption & SOAP Envelope Specifications

1. **AES-256-CBC Payload Encryption**: `PhilHealthPayloadEncryptor.cs` encrypts raw UTF-8 XML.
2. **SOAP Request**: `PhilHealthSoapClient.cs` embeds `pCipherKey` and `pEncryptedData` into SOAP XML wrapper.
