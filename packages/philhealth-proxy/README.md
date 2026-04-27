# PhilHealth Konsulta Proxy

A .NET 10 ASP.NET Core Web API that acts as a **REST-to-SOAP proxy** for the **PhilHealth Konsulta** web service.
It exposes clean, well-validated REST endpoints so that the ClinicEZ mobile and web clients do not need to deal with SOAP directly.

---

## Features

| Feature | Detail |
|---|---|
| REST → SOAP proxy | Converts REST calls to SOAP 1.1 envelopes with WS-Security |
| CQRS | MediatR queries and commands per feature |
| Rich validation | FluentValidation on every request, with field-level error messages |
| OpenAPI | Swagger UI available in Development mode |
| Containerised | Ships as a Docker image |

---

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/members/{philHealthNumber}` | Get member information by PIN |
| `POST` | `/api/members/verify` | Verify a member by name and PIN |
| `POST` | `/api/eligibility/check` | Check Konsulta eligibility |

---

## Configuration

Set the following values in `appsettings.json` (or via environment variables / Docker secrets):

```json
{
  "PhilHealth": {
    "ServiceUrl": "https://www2.philhealth.gov.ph/services/konsulta/",
    "Username": "<your-username>",
    "Password": "<your-password>",
    "TimeoutSeconds": 30,
    "FacilityAccreditationNumber": "<your-facility-accreditation-number>"
  }
}
```

> **Never commit real credentials.** Use environment variables or a secrets manager in production.

---

## Running locally

```bash
cd packages/philhealth-proxy
dotnet run --project src/CLINICEZ.PhilHealth.Proxy
```

Then open the Swagger UI at `https://localhost:<port>/swagger`.

---

## Docker

```bash
# Build
docker build -t clinicez-philhealth-proxy packages/philhealth-proxy

# Run
docker run -p 8080:8080 \
  -e PhilHealth__Username=<user> \
  -e PhilHealth__Password=<pass> \
  -e PhilHealth__FacilityAccreditationNumber=<accreditation> \
  clinicez-philhealth-proxy
```

---

## Project structure

```
src/
  CLINICEZ.PhilHealth.Proxy/
    Common/                 # ApiResponse, ValidationBehavior
    Configuration/          # PhilHealthSettings
    Controllers/            # MembersController, EligibilityController
    Features/
      Members/
        Queries/GetMemberInfo/
        Commands/VerifyMember/
      Eligibility/
        Queries/CheckEligibility/
    Models/                 # PhilHealthMemberInfo, EligibilityResult, SoapResponse
    Services/               # IPhilHealthSoapClient, PhilHealthSoapClient
    Program.cs
    appsettings.json
```
