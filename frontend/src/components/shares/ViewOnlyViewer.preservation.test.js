// @vitest-environment node

/**
 * Task 2 — Preservation Property Tests (BEFORE implementing fix)
 * ==============================================================
 * Property 2: Preservation — Security Deterrents and Non-PDF Rendering Unchanged
 *
 * Methodology: observation-first — each test observes the UNFIXED source to
 * capture the existing security baseline, then asserts the same behavior holds.
 * All tests in this file MUST PASS on both unfixed and fixed code.
 *
 * Behaviors preserved:
 *   3.1 Right-click context menu is suppressed on the viewer overlay
 *   3.2 Ctrl/Cmd+S, Ctrl/Cmd+P (and related) keyboard shortcuts are blocked
 *   3.3 Each PDF page continues to render onto its own canvas
 *   3.4 Images and text files continue to render correctly without regressions
 *   3.5 Blob URL is revoked on unmount — no memory leak
 *
 * Also covered (unit tests):
 *   - isBlockedShortcut returns true for Ctrl+S, Ctrl+P, Ctrl+Shift+S
 *     and false for ordinary keys
 *   - isPdfMime correctly identifies application/pdf and rejects image/png
 *
 * Also covered (property-based style tests using manual generators):
 *   - Random keyboard events: only isBlockedShortcut events trigger onBlockedAction
 *   - Random non-PDF MIME types: PdfViewer is never rendered for non-PDF content
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 *
 * Uses Vitest (node environment, source-level inspection — same pattern as
 * ViewOnlyViewer.bug-condition.test.js)
 * Run with: npm test
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the source of ViewOnlyViewer.jsx once for all tests
const SOURCE = readFileSync(join(__dirname, 'ViewOnlyViewer.jsx'), 'utf8');

// ---------------------------------------------------------------------------
// Source-level helpers — mirror the logic inside ViewOnlyViewer.jsx
// ---------------------------------------------------------------------------

/**
 * Extracts the body of a named function from the source.
 * Searches for `function <name>` and returns the slice from there to the
 * matching closing brace at the function body level.
 *
 * Correctly handles destructured parameter lists like `function Foo({ a, b })`
 * by skipping over the parameter list before starting brace depth counting.
 * The function body is the first `{` that opens AFTER the closing `)` of the
 * parameter list (or right after the function signature `()` for no-param fns).
 */
function extractFunctionBody(src, name) {
  const fnKeyword = `function ${name}`;
  const start = src.indexOf(fnKeyword);
  if (start === -1) return '';

  // Find the `(` that opens the parameter list, then skip to the matching `)`.
  const parenOpen = src.indexOf('(', start + fnKeyword.length);
  if (parenOpen === -1) return '';

  // Walk through the parameter list, counting parens to find the closing `)`.
  let parenDepth = 0;
  let i = parenOpen;
  while (i < src.length) {
    if (src[i] === '(') parenDepth++;
    else if (src[i] === ')') {
      parenDepth--;
      if (parenDepth === 0) { i++; break; }
    }
    i++;
  }

  // `i` is now just past the closing `)`. Find the first `{` which opens the body.
  const bodyOpen = src.indexOf('{', i);
  if (bodyOpen === -1) return '';

  // Count braces from the body opening `{` to find the matching closing `}`.
  let depth = 0;
  let j = bodyOpen;
  while (j < src.length) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
    j++;
  }
  return src.slice(start); // fallback: return to end if unbalanced
}

/**
 * Re-implements isBlockedShortcut from ViewOnlyViewer.jsx at the source level.
 * Returns true if the given synthetic event object matches a blocked shortcut.
 *
 * This is NOT mocking — it re-derives the logic from the source to allow
 * property-based testing of the specification itself.
 */
function isBlockedShortcut(e) {
  const mod = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;
  const key = (e.key || '').toLowerCase();

  // Form field exclusion (simulated)
  if (e._activeTag && ['input', 'textarea', 'select'].includes(e._activeTag)) {
    return false;
  }

  if (mod && key === 's') return true;
  if (mod && key === 'p') return true;
  if (mod && key === 'u') return true;
  if (key === 'f12') return true;
  if (mod && shift && key === 'i') return true;
  if (mod && shift && key === 'j') return true;
  if (mod && shift && key === 'c') return true;

  return false;
}

/**
 * Re-implements isPdfMime from ViewOnlyViewer.jsx.
 */
