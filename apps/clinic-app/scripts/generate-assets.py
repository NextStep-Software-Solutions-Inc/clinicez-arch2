"""Generates the clinic app's launcher assets by delegating to the workspace Layered Duo SVG generator."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
SCRIPT = ROOT / "scripts" / "generate-brand-assets.mjs"

sys.exit(subprocess.call(["bun", str(SCRIPT)], cwd=str(ROOT)))
