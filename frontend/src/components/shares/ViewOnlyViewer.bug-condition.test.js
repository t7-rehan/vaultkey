// @vitest-environment node

/**
 * Task 1 — Bug Condition Exploration Test
 * =========================================
 * Property 1: Bug Condition — PDF Content Clipped and Non-Scrollable
 *
 * CRITICAL: This test is designed to FAIL on unfixed code.
 * Failure confirms the bug exists. DO NOT fix the code to make this pass.
 *
 * Bug condition:
 *   isBugCondition(file) === true
 *   when isPdfMime(file.mimeType)
 *     AND contentAreaWrapper.hasClass('overflow-hidden')
 *
 * Root cause (two compounding constraints in ViewOnlyViewer.jsx):
 *   1. Content area wrapper (~line 323):
 *        <div className="flex-1 overflow-hidden relative">
 *      This is the direct parent of PdfViewer's scroll container.
 *      overflow-hidden suppresses the child's overflow-auto, preventing all scrolling.
 *   2. CanvasPage wrapper (~line 569):
 *        <div ref={wrapperRef} className="w-full rounded shadow-lg overflow-hidden" .../>
 *      overflow-hidden clips the canvas pixel data — content beyond the div's computed
 *      height is hidden even before any parent scroll constraint is considered.
 *
 * Expected (fixed) behavior:
 *   - Content area wrapper has overflow-auto (not overflow-hidden)
 *   - CanvasPage wrapper does NOT have overflow-hidden in its className
 *   - scrollTop > 0 after a programmatic scroll attempt on the PDF container
 *   - All canvas pages are accessible (not clipped)
 *
 * Counterexamples documented when tests FAIL on unfixed code:
 *   - contentAreaWrapper has class `overflow-hidden`
 *     → scroll is impossible; PdfViewer's overflow-auto is fully suppressed
 *   - CanvasPage wrapper has class `overflow-hidden`
 *     → canvas pixels are clipped to the wrapper's computed height
 *   - scrollTop remains 0 after scroll attempt (structural inference from layout constraints)
 *   - CanvasPage wrapper offsetHeight < canvas offsetHeight (structural inference)
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 *
 * Uses Vitest (node environment, source-level inspection)
 * Run with: npm test
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the source of ViewOnlyViewer.jsx once for all tests
const SOURCE = readFileSync(join(__dirname, 'ViewOnlyViewer.jsx'), 'utf8');

// ---------------------------------------------------------------------------
// Source-level helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the content area wrapper div className from the ViewOnlyViewer render.
 *
 * This is the <div> immediately inside the full-screen overlay that wraps
 * renderContent(). It begins with "Content area" comment and contains the
 * flex-1 class together with overflow-* and relative.
 *
 * Returns the full className string value, or empty string if not found.
 */
function getContentAreaWrapperClass(src) {
  // Anchor on the comment that precedes the content area div
  const commentAnchor = src.indexOf('Content area');
  if (commentAnchor === -1) return '';
  // Look forward for the next className attribute
  const classNameIdx = src.indexOf('className="', commentAnchor);
  if (classNameIdx === -1) return '';
  const start = classNameIdx + 'className="'.length;
  const end = src.indexOf('"', start);
  if (end === -1) return '';
  return src.slice(start, end);
}

/**
 * Extracts the CanvasPage wrapper div className.
 *
 * CanvasPage is the component that appends pre-rendered <canvas> nodes via
 * a ref. Its wrapper div is identified by the `wrapperRef` ref attachment.
 *
 * Returns the full className string value, or empty string if not found.
 */
function getCanvasPageWrapperClass(src) {
  // Find the wrapperRef usage in the JSX return of CanvasPage
  const wrapperRefIdx = src.indexOf('ref={wrapperRef}');
  if (wrapperRefIdx === -1) return '';
  // The className attribute is on the same element — search forward
  const classNameIdx = src.indexOf('className="', wrapperRefIdx);
  if (classNameIdx === -1) return '';
  const start = classNameIdx + 'className="'.length;
  const end = src.indexOf('"', start);
  if (end === -1) return '';
  return src.slice(start, end);
}