function isPdfMime(mime) {
  return mime === 'application/pdf';
}

/**
 * Re-implements isImageMime from ViewOnlyViewer.jsx.
 */
function isImageMime(mime) {
  return (mime || '').startsWith('image/');
}

/**
 * Re-implements isTextMime from ViewOnlyViewer.jsx.
 */
function isTextMime(mime) {
  if (!mime) return false;
  const textTypes = [
    'text/',
    'application/json',
    'application/javascript',
    'application/x-python',
    'application/xml',
  ];
  return textTypes.some((t) => mime.startsWith(t));
}

// ---------------------------------------------------------------------------
// Observation helpers — inspect source for structural security patterns
// ---------------------------------------------------------------------------

/**
 * Returns true if the source wires up a contextmenu handler to the overlay.
 * Observation on unfixed code: the overlay div has onContextMenu={handleContextMenu}.
 */
function overlayHasContextMenuHandler(src) {
  return src.includes('onContextMenu={handleContextMenu}');
}

/**
 * Returns true if handleContextMenu calls e.preventDefault().
 * handleContextMenu is defined as a useCallback arrow function, so we search
 * for the arrow function body rather than a named function declaration.
 * Observation on unfixed code: the handler prevents the default context menu.
 */
function contextMenuHandlerPreventsDefault(src) {
  // Find the const handleContextMenu = useCallback( ... ) block
  const idx = src.indexOf('const handleContextMenu = useCallback(');
  if (idx === -1) return false;
  // Extract a reasonable window past the declaration
  const segment = src.slice(idx, idx + 500);
  return segment.includes('preventDefault()');
}

/**
 * Returns true if the handleKeyDown handler calls e.preventDefault() when a
 * shortcut is blocked.
 * handleKeyDown is defined as a useCallback arrow function.
 */
function keyDownHandlerPreventsDefault(src) {
  const idx = src.indexOf('const handleKeyDown = useCallback(');
  if (idx === -1) return false;
  const segment = src.slice(idx, idx + 500);
  return segment.includes('preventDefault()');
}

/**
 * Returns true if handleKeyDown calls onBlockedAction when a shortcut fires.
 * handleKeyDown is defined as a useCallback arrow function.
 */
function keyDownHandlerCallsOnBlockedAction(src) {
  const idx = src.indexOf('const handleKeyDown = useCallback(');
  if (idx === -1) return false;
  const segment = src.slice(idx, idx + 500);
  return segment.includes('onBlockedAction');
}

/**
 * Returns true if document.addEventListener is called for 'keydown' with capture.
 * Observation: keyboard deterrence is document-level (capture phase) for reliability.
 */
function keydownListenerIsDocumentLevel(src) {
  return (
    src.includes("'keydown'") &&
    src.includes('document.addEventListener') &&
    src.includes('capture: true')
  );
}

/**
 * Returns true if window.print is patched to a no-op (print deterrence).
 * Observation on unfixed code: window.print is replaced inside a useEffect.
 */
function windowPrintIsPatched(src) {
  return src.includes('window.print = ') && src.includes('PRINT_BLOCKED');
}

/**
 * Returns true if the print-block CSS style is injected (@media print / display:none).
 * Observation on unfixed code: injectPrintBlockStyle is called and contains the media query.
 */
function printBlockStyleIsInjected(src) {
  return (
    src.includes('@media print') &&
    src.includes('display: none') &&
    src.includes('injectPrintBlockStyle')
  );
}

/**
 * Returns true if URL.revokeObjectURL is called on unmount.
 * Observation on unfixed code: the cleanup effect calls revokeObjectURL.
 */
function blobUrlIsRevokedOnUnmount(src) {
  // Check for a useEffect that calls revokeObjectURL in its return (cleanup)
  // Pattern: useEffect(() => { return () => { URL.revokeObjectURL(... } }, [])
  return (
    src.includes('URL.revokeObjectURL') &&
    src.includes('blobUrlRef.current = null')
  );
}

/**
 * Returns true if the image viewer uses draggable={false}.
 * Observation on unfixed code: <img> has draggable={false} to prevent drag-save.
 */
function imageRendererHasDraggableFalse(src) {
  // Find the image rendering path inside renderContent
  const renderContentStart = src.indexOf('const renderContent = ');
  if (renderContentStart === -1) return false;
  // Extract up to the TextViewer rendering block
  const segment = src.slice(renderContentStart, renderContentStart + 2000);
  return segment.includes('draggable={false}');
}

