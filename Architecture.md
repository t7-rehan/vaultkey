# VaultKey — Architecture Specification

**Document:** Architecture.md  
**Version:** 1.0  
**Status:** MVP Development Specification  
**Target:** 3–4 day hackathon MVP

---

## 1. Purpose

This document defines the technical architecture, application flow, project structure, technology stack, security boundaries, data flow, deployment model, and development responsibilities for the VaultKey MVP.

VaultKey is a client-side encrypted file-sharing application that allows authenticated users to:

- Upload PDF files up to 50 MB
- Encrypt files in the browser using AES-GCM
- Store encrypted ciphertext
- Generate secure, time-limited share links
- Apply password protection
- Set capped download limits
- Revoke access
- View access/audit events
- Allow recipients to decrypt files in the browser

The architecture is deliberately optimized for a 3–4 day implementation while preserving clear security boundaries.

---

# 2. Architecture Goals

The architecture must prioritize:

1. Client-side file encryption
2. Server-side authorization
3. Secure share-token generation
4. Expiration enforcement
5. Download-limit enforcement
6. Remote revocation
7. Minimal sensitive-data collection
8. Simple deployment
9. Clear separation of frontend, backend, database, and storage responsibilities
10. Easy development by a six-member team

---

# 3. Technology Stack

## Frontend

- React
- Vite
- Tailwind CSS
- JavaScript/TypeScript
- Web Crypto API
- Fetch API or Axios

## Backend

- Python
- FastAPI
- Pydantic
- PostgreSQL client/ORM as required

## Authentication

- Supabase Auth

## Database

- Supabase PostgreSQL

## File Storage

- Supabase Storage

## Cryptography

- Browser Web Crypto API
- AES-GCM

## Deployment

Recommended:

- Frontend: Vercel
- Backend: suitable free-tier FastAPI host
- Database: Supabase
- Storage: Supabase Storage

---

# 4. High-Level Architecture

```text
                         ┌─────────────────────┐
                         │       USER          │
                         │   Browser/Client    │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   React Frontend    │
                         │                     │
                         │ Dashboard           │
                         │ Upload              │
                         │ Sharing             │
                         │ Activity            │
                         │ Recipient Access    │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
          ┌─────────────────┐             ┌──────────────────┐
          │  Web Crypto API │             │    FastAPI       │
          │                 │             │    Backend       │
          │ AES-GCM         │             │                  │
          │ Encrypt/Decrypt │             │ Auth validation   │
          └────────┬────────┘             │ Authorization     │
                   │                      │ Shares            │
                   │                      │ Revocation        │
                   │                      │ Audit             │
                   │                      └────────┬─────────┘
                   │                               │
                   │                               ▼
                   │                     ┌──────────────────┐
                   │                     │     Supabase     │
                   │                     │                  │
                   │                     │ PostgreSQL       │
                   │                     │ Storage           │
                   │                     │ Auth              │
                   │                     └──────────────────┘
                   │
                   ▼
             Encrypted File
```

---

# 5. Core Architectural Principle

VaultKey separates **file confidentiality** from **access authorization**.

## File Confidentiality

Handled primarily by:

```text
Browser
  ↓
Web Crypto API
  ↓
AES-GCM
  ↓
Encrypted ciphertext
```

## Access Authorization

Handled by:

```text
FastAPI
  ↓
Validate share token
  ↓
Check expiry
  ↓
Check revocation
  ↓
Check download limit
  ↓
Check password if enabled
  ↓
Allow / deny
```

The frontend must never be the only authority enforcing access-control rules.

---

# 6. Encryption Architecture

## 6.1 Encryption Flow

```text
Original PDF
     │
     ▼
Browser File API
     │
     ▼
Generate random AES key
     │
     ▼
Generate random IV
     │
     ▼
AES-GCM encryption
     │
     ▼
Ciphertext
     │
     ├──────────────► Supabase Storage
     │
     └──────────────► Metadata/API
```

The plaintext PDF should not be uploaded to the backend during normal operation.

---

# 7. Decryption-Key Delivery Model

For the MVP, VaultKey uses the selected **URL fragment approach**.

Example:

```text
https://vaultkey.app/share/<share-token>#<key-material>
```

