"""
Runner that executes the view-only tests and writes results to a file.
Loads .env before starting pytest so DATABASE_URL is available.
Keeps process alive 30s so the IDE can read output.
"""
import os
import subprocess
import sys
import time
from pathlib import Path

BACKEND_DIR = r"C:\Users\Aamin\Desktop\App\vaultkey\backend"
VENV_PYTHON = os.path.join(BACKEND_DIR, "venv", "Scripts", "python.exe")
python_exe = VENV_PYTHON if os.path.exists(VENV_PYTHON) else sys.executable

# ── Load .env into the environment before spawning pytest ──────────────────
env = dict(os.environ)
env_file = Path(BACKEND_DIR) / ".env"
if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env.setdefault(key.strip(), value.strip())  # don't override existing OS env vars
    print(f"Loaded .env from {env_file}")
else:
    # Minimal test fallback
    env.setdefault("JWT_SECRET", "test_jwt_secret_for_testing_only")
    env.setdefault("DATABASE_URL", "sqlite:///./test_view_only.db")
    env.setdefault("R2_ACCOUNT_ID", "test_account")
    env.setdefault("R2_BUCKET_NAME", "test_bucket")
    env.setdefault("R2_ACCESS_KEY_ID", "test_key")
    env.setdefault("R2_SECRET_ACCESS_KEY", "test_secret")
    print("No .env found — using test fallback environment")

env["PYTHONPATH"] = BACKEND_DIR

result = subprocess.run(
    [
        python_exe, "-m", "pytest",
        os.path.join(BACKEND_DIR, "test_view_only.py"),
        "-v", "--tb=long", "-p", "no:cacheprovider",
    ],
    capture_output=True,
    text=True,
    cwd=BACKEND_DIR,
    env=env,
)

output = result.stdout + result.stderr
output_file = os.path.join(BACKEND_DIR, "pytest_viewonly_results.txt")
with open(output_file, "w", encoding="utf-8") as f:
    f.write(output)
    f.write(f"\n=== Exit code: {result.returncode} ===\n")

print(output)
print(f"=== Exit code: {result.returncode} ===")
print(f"Results saved to: {output_file}")

time.sleep(30)
