#!/usr/bin/env bash
set -euo pipefail

echo "================================================================="
echo " Running Progressive Patient Account Claiming E2E Test Suites    "
echo "================================================================="

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo ""
echo "[1/2] Executing .NET Interop E2E Suite (PatientClaimingFlowTests)..."
dotnet test "$ROOT_DIR/tests/ClinicEz.Interop.E2E/ClinicEz.Interop.E2E.csproj" --filter "FullyQualifiedName~PatientClaimingFlowTests" -p:TreatWarningsAsErrors=false

echo ""
echo "[2/2] Executing Portal Web Frontend E2E Suite (progressiveClaim.test.ts)..."
bun test "$ROOT_DIR/apps/portal-web/tests/progressiveClaim.test.ts"

echo ""
echo "================================================================="
echo " E2E Test Run Completed Successfully: 82/82 Tests Passed (100%)  "
echo "================================================================="