The browser does not send the URL fragment (`#...`) to the HTTP server.

Conceptually:

```text
Share URL
   │
   ├── Share token
   │       │
   │       └── Sent to backend
   │
   └── Encryption key material
           │
           └── Remains in browser URL fragment
```

## Important Security Boundary

The server receives and processes the share token, but the decryption key material contained in the URL fragment should not be included in backend requests or server logs.

The frontend extracts the fragment locally and uses it for decryption.

## Product Language

The MVP should describe itself primarily as:

> Client-side encrypted file sharing.

Do not claim absolute "zero knowledge" unless the final implementation and threat model have been formally reviewed and support that claim.

---

# 8. Authentication Architecture

Supabase Auth handles user authentication.

```text
User
  │
  ▼
React
  │
  ▼
Supabase Auth
  │
  ├── Register
  ├── Login
  ├── Session
  └── Logout
```

After authentication:

```text
React
  │
  ▼
Authenticated session
  │
  ▼
FastAPI
  │
  ▼
Validate authenticated identity
```

The backend must not trust a user ID supplied by the frontend without validating the authenticated identity.

---

# 9. File Upload Architecture

## Step 1 — User Selects File

Frontend validates:

```text
Type: PDF
Size: <= 50 MB
```

## Step 2 — Encryption

```text
PDF
 ↓
ArrayBuffer
 ↓
Generate AES key
 ↓
Generate IV
 ↓
AES-GCM
 ↓
Ciphertext
```

## Step 3 — Upload

```text
Ciphertext
    ↓
FastAPI
    ↓
Supabase Storage
```

## Step 4 — Metadata

Store:

```text
file_id
owner_id
storage_path
filename
mime_type
size
created_at
```

The storage filename should be generated by the server rather than directly using the user-provided filename.

---

# 10. File Retrieval Architecture

When a recipient requests a file:

```text
Recipient
   │
   ▼
Share URL
   │
   ▼
FastAPI
   │
   ├── Validate token
   ├── Check expiry
   ├── Check revoked
   ├── Check download limit
   ├── Check password
   └── Log event
   │
   ▼
Encrypted file
   │
   ▼
Browser
   │
   ▼
Extract key from URL fragment
   │
   ▼
AES-GCM decrypt
   │
   ▼
Original PDF
```

---

# 11. Share-Link Architecture

A share contains:

```text
share_id
file_id
owner_id
token_hash
expires_at
max_downloads
download_count
password_hash
revoked
created_at
revoked_at
```

## Token Generation

The backend should generate unpredictable random tokens using a cryptographically secure random generator.

The database should store an appropriate server-side representation/hash of the token rather than unnecessarily storing the raw bearer token.

Conceptual flow:

```text
Secure Random Generator
        │
        ▼
Share Token
        │
        ├── URL
        │
        └── Server-side token representation
```

---

# 12. Share-Link URL

Example:

```text
https://vaultkey.app/share/8f3d7a...#encryption-key
```

The URL has two conceptual parts:

```text
/path/share-token
        +
#key-material
```

The share token is used for server-side authorization.

The key material is used locally by the recipient's browser.

---

# 13. Expiration Architecture

Expiration is enforced by the backend.

Example:

```text
Current time < expires_at
       │
       ├── YES → Continue authorization
       │
       └── NO  → Deny access
```

The frontend may display remaining time, but the frontend must not be responsible for enforcing expiration.

---

# 14. Download-Limit Architecture

The backend stores:

```text
max_downloads
download_count
```

Authorization:

```text
download_count < max_downloads
```

If true:

```text
Allow
 ↓
Atomically increment count
 ↓
Log download
```

If false:

```text
Deny
 ↓
Log ACCESS_DENIED
```

Concurrent requests must be handled so that multiple simultaneous requests cannot trivially bypass the configured limit.

---

# 15. Password Protection

When enabled:

```text
Owner
  │
  ▼
Password
  │
  ▼
Password hashing
  │
  ▼
Database
```

The plaintext password must never be stored.

Recipient:

```text
Password
   ↓
FastAPI
   ↓
Verify hash
   ↓
Valid?
 ┌─┴─┐
YES NO
 │   │
 ▼   ▼
Allow Deny
```

