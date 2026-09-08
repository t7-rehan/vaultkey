/**
 * ViewOnlyViewer
 *
 * Renders decrypted file content inside a controlled in-browser viewer.
 *
 * Security posture
 * ────────────────
 * This component implements browser-side DETERRENCE against casual saving,
 * downloading, and printing.  It is NOT a DRM system.  A determined recipient
 * who controls their device can still extract content that their browser has
 * legitimately received and decrypted.  The server-side access_mode check
 * in /api/access/{token}/download is the actual security boundary.
 *
 * Deterrents implemented here:
 *   • Right-click context-menu suppressed on the viewer container.
 *   • Common save/print/devtools keyboard shortcuts intercepted
 *     (Ctrl/Cmd+S, Ctrl/Cmd+P, Ctrl/Cmd+Shift+S, Ctrl/Cmd+U,
 *      Ctrl/Cmd+Shift+I, Ctrl/Cmd+Shift+J, Ctrl/Cmd+Shift+C, F12).
 *   • window.print() replaced with a no-op for the lifetime of the viewer.
 *   • @media print CSS hides the page body.
 *   • Blob URL is revoked on unmount — decrypted data is not held in memory
 *     beyond the viewer's lifetime.
 *   • No localStorage/sessionStorage/IndexedDB caching of decrypted content.
 *   • Visual "VIEW ONLY" banner and subtle watermark.
 *
 * What this does NOT prevent:
 *   • Browser network inspector (content was already received).
 *   • Memory inspection or modified browser.
 *   • Screenshots or screen recording.
 *   • Physical cameras aimed at the screen.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { X, EyeOff, ShieldAlert } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

// Configure PDF.js worker once at module level
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// ─── Print-block style injected once globally ────────────────────────────────
const PRINT_BLOCK_STYLE_ID = 'vk-view-only-print-block';

function injectPrintBlockStyle() {
  if (document.getElementById(PRINT_BLOCK_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PRINT_BLOCK_STYLE_ID;
  // Hide everything when printing while the viewer is active.
  style.textContent = `
@media print {
  body { display: none !important; }
}
  `.trim();
  document.head.appendChild(style);
}

function removePrintBlockStyle() {
  const el = document.getElementById(PRINT_BLOCK_STYLE_ID);
  if (el) el.remove();
}

// ─── Keyboard shortcut deterrence ────────────────────────────────────────────
/**
 * Returns true if the event matches a shortcut that should be blocked in
 * view-only mode.  Handles both Windows/Linux (ctrlKey) and macOS (metaKey).
 *
 * Shortcuts blocked:
 *   Ctrl/Cmd + S          → Save page / Save file
 *   Ctrl/Cmd + Shift + S  → Save as
 *   Ctrl/Cmd + P          → Print
 *   Ctrl/Cmd + U          → View source
 *   F12                   → DevTools (deterrence only)
 *   Ctrl/Cmd + Shift + I  → DevTools
 *   Ctrl/Cmd + Shift + J  → DevTools console
 *   Ctrl/Cmd + Shift + C  → DevTools inspector
 *
 * Note: Input fields and textareas are intentionally excluded so that
 * normal typing is not affected.
 */
function isBlockedShortcut(e) {
  const mod = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;
  const key = e.key?.toLowerCase();

  // Never block while the user is typing in a form field.
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return false;

  if (mod && key === 's') return true;           // Ctrl/Cmd+S, Ctrl/Cmd+Shift+S
  if (mod && key === 'p') return true;           // Ctrl/Cmd+P
  if (mod && key === 'u') return true;           // Ctrl/Cmd+U
  if (key === 'f12') return true;                // F12
  if (mod && shift && key === 'i') return true;  // Ctrl/Cmd+Shift+I
  if (mod && shift && key === 'j') return true;  // Ctrl/Cmd+Shift+J
  if (mod && shift && key === 'c') return true;  // Ctrl/Cmd+Shift+C

  return false;
}

