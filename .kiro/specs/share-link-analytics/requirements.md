# Requirements Document

## Introduction

VaultKey currently tracks downloads per share link via download_count, but has no concept of visits.
This feature adds two analytics capabilities:

1. **Owner: Share Link Access Counter** - file owners see a visit count alongside download count on the FileDetailPage.
2. **Recipient: Link Visit History and Action Log** - recipients see visit count and Class A event timeline on the share page.

Both features read from the existing AccessLog table; no new persistent columns are required.

---

## Glossary

- **Share_Link**: A record in the shares table associating a file with a token-protected URL.
- **Access_Log**: A record in access_logs capturing every interaction event on a Share_Link.
- **Visit_Count**: The total number of ACCESS_ATTEMPT events for a specific Share_Link.
- **Download_Count**: The integer on ShareLink.download_count for successful download increments.
- **Class_A_Event**: Direct user interaction: ACCESS_ATTEMPT, ACCESS_GRANTED, PASSWORD_FAILED, or FILE_DOWNLOADED.
- **Class_B_Event**: System or owner action: LINK_CREATED, LINK_REVOKED, LINK_EXPIRED, ACCESS_DENIED.
- **Owner**: An authenticated VaultKey user who created the Share_Link.
- **Recipient**: A user accessing a share link via its public URL without a VaultKey account.
- **Analytics_Endpoint**: The new public REST endpoint GET /api/access/{token}/analytics.
- **Share_Detail_Response**: The JSON response from GET /api/shares/{id} to the Owner.
- **Recipient_Check_Response**: The JSON response from GET /api/access/{token} to the Recipient.

---

## Requirements

### Requirement 1: Owner-Visible Visit Count in Share Detail Response

**User Story:** As a file owner, I want to see the total number of times my share link has been visited, so that I can understand recipient engagement.

#### Acceptance Criteria

1. THE Share_Detail_Response SHALL include a visit_count integer field with a minimum value of 0 representing total ACCESS_ATTEMPT events for that Share_Link.
2. WHEN the Owner requests share detail for a specific Share_Link, THE Share_Detail_Response SHALL return a visit_count derived by counting AccessLog records where share_id equals the Share_Link id and event equals ACCESS_ATTEMPT.
3. IF no ACCESS_ATTEMPT events exist for a Share_Link, THEN THE Share_Detail_Response SHALL return a visit_count of 0.
4. WHEN a download operation is recorded for a Share_Link, THE visit_count for that Share_Link SHALL remain unchanged.
5. WHEN the Owner requests the list of all share links, EACH share item SHALL include a visit_count field computed using ACCESS_ATTEMPT counting logic for that item share_id.
6. THE visit_count in a Share_Detail_Response SHALL only be accessible to the authenticated Owner of that Share_Link.
7. WHEN the Owner retrieves share detail or the share list, THE system SHALL return the response including visit_count within 2000 milliseconds under normal load.

---

### Requirement 2: Owner-Visible Visit Count on the File Detail Page

**User Story:** As a file owner viewing a file detail page, I want to see the visit count displayed alongside downloads, so I have a full picture of engagement.

#### Acceptance Criteria

1. WHEN the FileDetailPage renders the active share summary card, THE FileDetailPage SHALL display the visit_count from the share list response as a non-negative integer.
2. WHEN visit_count is 0, THE FileDetailPage SHALL display 0 rather than hiding the field.
3. THE FileDetailPage SHALL display visit_count with the label Visits and download_count with the label Downloads as distinct labeled metrics in the share summary grid.
4. WHEN a new share link is created on the FileDetailPage and page data is refreshed, THE FileDetailPage SHALL display the updated visit_count without requiring a manual browser reload.
5. IF the share list request fails when loading the FileDetailPage, THEN THE FileDetailPage SHALL display an error indication and preserve any previously rendered page content.
6. THE share summary card displaying visit_count and download_count SHALL only be rendered when the authenticated file owner is viewing the page.

---

### Requirement 3: Public Analytics Endpoint for Recipients

**User Story:** As a recipient visiting a share link, I want to see how many times this link has been visited and a log of interaction events.

#### Acceptance Criteria

1. THE Analytics_Endpoint SHALL be publicly accessible without authentication, identified only by the share token.
2. WHEN a valid token is provided, THE Analytics_Endpoint SHALL return a visit_count integer and an events list of Class_A_Event entries each containing only event type and timestamp.
3. IF an invalid or non-existent token is provided, THEN THE Analytics_Endpoint SHALL return an error response indicating the token was not found.
4. EACH entry in the events list SHALL contain only event (string) and timestamp (ISO 8601); THE Analytics_Endpoint SHALL NOT expose ip_address, user_agent, owner_id, file_id, or share_id.
5. THE events list SHALL be ordered by timestamp descending with the most recent entry first.
6. THE events list SHALL contain only Class_A_Event entries (ACCESS_ATTEMPT, ACCESS_GRANTED, PASSWORD_FAILED, FILE_DOWNLOADED); Class_B_Events SHALL be excluded.
7. WHILE receiving requests from a client IP, THE system SHALL track the request count within the preceding 60-second rolling window.
8. IF more than 60 requests from the same IP are recorded within a 60-second rolling window, THEN THE Analytics_Endpoint SHALL return an error response indicating the rate limit has been exceeded.
9. WHEN the events list would contain more than 50 entries, THE Analytics_Endpoint SHALL return only the 50 most recent entries ordered by timestamp descending.