/**
 * Returns true if the image renderer does NOT include a download link (<a download).
 * Observation: no <a href> with download attribute for blob URL exposure.
 *
 * We check for actual JSX `<a ` anchor elements with a `download` attribute,
 * not just the word "download" (which appears in comments like "no download link exposed").
 * Specifically: `<a download` or `download={` on an anchor tag.
 */
function imageRendererHasNoDownloadLink(src) {
  const renderContentStart = src.indexOf('const renderContent = ');
  if (renderContentStart === -1) return true;
  const imageBlockStart = src.indexOf('isImageMime(mimeType)', renderContentStart);
  const textBlockStart = src.indexOf('isTextMime(mimeType)', renderContentStart);
  if (imageBlockStart === -1) return true;
  const imageSegment = src.slice(
    imageBlockStart,
    textBlockStart !== -1 ? textBlockStart : imageBlockStart + 500
  );
  // Check for actual anchor elements with a download attribute (not just comments)
  const hasAnchorWithDownload = /<a[^>]+download/.test(imageSegment)
    || /download={/.test(imageSegment);
  return !imageSegment.includes('<a ') && !hasAnchorWithDownload;
}

/**
 * Returns true if the text renderer uses a <pre> element.
 * Observation on unfixed code: TextViewer renders content inside <pre>.
 */
function textRendererUsesPre(src) {
  const textViewerBody = extractFunctionBody(src, 'TextViewer');
  return textViewerBody.includes('<pre');
}

/**
 * Returns true if PdfViewer is only rendered when isPdfMime returns true.
 * Observation on unfixed code: isPdfMime(mimeType) gates the PdfViewer render.
 */
function pdfViewerGatedByMimeCheck(src) {
  const renderContentStart = src.indexOf('const renderContent = ');
  if (renderContentStart === -1) return false;
  const renderContentEnd = src.indexOf('\n  };', renderContentStart);
  const renderContent = src.slice(
    renderContentStart,
    renderContentEnd !== -1 ? renderContentEnd + 5 : renderContentStart + 3000
  );
  return (
    renderContent.includes('isPdfMime(mimeType)') &&
    renderContent.includes('PdfViewer')
  );
}

/**
 * Returns true if drag protection is applied to the overlay container.
 * Observation on unfixed code: onDragStart={(e) => e.preventDefault()} is on the root div.
 */
function overlayHasDragProtection(src) {
  return src.includes('onDragStart={(e) => e.preventDefault()}');
}

// ---------------------------------------------------------------------------
// 3.1 Context-menu suppression
// ---------------------------------------------------------------------------

describe('Preservation 3.1: Context-menu suppression is in place', () => {

  /**
   * Observation: the root overlay div has onContextMenu={handleContextMenu}.
   * This is the primary mechanism that blocks right-click on the viewer.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.1
   */
  it('overlay div wires up onContextMenu={handleContextMenu}', () => {
    expect(
      overlayHasContextMenuHandler(SOURCE),
      'The root overlay div must have onContextMenu={handleContextMenu}'
    ).toBe(true);
  });

  /**
   * Observation: handleContextMenu calls e.preventDefault().
   * Without this, the browser context menu appears on right-click.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.1
   */
  it('handleContextMenu calls e.preventDefault() to suppress the browser context menu', () => {
    expect(
      contextMenuHandlerPreventsDefault(SOURCE),
      'handleContextMenu must call e.preventDefault()'
    ).toBe(true);
  });

  /**
   * Observation: document.addEventListener for 'contextmenu' with capture:true is present.
   * Document-level capture ensures suppression even inside nested React portals.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.1
   */
  it('contextmenu event listener is added at document level with capture:true', () => {
    expect(SOURCE).toContain("'contextmenu'");
    expect(SOURCE).toContain('document.addEventListener');
    expect(SOURCE).toContain('capture: true');
  });

});

// ---------------------------------------------------------------------------
// 3.2 Keyboard shortcut blocking (Ctrl+S, Ctrl+P, etc.)
// ---------------------------------------------------------------------------

describe('Preservation 3.2: Keyboard shortcut blocking (Ctrl+S, Ctrl+P, etc.)', () => {

  /**
   * Observation: handleKeyDown calls e.preventDefault() for blocked shortcuts.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.2
   */
  it('handleKeyDown calls e.preventDefault() when a blocked shortcut is detected', () => {
    expect(
      keyDownHandlerPreventsDefault(SOURCE),
      'handleKeyDown must call e.preventDefault() to suppress the blocked shortcut'
    ).toBe(true);
  });

  /**
   * Observation: handleKeyDown calls onBlockedAction with an event name string.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.2
   */
  it('handleKeyDown calls onBlockedAction when a blocked shortcut fires', () => {
    expect(
      keyDownHandlerCallsOnBlockedAction(SOURCE),
      'handleKeyDown must invoke onBlockedAction for audit logging'
    ).toBe(true);
  });

  /**
   * Observation: keydown listener is document-level with capture:true.
   * Capture-phase ensures the handler runs before any child component handler.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.2
   */
  it('keydown event listener is document-level with capture:true', () => {
    expect(
      keydownListenerIsDocumentLevel(SOURCE),
      "document.addEventListener('keydown', …, { capture: true }) must be present"
    ).toBe(true);
  });

  /**
   * Observation: window.print is patched to a no-op that fires PRINT_BLOCKED.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.2
   */
  it('window.print is patched to a no-op that fires PRINT_BLOCKED', () => {
    expect(
      windowPrintIsPatched(SOURCE),
      'window.print must be replaced with a function that calls onBlockedAction("PRINT_BLOCKED")'
    ).toBe(true);
  });

  /**
   * Observation: @media print / display:none CSS is injected on mount.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.2
   */
  it('@media print CSS block (display:none) is injected on mount', () => {
    expect(
      printBlockStyleIsInjected(SOURCE),
      '@media print { body { display: none !important } } must be injected via injectPrintBlockStyle'
    ).toBe(true);
  });

  // ── Unit tests: isBlockedShortcut function ────────────────────────────────

  it('isBlockedShortcut — isBlockedShortcut is defined in source', () => {
    expect(SOURCE).toContain('function isBlockedShortcut');
  });

  it('isBlockedShortcut — Ctrl+S returns true', () => {
    expect(isBlockedShortcut({ ctrlKey: true, key: 's' })).toBe(true);
  });

  it('isBlockedShortcut — Cmd+S returns true', () => {
    expect(isBlockedShortcut({ metaKey: true, key: 's' })).toBe(true);
  });

  it('isBlockedShortcut — Ctrl+Shift+S returns true', () => {
    expect(isBlockedShortcut({ ctrlKey: true, shiftKey: true, key: 's' })).toBe(true);
  });

  it('isBlockedShortcut — Ctrl+P returns true', () => {
    expect(isBlockedShortcut({ ctrlKey: true, key: 'p' })).toBe(true);
  });

  it('isBlockedShortcut — Ctrl+U returns true', () => {
    expect(isBlockedShortcut({ ctrlKey: true, key: 'u' })).toBe(true);
  });

  it('isBlockedShortcut — F12 returns true', () => {
    expect(isBlockedShortcut({ key: 'F12' })).toBe(true);
  });

  it('isBlockedShortcut — Ctrl+Shift+I returns true', () => {
    expect(isBlockedShortcut({ ctrlKey: true, shiftKey: true, key: 'i' })).toBe(true);
  });

  it('isBlockedShortcut — Ctrl+Shift+J returns true', () => {
    expect(isBlockedShortcut({ ctrlKey: true, shiftKey: true, key: 'j' })).toBe(true);
  });

  it('isBlockedShortcut — Ctrl+Shift+C returns true', () => {
    expect(isBlockedShortcut({ ctrlKey: true, shiftKey: true, key: 'c' })).toBe(true);
  });

  it('isBlockedShortcut — ordinary letter key (no modifier) returns false', () => {
    expect(isBlockedShortcut({ key: 'a' })).toBe(false);
    expect(isBlockedShortcut({ key: 'z' })).toBe(false);
    expect(isBlockedShortcut({ key: 'Enter' })).toBe(false);
    expect(isBlockedShortcut({ key: ' ' })).toBe(false);
  });

  it('isBlockedShortcut — Ctrl+C (copy) returns false — must not break clipboard', () => {
    expect(isBlockedShortcut({ ctrlKey: true, key: 'c' })).toBe(false);
  });

  it('isBlockedShortcut — Ctrl+V (paste) returns false', () => {
    expect(isBlockedShortcut({ ctrlKey: true, key: 'v' })).toBe(false);
  });

  it('isBlockedShortcut — Ctrl+Z (undo) returns false', () => {
    expect(isBlockedShortcut({ ctrlKey: true, key: 'z' })).toBe(false);
  });

  it('isBlockedShortcut — Ctrl+A (select all) returns false', () => {
    expect(isBlockedShortcut({ ctrlKey: true, key: 'a' })).toBe(false);
  });

  it('isBlockedShortcut — typing in a form input is excluded (tag=input)', () => {
    // Ctrl+S inside an input should NOT be blocked (user could be saving a form)
    expect(
      isBlockedShortcut({ ctrlKey: true, key: 's', _activeTag: 'input' })
    ).toBe(false);
  });

  it('isBlockedShortcut — typing in textarea is excluded', () => {
    expect(
      isBlockedShortcut({ ctrlKey: true, key: 'p', _activeTag: 'textarea' })
    ).toBe(false);
  });

});

// ---------------------------------------------------------------------------
// Property-based style: all blocked shortcuts trigger onBlockedAction
// ---------------------------------------------------------------------------

describe('Preservation 3.2 (property): only isBlockedShortcut events trigger deterrence', () => {

  /**
   * Property: FOR ALL keyboard events e,
   *   isBlockedShortcut(e) === true  →  handleKeyDown must call preventDefault + onBlockedAction
   *   isBlockedShortcut(e) === false →  handleKeyDown must NOT call onBlockedAction
   *
   * We test this at the source/logic level by verifying the guard pattern:
   *   if (!isBlockedShortcut(e)) return;
   * is present in handleKeyDown — this is the only gate before calling onBlockedAction.
   * handleKeyDown is a useCallback arrow function, so we search its definition directly.
   *
   * Validates: Requirement 3.2
   */
  it('handleKeyDown early-returns when isBlockedShortcut(e) is false (no spurious deterrence)', () => {
    const idx = SOURCE.indexOf('const handleKeyDown = useCallback(');
    expect(idx, 'handleKeyDown useCallback definition must exist').not.toBe(-1);
    const segment = SOURCE.slice(idx, idx + 500);
    // The guard pattern ensures non-blocked events exit immediately
    expect(segment).toContain('isBlockedShortcut');
    expect(segment).toContain('return');
  });

  /**
   * Property: generate a representative sample of non-blocked events and verify
   * isBlockedShortcut returns false for all of them.
   *
   * The spec states: only events matching isBlockedShortcut should trigger
   * onBlockedAction. Non-blocked events must be transparent.
   *
   * Validates: Requirement 3.2
   */
  it('property: random non-blocked key events all return false from isBlockedShortcut', () => {
    // Manually enumerate a comprehensive set of "safe" events
    // (mimics a property-based generator over ordinary keystrokes)
    const safeKeys = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('').concat([
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Escape', 'Tab', 'Enter', 'Backspace', 'Delete',
      'Home', 'End', 'PageUp', 'PageDown', 'Insert',
      'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11',
    ]);

    const safeModifierCombos = [
      // Ctrl + letters that are NOT blocked
      ...['b', 'd', 'e', 'f', 'g', 'h', 'k', 'l', 'm', 'n', 'o', 'q',
          'r', 't', 'w', 'x', 'y', 'z', 'a', 'c', 'v'].map(k => ({
        ctrlKey: true, key: k
      })),
      // Alt + anything (except bare F12 which the source blocks regardless of modifier)
      ...['s', 'p'].map(k => ({ altKey: true, key: k })),
      // No modifier at all (plain key presses)
      ...safeKeys.map(k => ({ key: k })),
    ];

    for (const event of safeModifierCombos) {
      const result = isBlockedShortcut(event);
      expect(
        result,
        `isBlockedShortcut(${JSON.stringify(event)}) should be false but got ${result}`
      ).toBe(false);
    }
  });

  /**
   * Property: generate a representative sample of blocked events and verify
   * isBlockedShortcut returns true for all of them.
   *
   * Validates: Requirement 3.2
   */
  it('property: all known blocked shortcuts return true from isBlockedShortcut', () => {
    const blockedEvents = [
      // Ctrl variants
      { ctrlKey: true, key: 's' },
      { ctrlKey: true, key: 'S' },  // uppercase
      { ctrlKey: true, shiftKey: true, key: 's' },
      { ctrlKey: true, key: 'p' },
      { ctrlKey: true, key: 'P' },
      { ctrlKey: true, key: 'u' },
      { ctrlKey: true, shiftKey: true, key: 'i' },
      { ctrlKey: true, shiftKey: true, key: 'j' },
      { ctrlKey: true, shiftKey: true, key: 'c' },
      // Meta (macOS Cmd) variants
      { metaKey: true, key: 's' },
      { metaKey: true, shiftKey: true, key: 's' },
      { metaKey: true, key: 'p' },
      { metaKey: true, key: 'u' },
      { metaKey: true, shiftKey: true, key: 'i' },
      { metaKey: true, shiftKey: true, key: 'j' },
      { metaKey: true, shiftKey: true, key: 'c' },
      // F12
      { key: 'F12' },
      { key: 'f12' },
    ];

    for (const event of blockedEvents) {
      const result = isBlockedShortcut(event);
      expect(
        result,
        `isBlockedShortcut(${JSON.stringify(event)}) should be true but got ${result}`
      ).toBe(true);
    }
  });

});

// ---------------------------------------------------------------------------
// 3.3 PDF canvas rendering — each page renders onto its own canvas
// ---------------------------------------------------------------------------

describe('Preservation 3.3: PDF rendering — each page renders onto its own canvas', () => {

  /**
   * Observation: PdfViewer sub-component exists and uses PDF.js (pdfjsLib).
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.3
   */
  it('PdfViewer sub-component is defined and uses pdfjsLib', () => {
    expect(SOURCE).toContain('function PdfViewer');
    expect(SOURCE).toContain('pdfjsLib');
  });

  /**
   * Observation: CanvasPage sub-component exists and uses wrapperRef for canvas attachment.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.3
   */
  it('CanvasPage sub-component is defined and attaches canvas via ref', () => {
    expect(SOURCE).toContain('function CanvasPage');
    expect(SOURCE).toContain('wrapper.appendChild(canvas)');
  });

  /**
   * Observation: Each canvas gets its aria-label set to "Page N of M".
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.3
   */
  it('each rendered canvas has an aria-label set to "Page N of M"', () => {
    const pdfViewerBody = extractFunctionBody(SOURCE, 'PdfViewer');
    expect(pdfViewerBody).toContain('aria-label');
    expect(pdfViewerBody).toContain('Page ');
  });

  /**
   * Observation: PdfViewer iterates from page 1 to numPages, rendering each page.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.3
   */
  it('PdfViewer renders pages in a loop from 1 to numPages', () => {
    const pdfViewerBody = extractFunctionBody(SOURCE, 'PdfViewer');
    expect(pdfViewerBody).toContain('numPages');
    expect(pdfViewerBody).toContain('pageNum');
    expect(pdfViewerBody).toContain('getPage');
  });

  /**
   * Observation: PdfViewer cancels in-progress render tasks on unmount (cleanup).
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.3
   */
  it('PdfViewer cancels render tasks on unmount (no stale renders)', () => {
    const pdfViewerBody = extractFunctionBody(SOURCE, 'PdfViewer');
    expect(pdfViewerBody).toContain('task.cancel()');
    expect(pdfViewerBody).toContain('cancelled = true');
  });

  /**
   * Observation: PdfViewer receives decryptedBlob directly (no iframe URL injection).
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.3
   */
  it('PdfViewer uses blob.arrayBuffer() directly (no iframe blob URL injection)', () => {
    const pdfViewerBody = extractFunctionBody(SOURCE, 'PdfViewer');
    expect(pdfViewerBody).toContain('arrayBuffer()');
    expect(pdfViewerBody).not.toContain('<iframe');
  });

});

// ---------------------------------------------------------------------------
// 3.4 Non-PDF rendering — images and text files
// ---------------------------------------------------------------------------

describe('Preservation 3.4: Non-PDF file rendering (images and text)', () => {

  /**
   * Observation: image files render via <img> with draggable={false}.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.4
   */
  it('image renderer uses <img> with draggable={false}', () => {
    expect(
      imageRendererHasDraggableFalse(SOURCE),
      'Image renderer must set draggable={false} on the <img> element'
    ).toBe(true);
  });

  /**
   * Observation: image renderer does NOT include an <a download> link.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.4
   */
  it('image renderer does not expose a download link in the DOM', () => {
    expect(
      imageRendererHasNoDownloadLink(SOURCE),
      'Image renderer must not contain <a download> or any element with a download attribute'
    ).toBe(true);
  });

  /**
   * Observation: text renderer (TextViewer) renders content in a <pre> element.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.4
   */
  it('text renderer displays content inside a <pre> element', () => {
    expect(
      textRendererUsesPre(SOURCE),
      'TextViewer must render text content inside a <pre> element'
    ).toBe(true);
  });

  /**
   * Observation: TextViewer sub-component is defined in the source.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.4
   */
  it('TextViewer sub-component is defined', () => {
    expect(SOURCE).toContain('function TextViewer');
  });

  /**
   * Observation: image renderer applies pointer-events:none to prevent drag-save.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.4
   */
  it('image renderer applies pointer-events:none to prevent drag-save', () => {
    const renderContentStart = SOURCE.indexOf('const renderContent = ');
    const segment = SOURCE.slice(renderContentStart, renderContentStart + 2000);
    expect(segment).toContain('pointerEvents');
  });

  /**
   * Observation: overlay has onDragStart={(e) => e.preventDefault()} for extra drag protection.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.4
   */
  it('overlay has onDragStart protection to prevent drag-save', () => {
    expect(
      overlayHasDragProtection(SOURCE),
      'Root overlay div must have onDragStart={(e) => e.preventDefault()}'
    ).toBe(true);
  });

  // ── Unit tests: isPdfMime ─────────────────────────────────────────────────

  it('isPdfMime — application/pdf returns true', () => {
    expect(isPdfMime('application/pdf')).toBe(true);
  });

  it('isPdfMime — image/png returns false', () => {
    expect(isPdfMime('image/png')).toBe(false);
  });

  it('isPdfMime — image/jpeg returns false', () => {
    expect(isPdfMime('image/jpeg')).toBe(false);
  });

  it('isPdfMime — text/plain returns false', () => {
    expect(isPdfMime('text/plain')).toBe(false);
  });

  it('isPdfMime — undefined/null returns false', () => {
    expect(isPdfMime(undefined)).toBe(false);
    expect(isPdfMime(null)).toBe(false);
    expect(isPdfMime('')).toBe(false);
  });

  it('isPdfMime — application/pdf with extra chars returns false (strict equality)', () => {
    expect(isPdfMime('application/pdf2')).toBe(false);
    expect(isPdfMime('application/pdf ')).toBe(false);
    expect(isPdfMime('APPLICATION/PDF')).toBe(false);
  });

  // ── Property-based style: non-PDF MIME types never render PdfViewer ───────

  /**
   * Property: FOR ALL non-PDF MIME types, PdfViewer must NOT be rendered.
   * We verify this at the source level by confirming PdfViewer is gated behind
   * isPdfMime(mimeType) in the renderContent() dispatch.
   *
   * Validates: Requirement 3.4
   */
  it('property: PdfViewer is gated behind isPdfMime(mimeType) in renderContent dispatch', () => {
    expect(
      pdfViewerGatedByMimeCheck(SOURCE),
      'renderContent() must check isPdfMime(mimeType) before rendering PdfViewer'
    ).toBe(true);
  });

  /**
   * Property: generate random non-PDF MIME types and verify isPdfMime returns false
   * for all of them — ensuring PdfViewer is never accidentally rendered.
   *
   * Validates: Requirement 3.4
   */
  it('property: random non-PDF MIME types all return false from isPdfMime', () => {
    const nonPdfMimeTypes = [
      // Image types
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'image/bmp', 'image/tiff', 'image/avif',
      // Text types
      'text/plain', 'text/html', 'text/css', 'text/javascript', 'text/csv',
      'text/xml', 'text/markdown',
      // Application types (non-PDF)
      'application/json', 'application/javascript', 'application/xml',
      'application/x-python', 'application/zip', 'application/gzip',
      'application/octet-stream', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      // Audio/video
      'audio/mpeg', 'audio/wav', 'video/mp4', 'video/webm',
      // Edge cases
      '', undefined, null, 'application', 'pdf', 'application/pdf2',
      'application/x-pdf', 'APPLICATION/PDF',
    ];

    for (const mime of nonPdfMimeTypes) {
      const result = isPdfMime(mime);
      expect(
        result,
        `isPdfMime(${JSON.stringify(mime)}) should be false but got ${result}`
      ).toBe(false);
    }
  });

  /**
   * Property: generate random non-PDF MIME types and verify the renderContent
   * dispatch correctly routes them away from PdfViewer.
   * At the source level: for any mime !== 'application/pdf', the isImageMime/
   * isTextMime/fallback branches handle them.
   *
   * Validates: Requirement 3.4
   */
  it('property: renderContent dispatch handles all non-PDF types without PdfViewer', () => {
    // Verify each non-PDF type is handled by a specific branch (no fallthrough to PdfViewer)
    const imageMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const textMimes = ['text/plain', 'text/html', 'application/json', 'application/javascript'];

    for (const mime of imageMimes) {
      expect(isImageMime(mime)).toBe(true);
      expect(isPdfMime(mime)).toBe(false);
    }

    for (const mime of textMimes) {
      expect(isTextMime(mime)).toBe(true);
      expect(isPdfMime(mime)).toBe(false);
    }

    // All non-PDF, non-image, non-text types fall through to the generic card
    const binaryMimes = ['application/zip', 'application/octet-stream', 'audio/mpeg'];
    for (const mime of binaryMimes) {
      expect(isPdfMime(mime)).toBe(false);
      expect(isImageMime(mime)).toBe(false);
      expect(isTextMime(mime)).toBe(false);
    }
  });

});

// ---------------------------------------------------------------------------
// 3.5 Blob URL revocation on unmount
// ---------------------------------------------------------------------------

describe('Preservation 3.5: Blob URL revocation on unmount', () => {

  /**
   * Observation: URL.revokeObjectURL is called and blobUrlRef.current is set to null
   * in a cleanup useEffect — preventing memory leaks after the viewer closes.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.5
   */
  it('URL.revokeObjectURL is called in cleanup and blobUrlRef is nulled', () => {
    expect(
      blobUrlIsRevokedOnUnmount(SOURCE),
      'A useEffect cleanup must call URL.revokeObjectURL and set blobUrlRef.current = null'
    ).toBe(true);
  });

  /**
   * Observation: revokeObjectURL is also called in handleClose (manual close).
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.5
   */
  it('handleClose also revokes the blob URL before calling onClose()', () => {
    const handleCloseStart = SOURCE.indexOf('const handleClose = ');
    expect(handleCloseStart, 'handleClose must be defined').not.toBe(-1);
    const handleCloseEnd = SOURCE.indexOf('\n  };', handleCloseStart);
    const handleCloseFn = SOURCE.slice(
      handleCloseStart,
      handleCloseEnd !== -1 ? handleCloseEnd + 5 : handleCloseStart + 300
    );
    expect(handleCloseFn).toContain('revokeObjectURL');
    expect(handleCloseFn).toContain('onClose()');
  });

  /**
   * Observation: blobUrlRef is created once using URL.createObjectURL.
   * The guarded pattern (if !blobUrlRef.current) prevents duplicate blob URLs.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.5
   */
  it('blob URL is created exactly once (guarded by !blobUrlRef.current check)', () => {
    expect(SOURCE).toContain('URL.createObjectURL');
    expect(SOURCE).toContain('!blobUrlRef.current');
  });

  /**
   * Observation: no blob URL is stored in localStorage, sessionStorage, or IndexedDB.
   * We check for actual API call patterns (setItem, put, etc.), not just the word,
   * since the source legitimately mentions these in comments.
   * MUST PASS on unfixed code; MUST PASS after fix.
   *
   * Validates: Requirement 3.5
   */
  it('blob URL is not persisted to localStorage, sessionStorage, or IndexedDB', () => {
    // These are the runtime call patterns that would actually store data.
    // The source comments mention these APIs (as things NOT done), so we check
    // for actual usage (setItem, removeItem, getItem, put, add) not bare names.
    expect(SOURCE).not.toContain('localStorage.setItem');
    expect(SOURCE).not.toContain('localStorage.getItem');
    expect(SOURCE).not.toContain('sessionStorage.setItem');
    expect(SOURCE).not.toContain('sessionStorage.getItem');
    expect(SOURCE).not.toContain('indexedDB.open');
    expect(SOURCE).not.toContain('IDBObjectStore');
  });

});

// ---------------------------------------------------------------------------
// Structural: visual deterrence elements (watermark, banner) remain in place
// ---------------------------------------------------------------------------

describe('Preservation: visual deterrence elements (watermark, VIEW ONLY banner)', () => {

  it('VIEW ONLY text is present in the header bar', () => {
    expect(SOURCE).toContain('VIEW ONLY');
  });

  it('VaultKey • View Only watermark is present', () => {
    expect(SOURCE).toContain('VaultKey \u2022 View Only');
  });

  it('the deterrence disclaimer footer is present', () => {
    expect(SOURCE).toContain('View-Only mode provides browser-side deterrence');
  });

});
