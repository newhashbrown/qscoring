/**
 * Serialize a value for safe embedding inside an inline
 * `<script type="application/ld+json">` block.
 *
 * `JSON.stringify` alone does NOT escape `<`, `>`, or `&`. A string field
 * containing `</script>` — e.g. an FMP-sourced `companyName` returned with bad
 * data or via an upstream compromise — would otherwise close the script
 * element and inject arbitrary markup/JS into the page. There is no CSP that
 * blocks inline script, so this escaping is the load-bearing defense (security
 * audit finding M1, 2026-06-23).
 *
 * Escaping these three characters to their `\uXXXX` forms keeps the output
 * JSON.parse-equivalent (the escapes decode to the same characters) while
 * rendering it inert as HTML. This is the standard technique for embedding
 * JSON in an HTML <script> element. (U+2028/U+2029 need not be escaped here:
 * the block is parsed as JSON, where they are valid, not executed as JS.)
 */
export function safeJsonLdString(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