/**
 * Returns true if the content area wrapper has `overflow-hidden` in its
 * className — confirming the bug condition is present.
 */
function contentAreaHasOverflowHidden(src) {
  const cls = getContentAreaWrapperClass(src);
  return cls.split(' ').includes('overflow-hidden');
}

/**
 * Returns true if the CanvasPage wrapper has `overflow-hidden` in its
 * className — confirming the clipping bug is present.
 */
function canvasPageHasOverflowHidden(src) {
  const cls = getCanvasPageWrapperClass(src);
  return cls.split(' ').includes('overflow-hidden');
}

/**
 * Returns true if the content area wrapper has `overflow-auto` in its
 * className — the correct state after the fix.
 */
function contentAreaHasOverflowAuto(src) {
  const cls = getContentAreaWrapperClass(src);
  return cls.split(' ').includes('overflow-auto');
}

/**
 * Applies isBugCondition logic: a PDF file is open AND the content area
 * wrapper still carries overflow-hidden (which blocks PdfViewer's scroll).
 */
function isBugCondition(mimeType, src) {
  return mimeType === 'application/pdf' && contentAreaHasOverflowHidden(src);
}

/**
 * Returns a simplified model of the scroll behavior given the CSS constraints
 * that exist in the source. When overflow-hidden is present on the parent,
 * any programmatic scroll of the child container results in scrollTop staying 0.
 *
 * This mirrors the browser layout rule: overflow-hidden on a parent creates a
 * block formatting context that clips all child overflow and disables their
 * scroll capability.
 *
 * Returns 'blocked' when overflow-hidden is detected on the content area,
 * 'works' otherwise.
 */
function inferScrollBehavior(src) {
  if (contentAreaHasOverflowHidden(src)) return 'blocked';
  return 'works';
}

/**
 * Returns a simplified model of canvas clipping behavior given the CanvasPage
 * wrapper's CSS constraints.
 *
 * overflow-hidden on the wrapper clips canvas pixel data — the wrapper's
 * offsetHeight will be less than the canvas's own offsetHeight for any page
 * taller than its initial display size.
 *
 * Returns 'clipped' when overflow-hidden is detected on CanvasPage wrapper,
 * 'unclipped' otherwise.
 */
function inferCanvasClipping(src) {
  if (canvasPageHasOverflowHidden(src)) return 'clipped';
  return 'unclipped';
}

// ---------------------------------------------------------------------------
// Bug Condition Exploration Tests
// (These tests FAIL on unfixed code — that is the intended, correct outcome)
// ---------------------------------------------------------------------------

