# Bugfix Requirements Document

## Introduction

In the VaultKey view-only access mode, the PDF viewer renders PDF content onto HTML5 canvases but only displays a portion of the document. The rendered pages are visually clipped and the user cannot scroll to see content beyond what is initially visible. This breaks the core purpose of the view-only feature, which is to allow recipients to read a PDF in full without downloading it.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a recipient opens a view-only PDF share THEN the system renders only a portion of the first page (or first few pages) visible on screen, with the remainder clipped and inaccessible.

1.2 WHEN a recipient attempts to scroll within the PDF viewer area THEN the system does not scroll — the content remains stationary and the overflow is hidden.

1.3 WHEN a multi-page PDF is opened in the view-only viewer THEN the system clips the canvas pages so that pages beyond the visible viewport area cannot be reached by scrolling.

### Expected Behavior (Correct)

2.1 WHEN a recipient opens a view-only PDF share THEN the system SHALL display the full rendered content of all PDF pages, with the viewer area being scrollable to reveal content that extends beyond the initial viewport.

2.2 WHEN a recipient scrolls within the PDF viewer area THEN the system SHALL scroll the rendered canvas pages vertically, allowing all content to be reached.

2.3 WHEN a multi-page PDF is opened in the view-only viewer THEN the system SHALL allow the recipient to scroll through all rendered pages without any content being clipped or hidden.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a recipient views a PDF in view-only mode THEN the system SHALL CONTINUE TO prevent downloading, printing, and right-click context menu actions.

3.2 WHEN a recipient views a PDF in view-only mode THEN the system SHALL CONTINUE TO block keyboard shortcuts associated with saving or printing (e.g., Ctrl+S, Ctrl+P).

3.3 WHEN a recipient opens a view-only PDF share THEN the system SHALL CONTINUE TO render each PDF page onto its own canvas at the correct resolution and scale.

3.4 WHEN a recipient views images or text files in view-only mode THEN the system SHALL CONTINUE TO display those file types correctly and without regression.

3.5 WHEN the view-only viewer is closed THEN the system SHALL CONTINUE TO clean up blob URLs and revoke object URLs to prevent memory leaks.