/**
 * Classifies a blocked shortcut into an audit event name.
 * Returns null if it does not map to a distinct event.
 */
function blockedShortcutEvent(e) {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key?.toLowerCase();
  if (mod && key === 'p') return 'PRINT_BLOCKED';
  if (mod && key === 's') return 'SAVE_ATTEMPT_BLOCKED';
  return 'DOWNLOAD_BLOCKED';
}

// ─── File type → viewer renderer ─────────────────────────────────────────────

function isImageMime(mime) {
  return mime?.startsWith('image/');
}

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

function isPdfMime(mime) {
  return mime === 'application/pdf';
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * @param {object}   props
 * @param {Blob}     props.decryptedBlob   – Decrypted file blob from Web Crypto.
 * @param {string}   props.filename        – Original filename for the header bar.
 * @param {string}   props.mimeType        – Resolved MIME type.
 * @param {function} props.onClose         – Called when the viewer is closed.
 * @param {function} props.onBlockedAction – Called with an audit event name string
 *                                          when a deterrent fires.
 */
export function ViewOnlyViewer({
  decryptedBlob,
  filename,
  mimeType,
  onClose,
  onBlockedAction,
}) {
  const blobUrlRef = useRef(null);
  const originalPrintRef = useRef(null);
  const textContentRef = useRef('');

  // ── Create blob URL once ──────────────────────────────────────────────────
  if (!blobUrlRef.current && decryptedBlob) {
    blobUrlRef.current = URL.createObjectURL(decryptedBlob);
  }

  // ── Keyboard deterrence ───────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e) => {
      if (!isBlockedShortcut(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const evt = blockedShortcutEvent(e);
      if (evt && onBlockedAction) onBlockedAction(evt);
    },
    [onBlockedAction],
  );

  // ── Context-menu deterrence ───────────────────────────────────────────────
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
  }, []);

  // ── Patch + restore window.print ─────────────────────────────────────────
  useEffect(() => {
    originalPrintRef.current = window.print;
    window.print = () => {
      if (onBlockedAction) onBlockedAction('PRINT_BLOCKED');
    };
    return () => {
      if (originalPrintRef.current) {
        window.print = originalPrintRef.current;
      }
    };
  }, [onBlockedAction]);

  // ── Print-block CSS + event listeners ────────────────────────────────────
  useEffect(() => {
    injectPrintBlockStyle();
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('contextmenu', handleContextMenu, { capture: true });

    return () => {
      removePrintBlockStyle();
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('contextmenu', handleContextMenu, { capture: true });
    };
  }, [handleKeyDown, handleContextMenu]);

  // ── Revoke blob URL on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  // ── Read text content once for text renderer ──────────────────────────────
  useEffect(() => {
    if (isTextMime(mimeType) && decryptedBlob && !isPdfMime(mimeType)) {
      decryptedBlob.text().then((t) => {
        textContentRef.current = t;
      });
    }
  }, [decryptedBlob, mimeType]);

  const handleClose = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    onClose();
  };

  // ── Render the appropriate content viewer ────────────────────────────────
  const renderContent = () => {
    const blobUrl = blobUrlRef.current;
    if (!blobUrl) return null;

    if (isPdfMime(mimeType)) {
      return <PdfViewer decryptedBlob={decryptedBlob} filename={filename} />;
    }

    if (isImageMime(mimeType)) {
      // Image: rendered via <img> — no download link exposed.
      // user-select:none + pointer-events:none prevents simple drag-save.
      return (
        <div className="flex items-center justify-center w-full h-full overflow-auto p-4 bg-gray-900">
          <img
            src={blobUrl}
            alt={filename}
            className="max-w-full max-h-full object-contain rounded"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
            draggable={false}
          />
        </div>
      );
    }

    if (isTextMime(mimeType)) {
      // Text / code / JSON: rendered as pre-formatted text — no raw URL exposed.
      // The blob URL is used to populate the text via the effect above; we
      // render from the ref so we don't re-expose the URL in the DOM.
      return (
        <TextViewer blobUrl={blobUrl} filename={filename} mimeType={mimeType} />
      );
    }

    // Unknown / binary: show a minimal informational card rather than exposing
    // a download link.
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-4 text-gray-400">
        <ShieldAlert className="w-12 h-12 text-amber-400" />
        <p className="text-sm font-medium text-white">
          Inline preview not available for this file type.
        </p>
        <p className="text-xs text-gray-500">
          ({mimeType || 'unknown type'})
        </p>
        <p className="text-xs text-gray-600 max-w-xs text-center">
          This share is View-Only. Downloading is not permitted.
        </p>
      </div>
    );
  };

  return (
    // Full-screen overlay — fixed position, highest z-index
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onContextMenu={handleContextMenu}
      // Extra drag protection: prevent default drag behaviour on the container
      onDragStart={(e) => e.preventDefault()}
    >
      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between bg-[#0D1526] border-b border-[#1E2D47] px-5 py-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-amber-500/15 text-amber-400 rounded-lg shrink-0">
            <EyeOff className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{filename}</p>
            <p className="text-xs text-amber-400 font-medium">
              VIEW ONLY — Downloading and printing are disabled for this share.
            </p>
          </div>
        </div>

        {/* Watermark — non-secret, purely visual deterrent */}
        <span
          className="hidden sm:block text-[10px] font-mono text-gray-600 select-none mx-4 shrink-0"
          aria-hidden="true"
        >
          VaultKey • View Only
        </span>

        <button
          onClick={handleClose}
          aria-label="Close viewer"
          className="p-2 bg-[#1A2438] hover:bg-[#253044] rounded-xl text-gray-400 hover:text-white transition-colors shrink-0 ml-2"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Content area ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto relative">
        {/* Subtle watermark overlay — does not obscure content, purely informational */}
        <div
          className="absolute inset-0 pointer-events-none z-10 flex items-end justify-end p-4"
          aria-hidden="true"
        >
          <span className="text-[10px] font-mono text-white/5 select-none">
            VaultKey • View Only
          </span>
        </div>

        {renderContent()}
      </div>

      {/* ── Footer disclaimer ───────────────────────────────────────────── */}
      <div className="shrink-0 bg-[#0D1526] border-t border-[#1E2D47] px-5 py-2 text-center">
        <p className="text-[10px] text-gray-600">
          View-Only mode provides browser-side deterrence against casual downloading, saving, and
          printing. Content rendered on a recipient-controlled device cannot be made completely
          non-extractable.
        </p>
      </div>
    </div>
  );
}

