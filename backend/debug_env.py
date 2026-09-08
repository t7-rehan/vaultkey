"""Debug: show which DATABASE_URL is active and where it came from."""
import os, time
from pathlib import Path

print("=== Before load_dotenv ===")
print(f"DATABASE_URL = {os.environ.get('DATABASE_URL', '(not set)')[:80]}...")

from dotenv import load_dotenv
env_file = Path(__file__).parent / ".env"
print(f"\n.env exists: {env_file.exists()}")
if env_file.exists():
    for line in env_file.read_text().splitlines():
        if line.startswith("DATABASE_URL"):
            print(f".env DATABASE_URL = {line[:80]}...")

loaded = load_dotenv(env_file, override=True)
print(f"\nload_dotenv returned: {loaded}")
print(f"DATABASE_URL after load = {os.environ.get('DATABASE_URL', '(not set)')[:80]}...")

time.sleep(15)
