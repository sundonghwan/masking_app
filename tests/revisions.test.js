import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRevisionMatch,
  nextRevision,
  normalizeRevision,
  readIfMatchRevision,
} from "../src/server/revisions.js";

test("readIfMatchRevision accepts body revision before If-Match headers", () => {
  const request = { headers: { "if-match": '"7"' } };

  assert.equal(readIfMatchRevision(request, { if_match_revision: 3 }), 3);
  assert.equal(readIfMatchRevision(request, { ifMatchRevision: 4 }), 4);
});

test("readIfMatchRevision parses quoted weak If-Match headers", () => {
  assert.equal(readIfMatchRevision({ headers: { "if-match": 'W/"12"' } }), 12);
  assert.equal(readIfMatchRevision({ headers: { "If-Match": '"8"' } }), 8);
  assert.equal(readIfMatchRevision({ headers: { "if-match": "not-a-number" } }), null);
});

test("assertRevisionMatch sends conflict response for stale revisions", () => {
  const response = createJsonResponseRecorder();
  const matched = assertRevisionMatch(
    response,
    { headers: {} },
    { if_match_revision: 2 },
    5,
  );

  assert.equal(matched, false);
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.error, "revision_conflict");
  assert.equal(response.body.expected_revision, 5);
  assert.equal(response.body.received_revision, 2);
});

test("revision helpers normalize invalid values and increment safely", () => {
  assert.equal(normalizeRevision(""), 0);
  assert.equal(normalizeRevision(-1), 0);
  assert.equal(normalizeRevision("6"), 6);
  assert.equal(nextRevision("6"), 7);
});

function createJsonResponseRecorder() {
  const response = {
    statusCode: 0,
    body: null,
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end(body) {
      this.body = JSON.parse(body);
    },
  };
  return response;
}