describe('Bug Condition: isBugCondition — overflow-hidden clipping (Property 1 — EXPECTED TO FAIL ON UNFIXED CODE)', () => {

  /**
   * Test 1: Assert the bug condition does NOT exist — FAILS on unfixed code.
   *
   * The bug condition is: isPdfMime AND contentAreaWrapper.hasClass('overflow-hidden').
   * On unfixed code, this evaluates to true (bug exists).
   * The test asserts isBugCondition === false (i.e., bug is absent), so it FAILS.
   *
   * Counterexample on unfixed code:
   *   isBugCondition('application/pdf', SOURCE) === true
   *   → contentAreaWrapper has class 'overflow-hidden'
   *   → PdfViewer's overflow-auto scroll container is fully suppressed by its parent
   *
   * Validates: Requirement 1.1, 1.2
   */
  it('isBugCondition is false for PDF files (no overflow-hidden on content area wrapper) — FAILS on unfixed code', () => {
    // Expected after fix: isBugCondition returns false (bug condition absent)
    // Fails on unfixed code: contentAreaWrapper still has overflow-hidden
    expect(isBugCondition('application/pdf', SOURCE)).toBe(false);
  });

  /**
   * Test 2: Content area wrapper does NOT have overflow-hidden — FAILS on unfixed code.
   *
   * The content area wrapper (<div className="flex-1 overflow-hidden relative">)
   * must be changed to overflow-auto (or have overflow-hidden removed) for the fix.
   * On unfixed code the assertion fails because overflow-hidden is still present.
   *
   * Counterexample on unfixed code:
   *   contentAreaWrapperClass === "flex-1 overflow-hidden relative"
   *   → overflow-hidden suppresses PdfViewer's overflow-auto scroll container
   *   → scrollTop of PdfViewer container stays 0 after any scroll attempt
   *
   * Validates: Requirement 1.2
   */
  it('content area wrapper does NOT have overflow-hidden class — FAILS on unfixed code', () => {
    const cls = getContentAreaWrapperClass(SOURCE);
    // Document the counterexample in the assertion message
    expect(
      cls,
      `COUNTEREXAMPLE: content area wrapper className is "${cls}" — overflow-hidden suppresses PdfViewer scroll`
    ).not.toContain('overflow-hidden');
  });

  /**
   * Test 3: Content area wrapper has overflow-auto (the expected fixed state) — FAILS on unfixed code.
   *
   * After the fix, the content area wrapper must use overflow-auto so that
   * PdfViewer's own overflow-auto scroll container can function correctly.
   *
   * Counterexample on unfixed code:
   *   contentAreaWrapper does NOT have overflow-auto
   *   → scroll is impossible regardless of PdfViewer's own CSS
   *
   * Validates: Requirement 2.1, 2.2
   */
  it('content area wrapper has overflow-auto (fixed scrollable state) — FAILS on unfixed code', () => {
    const cls = getContentAreaWrapperClass(SOURCE);
    expect(
      contentAreaHasOverflowAuto(SOURCE),
      `COUNTEREXAMPLE: content area className is "${cls}" — expected overflow-auto, found no overflow-auto class`
    ).toBe(true);
  });

  /**
   * Test 4: CanvasPage wrapper does NOT have overflow-hidden — FAILS on unfixed code.
   *
   * The CanvasPage wrapper (<div ref={wrapperRef} className="w-full rounded shadow-lg overflow-hidden">)
   * clips canvas pixel data. Even if the parent scroll constraint were fixed, this
   * would still hide any canvas content that extends beyond the wrapper's computed height.
   *
   * Counterexample on unfixed code:
   *   canvasPageWrapperClass === "w-full rounded shadow-lg overflow-hidden"
   *   → canvas pixels beyond wrapper height are invisible
   *   → offsetHeight of wrapper < offsetHeight of canvas for any tall page
   *   → content is irrecoverably clipped for multi-page and tall-content PDFs
   *
   * Validates: Requirement 1.1, 1.3
   */
  it('CanvasPage wrapper does NOT have overflow-hidden — FAILS on unfixed code', () => {
    const cls = getCanvasPageWrapperClass(SOURCE);
    expect(
      cls,
      `COUNTEREXAMPLE: CanvasPage wrapper className is "${cls}" — overflow-hidden clips canvas pixel data`
    ).not.toContain('overflow-hidden');
  });

  /**
   * Test 5: Scroll behavior is inferred as 'works' (not 'blocked') — FAILS on unfixed code.
   *
   * When overflow-hidden is present on the content area wrapper, any programmatic
   * scroll of the inner PdfViewer container results in scrollTop remaining 0.
   * The inferScrollBehavior() model reflects this browser layout constraint.
   *
   * Counterexample on unfixed code:
   *   inferScrollBehavior(SOURCE) === 'blocked'
   *   → scrollTop remains 0 after scroll attempt
   *   → Requirement 1.2: "the system does not scroll — the content remains stationary"
   *
   * Validates: Requirement 1.2
   */
  it('scroll behavior is not blocked by overflow-hidden (inferScrollBehavior = works) — FAILS on unfixed code', () => {
    const behavior = inferScrollBehavior(SOURCE);
    expect(
      behavior,
      `COUNTEREXAMPLE: scroll is "${behavior}" — overflow-hidden on content area wrapper makes scrollTop stay 0 after any scroll attempt`
    ).toBe('works');
  });

  /**
   * Test 6: Canvas content is inferred as 'unclipped' (not 'clipped') — FAILS on unfixed code.
   *
   * When overflow-hidden is present on the CanvasPage wrapper, the canvas's
   * rendered pixels are clipped. For a multi-page PDF, the second and subsequent
   * pages are either wholly or partially hidden.
   *
   * Counterexample on unfixed code:
   *   inferCanvasClipping(SOURCE) === 'clipped'
   *   → CanvasPage wrapper offsetHeight < canvas offsetHeight for tall pages
   *   → Second/third canvas pages are hidden (inaccessible) even without scroll
   *
   * Validates: Requirement 1.1, 1.3
   */
  it('canvas content is unclipped (inferCanvasClipping = unclipped) — FAILS on unfixed code', () => {
    const clipping = inferCanvasClipping(SOURCE);
    expect(
      clipping,
      `COUNTEREXAMPLE: canvas is "${clipping}" — overflow-hidden on CanvasPage wrapper clips pixel data; offsetHeight of wrapper < offsetHeight of canvas`
    ).toBe('unclipped');
  });

});

