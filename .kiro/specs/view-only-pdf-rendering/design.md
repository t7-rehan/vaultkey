# View-Only PDF Rendering Bugfix Design

## Overview

PDF files in view-only shares display a blank iframe instead of actual content. The root cause is that `ViewOnlyViewer.jsx` creates a blob URL from the decrypted PDF and loads it into an `<iframe>`, a pattern that modern browsers block due to Content-Security-Policy enforcement and native restrictions on blob-URL-sourced PDF rendering in sandboxed iframes.

The fix replaces the iframe path with a PDF.js canvas-based renderer (`pdfjs-dist`). PDF.js reads the decrypted blob's `ArrayBuffer` directly via its document-loading API — no blob URL iframe required — and renders each page onto a `<canvas>` element. This approach is browser-native, CSP-safe, and consistent with how the existing `TextViewer` sub-component already fetches content directly from the blob rather than pointing an element at a URL.

All other rendering paths (image, text, unsupported fallback), all view-only deterrents (keyboard blocking, print suppression, right-click suppression, blob URL revocation), and the backend access flow remain completely unchanged.

---

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — `ViewOnlyViewer` receives a blob whose MIME type is `application/pdf` and attempts to render it via `<iframe src={blobUrl}>`.
- **Property (P)**: The desired behavior when the bug condition holds — the PDF SHALL be rendered visibly using a canvas-based PDF.js renderer.
- **Preservation**: All rendering paths, deterrents, and backend integrations that must remain identical after the fix.
- **`isPdfMime(mime)`**: The predicate in `ViewOnlyViewer.jsx` that returns `true` when `mime === 'application/pdf'`, gating the iframe branch.
- **`renderContent()`**: The function inside `ViewOnlyViewer` that dispatches to the correct renderer based on MIME type.
- **`PdfViewer`**: The new sub-component to be introduced, analogous to the existing `TextViewer`, responsible for PDF.js-based canvas rendering.
- **`pdfjs-dist`**: The Mozilla PDF.js npm package providing `getDocument()` and `PDFDocumentProxy` for in-browser PDF rendering onto canvas.
- **`blobUrlRef`**: The React ref that holds the single blob URL created from the decrypted content; used by image and (currently) PDF paths.

---

## Bug Details

### Bug Condition

The bug manifests when `ViewOnlyViewer` receives a `decryptedBlob` with MIME type `application/pdf`. The `renderContent()` function enters the `isPdfMime` branch and returns an `<iframe>` whose `src` is a `blob:` URL. Modern Chromium, Firefox, and Safari builds refuse to load blob-URL-sourced PDFs inside iframes due to CSP frame-src restrictions and browser-internal sandboxing for PDF plugins. The result is a blank/empty frame with no error surfaced to the user.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = { decryptedBlob: Blob, mimeType: string }
  OUTPUT: boolean

  RETURN input.mimeType === 'application/pdf'
         AND decryptedBlob is non-null
         AND renderContent() returns <iframe src={blobUrl}>
         AND iframe displays no PDF content in the browser
