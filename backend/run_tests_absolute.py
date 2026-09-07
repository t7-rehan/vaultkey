"""
Wrapper to run pytest from any working directory using absolute paths.
"""
import os
import subprocess
import sys
import time

BACKEND_DIR = r"c:\Users\Aamin\Desktop\App\vaultkey\backend"
VENV_PYTHON = os.path.join(BACKEND_DIR, "venv", "Scripts", "python.exe")
VENV_PYTEST = os.path.join(BACKEND_DIR, "venv", "Scripts", "pytest.exe")

# Use venv python/pytest if available, else system
python_exe = VENV_PYTHON if os.path.exists(VENV_PYTHON) else sys.executable
pytest_exe = VENV_PYTEST if os.path.exists(VENV_PYTEST) else "pytest"

print(f"Using Python: {python_exe} (exists={os.path.exists(python_exe)})")
print(f"Using Pytest: {pytest_exe} (exists={os.path.exists(pytest_exe)})")
print(f"Working dir: {BACKEND_DIR}")

result = subprocess.run(
    [python_exe, "-m", "pytest",
     os.path.join(BACKEND_DIR, "test_security_exploration.py"),
     "-v", "--tb=short", "-p", "no:cacheprovider"],
    capture_output=True,
    text=True,
    cwd=BACKEND_DIR,
    env={**os.environ, "PYTHONPATH": BACKEND_DIR},
)

output = result.stdout + result.stderr
output_file = os.path.join(BACKEND_DIR, "pytest_exploration_results.txt")
with open(output_file, "w", encoding="utf-8") as f:
    f.write(output)
    f.write(f"\n=== Exit code: {result.returncode} ===\n")

print(output)
print(f"\n=== Exit code: {result.returncode} ===")
print(f"Results saved to: {output_file}")

time.sleep(3)
