# Bugfix Requirements Document

## Introduction

PDF files shared in view-only mode are not rendering in the browser for recipients. When a file with a PDF MIME type is opened through the `ViewOnlyViewer` component, the PDF does not display. The viewer renders an `<iframe>` using a blob URL created from the decrypted content, but this approach fails in most modern browsers because they block blob URLs from loading inside `<iframe>` elements due to security policies (notably `Content-Security-Policy` and browser-native restrictions on blob-originated PDF rendering in sandboxed iframes). Other file types — images and plain text — are unaffected because they use different rendering strategies (`<img>` and `TextViewer` respectively). This bug prevents recipients from using the core view-only feature for the most common document type (PDF).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a recipient opens a view-only share link for a PDF file THEN the system displays a blank or empty iframe instead of the PDF content.

1.2 WHEN the `ViewOnlyViewer` component receives a decrypted PDF blob and renders the PDF path THEN the system creates a blob URL and loads it into an `<iframe src="...#toolbar=0">`, which browsers silently fail to render due to CSP or sandboxing restrictions on blob-URL-sourced iframes for PDF content.

1.3 WHEN the PDF fails to load in the iframe THEN the system shows no error message or fallback to the recipient, leaving them with a blank viewer and no indication of the problem.

### Expected Behavior (Correct)

2.1 WHEN a recipient opens a view-only share link for a PDF file THEN the system SHALL render the PDF content visibly inside the in-browser viewer.

2.2 WHEN the `ViewOnlyViewer` component receives a decrypted PDF blob THEN the system SHALL use a rendering approach that is compatible with browser security policies, such as embedding via a `<canvas>`-based PDF renderer (e.g. PDF.js) or an `<object>` tag, so that the PDF is actually displayed rather than silently failing.

2.3 WHEN the PDF cannot be rendered due to a browser incompatibility or rendering error THEN the system SHALL display a clear, user-readable error message explaining that the PDF could not be displayed in this browser.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a recipient opens a view-only share link for an image file (PNG, JPEG, GIF, WebP) THEN the system SHALL CONTINUE TO display the image using the `<img>` renderer without any changes.

3.2 WHEN a recipient opens a view-only share link for a text-based file (plain text, JSON, Markdown, code) THEN the system SHALL CONTINUE TO display the content using the `TextViewer` renderer without any changes.

3.3 WHEN a recipient opens a view-only share link for an unsupported/binary file type THEN the system SHALL CONTINUE TO display the "Inline preview not available" fallback message.

3.4 WHEN any view-only share is accessed THEN the system SHALL CONTINUE TO enforce all existing deterrents: right-click suppression, keyboard shortcut blocking (Ctrl+S, Ctrl+P, etc.), print blocking, and blob URL revocation on close.

3.5 WHEN any view-only share is accessed THEN the system SHALL CONTINUE TO route through the `/api/access/{token}/view` backend endpoint, logging `VIEW_STARTED` and never incrementing the download counter.

3.6 WHEN a download-mode share is accessed THEN the system SHALL CONTINUE TO use the `/api/access/{token}/download` endpoint and trigger a file download to disk, unaffected by any PDF viewer changes.

3.7 WHEN the `ViewOnlyViewer` component is closed THEN the system SHALL CONTINUE TO revoke the blob URL to prevent the decrypted content from persisting in memory beyond the viewer's lifetime.
