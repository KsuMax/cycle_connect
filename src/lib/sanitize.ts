import DOMPurify from "dompurify";

/**
 * Sanitize HTML from rich-text editors (Tiptap) before rendering.
 * Strips dangerous tags/attributes while keeping safe formatting.
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