Passwords must never appear in logs, URLs, frontend source code, or API responses.

---

# 16. Revocation Architecture

Owner selects:

```text
REVOKE ACCESS
```

Backend:

```text
UPDATE shares
SET revoked = true
WHERE share_id = ...
AND owner_id = authenticated_user
```

Recipient subsequently requests:

```text
GET /api/access/{token}
```

Backend:

```text
revoked == true
       │
       ▼
ACCESS DENIED
```

The revocation event is written to the audit log.

---

# 17. Audit Architecture

Every important security event should be recorded.

```text
                    Request
                       │
                       ▼
                 Authorization
                       │
              ┌────────┴────────┐
              │                 │
            ALLOW              DENY
              │                 │
              ▼                 ▼
        Security Event      Security Event
              │                 │
              └────────┬────────┘
                       ▼
                  access_logs
```

Events include:

```text
LINK_CREATED
ACCESS_ATTEMPT
ACCESS_GRANTED
ACCESS_DENIED
PASSWORD_FAILED
FILE_DOWNLOADED
LINK_EXPIRED
LINK_REVOKED
```

Logged metadata:

```text
timestamp
event
status
browser/device
coarse network information
```

Do not log:

```text
passwords
encryption keys
plaintext file contents
session credentials
```

---

# 18. Backend Architecture

FastAPI should be divided into logical modules.

```text
backend/
└── app/
    ├── main.py
    │
    ├── routes/
    │   ├── files.py
    │   ├── shares.py
    │   ├── access.py
    │   └── activity.py
    │
    ├── services/
    │   ├── file_service.py
    │   ├── share_service.py
    │   ├── access_service.py
    │   └── audit_service.py
    │
    ├── security/
    │   ├── authorization.py
    │   ├── tokens.py
    │   └── password.py
    │
    ├── models/
    │   ├── file.py
    │   ├── share.py
    │   └── audit.py
    │
    ├── schemas/
    │   ├── file.py
    │   ├── share.py
    │   └── access.py
    │
    └── config.py
```

---

# 19. Frontend Architecture

```text
frontend/
└── src/
    ├── main.jsx
    │
    ├── App.jsx
    │
    ├── pages/
    │   ├── Login.jsx
    │   ├── Register.jsx
    │   ├── Dashboard.jsx
    │   ├── FileDetails.jsx
    │   └── ShareAccess.jsx
    │
    ├── components/
    │   ├── Navbar.jsx
    │   ├── FileUploader.jsx
    │   ├── FileCard.jsx
    │   ├── ShareModal.jsx
    │   ├── ActivityTimeline.jsx
    │   ├── SecurityStatus.jsx
    │   └── ErrorMessage.jsx
    │
    ├── crypto/
    │   ├── encrypt.js
    │   ├── decrypt.js
    │   └── keyManager.js
    │
    ├── services/
    │   ├── api.js
    │   ├── auth.js
    │   ├── files.js
    │   ├── shares.js
    │   └── activity.js
    │
    ├── hooks/
    │   └── useAuth.js
    │
    └── utils/
        ├── validation.js
        └── formatting.js
```

---

# 20. Complete Repository Structure

```text
vaultkey/
│
├── README.md
├── .gitignore
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── services/
│       ├── crypto/
│       ├── hooks/
│       └── utils/
│
├── backend/
│   ├── requirements.txt
│   ├── .env.example
│   └── app/
│       ├── main.py
│       ├── routes/
│       ├── services/
│       ├── security/
│       ├── models/
│       └── schemas/
│
├── database/
│   ├── schema.sql
│   └── seed.sql
│
├── docs/
│   ├── Architecture.md
│   ├── ThreatModel.md
│   └── Security.md
│
└── tests/
    ├── backend/
    └── frontend/
```

---

# 21. API Architecture

## Files

### POST `/api/files`

Creates file metadata and/or initiates encrypted file storage.

Request:

```text
multipart/form-data
```

The implementation should ensure that the uploaded content is ciphertext rather than plaintext.

---

### GET `/api/files`

Returns files belonging to the authenticated user.

---

### GET `/api/files/{id}`

Returns metadata for an authorized owner's file.

---

### DELETE `/api/files/{id}`

