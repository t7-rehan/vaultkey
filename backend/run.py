from dotenv import load_dotenv
from pathlib import Path

# Load .env from the backend directory (where this file lives).
# Put your secrets in backend/.env — never commit it.
load_dotenv(Path(__file__).parent / ".env")

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
