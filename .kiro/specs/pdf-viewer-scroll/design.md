# PDF Viewer Scroll Fix Bugfix Design

## Overview

The VaultKey view-only PDF viewer renders PDF pages onto HTML5 canvases using PDF.js, but the
rendered content is clipped and non-scrollable. Recipients see only the portion of the first
page that fits within the initial viewport and cannot scroll to read the rest of the document.

The root cause is two compounding `overflow-hidden` constraints in `ViewOnlyViewer.jsx`:

1. The content area wrapper (`<div className="flex-1 overflow-hidden relative">`) suppresses
   the `PdfViewer` component's own `overflow-auto` scroll container.
2. The `CanvasPage` wrapper (`<div … className="w-full rounded shadow-lg overflow-hidden">`)
   clips the rendered canvas pixels for each individual page.

The fix removes both `overflow-hidden` constraints so the `PdfViewer`'s existing `overflow-auto`
container can function as intended, allowing recipients to scroll through all rendered pages.

---

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — a PDF file is open in
  `ViewOnlyViewer` and the content area or canvas wrapper is applying `overflow-hidden`, which
  clips rendered content and disables scrolling.
- **Property (P)**: The desired behavior — all rendered PDF page canvases are fully visible and
  the viewer area is vertically scrollable so every page can be reached.
- **Preservation**: Existing security deterrents (no download, no print, no context menu, no
  Ctrl+S/Ctrl+P), correct rendering of images and text files, and blob URL cleanup that must
  remain completely unchanged after the fix.
- **ViewOnlyViewer**: The React component in
  `frontend/src/components/shares/ViewOnlyViewer.jsx` that wraps the full-screen overlay and
  dispatches to content-type-specific sub-renderers.
- **PdfViewer**: The internal `PdfViewer` function (same file) that uses PDF.js to render each
  PDF page to a canvas and displays them in a scrollable flex column.
- **CanvasPage**: The internal `CanvasPage` function (same file) that mounts a pre-rendered
  `<canvas>` DOM node into the React tree via a ref.
- **overflow-hidden**: A Tailwind CSS utility that sets `overflow: hidden`, preventing any
  content from being visible outside the element's bounding box and suppressing scroll.
- **overflow-auto**: A Tailwind CSS utility that sets `overflow: auto`, showing scrollbars only
  when content overflows — used by `PdfViewer`'s container.

---

## Bug Details

### Bug Condition

The bug manifests when a PDF file is opened in view-only mode. The `PdfViewer` component
correctly sets up an `overflow-auto` scroll container, but the parent content area wrapper in
`ViewOnlyViewer` applies `overflow-hidden`, which suppresses that scroll container. Additionally,
each `CanvasPage` wrapper applies its own `overflow-hidden`, which clips the canvas pixel data
itself. Together these two constraints make scrolling impossible and content invisible beyond the
initial viewport.

**Formal Specification:**

```
FUNCTION isBugCondition(file)
  INPUT: file opened in ViewOnlyViewer
  OUTPUT: boolean

  RETURN isPdfMime(file.mimeType)
         AND contentAreaWrapper.hasClass('overflow-hidden')
         AND (canvasPageWrapper.hasClass('overflow-hidden')
              OR contentAreaWrapper.hasClass('overflow-hidden'))
END FUNCTION
```

### Examples

- **Single-page PDF, tall content**: User opens a PDF whose single page is taller than the
  viewport. Expected: page scrolls vertically. Actual: bottom portion is clipped and
  inaccessible — scroll does nothing.
- **Multi-page PDF**: User opens a 5-page PDF. Expected: all 5 pages are stacked and scrollable.
  Actual: only as much of page 1 as fits in the viewport is visible; pages 2–5 are hidden.
- **Wide PDF page**: User opens a PDF wider than the container. Expected: horizontal scrollbar
  appears on the `PdfViewer` container. Actual: width is clipped by `overflow-hidden`.
- **Image file (non-buggy)**: User opens a JPEG in view-only mode. Expected: image displays
  correctly. Actual (post-fix): unchanged — the image path is unaffected by this fix.

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Downloading must remain blocked — no `<a download>` links or blob URL exposure.
- Printing must remain blocked — `window.print` patch and `@media print` CSS stay in place.
- Right-click context menu must remain suppressed via `onContextMenu` handler.
- Keyboard shortcuts Ctrl+S, Ctrl+P, Ctrl+Shift+S, and macOS equivalents must remain blocked.
- Each PDF page must continue to be rendered onto its own canvas at the correct scale and
  resolution.
