const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../app/lib/invitation.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = { exports: {}, URL };
vm.runInNewContext(compiled, context);
const { invitationEmail, formatInvitationExpiry } = context.exports;
const link = {
  user: { name: "Zoë", username: "researcher+test", email: "researcher+test@example.org" },
  url: "https://dashboard.example.org/set-password#token=test_token-123",
  expiresAt: "2026-11-04T12:00:00Z",
  purpose: "invite",
};

test("draft preserves the recipient, Unicode text, and the complete setup link", () => {
  const draft = new URL(invitationEmail(link));
  assert.equal(draft.protocol, "mailto:");
  assert.equal(decodeURIComponent(draft.pathname), link.user.email);
  assert.equal(draft.hash, "");
  assert.deepEqual([...draft.searchParams.keys()], ["subject", "body"]);
  const body = draft.searchParams.get("body");
  assert.ok(body.includes("Hello Zoë,"));
  assert.ok(body.includes("Username: researcher+test"));
  assert.ok(body.includes(link.url));
  assert.ok(body.includes("https://dashboard.example.org/login"));
  assert.ok(body.includes("can be used once"));
});

test("reset drafts use reset wording without exposing the fragment as a mail header", () => {
  const draft = new URL(invitationEmail({ ...link, purpose: "reset" }));
  assert.equal(draft.searchParams.get("subject"), "Reset your momenTUM dashboard password");
  assert.ok(draft.searchParams.get("body").includes("Your administrator has provided"));
  assert.ok(draft.searchParams.get("body").includes(link.url));
  assert.equal(draft.searchParams.get("bcc"), null);
});


test("expiry uses German dates and Central European winter time", () => {
  assert.equal(formatInvitationExpiry("2026-11-04T12:00:00Z"), "04.11.2026 at 13:00 CET");
  const draft = new URL(invitationEmail(link));
  assert.ok(draft.searchParams.get("body").includes("expires on 04.11.2026 at 13:00 CET."));
});

test("expiry follows Central European daylight saving time and date rollover", () => {
  assert.equal(formatInvitationExpiry("2026-07-04T12:00:00Z"), "04.07.2026 at 14:00 CEST");
  assert.equal(formatInvitationExpiry("2026-11-04T23:30:00Z"), "05.11.2026 at 00:30 CET");
});