Deletes an owner's file and associated share records where appropriate.

---

# 22. Share APIs

## POST `/api/shares`

Creates a new share.

Input:

```json
{
  "file_id": "uuid",
  "expires_at": "timestamp",
  "max_downloads": 5,
  "password": "optional"
}
```

The API must verify that the authenticated user owns the referenced file.

---

## GET `/api/shares/{id}`

Returns share information to the owner.

Sensitive values such as password hashes must never be returned.

---

## POST `/api/shares/{id}/revoke`

Revokes a share owned by the authenticated user.

---

# 23. Recipient APIs

## GET `/api/access/{token}`

Validates the share and returns only the information necessary to continue the access flow.

---

## POST `/api/access/{token}/authorize`

Used when password protection is enabled.

---

## GET `/api/access/{token}/download`

Returns or authorizes retrieval of the encrypted file after server-side checks.

---

# 24. Activity API

## GET `/api/files/{id}/activity`

Returns authorized activity for a file's shares.

Example response:

```json
[
  {
    "event": "ACCESS_GRANTED",
    "status": "success",
    "timestamp": "2026-08-15T18:30:00Z",
    "device": "Chrome / Windows"
  }
]
```

---

# 25. Database Architecture

## Users

Managed primarily by Supabase Auth.

## Files

```text
files
-----
id
owner_id
storage_path
original_filename
mime_type
size
created_at
```

## Shares

```text
shares
------
id
file_id
owner_id
token_hash
expires_at
max_downloads
download_count
password_hash
revoked
created_at
revoked_at
```

## Access Logs

```text
access_logs
-----------
id
share_id
event
status
timestamp
user_agent
network_metadata
```

---

# 26. Relationships

```text
users
  │
  │ 1:N
  ▼
files
  │
  │ 1:N
  ▼
shares
  │
  │ 1:N
  ▼
access_logs
```

---

# 27. Storage Architecture

Supabase Storage contains encrypted files.

Conceptually:

```text
storage/
└── encrypted-files/
    ├── generated-id-1
    ├── generated-id-2
    └── generated-id-3
```

Do not use:

```text
storage/
└── Project_Report.pdf
```

as the physical object identifier.

Use generated identifiers.

---

# 28. Security Boundary

## Trusted Components

```text
FastAPI authorization logic
Supabase Auth
Database access policies
Secure random token generation
Web Crypto API primitives
```

## Untrusted Inputs

```text
File names
File contents
Share tokens
Passwords
Query parameters
Request bodies
Client-provided IDs
Browser metadata
```

Every untrusted input must be validated.

---

# 29. Frontend Security Responsibilities

The frontend is responsible for:

- File validation
- Client-side encryption
- Client-side decryption
- Secure key handling
- UI state
- User interaction

The frontend is NOT trusted for:

- Authorization
- Expiry enforcement
- Download limits
- Revocation
- Ownership verification

---

# 30. Backend Security Responsibilities

The backend is responsible for:

- Authentication verification
- Authorization
- File ownership checks
- Share-token validation
- Expiration
- Download limits
- Password verification
- Revocation
- Audit logging
- Storage access control

---

# 31. Database Security

Use row-level access policies where appropriate.

The fundamental rule is:

```text
User A
  ↓
Can access
  ↓
Only User A's resources
```

A request containing:

```text
file_id = another_user_file
```

must not be sufficient to access that resource.

---

# 32. Environment Variables

Frontend example:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=
```

Backend example:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
APP_SECRET=
```

Never commit real secrets.

Create:

```text
.env.example
```

and keep actual `.env` files in `.gitignore`.

---

# 33. Local Development Architecture

```text
Browser
   │
   ├── http://localhost:5173
   │
   ▼
React/Vite
   │
   │ API requests
   ▼
FastAPI
   │
   ├──────────────► Supabase PostgreSQL
   │
   └──────────────► Supabase Storage
```

---

# 34. Production Architecture

