import { LiveChat } from "../src"
import { ChatItem } from "../src/types/data"
import { RateLimitError, ScrapeError } from "../src/errors"

jest.mock("../src/requests")
import { fetchChat, fetchLivePage } from "../src/requests"

const chatItem: ChatItem = {
  id: "id",
  author: {
    name: "authorName",
    thumbnail: { url: "https://author.thumbnail.url", alt: "authorName" },
    channelId: "channelId",
  },
  message: [{ text: "Hello, World!" }],
  isMembership: false,
  isVerified: false,
  isOwner: false,
  isModerator: false,
  timestamp: new Date("2021-01-01"),
}

const mockFetchChat = fetchChat as jest.Mock
const mockFetchLivePage = fetchLivePage as jest.Mock

/** Resolve once `event` fires, or reject if it takes longer than `ms`. */
function once(emitter: LiveChat, event: "chat" | "error" | "end", ms = 2000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), ms)
    emitter.once(
      event as never,
      ((payload: unknown) => {
        clearTimeout(timer)
        resolve(payload)
      }) as never
    )
  })
}

beforeEach(() => {
  mockFetchChat.mockReset()
  mockFetchLivePage.mockReset()
  // [items, continuation, timeoutMs] — YouTube asks to be polled every 10s.
  mockFetchChat.mockResolvedValue([[chatItem], "continuation", 10_000])
  mockFetchLivePage.mockResolvedValue({
    liveId: "liveId",
    apiKey: "apiKey",
    clientVersion: "clientVersion",
    continuation: "continuation",
  })
})

describe("LiveChat", () => {
  describe("constructor", () => {
    test("LiveID", () => {
      const liveChat = new LiveChat({ liveId: "liveId" })
      expect(liveChat).toBeInstanceOf(LiveChat)
      expect(liveChat.liveId).toBe("liveId")
    })

    test("ChannelID", () => {
      expect(new LiveChat({ channelId: "channelId" })).toBeInstanceOf(LiveChat)
    })

    test("No IDs Error", () => {
      // eslint-disable-next-line
      // @ts-ignore
      expect(() => new LiveChat()).toThrow("Required channelId or liveId or handle.")
    })
  })

  describe("lifecycle", () => {
    test("Start emits start", async () => {
      const liveChat = new LiveChat({ channelId: "channelId" })
      const onStart = jest.fn()
      liveChat.on("start", onStart)
      expect(await liveChat.start()).toBe(true)
      expect(onStart).toHaveBeenCalledWith(expect.any(String))
      liveChat.stop()
    })

    test("Stop emits end with reason", async () => {
      const liveChat = new LiveChat({ channelId: "channelId" })
      const onEnd = jest.fn()
      liveChat.on("end", onEnd)
      await liveChat.start()
      liveChat.stop("STOP")
      expect(onEnd).toHaveBeenCalledWith("STOP")
    })

    test("Start while running returns false, and works again after stop", async () => {
      const liveChat = new LiveChat({ channelId: "channelId" })
      const onStart = jest.fn()
      liveChat.on("start", onStart)
      await liveChat.start()
      expect(await liveChat.start()).toBe(false)
      expect(onStart).toHaveBeenCalledTimes(1)
      liveChat.stop()
      expect(await liveChat.start()).toBe(true)
      expect(onStart).toHaveBeenCalledTimes(2)
      liveChat.stop()
    })

    test("Stop is idempotent — emits end only once", async () => {
      const liveChat = new LiveChat({ channelId: "channelId" })
      const onEnd = jest.fn()
      liveChat.on("end", onEnd)
      await liveChat.start()
      liveChat.stop("first")
      liveChat.stop("second")
      expect(onEnd).toHaveBeenCalledTimes(1)
    })
  })

  describe("chat", () => {
    test("On chat", async () => {
      const liveChat = new LiveChat({ channelId: "channelId" })
      const received = once(liveChat, "chat")
      await liveChat.start()
      expect(await received).toMatchObject({ id: "id", message: [{ text: "Hello, World!" }] })
      liveChat.stop()
    })

    test("Honours YouTube's timeoutMs instead of the interval floor", async () => {
      // interval is a floor; YouTube asked for 10s, so a second poll must not happen immediately.
      const liveChat = new LiveChat({ channelId: "channelId" }, 10)
      await liveChat.start()
      await new Promise((r) => setTimeout(r, 150))
      liveChat.stop()
      expect(mockFetchChat).toHaveBeenCalledTimes(1)
    })

    test("Uses the interval floor when it is slower than YouTube's request", async () => {
      mockFetchChat.mockResolvedValue([[chatItem], "continuation", 1])
      const liveChat = new LiveChat({ channelId: "channelId" }, 50_000)
      await liveChat.start()
      await new Promise((r) => setTimeout(r, 150))
      liveChat.stop()
      expect(mockFetchChat).toHaveBeenCalledTimes(1)
    })
  })

  describe("errors", () => {
    test("On error while starting", async () => {
      mockFetchLivePage.mockRejectedValueOnce(new Error("ERROR"))
      const liveChat = new LiveChat({ channelId: "channelId" })
      const onError = jest.fn()
      liveChat.on("error", onError)
      expect(await liveChat.start()).toBe(false)
      expect(onError).toHaveBeenCalledWith(new Error("ERROR"))
    })

    test("Error while fetching chat is emitted, not thrown", async () => {
      mockFetchChat.mockRejectedValueOnce(new Error("ERROR"))
      const liveChat = new LiveChat({ channelId: "channelId" }, 10)
      const received = once(liveChat, "error")
      await liveChat.start()
      expect(await received).toEqual(new Error("ERROR"))
      liveChat.stop()
    })

    test("Empty continuation ends the stream instead of polling forever", async () => {
      mockFetchChat.mockResolvedValue([[], "", 0])
      const liveChat = new LiveChat({ channelId: "channelId" }, 10)
      const ended = once(liveChat, "end")
      await liveChat.start()
      expect(await ended).toBe("Live stream ended")
    })

    test("ScrapeError stops immediately — retrying cannot fix a page-shape change", async () => {
      mockFetchChat.mockRejectedValue(new ScrapeError("continuation"))
      const liveChat = new LiveChat({ channelId: "channelId" }, 10)
      liveChat.on("error", jest.fn())
      const ended = once(liveChat, "end")
      await liveChat.start()
      await ended
      expect(mockFetchChat).toHaveBeenCalledTimes(1)
    })

    test("Gives up after repeated failures rather than looping forever", async () => {
      mockFetchChat.mockRejectedValue(new Error("boom"))
      const liveChat = new LiveChat({ channelId: "channelId" }, 1)
      liveChat.on("error", jest.fn())
      const ended = once(liveChat, "end", 5000)
      await liveChat.start()
      expect(await ended).toContain("consecutive errors")
      expect(mockFetchChat).toHaveBeenCalledTimes(5)
    })

    test("Honours Retry-After from a RateLimitError", async () => {
      mockFetchChat.mockRejectedValueOnce(new RateLimitError(429, 30_000))
      const liveChat = new LiveChat({ channelId: "channelId" }, 10)
      const received = once(liveChat, "error")
      await liveChat.start()
      expect(await received).toBeInstanceOf(RateLimitError)
      // Must wait out the 30s Retry-After rather than immediately retrying.
      await new Promise((r) => setTimeout(r, 150))
      expect(mockFetchChat).toHaveBeenCalledTimes(1)
      liveChat.stop()
    })
  })
})