- Images and text files must continue to display correctly in their respective sub-viewers.
- Blob URL revocation on unmount must continue to prevent memory leaks.
- The visual "VIEW ONLY" watermark and deterrence banner must remain visible.

**Scope:**

All inputs that do NOT involve a PDF file (images, text, unknown types) are completely
unaffected. For PDFs, only the CSS overflow constraints are changed — no rendering logic,
security logic, or event handling is touched.

---

## Hypothesized Root Cause

Based on code inspection of `ViewOnlyViewer.jsx`:

1. **Content area wrapper uses `overflow-hidden`** (confirmed, line ~323):
   ```jsx
   <div className="flex-1 overflow-hidden relative">
   ```
   This is the direct parent of `PdfViewer`'s scrollable `overflow-auto` container.
   `overflow-hidden` on a parent creates a new block formatting context that clips all
   descendant overflow, completely suppressing the child's scroll capability.

2. **`CanvasPage` wrapper uses `overflow-hidden`** (confirmed, line ~566):
   ```jsx
   <div ref={wrapperRef} className="w-full rounded shadow-lg overflow-hidden" … />
   ```
   Even if the parent scroll were fixed, this would clip the canvas content itself — any pixels
   that extend beyond the wrapper div's computed height are hidden.

3. **No secondary causes**: The `PdfViewer` itself (`overflow-auto p-4 bg-gray-900 flex flex-col`)
   is correctly structured. The bug is entirely in the two `overflow-hidden` declarations above.

---

## Correctness Properties

Property 1: Bug Condition — PDF Content Is Fully Scrollable

_For any_ PDF file opened in `ViewOnlyViewer` where the rendered canvas content exceeds the
visible viewport height, the fixed component SHALL display a scrollable container that allows
the recipient to scroll vertically through all rendered pages, with no canvas content clipped
or hidden by overflow constraints.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation — Security Deterrents and Non-PDF Rendering Are Unchanged

_For any_ interaction that does NOT involve scrolling PDF pages (mouse clicks on buttons,
keyboard deterrence events, context menu suppression, image/text file rendering, blob URL
lifecycle), the fixed component SHALL produce exactly the same behavior as the original
component, preserving all security deterrents and non-PDF rendering paths.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

---

## Fix Implementation

### Changes Required

**File**: `frontend/src/components/shares/ViewOnlyViewer.jsx`

#### Change 1 — Content Area Wrapper (ViewOnlyViewer render, ~line 323)

**Current:**
```jsx
<div className="flex-1 overflow-hidden relative">
```

**Fixed:**
```jsx
<div className="flex-1 overflow-auto relative">
```

Rationale: The `PdfViewer` component already handles its own scroll with `overflow-auto`. The
parent wrapper only needs to occupy the remaining flex space (`flex-1`). Changing `overflow-hidden`
to `overflow-auto` allows the child's scroll container to work. Alternatively, `overflow-hidden`
could be removed entirely since `PdfViewer` owns the scroll, but `overflow-auto` is the minimal
targeted change that also correctly handles edge cases where `renderContent()` returns a non-PDF
viewer that itself needs to overflow.

#### Change 2 — CanvasPage Wrapper (~line 566)

**Current:**
```jsx
<div
  ref={wrapperRef}
  className="w-full rounded shadow-lg overflow-hidden"
  style={{ maxWidth: '100%' }}
/>
```

**Fixed:**
```jsx
<div
  ref={wrapperRef}
  className="w-full rounded shadow-lg"
  style={{ maxWidth: '100%' }}
/>
```

Rationale: The canvas already has `style={{ width: '100%' }}` set during rendering, so it
naturally fits its wrapper. `overflow-hidden` serves no purpose here and clips the canvas
pixel data. Removing it allows the full canvas height to be visible and included in the
document flow for scrolling.

**No other files require changes.** The fix is two targeted CSS class modifications.

---

## Testing Strategy

### Validation Approach

Testing follows a two-phase approach: first, run exploratory tests on the unfixed code to
surface counterexamples that confirm the root cause; then verify the fix and check that all
security deterrents and non-PDF paths are preserved.

---

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples demonstrating the scroll/clip bug on the UNFIXED code to
confirm the root cause before implementing the fix.