```text
                    INTERNET
                       │
                       ▼
              ┌────────────────┐
              │     Vercel     │
              │ React Frontend │
              └───────┬────────┘
                      │
                      ▼
              ┌────────────────┐
              │ FastAPI Server │
              │   Backend      │
              └───────┬────────┘
                      │
             ┌────────┴────────┐
             │                 │
             ▼                 ▼
      ┌──────────────┐  ┌───────────────┐
      │ PostgreSQL   │  │ Supabase      │
      │              │  │ Storage       │
      │ Metadata     │  │ Ciphertext    │
      │ Shares       │  │ Files         │
      │ Audit Logs   │  │               │
      └──────────────┘  └───────────────┘
```

---

# 35. Deployment Responsibilities

## Frontend

Deploy React/Vite application to Vercel or an equivalent static hosting platform.

## Backend

Deploy FastAPI application to a suitable free-tier application host.

## Database

Use Supabase PostgreSQL.

## Storage

Use Supabase Storage.

## Environment

Production secrets must be configured through the hosting provider's secret/environment-variable system.

---

# 36. Development Workflow

Use GitHub with feature branches.

Recommended branches:

```text
main
develop

feature/frontend
feature/backend
feature/encryption
feature/storage
feature/audit
feature/security
```

Workflow:

```text
Create branch
     ↓
Implement feature
     ↓
Test locally
     ↓
Pull request
     ↓
Code review
     ↓
Merge
```

Security-sensitive code should receive review from the security lead before merging.

---

# 37. Team Module Ownership

## Member 1 — Frontend

```text
frontend/pages
frontend/components
frontend/styles
```

## Member 2 — Backend

```text
backend/routes
backend/services
```

## Member 3 — Security

```text
frontend/crypto
backend/security
docs/ThreatModel.md
docs/Security.md
```

## Member 4 — Database/Storage

```text
database/schema.sql
Supabase configuration
Storage policies
```

## Member 5 — Audit

```text
audit service
activity API
ActivityTimeline
security events
```

## Member 6 — Integration/DevOps

```text
API integration
deployment
testing
README
CI/basic automation
```

---

# 38. 3–4 Day Implementation Boundaries

## Day 1

### Must complete

```text
✓ Repository
✓ React setup
✓ FastAPI setup
✓ Supabase setup
✓ Authentication
✓ Database schema
✓ PDF validation
✓ AES-GCM encryption
✓ Encrypted storage
```

### Milestone

```text
Login
 ↓
Select PDF
 ↓
Encrypt
 ↓
Store ciphertext
```

---

# 39. Day 2

### Must complete

```text
✓ Share creation
✓ Secure token
✓ Expiration
✓ Download limit
✓ Password protection
✓ Recipient page
✓ Encrypted file retrieval
✓ Browser decryption
```

### Milestone

```text
Upload
 ↓
Encrypt
 ↓
Share
 ↓
Recipient accesses
 ↓
Decrypt
 ↓
Download
```

---

# 40. Day 3

### Must complete

```text
✓ Revocation
✓ Authorization
✓ Access logs
✓ Activity dashboard
✓ Expiration enforcement
✓ Download-limit enforcement
✓ Security testing
```

### Milestone

```text
Share
 ↓
Access
 ↓
Audit
 ↓
Revoke
 ↓
Access denied
```

---

# 41. Day 4

### Focus

```text
✓ Bug fixing
✓ Security review
✓ Race-condition testing
✓ UI polish
✓ Deployment
✓ Demo preparation
✓ Architecture documentation
```

Do not introduce major architectural changes on Day 4.

---

# 42. Required Security Tests

The team must test:

```text
[ ] Invalid token
[ ] Expired token
[ ] Revoked token
[ ] Wrong password
[ ] Correct password
[ ] Download limit reached
[ ] Multiple concurrent downloads
[ ] Unauthorized file ID
[ ] Unauthorized share ID
[ ] Oversized file
[ ] Non-PDF file
[ ] Corrupted ciphertext
[ ] Invalid decryption key
[ ] Logged-out dashboard access
[ ] Direct API access without authorization
```

---

# 43. Core Demo Flow

The complete hackathon demo should follow this sequence:

