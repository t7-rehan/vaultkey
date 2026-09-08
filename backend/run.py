from dotenv import load_dotenv
from pathlib import Path

# Load .env from the backend directory (where this file lives).
# Put your secrets in backend/.env — never commit it.
# override=True ensures .env values win over any stale OS-level env vars
# (e.g. a leftover DATABASE_URL set in a previous shell session).
load_dotenv(Path(__file__).parent / ".env", override=True)

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