---

### Requirement 4: Recipient Page Displays Visit Count and Event Timeline

**User Story:** As a recipient on the share link page, I want to see visit analytics and interaction event history without a VaultKey account.

#### Acceptance Criteria

1. WHEN the ShareRecipientPage successfully loads a valid share link, THE ShareRecipientPage SHALL fetch analytics from the Analytics_Endpoint using the same token within 5 seconds of page load completing.
2. WHEN analytics data is available, THE ShareRecipientPage SHALL display the visit_count as a labeled non-negative integer metric.
3. WHEN the events list is non-empty, THE ShareRecipientPage SHALL render a timeline showing each event type label and timestamp in the recipient local timezone, ordered most recent to oldest.
4. WHEN the events list is empty, THE ShareRecipientPage SHALL display a message indicating no interaction history is available.
5. IF the Analytics_Endpoint returns an error due to network failure or HTTP error, THEN THE ShareRecipientPage SHALL suppress the error, render the analytics section as unavailable, and continue the file access flow without interruption.
6. THE ShareRecipientPage SHALL display human-readable event labels: ACCESS_ATTEMPT as Link Visited, ACCESS_GRANTED as Access Granted, PASSWORD_FAILED as Incorrect Password, and FILE_DOWNLOADED as File Downloaded.
7. WHEN the link status is REVOKED, EXPIRED, or LIMIT_REACHED, THE ShareRecipientPage SHALL NOT display the analytics section.
8. IF the Analytics_Endpoint does not respond within 5 seconds, THEN THE ShareRecipientPage SHALL treat the request as failed and apply the silent suppression behavior from criterion 5.

---

### Requirement 5: Analytics Data Isolation

**User Story:** As a VaultKey security principle, recipient-facing analytics must not expose owner-identifying or cross-file information to preserve zero-knowledge design.

#### Acceptance Criteria

1. THE Analytics_Endpoint SHALL NOT include any field that directly or indirectly identifies the Owner, including fields derived from owner_id or owner email such as a hash, pseudonym, or encoded form.
2. THE Analytics_Endpoint SHALL NOT include any field revealing file identity (such as file_id, storage_path, or original_filename) beyond fields already in the Recipient_Check_Response for the same token.
3. THE Analytics_Endpoint SHALL NOT include visitor IP address or user-agent data in any form including exact, partial, hashed, or coarsened derivatives.
4. THE Analytics_Endpoint response SHALL be scoped exclusively to the single Share_Link identified by the token; cross-share or cross-file aggregates SHALL NOT be included.
5. THE Analytics_Endpoint SHALL return only aggregate non-identifying visitor counts and SHALL NOT return per-visit records or visitor-level attributes.
6. IF the Share_Link token is revoked, expired, nonexistent, or malformed, THEN THE Analytics_Endpoint SHALL return an error response that is indistinguishable across all invalid-token states, ensuring the response does not reveal whether the token ever existed.

---

### Requirement 6: Backend Correctness - Visit Count Consistency

**User Story:** As a developer, I want the visit count consistently derived from the access log so it accurately reflects access events and cannot be manipulated.

#### Acceptance Criteria

1. THE Visit_Count SHALL be computed at query time by counting AccessLog records with event equal to ACCESS_ATTEMPT for the given share_id; it SHALL NOT be stored as a separate mutable integer on ShareLink.
2. WHEN multiple concurrent requests arrive for the same Share_Link, THE Analytics_Endpoint SHALL return a Visit_Count reflecting ACCESS_ATTEMPT records committed to the AccessLog at query execution time.
3. WHEN GET /api/shares/{id} and GET /api/access/{token}/analytics are queried for the same Share_Link with no new ACCESS_ATTEMPT events committed between the two queries, THE system SHALL return identical visit_count values in both responses.
4. THE Visit_Count SHALL include only AccessLog records where event equals ACCESS_ATTEMPT and SHALL NOT count records of any other event type including ACCESS_GRANTED or FILE_DOWNLOADED.
5. IF the share_id does not correspond to an existing ShareLink, THEN THE system SHALL return a visit_count of 0 and an empty events list without returning an error.
6. WHEN an ACCESS_ATTEMPT event is recorded, THE system SHALL store it as a distinct record regardless of prior ACCESS_ATTEMPT records for the same share_id, ensuring every access event contributes exactly 1 to the Visit_Count.