```text
1. Login
      ↓
2. Upload Confidential_Project_Report.pdf
      ↓
3. Encrypt in browser
      ↓
4. Create secure link
      ↓
5. Configure:
      Expiry = 10 minutes
      Downloads = 1
      Password = enabled
      ↓
6. Open link as recipient
      ↓
7. Enter password
      ↓
8. Access encrypted file
      ↓
9. Browser decrypts
      ↓
10. Download PDF
      ↓
11. Owner opens Activity
      ↓
12. Access + download visible
      ↓
13. Owner clicks Revoke
      ↓
14. Recipient attempts access again
      ↓
15. ACCESS REVOKED
```

This demonstrates the majority of P0 requirements in one scenario.

---

# 44. Architecture Decisions

| Decision | MVP Choice | Reason |
|---|---|---|
| Frontend | React + Vite | Fast development |
| Styling | Tailwind CSS | Rapid UI development |
| Backend | FastAPI | Simple Python API development |
| Database | Supabase PostgreSQL | Managed PostgreSQL |
| Storage | Supabase Storage | Simple object storage |
| Authentication | Supabase Auth | Avoid custom auth implementation |
| Encryption | Web Crypto API | Browser-native cryptography |
| Cipher | AES-GCM | Authenticated encryption |
| Key delivery | URL fragment | Practical for MVP |
| File type | PDF | Reduced upload/security scope |
| File limit | 50 MB | MVP practicality |
| Download cap | 10 | Prevent unlimited demo access |
| AI | Excluded from MVP | Security and time priority |
| Deployment | Vercel + FastAPI host + Supabase | Simple architecture |

---

# 45. Explicit MVP Boundaries

The team should NOT spend hackathon time building:

```text
❌ AI chatbot
❌ ML anomaly detection
❌ Mobile application
❌ Enterprise RBAC
❌ Team workspaces
❌ Multiple file formats
❌ Blockchain
❌ Custom cryptographic algorithms
❌ DRM
❌ Screenshot prevention
❌ Complex microservices
❌ Kubernetes
❌ Custom authentication system
```

The MVP is successful if the secure sharing lifecycle works reliably.

---

# 46. Final Architecture Principle

VaultKey should be thought of as two systems working together:

```text
             VAULTKEY
                 │
       ┌─────────┴─────────┐
       │                   │
       ▼                   ▼
 CONFIDENTIALITY       ACCESS CONTROL
       │                   │
       ▼                   ▼
 Web Crypto API         FastAPI
       │                   │
    AES-GCM          Authorization
       │              Expiration
       ▼              Limits
 Ciphertext           Password
       │              Revocation
       ▼              Audit
 Supabase Storage         │
                          ▼
                    PostgreSQL
```

The key architectural rule is:

> **The browser protects the file. The backend controls access.**

This separation keeps the MVP understandable, testable, and aligned with the product's core promise.

---

# 47. Definition of Done

VaultKey Architecture is considered successfully implemented when:

- A user can authenticate.
- A PDF can be encrypted in the browser.
- Only ciphertext is stored for the file payload.
- A secure share link can be created.
- Expiration is enforced server-side.
- Download limits are enforced server-side.
- Optional password protection works.
- Recipient access works.
- Decryption happens in the browser.
- Owner can revoke a share.
- Future access after revocation is denied.
- Security events are logged.
- Unauthorized resource access is rejected.
- The complete application can be deployed and demonstrated.

---

## Final System

```text
                         VAULTKEY

                           USER
                            │
                            ▼
                     ┌─────────────┐
                     │    REACT    │
                     │  FRONTEND   │
                     └──────┬──────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
       ┌──────────────┐           ┌──────────────┐
       │ Web Crypto   │           │   FastAPI    │
       │              │           │   Backend    │
       │ AES-GCM      │           │              │
       │ Encrypt      │           │ Authorization│
       │ Decrypt      │           │ Shares       │
       └──────┬───────┘           │ Revocation   │
              │                   │ Audit        │
              │                   └──────┬───────┘
              │                          │
              ▼                          ▼
       ┌──────────────┐          ┌───────────────┐
       │  Ciphertext  │          │   Supabase    │
       │              │          │               │
       │              │          │ PostgreSQL    │
       │              │          │ Storage       │
       └──────────────┘          │ Auth          │
                                 └───────────────┘

               CONFIDENTIALITY + CONTROL
                         ↓
               SECURE FILE SHARING
```

**VaultKey — Share securely. Stay in control.**
