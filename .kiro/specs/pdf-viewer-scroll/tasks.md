# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - PDF Content Clipped and Non-Scrollable
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the overflow-hidden clipping bug exists
  - **Scoped PBT Approach**: Scope the property to the concrete failing case — a PDF file opened in ViewOnlyViewer where the content area wrapper has `overflow-hidden` and/or the CanvasPage wrapper has `overflow-hidden`
  - Write tests in `frontend/src/components/shares/ViewOnlyViewer.bug-condition.test.js`
  - Test that `isBugCondition(file)` is true: `isPdfMime(file.mimeType) AND contentAreaWrapper.hasClass('overflow-hidden')`
  - Mount `ViewOnlyViewer` with a synthetic multi-page PDF blob; assert the content area wrapper does NOT have `overflow-hidden` (from Bug Condition in design)
  - Mount `ViewOnlyViewer` and inspect the `CanvasPage` wrapper div; assert it does NOT have `overflow-hidden` in its class list
  - Simulate a programmatic scroll on the viewer container; assert `scrollTop > 0` after the attempt (confirms scroll works)
  - For multi-page PDFs: assert the second canvas element is accessible (not clipped) after scrolling
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves the overflow-hidden constraints suppress scrolling and clip canvas content)
  - Document counterexamples found: e.g., "contentAreaWrapper has class `overflow-hidden`", "`scrollTop` remains `0` after scroll attempt", "CanvasPage wrapper `offsetHeight` < canvas `offsetHeight`"
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Security Deterrents and Non-PDF Rendering Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Write tests in `frontend/src/components/shares/ViewOnlyViewer.preservation.test.js`
  - Observe on UNFIXED code: dispatching a `contextmenu` event on the viewer overlay results in `event.defaultPrevented === true`
  - Observe on UNFIXED code: dispatching `keydown` with `ctrlKey + 's'` results in `event.defaultPrevented === true` and `onBlockedAction` is called
  - Observe on UNFIXED code: dispatching `keydown` with `ctrlKey + 'p'` results in `event.defaultPrevented === true`
  - Observe on UNFIXED code: opening a JPEG blob renders an `<img>` with `draggable="false"` and no download link in the DOM
  - Observe on UNFIXED code: opening a plain-text blob renders content in a `<pre>` element with no exposed blob URL href
  - Observe on UNFIXED code: unmounting the component causes `URL.revokeObjectURL` to be called
  - Write property-based tests capturing all observed behaviors (from Preservation Requirements in design): generate random keyboard events and assert only `isBlockedShortcut` events trigger `onBlockedAction`; generate random non-PDF MIME types and assert `PdfViewer` is never rendered
  - Verify all preservation tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the security and non-PDF baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for PDF viewer scroll clipping bug

  - [x] 3.1 Implement the fix in ViewOnlyViewer.jsx
    - **File**: `frontend/src/components/shares/ViewOnlyViewer.jsx`
    - **Change 1** — Content area wrapper (~line 323): change `overflow-hidden` → `overflow-auto` in `<div className="flex-1 overflow-hidden relative">`
    - **Change 2** — CanvasPage wrapper (~line 566): remove `overflow-hidden` from `<div ref={wrapperRef} className="w-full rounded shadow-lg overflow-hidden" …>`
    - No other files require changes — the fix is two targeted CSS class modifications only
    - Do not touch any rendering logic, security event handlers, blob URL lifecycle, or other utility functions
    - _Bug_Condition: isBugCondition(file) where isPdfMime(file.mimeType) AND contentAreaWrapper.hasClass('overflow-hidden')_
    - _Expected_Behavior: scrollContainer.scrollHeight > scrollContainer.clientHeight AND canvasWrapper.offsetHeight === canvas.offsetHeight AND userCanScrollToPage(result, 2) for multi-page PDFs_
    - _Preservation: context menu suppression, Ctrl+S/Ctrl+P blocking, image/text rendering, blob URL revocation, and watermark display all remain unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - PDF Content Is Fully Scrollable
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - The tests from task 1 encode the expected behavior (no `overflow-hidden` on content area wrapper, no `overflow-hidden` on CanvasPage wrapper, `scrollTop > 0` after scroll, all pages accessible)
    - When these tests pass, it confirms the `overflow-hidden` constraints have been removed and scrolling is functional
    - Run bug condition exploration tests from step 1
    - **EXPECTED OUTCOME**: Tests PASS (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Security Deterrents and Non-PDF Rendering Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in security deterrents, non-PDF rendering, or blob URL lifecycle)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite for `ViewOnlyViewer` and confirm both the bug condition test and the preservation tests pass
  - Ensure all tests pass; ask the user if any questions arise
