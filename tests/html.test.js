import assert from "node:assert/strict";
import test from "node:test";

import { escapeHtml } from "../src/ui/html.js";

test("escapeHtml escapes HTML-sensitive characters", () => {
  assert.equal(
    escapeHtml("<script data-x=\"1\">Tom & 'Jerry'</script>"),
    "&lt;script data-x=&quot;1&quot;&gt;Tom &amp; &#039;Jerry&#039;&lt;/script&gt;",
  );
});

test("escapeHtml preserves ordinary text", () => {
  assert.equal(escapeHtml("mask label 01"), "mask label 01");
});