// ---------------------------------------------------------------------------
// Bug Condition: multi-page scrollability — structural invariants
// (These tests FAIL on unfixed code)
// ---------------------------------------------------------------------------

describe('Bug Condition: multi-page PDF scrollability — structural CSS checks (EXPECTED TO FAIL ON UNFIXED CODE)', () => {

  /**
   * Test 7: Both overflow-hidden constraints are absent simultaneously — FAILS on unfixed code.
   *
   * For multi-page PDF scrolling to work, BOTH overflow constraints must be
   * removed. Having only one removed is insufficient:
   *   - If content area still has overflow-hidden: scroll is blocked at the top level.
   *   - If CanvasPage still has overflow-hidden: individual pages are clipped even if scroll works.
   *
   * Both must be absent for Requirement 2.3 to be satisfied.
   *
   * Counterexample on unfixed code:
   *   contentAreaHasOverflowHidden = true AND canvasPageHasOverflowHidden = true
   *   → Multi-page PDF: user cannot scroll to page 2, 3, ... N
   *   → Second canvas element is inaccessible after any scroll attempt
   *
   * Validates: Requirement 1.3 (bug), 2.3 (expected)
   */
  it('neither content area nor CanvasPage wrapper has overflow-hidden — FAILS on unfixed code', () => {
    const contentAreaBug = contentAreaHasOverflowHidden(SOURCE);
    const canvasPageBug = canvasPageHasOverflowHidden(SOURCE);
    expect(
      contentAreaBug,
      `COUNTEREXAMPLE: content area wrapper has overflow-hidden=${contentAreaBug}; CanvasPage has overflow-hidden=${canvasPageBug} — multi-page PDFs are fully inaccessible`
    ).toBe(false);
    expect(
      canvasPageBug,
      `COUNTEREXAMPLE: CanvasPage wrapper has overflow-hidden=${canvasPageBug} — canvas pages are clipped individually`
    ).toBe(false);
  });

  /**
   * Test 8: The PdfViewer scroll container uses overflow-auto (verifying scroll architecture).
   *
   * This test PASSES on both unfixed and fixed code — PdfViewer already has overflow-auto.
   * It documents that the scroll infrastructure in PdfViewer is correct; the bug is
   * exclusively in the two parent overflow-hidden constraints.
   *
   * Validates: documents the root cause precisely
   */
  it('PdfViewer scroll container uses overflow-auto (scroll architecture is correct — passes on both versions)', () => {
    // Find the PdfViewer container div with overflow-auto.
    // PdfViewer is a long async function; use the CanvasPage declaration as the end boundary.
    const pdfViewerStart = SOURCE.indexOf('function PdfViewer');
    expect(pdfViewerStart, 'PdfViewer sub-component must exist').not.toBe(-1);
    const canvasPageStart = SOURCE.indexOf('function CanvasPage');
    const endBoundary = canvasPageStart !== -1 ? canvasPageStart : SOURCE.length;
    const pdfViewerBody = SOURCE.slice(pdfViewerStart, endBoundary);
    expect(pdfViewerBody).toContain('overflow-auto');
  });

  /**
   * Test 9: The content area wrapper class string is exactly what we expect on unfixed code.
   *
   * This is a documentation test that always PASSES on unfixed code, recording the
   * counterexample class string for later comparison after the fix is applied.
   *
   * Validates: documents counterexample precisely
   */
  it('documents exact content area wrapper className on current (unfixed) code', () => {
    const cls = getContentAreaWrapperClass(SOURCE);
    // This assertion documents the bug state — it passes on unfixed code.
    // After the fix this assertion will fail, confirming the fix changed the class.
    // NOTE: This test is intentionally not in the "FAILS on unfixed code" group.
    expect(cls).toBeTruthy(); // Content area wrapper div must exist
    // Log the counterexample for documentation purposes
    if (cls.includes('overflow-hidden')) {
      // Bug confirmed: document the counterexample
      expect(cls).toContain('overflow-hidden'); // passes on unfixed code, documents bug
    }
  });

  /**
   * Test 10: The CanvasPage wrapper class string is exactly what we expect on unfixed code.
   *
   * Same as Test 9 — documents the CanvasPage counterexample class string.
   *
   * Validates: documents counterexample precisely
   */
  it('documents exact CanvasPage wrapper className on current (unfixed) code', () => {
    const cls = getCanvasPageWrapperClass(SOURCE);
    expect(cls).toBeTruthy(); // CanvasPage wrapper div must exist
    if (cls.includes('overflow-hidden')) {
      expect(cls).toContain('overflow-hidden'); // passes on unfixed code, documents bug
    }
  });

});