END FUNCTION
```

### Examples

- **Chromium 120+**: `<iframe src="blob:http://localhost/...">` — frame renders white/blank; browser console may log a CSP or process-isolation error.
- **Firefox 121+**: Blob-URL iframe for PDF silently fails; no content displayed, no user-visible error.
- **Safari 17+**: Same blank-frame behavior; Safari's PDF plugin does not load inside sandboxed blob-URL iframes.
- **Edge case — PDF blob, rendering error**: PDF.js itself fails to parse the blob (corrupted PDF); must show a user-readable error rather than a blank state.

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Image files (`image/*`) MUST continue to render via the `<img>` element path, with `pointerEvents: none` and `draggable={false}`.
- Text/code/JSON files MUST continue to render via `TextViewer` (fetch from blob URL → `<pre>` display).
- Unsupported/binary file types MUST continue to show the "Inline preview not available" fallback card with the `ShieldAlert` icon.
- All keyboard deterrents (Ctrl/Cmd+S, Ctrl/Cmd+P, Ctrl/Cmd+U, F12, Shift+I/J/C) MUST continue to fire and call `onBlockedAction`.
- `window.print` patching MUST remain in place for the lifetime of the viewer.
- Right-click suppression (`contextmenu` event) MUST remain active on the whole viewer.
- Blob URL creation and revocation lifecycle (create once on mount via `blobUrlRef`, revoke on `handleClose` and on unmount) MUST be unchanged.
- The visual header bar, watermark, and footer disclaimer MUST remain unchanged.

**Scope:**
All inputs where `mimeType !== 'application/pdf'` are completely unaffected. The fix is isolated to the `isPdfMime(mimeType)` branch inside `renderContent()` and the introduction of a new `PdfViewer` sub-component.

---

## Hypothesized Root Cause

Based on the bug description and code analysis:

1. **Blob URL iframe blocked by browser security policy**: Browsers implement `frame-src` CSP rules and process-isolation for PDF rendering. A `blob:` URL pointing to PDF data is treated as cross-origin in sandboxed contexts and the browser's built-in PDF renderer refuses to activate. This is the primary cause.

2. **No error surfacing**: The current code has no `onError` or `onLoad` fallback on the `<iframe>`. Even if the iframe fails silently, the user receives no feedback — compounding the UX impact of the underlying rendering failure.

3. **`#toolbar=0&navpanes=0` hint only works for direct navigation**: The `#toolbar=0` fragment hint to suppress the PDF toolbar is only respected by the browser when the PDF is loaded as a top-level navigation target, not when embedded via a blob URL iframe in this context.

4. **No PDF.js fallback**: The codebase has no existing canvas-based PDF renderer. Introducing `pdfjs-dist` is a new dependency but it is the standard, CSP-safe, cross-browser solution used by most web applications for in-browser PDF display.

---

## Correctness Properties

Property 1: Bug Condition - PDF Blob Renders Visibly via Canvas

_For any_ input where the bug condition holds (`mimeType === 'application/pdf'` and `decryptedBlob` is non-null), the fixed `renderContent()` function SHALL render at least page 1 of the PDF onto a visible `<canvas>` element using PDF.js, producing non-blank visual output that matches the PDF content.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Non-PDF Rendering Paths Unchanged

_For any_ input where the bug condition does NOT hold (`mimeType !== 'application/pdf'`), the fixed `renderContent()` function SHALL produce exactly the same rendered output as the original function — `<img>` for images, `TextViewer` for text types, and the fallback card for all other types — preserving all existing rendering behavior.

**Validates: Requirements 3.1, 3.2, 3.3**

---

## Fix Implementation

### Changes Required

**File**: `frontend/src/components/shares/ViewOnlyViewer.jsx`

**Function**: `renderContent()` — `isPdfMime` branch

**Specific Changes:**

1. **Remove iframe branch**: Delete the `isPdfMime(mimeType)` return block that renders `<iframe src={blobUrl}...>`.

2. **Add `PdfViewer` sub-component**: Introduce a new `PdfViewer` React component (analogous to `TextViewer`) that:
   - Accepts `decryptedBlob` as a prop (not a blob URL, avoiding the iframe URL pattern).
   - Converts the blob to `ArrayBuffer` via `blob.arrayBuffer()` in a `useEffect`.
   - Calls `pdfjsLib.getDocument({ data: arrayBuffer })` to load the PDF.
   - Iterates over all pages, rendering each onto a `<canvas>` element via `page.render({ canvasContext, viewport })`.
   - Shows a loading spinner while pages render.
   - Shows a user-readable error message if `getDocument` or `page.render` rejects.

3. **Update `renderContent()` to use `PdfViewer`**: Replace the iframe JSX with `<PdfViewer decryptedBlob={decryptedBlob} filename={filename} />`.

4. **Pass `decryptedBlob` instead of `blobUrl` to `PdfViewer`**: The `PdfViewer` reads the `ArrayBuffer` directly from the blob — no blob URL is needed for PDF rendering, eliminating the iframe URL-loading pattern entirely.

5. **Configure PDF.js worker**: Set `pdfjsLib.GlobalWorkerOptions.workerSrc` to the bundled worker path from `pdfjs-dist/build/pdf.worker.min.js` (or use the CDN path as a fallback). This must be done once at module level or inside the component.

**File**: `frontend/package.json`

6. **Add `pdfjs-dist` dependency**: Add `"pdfjs-dist": "^3.11.174"` (or latest stable 3.x compatible with the Vite/ES-module setup) to `dependencies`.

---

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first surface counterexamples that demonstrate the bug on unfixed code, then verify the fix renders PDF content correctly and leaves all non-PDF paths untouched.

### Exploratory Bug Condition Checking

**Goal**: Confirm the bug before implementing the fix. Demonstrate that the current iframe approach produces no visible PDF output, and identify the exact failure mode (blank iframe, CSP error, etc.).

**Test Plan**: Mount `ViewOnlyViewer` with a minimal valid PDF blob and `mimeType="application/pdf"`. Assert that the rendered DOM contains an `<iframe>` element but does NOT contain visible canvas or text content. Observe console errors for CSP or blob-URL rejections. Run these tests on the UNFIXED code.

**Test Cases:**
1. **Blank iframe test**: Mount `ViewOnlyViewer` with a real 1-page PDF blob and `mimeType="application/pdf"`. Assert the iframe is present in the DOM and its `src` starts with `blob:`. Observe that no PDF text/content is accessible via the rendered DOM (will confirm the blob URL iframe failure mode).
2. **No error message test**: Assert that no error UI (e.g. "could not be displayed") is shown — confirming the silent failure described in requirement 1.3.
3. **Other MIME types unaffected baseline**: Mount with `mimeType="image/png"` and assert `<img>` is rendered — establishing the baseline for preservation tests.

**Expected Counterexamples:**
- The `<iframe>` exists in the DOM but displays no PDF content.
- No user-visible error message is shown despite the rendering failure.
- Possible causes: blob-URL CSP block, browser sandbox restriction, missing PDF plugin in iframe context.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed component renders PDF content via canvas.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := render ViewOnlyViewer_fixed(input)
  ASSERT result contains <canvas> elements
  ASSERT result does NOT contain <iframe>
  ASSERT canvas has non-zero pixel dimensions
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed component renders identically to the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT ViewOnlyViewer_original(input) DOM = ViewOnlyViewer_fixed(input) DOM
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates varied MIME types, blob sizes, and filename strings automatically.
- It catches regressions in the MIME-type dispatch logic that unit tests with hardcoded inputs might miss.
- It provides strong guarantees that the `isPdfMime` branch change does not bleed into other branches.

**Test Plan**: Observe that image/text/fallback renderers work correctly on unfixed code, then write property-based tests that randomly sample non-PDF MIME types and assert the correct renderer is used.

**Test Cases:**
1. **Image preservation**: Verify `mimeType="image/png"` still renders `<img>`, not `<canvas>` or `<iframe>`.
2. **Text preservation**: Verify `mimeType="text/plain"` still renders `TextViewer` (contains `<pre>`).
3. **JSON preservation**: Verify `mimeType="application/json"` renders `TextViewer` with JSON formatting.
4. **Fallback preservation**: Verify `mimeType="application/zip"` still renders the "Inline preview not available" card.
5. **Deterrents preservation**: Verify `keydown` event listener is still attached and `onBlockedAction` is called for Ctrl+S regardless of MIME type.
6. **Blob URL revocation preservation**: Verify `URL.revokeObjectURL` is called on close for all MIME types.

### Unit Tests

- Test `isPdfMime` predicate returns true only for `application/pdf`.
- Test `PdfViewer` renders `<canvas>` elements for a valid minimal PDF ArrayBuffer.
- Test `PdfViewer` renders an error message when given a malformed/empty ArrayBuffer.
- Test `PdfViewer` shows a loading state before the PDF.js `getDocument` promise resolves.

### Property-Based Tests

- Generate random non-PDF MIME type strings and assert `renderContent()` never returns a `<canvas>` element.
- Generate random valid MIME types and assert the correct renderer is selected (image → `<img>`, text types → `<pre>`, pdf → `<canvas>`, other → fallback card).
- Generate random blob sizes and assert `PdfViewer` handles both small (single page) and large (multi-page) PDFs without crashing.

### Integration Tests

- Test full view-only flow: open a share link for a PDF → viewer mounts → PDF pages render on canvas.
- Test keyboard deterrents (Ctrl+S, Ctrl+P) fire `onBlockedAction` while the PDF is being rendered.
- Test closing the viewer while PDF is mid-render cancels the render and revokes the blob URL.
- Test that switching between a PDF share and an image share renders the correct viewer each time.