// ─── Text viewer sub-component ────────────────────────────────────────────────

/**
 * Fetches the text from the blob URL and renders it in a read-only code block.
 * Keeps the rendering inside the React tree so no raw blob URL sits in an
 * href or src that the user could easily copy.
 */
function TextViewer({ blobUrl, filename, mimeType }) {
  const [text, setText] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(blobUrl)
      .then((r) => r.text())
      .then((t) => {
        if (!cancelled) {
          setText(t);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setText('Unable to render content.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [blobUrl]);

  const isJson = mimeType === 'application/json';
  let displayText = text;
  if (isJson && text) {
    try {
      displayText = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // leave as-is
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-400" />
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto p-4 bg-[#0B1120]">
      <pre
        className="text-xs text-gray-200 font-mono whitespace-pre-wrap break-words select-text leading-relaxed"
        // Allow text selection so the file is still readable, but the lack of
        // a download button and the Ctrl+S block make casual saving harder.
      >
        {displayText}
      </pre>
    </div>
  );
}

// ─── PDF viewer sub-component ─────────────────────────────────────────────────

/**
 * Renders a PDF blob using PDF.js onto a series of <canvas> elements.
 *
 * Accepts the raw decrypted blob directly — no blob URL is created or passed —
 * eliminating the iframe URL-loading pattern that caused blank rendering in
 * modern browsers due to CSP / sandbox restrictions.
 *
 * Lifecycle:
 *   1. Convert blob → ArrayBuffer via blob.arrayBuffer().
 *   2. Pass ArrayBuffer data directly to pdfjsLib.getDocument({ data }).
 *   3. For each page in the document, render onto a dedicated <canvas>.
 *   4. Show an amber spinner while loading; show an error card on failure.
 *
 * Cancellation: the renderTask returned by page.render() is cancelled on
 * cleanup to avoid "Rendering cancelled" promise rejections when the component
 * unmounts mid-render.
 */
function PdfViewer({ decryptedBlob, filename }) {
  const [pageCanvases, setPageCanvases] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!decryptedBlob) return;

    let cancelled = false;
    const activeTasks = [];

    async function renderPdf() {
      try {
        // Step 1: Blob → ArrayBuffer (no blob URL needed)
        const arrayBuffer = await decryptedBlob.arrayBuffer();
        if (cancelled) return;

        // Step 2: Load PDF document via PDF.js
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;
        if (cancelled) return;

        const numPages = pdfDoc.numPages;
        const canvasElements = [];

        // Step 3: Render each page onto its own canvas
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          if (cancelled) break;

          const page = await pdfDoc.getPage(pageNum);
          if (cancelled) break;

          // Scale to fit a reasonable viewport width (CSS pixels)
          const desiredWidth = containerRef.current
            ? containerRef.current.clientWidth - 32 // subtract horizontal padding
            : 800;
          const unscaledViewport = page.getViewport({ scale: 1 });
          const scale = desiredWidth / unscaledViewport.width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.display = 'block';
          canvas.style.width = '100%';
          canvas.setAttribute('aria-label', `Page ${pageNum} of ${numPages}`);

          const canvasContext = canvas.getContext('2d');
          const renderTask = page.render({ canvasContext, viewport });
          activeTasks.push(renderTask);

          await renderTask.promise;
          if (cancelled) break;

          canvasElements.push(canvas);
        }

        if (!cancelled) {
          setPageCanvases(canvasElements);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          // Don't surface cancellation errors caused by unmount
          if (err?.name !== 'RenderingCancelledException') {
            setError('This PDF could not be displayed in your browser.');
          }
          setLoading(false);
        }
      }
    }

    renderPdf();

    return () => {
      cancelled = true;
      // Cancel any in-progress page renders to avoid unhandled rejections
      for (const task of activeTasks) {
        try { task.cancel(); } catch { /* ignore */ }
      }
    };
  }, [decryptedBlob]);

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-4 text-gray-400 px-4">
        <ShieldAlert className="w-10 h-10 text-red-400" />
        <p className="text-sm font-medium text-white text-center">{error}</p>
        <p className="text-xs text-gray-500 text-center max-w-xs">
          Try a different browser, or contact the sender if the problem persists.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-auto p-4 bg-gray-900 flex flex-col items-center gap-4"
    >
      {pageCanvases.map((canvas, idx) => (
        <CanvasPage key={idx} canvas={canvas} />
      ))}
    </div>
  );
}

/**
 * Mounts a pre-rendered <canvas> DOM node into the React tree.
 * Using a ref attachment avoids cloning the canvas (which would lose pixel data).
 */
function CanvasPage({ canvas }) {
  const wrapperRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (wrapper && canvas) {
      wrapper.appendChild(canvas);
      return () => {
        if (canvas.parentNode === wrapper) {
          wrapper.removeChild(canvas);
        }
      };
    }
  }, [canvas]);

  return (
    <div
      ref={wrapperRef}
      className="w-full rounded shadow-lg"
      style={{ maxWidth: '100%' }}
    />
  );
}
