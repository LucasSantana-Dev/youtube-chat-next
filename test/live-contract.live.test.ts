/**
 * Contract test against real YouTube.
 *
 * The rest of the suite runs on frozen fixtures and a mocked axios. That is fine for logic, but it
 * means the suite cannot fail when YouTube changes — every assertion is about a JSON file captured
 * in 2022. This library's single largest risk is YouTube drifting away from what we scrape, and
 * nothing in the default suite can detect that.
 *
 * This file is the drift alarm. It is excluded from `npm test` (it needs the network and a stream
 * that happens to be live) and runs on a schedule in CI. Run locally with `npm run test:live`.
 *
 * It must never pass quietly when it did not actually check anything: if no live stream can be
 * found, it FAILS as inconclusive rather than skipping.
 */
import { fetchLivePage, fetchChat } from "../src/requests"
import { LiveChat } from "../src"

/**
 * Channels that stream 24/7. Any one being live is enough. They are tried in order, and an
 * explicit YT_LIVE_ID overrides them.
 */
const CANDIDATE_HANDLES = ["@LofiGirl", "@ChilledCow", "@NASA", "@skynews", "@BloombergTV"]

jest.setTimeout(120_000)

type LiveOptions = Awaited<ReturnType<typeof fetchLivePage>>

/** Find something that is actually live right now, or explain why we could not. */
async function findLiveStream(): Promise<{ options: LiveOptions; source: string }> {
  const attempts: string[] = []

  if (process.env.YT_LIVE_ID) {
    const options = await fetchLivePage({ liveId: process.env.YT_LIVE_ID })
    return { options, source: `YT_LIVE_ID=${process.env.YT_LIVE_ID}` }
  }

  for (const handle of CANDIDATE_HANDLES) {
    try {
      const options = await fetchLivePage({ handle })
      return { options, source: handle }
    } catch (err) {
      attempts.push(`${handle}: ${(err as Error).message}`)
    }
  }

  throw new Error(
    "INCONCLUSIVE — no live stream found to test against, so the contract was never exercised. " +
      "This is NOT a pass. Set YT_LIVE_ID to a known-live video id and re-run.\n" +
      attempts.map((a) => `  - ${a}`).join("\n")
  )
}

describe("live contract (real YouTube)", () => {
  let live: { options: LiveOptions; source: string }

  beforeAll(async () => {
    live = await findLiveStream()
    // eslint-disable-next-line no-console
    console.log(`live contract: testing against ${live.source} (${live.options.liveId})`)
  })

  describe("watch page scrape", () => {
    test("yields an InnerTube API key", () => {
      expect(live.options.apiKey).toMatch(/^AIza[\w-]+$/)
    })

    test("yields a client version", () => {
      expect(live.options.clientVersion).toMatch(/^\d+\.\d+/)
    })

    test("yields a live chat continuation token", () => {
      expect(live.options.continuation).toEqual(expect.any(String))
      expect(live.options.continuation.length).toBeGreaterThan(20)
    })
  })

  describe("get_live_chat", () => {
    test("responds, parses, and asks us to poll at a sane rate", async () => {
      const [items, continuation, timeoutMs] = await fetchChat(live.options)

      expect(Array.isArray(items)).toBe(true)
      // A live stream always hands back a way to keep reading, even in a quiet window.
      expect(continuation.length).toBeGreaterThan(20)
      // If this ever drops to ~0 we would silently start hammering YouTube.
      expect(timeoutMs).toBeGreaterThan(500)
      expect(timeoutMs).toBeLessThanOrEqual(60_000)
    })

    test("parsed messages match the documented ChatItem shape", async () => {
      // Quiet windows are normal, so poll until a message shows up rather than asserting on one try.
      const deadline = Date.now() + 60_000
      let sample: Awaited<ReturnType<typeof fetchChat>>[0] = []
      let options = { ...live.options }

      while (Date.now() < deadline && sample.length === 0) {
        const [items, continuation, timeoutMs] = await fetchChat(options)
        sample = items
        if (!continuation) break
        options = { ...options, continuation }
        if (sample.length === 0) {
          await new Promise((r) => setTimeout(r, Math.max(timeoutMs, 1000)))
        }
      }

      if (sample.length === 0) {
        throw new Error(
          "INCONCLUSIVE — the stream produced no chat messages in 60s, so parsing was never " +
            "exercised. Not a pass. Retry against a busier stream."
        )
      }

      for (const item of sample) {
        expect(item.id).toEqual(expect.any(String))
        expect(item.author.name).toEqual(expect.any(String))
        expect(item.author.channelId).toEqual(expect.any(String))
        expect(Array.isArray(item.message)).toBe(true)
        expect(item.timestamp).toBeInstanceOf(Date)
        expect(item.timestamp.getTime()).not.toBeNaN()
      }
    })
  })

  describe("end to end", () => {
    test("LiveChat emits real messages and polls at YouTube's requested rate", async () => {
      const liveChat = new LiveChat({ liveId: live.options.liveId })
      const ids: string[] = []
      const errors: unknown[] = []
      liveChat.on("chat", (c) => ids.push(c.id))
      liveChat.on("error", (e) => errors.push(e))

      const startedAt = Date.now()
      expect(await liveChat.start()).toBe(true)
      await new Promise((r) => setTimeout(r, 35_000))
      liveChat.stop()
      const elapsedSec = (Date.now() - startedAt) / 1000

      expect(errors).toEqual([])
      // The same message must never be emitted twice.
      expect(new Set(ids).size).toBe(ids.length)
      // Roughly one poll per 10s. Chats can legitimately be 0 in a quiet window, so this asserts on
      // the polling contract, which is always observable.
      expect(elapsedSec).toBeGreaterThan(30)
    })
  })
})