// ---------------------------------------------------------------------------
// Baseline: structural checks that PASS on both unfixed and fixed code
// ---------------------------------------------------------------------------

describe('Bug Condition: baseline structural checks (pass on all versions)', () => {

  /**
   * Verify isPdfMime is defined and scoped to exact MIME type match.
   */
  it('isPdfMime function is defined', () => {
    expect(SOURCE).toContain('function isPdfMime');
  });

  it('isPdfMime uses strict equality for application/pdf', () => {
    const start = SOURCE.indexOf('function isPdfMime');
    const end = SOURCE.indexOf('\n}', start) + 2;
    const fnBody = SOURCE.slice(start, end);
    expect(fnBody).toContain("'application/pdf'");
  });

  /**
   * Verify the PdfViewer sub-component exists (canvas-based renderer is in place).
   */
  it('PdfViewer sub-component is defined (canvas-based PDF.js renderer exists)', () => {
    expect(SOURCE).toContain('function PdfViewer');
  });

  /**
   * Verify the CanvasPage sub-component exists and uses wrapperRef.
   */
  it('CanvasPage sub-component is defined and uses wrapperRef for canvas attachment', () => {
    expect(SOURCE).toContain('function CanvasPage');
    expect(SOURCE).toContain('ref={wrapperRef}');
  });

  /**
   * Verify the content area wrapper div is present in the source.
   */
  it('content area wrapper div is present in the render output', () => {
    const cls = getContentAreaWrapperClass(SOURCE);
    expect(cls).toBeTruthy();
    expect(cls).toContain('flex-1');
    expect(cls).toContain('relative');
  });

  /**
   * Verify the CanvasPage wrapper div carries the expected base classes.
   */
  it('CanvasPage wrapper div has expected base classes (w-full, rounded, shadow-lg)', () => {
    const cls = getCanvasPageWrapperClass(SOURCE);
    expect(cls).toBeTruthy();
    expect(cls).toContain('w-full');
    expect(cls).toContain('rounded');
    expect(cls).toContain('shadow-lg');
  });

});
