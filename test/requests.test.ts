// `requests` talks to a private axios instance rather than the axios singleton, so the singleton's
// `create` is mocked to hand back the spies.
const mockPost = jest.fn()
const mockGet = jest.fn()
jest.mock("axios", () => ({
  __esModule: true,
  default: { create: () => ({ post: mockPost, get: mockGet }) },
}))

import { fetchLivePage, fetchChat } from "../src/requests"
jest.mock("../src/parser")
import { parseChatData, getOptionsFromLivePage } from "../src/parser"

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
