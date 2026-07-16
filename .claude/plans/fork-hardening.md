# Plan: youtube-chat fork, "works fully, trustable for the future"

**Date:** 2026-07-15
**Base:** LinaTsukusu/youtube-chat @ b8cdc3a (`develop`, v2.2.0, MIT)
**Decision:** Fork + harden in place. Keep native InnerTube engine. (Debate verdict below.)

---

## Goal

A fork of `youtube-chat` that (a) works against live YouTube today, (b) fails loudly and
early when YouTube drifts, (c) does not get its users IP-banned, (d) keeps the existing
public API so the 247-star consumer base can migrate by changing one dependency line.

## Evidence base (measured 2026-07-15, not assumed)

| Claim | Method | Result |
|---|---|---|
| Library works today | Built `dist`, ran against genuinely-live streams | liveId 71 chats/12s, channelId 74/14s, handle 74/14s, 0 errors, 0 dupes |
| InnerTube alive in 2026 | Scrape + POST `get_live_chat` | 200 OK; `INNERTUBE_API_KEY` + clientVersion `2.20260714.05.00` scrape fine |
| PO Token needed for chat? | yt-dlp PO Token Guide + live POST | **No**, PO tokens gate playback/GVS, not live chat |
| YouTube's requested poll rate | `continuations[0].*.timeoutMs` | **10000ms**. Library polls at fixed **1000ms** → ~10x over-poll |
| Issues #102 / #67 / #93 ("broken") | Direct repro attempt | **Did not reproduce.** Stale or geo/datacenter-IP specific |
| Surface stability | Upstream untouched since 2022-12, still works | **3.5 years unmaintained, still functional** |

> The 3.5-year-unmaintained-and-still-working result is the single most important fact.
> It refutes the "YouTube breaks scrapers every 6 months" consensus **for the live-chat
> surface specifically** (that consensus is drawn from the playback surface). Owning this
> surface is therefore cheap.

## Debate verdict

- **A, fork & harden: ADOPTED.** Works; 1190 LoC; zero migration friction; surface proven stable.
- **B, rewrite onto youtubei.js: REJECTED as engine; one insight kept.** Its premise (6-month
  churn) is refuted by measurement. But B is correct that *"it works today"* is a weak basis for a
  *future* trust claim, that is a **drift-detection** problem, not an engine problem. Phase 2 exists
  because of B.
- **C, pluggable transport seam: REJECTED (C conceded).** Data API v3 is OAuth-walled to streams
  you own/moderate, so it cannot serve the actual use case (arbitrary public streams). A seam with
  one real implementation at ship time is speculative generality.

**Revisit-when:** InnerTube live-chat breaks and stays broken >72h, OR PO-token/attestation is
observed on `get_live_chat`, OR the Phase-2 canary reds for reasons we cannot patch in <1 day.
Then reopen B (youtubei.js adapter). Not before.

## Scope

