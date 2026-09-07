"""
Static verification of TestIssue2CorsPreservation conditions
against backend/app/main.py — no DB connection required.
"""
import re
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).parent.parent
main_py = (WORKSPACE_ROOT / "backend" / "app" / "main.py").read_text(encoding="utf-8")

results = {}

# 1. http://localhost:5173 present in the default origins string
results["localhost_5173_in_origins"] = "http://localhost:5173" in main_py

# 2/3. X-IV-Hex and X-Original-Filename anywhere in the file
results["x_iv_hex_present"] = "X-IV-Hex" in main_py
results["x_original_filename_present"] = "X-Original-Filename" in main_py

# 4. allow_credentials=True in CORSMiddleware call
results["allow_credentials_true"] = "allow_credentials=True" in main_py

# 5a. expose_headers=[...] argument present
expose_match = re.search(r'expose_headers\s*=\s*\[([^\]]+)\]', main_py)
results["expose_headers_arg_present"] = expose_match is not None
if expose_match:
    expose_value = expose_match.group(1)
    # 5b/c. Both custom headers inside that list
    results["expose_headers_contains_X_IV_Hex"] = "X-IV-Hex" in expose_value
    results["expose_headers_contains_X_Original_Filename"] = "X-Original-Filename" in expose_value
else:
    results["expose_headers_contains_X_IV_Hex"] = False
    results["expose_headers_contains_X_Original_Filename"] = False

# 6. No wildcard in origins
results["no_wildcard_in_origins"] = ('"*"' not in main_py) and ("'*'" not in main_py)

# 7. http://localhost:3000 in origins (tested by test_localhost_3000_receives_cors_header)
results["localhost_3000_in_origins"] = "http://localhost:3000" in main_py

print("=" * 55)
print("  TestIssue2CorsPreservation — Static Verification")
print("=" * 55)
all_pass = True
for check, passed in results.items():
    status = "PASS" if passed else "FAIL"
    if not passed:
        all_pass = False
    print(f"  [{status}] {check}")

print()
print("--- Relevant lines from main.py ---")
for i, line in enumerate(main_py.splitlines(), 1):
    lo = line.lower()
    if any(kw in lo for kw in ("origins", "allowed_origins", "corsmiddleware",
                                "expose_headers", "allow_credentials")):
        print(f"  {i:3}: {line}")

print()
print("OVERALL RESULT:", "ALL PASS ✓" if all_pass else "FAILURES DETECTED ✗")
