// IMPORTANT: must be the isomorphic build, not bare `dompurify`.
// `dompurify` requires `window` and silently no-ops in Node — meaning Server
// Components would render unsanitized HTML straight into the page. The
// isomorphic shim provides a JSDOM-backed instance on the server while
// delegating to the native one in the browser.
import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize HTML from rich-text editors (Tiptap) before rendering.
 * Strips dangerous tags/attributes while keeping safe formatting.
 * Safe to call from both Server Components and the browser.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "s", "del",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li",
      "blockquote", "pre", "code",
      "a", "img",
      "hr", "span", "div",
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel",
      "src", "alt", "width", "height",
      "class",
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["script", "style", "iframe", "form", "input", "object", "embed"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
    // Block javascript:, data:, vbscript: and other dangerous URI schemes in href/src
    ALLOWED_URI_REGEXP: /^(?:https?|mailto|ftp|tel):/i,
  });
}
