// `requests` talks to a private axios instance rather than the axios singleton, so the singleton's
// `create` is mocked to hand back the spies.
const mockPost = jest.fn()
const mockGet = jest.fn()
jest.mock("axios", () => ({
  __esModule: true,
  default: { create: () => ({ post: mockPost, get: mockGet }) },
}))

import { fetchLivePage, fetchChat } from "../src/requests"
import { RateLimitError } from "../src/errors"
jest.mock("../src/parser")
import { parseChatData, getOptionsFromLivePage } from "../src/parser"

/** Shape a rejection like an axios error carrying a response + headers. */
function axiosError(status: number, headers: Record<string, string> = {}) {
  return { response: { status, headers } }
}

const mockParseChatData = parseChatData as jest.Mock
const mockGetOptionsFromLivePage = getOptionsFromLivePage as jest.Mock

beforeEach(() => {
  mockPost.mockReset()
  mockGet.mockReset()
})

describe("requests", () => {
  describe("fetchChat", () => {
    test("Request", async () => {
      mockPost.mockResolvedValue({ data: "responseData" })
      const options = {
        apiKey: "apiKey",
        clientVersion: "clientVersion",
        continuation: "continuation",
      }
      await fetchChat(options)
      expect(mockPost).toHaveBeenCalledWith(
        `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${options.apiKey}`,
        {
          context: {
            client: {
              clientVersion: options.clientVersion,
              clientName: "WEB",
            },
          },
          continuation: options.continuation,
        }
      )
      expect(mockParseChatData).toHaveBeenCalledWith("responseData")
    })

    test("maps 429 to RateLimitError with numeric Retry-After", async () => {
      mockPost.mockRejectedValue(axiosError(429, { "retry-after": "120" }))
      await expect(fetchChat({ apiKey: "k", clientVersion: "v", continuation: "c" })).rejects.toMatchObject({
        constructor: RateLimitError,
        status: 429,
        retryAfterMs: 120_000,
      })
    })

    test("parses an HTTP-date Retry-After into a positive delay", async () => {
      const when = new Date(Date.now() + 45_000).toUTCString()
      mockPost.mockRejectedValue(axiosError(403, { "retry-after": when }))
      let caught: unknown
      await fetchChat({ apiKey: "k", clientVersion: "v", continuation: "c" }).catch((e) => (caught = e))
      expect(caught).toBeInstanceOf(RateLimitError)
      // ~45s out; allow slack for clock drift during the test.
      expect((caught as RateLimitError).retryAfterMs).toBeGreaterThan(30_000)
      expect((caught as RateLimitError).retryAfterMs).toBeLessThanOrEqual(45_000)
    })

    test("leaves retryAfterMs undefined when Retry-After is absent", async () => {
      mockPost.mockRejectedValue(axiosError(429))
      let caught: unknown
      await fetchChat({ apiKey: "k", clientVersion: "v", continuation: "c" }).catch((e) => (caught = e))
      expect((caught as RateLimitError).retryAfterMs).toBeUndefined()
    })

    test.each([
      ["negative", "-1"],
      ["multiply-overflow", "1e306"],
      ["already-infinite", "1e309"],
      ["garbage", "soon"],
    ])("ignores a %s Retry-After rather than producing a bad delay", async (_label, value) => {
      mockPost.mockRejectedValue(axiosError(429, { "retry-after": value }))
      let caught: unknown
      await fetchChat({ apiKey: "k", clientVersion: "v", continuation: "c" }).catch((e) => (caught = e))
      expect((caught as RateLimitError).retryAfterMs).toBeUndefined()
    })
  })

  describe("fetchLivePage", () => {
    test("ChannelID request", async () => {
      mockGet.mockResolvedValue({ data: "responseData" })
      await fetchLivePage({ channelId: "channelId" })
      expect(mockGet).toHaveBeenCalledWith("https://www.youtube.com/channel/channelId/live")
      expect(mockGetOptionsFromLivePage).toHaveBeenCalledWith("responseData")
    })

    test("LiveID request", async () => {
      mockGet.mockResolvedValue({ data: "responseData" })
      await fetchLivePage({ liveId: "liveId" })
      expect(mockGet).toHaveBeenCalledWith("https://www.youtube.com/watch?v=liveId")
      expect(mockGetOptionsFromLivePage).toHaveBeenCalledWith("responseData")
    })

    test("Handle request", async () => {
      mockGet.mockResolvedValue({ data: "responseData" })
      await fetchLivePage({ handle: "@handle" })
      expect(mockGet).toHaveBeenCalledWith("https://www.youtube.com/@handle/live")
      expect(mockGetOptionsFromLivePage).toHaveBeenCalledWith("responseData")
    })

    test("Handle without '@' request", async () => {
      mockGet.mockResolvedValue({ data: "responseData" })
      await fetchLivePage({ handle: "handle" })
      expect(mockGet).toHaveBeenCalledWith("https://www.youtube.com/@handle/live")
      expect(mockGetOptionsFromLivePage).toHaveBeenCalledWith("responseData")
    })
  })
})