**Test Plan**: Mount `ViewOnlyViewer` with a synthetic multi-page PDF blob, simulate a scroll
event on the viewer container, and assert that the scroll position has changed. Run on unfixed
code to observe that scrollTop remains 0.

**Test Cases**:

1. **Tall Single-Page PDF**: Render a single-page PDF whose canvas height exceeds the viewport.
   Assert `scrollTop > 0` after programmatic scroll — will fail on unfixed code because the
   container is `overflow-hidden`.
2. **Multi-Page PDF Scroll**: Render a 3-page PDF. Assert that the second canvas is visible
   (i.e., not clipped) after scrolling — will fail on unfixed code.
3. **CanvasPage Clip Check**: Inspect the wrapper div's `offsetHeight` vs the canvas's
   `offsetHeight`. Assert they are equal — will fail on unfixed code because `overflow-hidden`
   clips the wrapper's reported scroll height.
4. **Horizontal Overflow**: Render a wide PDF. Assert a horizontal scrollbar is present —
   may fail on unfixed code depending on the specific layout.

**Expected Counterexamples**:
- `scrollTop` remains `0` after a programmatic scroll attempt.
- Canvas wrapper `offsetHeight` is less than the canvas's own `offsetHeight`.
- Possible causes: `overflow-hidden` on content area, `overflow-hidden` on `CanvasPage` wrapper.

---

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed component allows
full scrolling and no canvas clipping.

**Pseudocode:**
```
FOR ALL pdfFile WHERE isBugCondition(pdfFile) DO
  result := renderViewOnlyViewer_fixed(pdfFile)
  ASSERT result.scrollContainer.scrollHeight > result.scrollContainer.clientHeight
  ASSERT result.canvasWrapper.offsetHeight === result.canvas.offsetHeight
  ASSERT userCanScrollToPage(result, 2)   // for multi-page PDFs
END FOR
```

---

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (non-PDF files,
security event handling), the fixed component produces exactly the same behavior as the
original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalComponent(input) === fixedComponent(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many synthetic events and file types automatically.
- It provides strong guarantees that security deterrents are not regressed across all inputs.
- It catches edge cases (e.g., unusual MIME types, rapid open/close sequences) that manual
  tests might miss.

**Test Plan**: Confirm behavior on unfixed code first for each category, then assert the same
behavior persists on fixed code.

**Test Cases**:

1. **Context Menu Suppression**: Dispatch a `contextmenu` event on the viewer overlay and
   assert `event.defaultPrevented === true`.
2. **Ctrl+S Blocked**: Dispatch a `keydown` event with `ctrlKey + 's'` and assert
   `event.defaultPrevented === true` and `onBlockedAction` was called.
3. **Ctrl+P Blocked**: Same as above with `'p'`.
4. **Image File Rendering**: Open a JPEG blob and assert the `<img>` element is rendered with
   `draggable="false"` and no download link is present in the DOM.
5. **Text File Rendering**: Open a plain-text blob and assert the text content renders in a
   `<pre>` element with no `href` pointing to a blob URL.
6. **Blob URL Revocation**: Unmount the component and assert `URL.revokeObjectURL` was called.

---

### Unit Tests

- Test that the `PdfViewer` scroll container (`overflow-auto`) is a direct child of a container
  that does not have `overflow-hidden`.
- Test that `CanvasPage` wrapper div does not have `overflow-hidden` in its class list.
- Test `isBlockedShortcut` returns `true` for Ctrl+S, Ctrl+P, Ctrl+Shift+S and `false` for
  ordinary keys.
- Test `isPdfMime` correctly identifies `application/pdf` and rejects `image/png`.

### Property-Based Tests

- Generate random keyboard events and assert that only events matching `isBlockedShortcut`
  trigger `onBlockedAction` — verifying no regression in the deterrence logic.
- Generate PDFs with a random number of pages (1–20) and assert that after rendering, the
  scroll container's `scrollHeight` equals the sum of all canvas heights plus gaps.
- Generate random non-PDF MIME types and assert `PdfViewer` is never rendered — preserving
  the content-type dispatch logic.

### Integration Tests

- Open a real (minimal) multi-page PDF in `ViewOnlyViewer` in a browser environment and assert
  that a user scrolling to the bottom can see the last page's canvas.
- Open a view-only PDF, attempt Ctrl+S, and assert the download dialog does not appear.
- Open a view-only PDF, close the viewer, and assert no blob URLs are leaked (check
  `performance.getEntriesByType('resource')`).
