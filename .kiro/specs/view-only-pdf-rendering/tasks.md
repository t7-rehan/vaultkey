# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - PDF Blob Loads Into iframe Instead of Rendering
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate that `ViewOnlyViewer` uses an `<iframe>` for PDF rendering, producing no visible canvas output
  - **Scoped PBT Approach**: Scope the property to the concrete failing case — any `decryptedBlob` with `mimeType="application/pdf"` — since the failure is deterministic (iframe always fails for blob-URL-sourced PDFs)
  - Mount `ViewOnlyViewer` with a minimal valid PDF blob and `mimeType="application/pdf"`
  - Assert that the rendered DOM does NOT contain a `<canvas>` element (which is what the fixed code should produce)
  - Assert that the rendered DOM DOES contain an `<iframe>` whose `src` starts with `blob:` (confirming the broken rendering path)
  - Assert that no user-readable error message is shown despite the rendering failure (confirming requirement 1.3 — silent failure)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS — the iframe exists, there is no canvas, and no error is shown (this is correct — it proves the bug exists)
  - Document counterexamples found, e.g., "ViewOnlyViewer with mimeType='application/pdf' renders `<iframe src='blob:...'>` with no canvas, and shows no error message"
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-PDF Rendering Paths Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: `ViewOnlyViewer` with `mimeType="image/png"` renders `<img>` on unfixed code
  - Observe: `ViewOnlyViewer` with `mimeType="text/plain"` renders `<pre>` via `TextViewer` on unfixed code
  - Observe: `ViewOnlyViewer` with `mimeType="application/json"` renders `<pre>` via `TextViewer` on unfixed code
  - Observe: `ViewOnlyViewer` with `mimeType="application/zip"` renders the "Inline preview not available" fallback card on unfixed code
  - Write property-based tests: for all non-PDF MIME types (image/*, text/*, application/json, application/javascript, other binaries), assert `renderContent()` produces no `<canvas>` and the correct renderer element (`<img>`, `<pre>`, or fallback card)
  - Write property-based test: for a randomly sampled set of non-PDF MIME type strings, assert the correct renderer is selected and no iframe is rendered
  - Verify all preservation tests PASS on UNFIXED code (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7_

- [x] 3. Fix: Replace iframe PDF rendering with PDF.js canvas renderer

  - [x] 3.1 Add `pdfjs-dist` dependency to `frontend/package.json`
    - Add `"pdfjs-dist": "^3.11.174"` to the `dependencies` section
    - Run `npm install` inside `frontend/` to lock the version
    - _Bug_Condition: isBugCondition(input) where input.mimeType === 'application/pdf' AND decryptedBlob is non-null AND renderContent() returns `<iframe src={blobUrl}>`_
    - _Expected_Behavior: After fix, renderContent() for application/pdf returns `<PdfViewer decryptedBlob={decryptedBlob} />` which renders `<canvas>` elements via PDF.js_
    - _Requirements: 2.2_

  - [x] 3.2 Introduce `PdfViewer` sub-component in `ViewOnlyViewer.jsx`
    - Add `PdfViewer` as a new function component (analogous to `TextViewer`) at the bottom of the file
    - Accept `decryptedBlob` and `filename` as props — do NOT pass a blob URL to avoid the iframe URL pattern
    - In a `useEffect`, call `decryptedBlob.arrayBuffer()` to get the raw bytes, then call `pdfjsLib.getDocument({ data: arrayBuffer })` to load the PDF document
    - Iterate over all pages with `pdfDoc.numPages`, rendering each onto a `<canvas>` element via `page.render({ canvasContext, viewport })`
    - Show an amber spinner (consistent with `TextViewer` loading state) while `getDocument` is in progress
    - Show a user-readable error message (e.g., "This PDF could not be displayed in your browser.") if `getDocument` or any `page.render` rejects
    - Configure `pdfjsLib.GlobalWorkerOptions.workerSrc` at module level using the `pdfjs-dist` bundled worker
    - _Bug_Condition: isBugCondition(input) where input.mimeType === 'application/pdf' AND decryptedBlob is non-null_
    - _Expected_Behavior: PdfViewer renders `<canvas>` elements with non-zero pixel dimensions for each PDF page; shows loading state before resolution; shows error message on parse failure_
    - _Preservation: All inputs where mimeType !== 'application/pdf' do not enter PdfViewer and are completely unaffected_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Replace the iframe branch in `renderContent()` with `<PdfViewer>`
    - Remove the entire `isPdfMime(mimeType)` return block that renders `<iframe src={blobUrl}...>`
    - Replace it with `return <PdfViewer decryptedBlob={decryptedBlob} filename={filename} />;`
    - The `blobUrlRef` and blob URL lifecycle (create on mount, revoke on close/unmount) remain unchanged — the blob URL is still used by the image and text paths
    - _Bug_Condition: isBugCondition(input) where renderContent() previously returned `<iframe src={blobUrl}>`_
    - _Expected_Behavior: renderContent() now returns `<PdfViewer decryptedBlob={decryptedBlob} filename={filename} />` for application/pdf_
    - _Preservation: image/*, text/*, and fallback branches in renderContent() are completely untouched_
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.7_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - PDF Blob Renders Visibly via Canvas
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 asserts: no `<iframe>`, canvas elements present, no silent blank state
    - When this test passes, it confirms the expected behavior is satisfied (requirement 2.1, 2.2)
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-PDF Rendering Paths Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run all preservation property tests from step 2
    - **EXPECTED OUTCOME**: All tests PASS (confirms no regressions in image, text, fallback, deterrent, and blob URL revocation paths)
    - Confirm all non-PDF rendering paths, keyboard deterrents, and blob URL lifecycle are unaffected

- [x] 4. Checkpoint — Ensure all tests pass
  - Run the full frontend test suite: `npm test` (or `vitest run`) inside `frontend/`
  - Ensure task 1 exploration test passes (bug is fixed)
  - Ensure task 2 preservation tests all pass (no regressions)
  - Ensure any existing tests in the project still pass
  - Ask the user if any questions arise
