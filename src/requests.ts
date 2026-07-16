import axios, { AxiosError } from "axios"
import { parseChatData, getOptionsFromLivePage } from "./parser"
import { FetchOptions } from "./types/yt-response"
import { ChatItem, YoutubeId } from "./types/data"
import { NotLiveError, RateLimitError } from "./errors"

/**
 * A private axios instance.
 *
 * Upstream assigned to `axios.defaults.headers.common`, which mutated the *consumer's* axios
 * singleton — every unrelated request in the host application inherited those headers.
 */
const http = axios.create({
  headers: {
    // Without a browser-like UA YouTube serves a different page, sometimes a consent wall.
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    // Pin the locale. YouTube localises the watch page by IP, so without this the page — including
    // the chat tab labels inside it — comes back in the language of wherever the process runs.
    "Accept-Language": "en-US,en;q=0.9",
    // Skips the EU consent interstitial, which otherwise replaces the page we need.
    Cookie: "SOCS=CAI",
  },
  timeout: 30_000,
})

function toRateLimitError(err: unknown): RateLimitError | undefined {
  const res = (err as AxiosError)?.response
  if (res?.status !== 429 && res?.status !== 403) {
    return undefined
  }
  return new RateLimitError(res.status, parseRetryAfter(res.headers?.["retry-after"]))
}

/** Retry-After is either delta-seconds ("120") or an HTTP-date (RFC 7231). Handle both. */
function parseRetryAfter(header: unknown): number | undefined {
  if (typeof header !== "string") {
    return undefined
  }
  const seconds = Number(header)
  if (Number.isFinite(seconds)) {
    // A finite seconds value can still overflow to Infinity once multiplied, and "-1" is negative.
    const delayMs = seconds * 1000
    return Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : undefined
  }
  const dateMs = Date.parse(header)
  if (Number.isNaN(dateMs)) {
    return undefined
  }
  return Math.max(0, dateMs - Date.now())
}

/**
 * Fetch one page of chat.
 *
 * Returns the items, the next continuation token, and how long YouTube asks us to wait before
 * asking again. An empty continuation means the stream is over.
 */
export async function fetchChat(options: FetchOptions): Promise<[ChatItem[], string, number]> {
  const url = `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${options.apiKey}`
  try {
    const res = await http.post(url, {
      context: {
        client: {
          clientVersion: options.clientVersion,
          clientName: "WEB",
        },
      },
      continuation: options.continuation,
    })
    return parseChatData(res.data)
  } catch (err) {
    throw toRateLimitError(err) ?? err
  }
}

export async function fetchLivePage(id: { channelId: string } | { liveId: string } | { handle: string }) {
  const url = generateLiveUrl(id)
  if (!url) {
    throw new TypeError("not found id")
  }
  try {
    const res = await http.get(url)
    return getOptionsFromLivePage(res.data.toString())
  } catch (err) {
    const rateLimited = toRateLimitError(err)
    if (rateLimited) {
      throw rateLimited
    }
    if ((err as AxiosError)?.response?.status === 404) {
      throw new NotLiveError(`No live stream found for ${url}`)
    }
    throw err
  }
}

function generateLiveUrl(id: YoutubeId) {
  if ("channelId" in id) {
    return `https://www.youtube.com/channel/${id.channelId}/live`
  } else if ("liveId" in id) {
    return `https://www.youtube.com/watch?v=${id.liveId}`
  } else if ("handle" in id) {
    let handle = id.handle
    if (!handle.startsWith("@")) {
      handle = "@" + handle
    }
    return `https://www.youtube.com/${handle}/live`
  }
  return ""
}
