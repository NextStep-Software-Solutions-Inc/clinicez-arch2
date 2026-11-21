import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";

/**
 * Issue #74 Test Suite: Configuration Cleanup & Architecture Mandates Static Audit
 *
 * Requirements Covered:
 * - R3: Uniform Services:PatientApiUrl Configuration Cleanup:
 *   - Replace dead "ClinicApiUrl": "http://clinic-api:8080" with "PatientApiUrl": "http://patient-api:8080"
 *     in appsettings.json and appsettings.Development.json
 *   - Update SERVICES_CLINIC_API_URL to SERVICES_PATIENT_API_URL in docker-compose.yml, .env.example,
 *     and GitHub Actions deployment workflows (deploy-portal-api-dev.yml, deploy-portal-api-prod.yml)
 * - R4: Codify Service-Boundary & Zero-BFF Architectural Mandates:
 *   - Verify .github/copilot-instructions.md, docs/architecture/interop-hub.md,
 *     docs/architecture/platform-contract.md, and interop-hub-expert/SKILL.md document:
 *     1. portal <-> patient sole direct-communication exception
 *     2. prohibition of Next.js BFF proxy routes
 */

const REPO_ROOT = path.resolve(__dirname, "../../..");

describe("Issue #74: Configuration Cleanup & Architectural Mandates Audit", () => {
  describe("Tier 1 & Tier 2: Services:PatientApiUrl Configuration Cleanup (R3)", () => {
    test("T1.1: services/portal-api appsettings.json contains PatientApiUrl and ZERO ClinicApiUrl", () => {
      const appSettingsPath = path.join(
        REPO_ROOT,
        "services",
        "portal-api",
        "ClinicEz.Portal.Api",
        "appsettings.json"
      );
      expect(fs.existsSync(appSettingsPath)).toBe(true);

      const content = fs.readFileSync(appSettingsPath, "utf-8");
      expect(content).not.toContain("ClinicApiUrl");
      expect(content).toContain('"PatientApiUrl": "http://patient-api:8080"');
    });

    test("T1.2: services/portal-api appsettings.Development.json contains PatientApiUrl and ZERO ClinicApiUrl", () => {
      const devSettingsPath = path.join(
        REPO_ROOT,
        "services",
        "portal-api",
        "ClinicEz.Portal.Api",
        "appsettings.Development.json"
      );
      expect(fs.existsSync(devSettingsPath)).toBe(true);

      const content = fs.readFileSync(devSettingsPath, "utf-8");
      expect(content).not.toContain("ClinicApiUrl");
      expect(content).toContain('"PatientApiUrl": "http://patient-api:8080"');
    });

    test("T1.3: deploy/portal-api/docker-compose.yml uses SERVICES_PATIENT_API_URL and ZERO SERVICES_CLINIC_API_URL", () => {
      const composePath = path.join(REPO_ROOT, "deploy", "portal-api", "docker-compose.yml");
      expect(fs.existsSync(composePath)).toBe(true);

      const content = fs.readFileSync(composePath, "utf-8");
      expect(content).not.toContain("SERVICES_CLINIC_API_URL");
      expect(content).not.toContain("Services__ClinicApiUrl");
      expect(content).toContain("SERVICES_PATIENT_API_URL");
      expect(content).toContain("Services__PatientApiUrl");
    });

    test("T1.4: deploy/portal-api/.env.example uses SERVICES_PATIENT_API_URL and ZERO SERVICES_CLINIC_API_URL", () => {
      const envExamplePath = path.join(REPO_ROOT, "deploy", "portal-api", ".env.example");
      expect(fs.existsSync(envExamplePath)).toBe(true);

      const content = fs.readFileSync(envExamplePath, "utf-8");
      expect(content).not.toContain("SERVICES_CLINIC_API_URL");
      expect(content).toContain("SERVICES_PATIENT_API_URL=http://patient-api:8080");
    });

    test("T1.5: .github/workflows/deploy-portal-api-dev.yml uses SERVICES_PATIENT_API_URL and ZERO SERVICES_CLINIC_API_URL", () => {
      const workflowPath = path.join(
        REPO_ROOT,
        ".github",
        "workflows",
        "deploy-portal-api-dev.yml"
      );
      expect(fs.existsSync(workflowPath)).toBe(true);

      const content = fs.readFileSync(workflowPath, "utf-8");
      expect(content).not.toContain("SERVICES_CLINIC_API_URL");
      expect(content).toContain("SERVICES_PATIENT_API_URL");
    });

    test("T1.6: .github/workflows/deploy-portal-api-prod.yml uses SERVICES_PATIENT_API_URL and ZERO SERVICES_CLINIC_API_URL", () => {
      const workflowPath = path.join(
        REPO_ROOT,
        ".github",
        "workflows",
        "deploy-portal-api-prod.yml"
      );
      expect(fs.existsSync(workflowPath)).toBe(true);

      const content = fs.readFileSync(workflowPath, "utf-8");
      expect(content).not.toContain("SERVICES_CLINIC_API_URL");
      expect(content).toContain("SERVICES_PATIENT_API_URL");
    });
  });

  describe("Tier 3 & Tier 4: Architectural Mandates Documentation Verification (R4)", () => {
    test("T3.1: .github/copilot-instructions.md documents portal <-> patient exception and zero-BFF mandate", () => {
      const docPath = path.join(REPO_ROOT, ".github", "copilot-instructions.md");
      expect(fs.existsSync(docPath)).toBe(true);

      const content = fs.readFileSync(docPath, "utf-8");
      expect(content).toMatch(/portal\s*<->\s*patient/i);
      expect(content).toMatch(/BFF/i);
    });

    test("T3.2: docs/architecture/interop-hub.md documents portal <-> patient exception and zero-BFF mandate", () => {
      const docPath = path.join(REPO_ROOT, "docs", "architecture", "interop-hub.md");
      expect(fs.existsSync(docPath)).toBe(true);

      const content = fs.readFileSync(docPath, "utf-8");
      expect(content).toMatch(/portal\s*<->\s*patient/i);
      expect(content).toMatch(/BFF/i);
    });

    test("T3.3: docs/architecture/platform-contract.md documents service boundary rules", () => {
      const docPath = path.join(REPO_ROOT, "docs", "architecture", "platform-contract.md");
      expect(fs.existsSync(docPath)).toBe(true);

      const content = fs.readFileSync(docPath, "utf-8");
      expect(content).toMatch(/portal\s*<->\s*patient/i);
      expect(content).toMatch(/BFF/i);
    });

    test("T3.4: .agents/skills/interop-hub-expert/SKILL.md documents portal <-> patient exception", () => {
      const skillPath = path.join(
        REPO_ROOT,
        ".agents",
        "skills",
        "interop-hub-expert",
        "SKILL.md"
      );
      expect(fs.existsSync(skillPath)).toBe(true);

      const content = fs.readFileSync(skillPath, "utf-8");
      expect(content).toMatch(/portal\s*<->\s*patient/i);
      expect(content).toMatch(/BFF/i);
    });
  });
});