**In:** correctness + safety of the polling loop, drift detection, error taxonomy, parser
robustness, toolchain currency, docs honesty.
**Out:** sending messages (#68), replay chat (#25), a rewrite onto youtubei.js, a transport
abstraction, browser bundling (#101) unless it falls out free.

---

## Phase 1, Stop the harm (correctness + ban risk)

Fixes defects that damage the *consumer's* process or risk their IP. Highest value, lowest risk.

**Files:** `src/requests.ts`, `src/live-chat.ts`, `src/parser.ts`

1. **Respect YouTube's `timeoutMs`.** Parse `timeoutMs` from `invalidationContinuationData` /
   `timedContinuationData` and use it as the poll delay. Treat the constructor `interval` as a
   *floor*, not the rate. Replaces `setInterval` with a self-scheduling loop.
   *Why:* currently polls 10x faster than YouTube asks. This is the top ban vector and the single
   biggest "untrustable" property.
2. **Kill `setInterval` re-entrancy.** The self-scheduling loop from (1) inherently prevents
   overlapping in-flight fetches. (`live-chat.ts:45`)
3. **Stop mutating the consumer's axios.** `requests.ts:4` does
   `axios.defaults.headers.common["Accept-Encoding"] = "utf-8"`, global, leaks into the host app,
   and `utf-8` is not a valid `Accept-Encoding` value anyway. Replace with a module-private
   `axios.create()` instance carrying a real UA.
4. **Guard the response traversal.** `parser.ts:63` does unguarded
   `data.continuationContents.liveChatContinuation` → throws `TypeError` on stream end / error
   payloads, which the loop then swallows and retries forever.
5. **Detect stream end.** Absent `continuationContents` or absent next continuation ⇒ emit `end`,
   stop the loop. Today it error-loops silently forever.

**Verify:** `npm run build && node scratchpad/e2e2.mjs <liveId>`, expect chats > 0, dupes = 0,
errors = 0, **and** observed request rate ≈ 1 per 10s (not 1 per 1s).
**Done when:** all five land; live run is clean; request rate matches YouTube's `timeoutMs`.

## Phase 2, Make drift detectable (the actual trust fix)

The suite is 100% frozen fixtures + `jest.mock("axios")`. It cannot fail when YouTube changes.
This is *why* the library is untrustable, per both debaters.

6. **Live contract test**, opt-in via env (`YT_LIVE_TEST=1`), excluded from the default unit run:
   resolve a currently-live stream, assert the full chain, page scrape yields key + clientVersion
   + continuation; POST returns 200; response parses; ≥1 renderer recognized.
7. **Scheduled canary CI** (cron, daily). Runs the live contract test against a known perpetual
   live stream. Reds ⇒ opens an issue. This is the drift alarm.
8. **Unknown-renderer telemetry.** `parser.ts` silently `return null`s on unrecognized renderer
   types, so YouTube adding/renaming a renderer looks identical to "no new messages". Emit a
   `debug`/`unknown` signal instead of dropping.

**Verify:** inject a deliberate break (corrupt the API-key regex) ⇒ live test must FAIL; restore ⇒
must PASS.
**Done when:** the injected-break check fires. *A canary that has never been proven to fail is not
evidence.* (Per `feedback_verification_instrument_error_2026-07-15`, a clean check is only
evidence once you've shown it can go red.)

## Phase 3, Error taxonomy + resilience

9. **Typed errors.** Today every failure arrives as an opaque `error` event, so consumers cannot
   distinguish "stream ended" from "429, back off" from "regex broke, YouTube changed".
   Introduce discriminable error types.
10. **Backoff on 429/403** with jitter; surface `Retry-After` when present. Currently no status
    inspection at all.
11. **Bounded retry**, then `end` with a reason, instead of infinite silent error-looping.

**Verify:** unit tests per branch with mocked 429/403/malformed bodies (fixtures for failure modes
do not currently exist).

## Phase 4, Toolchain + supply chain

12. **Node 16 → 22/24 LTS** in `ci.yml` + `publish.yml` (Node 16 is EOL since 2023-09).
13. **Dep currency:** axios `1.2.0` → `1.18.1` (3.5yr of patches incl. CVEs); TS 4.9 → 5.x;
    jest 29 → 30; eslint 8 → 9/10; prettier 2 → 3.
14. **Replace `typed-emitter`** (last published 2022-06-28, unmaintained), Node's built-in
    `EventEmitter` generics cover this now. Drops a dep with zero behavior change.
15. **Coverage thresholds** in `jest.config.js` (currently none).

## Phase 5, Merge the worthwhile backlog

Cherry-pick, each behind a test:
- **PR #97** (narze), superchat/membership milestone with no message. Fixes crash **#96**. Ready.
- **PR #94** (advancedbear), `chatType` option: "Top chat" vs "Live chat". Fixes **#80**.
  ✅ Verified (Open Questions #80). **Do NOT cherry-pick #94 as-is**, see spec below.

### Phase 5a, `chatType` (Top vs Live), SPEC (2026-07-16)

**Why #94 can't be taken as-is:**
1. Its selection is positional (`Array.from(matchAll(/"continuation":"..."/g))[1]` = Top, `[2]` =
   Live), the exact 1.3MB-global-scan fragility this fork removed in `matchLiveChatContinuation`. Any
   payload reshuffle silently returns an unrelated token.
2. Its API puts `chatType` as constructor arg 2 (`new LiveChat(id, true)`); our fork already uses
   arg 2 as `interval`. Direct collision.
3. Boolean `true`/`false` is opaque at the call site.

**Decision, default = `"top"` (keep current behavior).** Rationale: goal (d) is drop-in migration for
the 247-star base by changing one dependency line. Flipping the default to Live/all changes the message
set every existing consumer receives. Top also matches YouTube's own web default. Live is **opt-in**.
(Reversible: a later major version can flip the default with a changelog note.)

**API** (non-breaking, append arg 3):
- `src/types/data.ts`: `export type ChatType = "top" | "live"`
- `LiveChat` constructor: `constructor(id: YoutubeId, interval = 1000, chatType: ChatType = "top")`,
  store `readonly #chatType`. Call site: `new LiveChat(id, 1000, "live")` (self-documenting vs `true`).

**Plumbing** (thread through, no logic elsewhere):
- `LiveChat.start()` → `fetchLivePage(this.#id, this.#chatType)`
- `requests.fetchLivePage(id, chatType = "top")` → `getOptionsFromLivePage(html, chatType)`
- `parser.getOptionsFromLivePage(data, chatType = "top")` → `matchLiveChatContinuation(data, chatType)`

**Selection** (`matchLiveChatContinuation(data, chatType)`), **IMPLEMENTED 2026-07-16, approach
revised by measurement:**
- `"top"` → **unchanged** (`continuations[0]`).
- `"live"` → the original spec (select the viewSelector sub-menu "Live chat" token) was **disproven
  by live measurement**: the sub-menu's own reload tokens (both Top and Live, 32 chars) are
  **rejected by `get_live_chat` with HTTP 400**. Only the long `continuations[0]` (~180 chars) is
  accepted. Top and Live tokens are byte-identical except one protobuf selector byte: `0x08 0x04` =
  Top (filtered), `0x08 0x01` = Live (all). **Implementation: take the Top continuation and flip that
  one byte** (`selectLiveView()` in `parser.ts`). Guard: exactly one `0x08 0x04` or
  `throw new ScrapeError("live-selector")`, never patch an unrelated field, never silently return Top.
- `#loop` needs **no change**: the filter rides inside the token, so the next continuation from
  `get_live_chat` preserves the view across polls (verified, live-contract test polls twice).
- Fragility acknowledged: byte-patching an opaque protobuf is more brittle than structural parsing,
  but it is the *only* path that works (sub-menu tokens 400). The `*.live.test.ts` drift alarm is the
  mitigation, it fails loud if YouTube changes the token shape.

**Tests (behind which this ships):**
1. Unit (frozen fixture): a watch-page fixture with both sub-menu items. Assert `("live")` and `("top")`
   return **different** tokens, each the correct one; assert missing viewSelector + `"live"` throws
   `ScrapeError`. Cheap regression guard: Top token has selector byte `08 04`, Live `08 01`.
2. Live-contract (`*.live.test.ts`): with `"live"`, `fetchLivePage` + `fetchChat` yields valid items
   **and** a next continuation; poll a 2nd time and confirm it still works (filter continuity). This is
   the measurement-behind-a-test the plan requires.

**More-robust fallback (only if title-match proves flaky in the live test):** decode each sub-menu
item's reload-token protobuf and select the one whose selector byte is `08 01`, locale- and
order-independent. Heavier; not needed unless #1 above flakes.
- **#69**, emoji parser `Cannot read properties of undefined (reading '0')`; unguarded
  `.shift()` on thumbnails. Fixed by Phase 1 guarding.
- **PR #95**, json5 security bump (obsolete after Phase 4).
- **PR #78** (membership gifting), incomplete (no gift count). Rewrite or drop.

## Phase 6, Honest docs + release

16. **README:** state plainly that this uses YouTube's private InnerTube endpoint, is not
    affiliated with/endorsed by YouTube, may break without notice, and that heavy automated use may
    violate YouTube ToS and risk IP blocks. Document the official Data API v3 as the compliant
    alternative *and* its real constraint (OAuth; only streams you own/moderate).
17. **Fork notice + attribution**, MIT requires preserving the original copyright. Credit
    LinaTsukusu; state clearly this is an unofficial continuation.
18. **Release:** semver from the fork point, changelog, publish under the chosen name.

---

## Open questions (unresolved, do not assert either way)

- **Top chat vs Live chat (#80). RESOLVED 2026-07-16 by measurement (live @LofiGirl).** The scraped
  `continuations[0]` is YouTube's **"Top chat"** (algorithmically filtered subset), NOT "Live chat"
  (all messages). Three confirmations: (1) `viewSelector` selected item = "Top chat"; (2) Top vs Live
  reload tokens are byte-identical except byte 14, `08 04` (Top, filter=4) vs `08 01` (Live,
  filter=1); (3) the grabbed `continuations[0]` embeds selector field `#1 varint=4` = Top. So
  consumers silently get a filtered stream while believing they get everything, a real
  correctness/trust bug. **PR #94 (`chatType` option) is confirmed important.** Default decision
  (FINALIZED, implemented): default stays **`"top"`**, matching YouTube's own web default and keeping
  existing consumers' behavior unchanged (drop-in migration). `"live"` is opt-in. Flipping the
  default to Live/all was considered and rejected as a breaking change; it can be revisited in a
  future major version with a changelog note.
- **Datacenter-IP behavior.** All measurements were from a residential IP. Issues #67/#93 (403
  consent) may be datacenter-IP-specific. Untested from a cloud host; do not claim it works there.

## Risks

- Fork inherits a dead lib's reputation; needs a real drift-alarm story to be trusted (Phase 2).
- Solo bus factor, mitigated by tiny surface + canary, not eliminated.
- ToS: InnerTube use is against YouTube ToS. Enforcement is technical (rate-limit/IP block), not
  legal, but Phase 1 (respect `timeoutMs`) and Phase 6 (honest docs) are the mitigations.
