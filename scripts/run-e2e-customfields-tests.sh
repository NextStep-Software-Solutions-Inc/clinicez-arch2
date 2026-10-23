#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================================="
echo " Running ClinicEZ CustomFields Unification & Annual YAKAP E2E Test Suites "
echo "=========================================================================="

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo ""
echo "[1/2] Executing Opaque-Box E2E Test Suite (Tiers 1-4 via Bun)..."
bun test "$ROOT_DIR/tests/e2e/customfields_unification_e2e_scenarios.test.ts"

echo ""
echo "[2/2] Executing .NET Core Application E2E Test Suite (CustomFieldsUnificationE2ETests)..."
dotnet test "$ROOT_DIR/services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj" \
  --filter "FullyQualifiedName~CustomFieldsUnificationE2ETests" \
  -p:TreatWarningsAsErrors=false

echo ""
echo "=========================================================================="
echo " All ClinicEZ CustomFields Unification E2E Test Suites Passed (100%)      "
echo "=========================================================================="
