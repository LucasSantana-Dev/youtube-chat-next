import { EventEmitter } from "events"
import TypedEmitter from "typed-emitter"
import { ChatItem, ChatType, YoutubeId } from "./types/data"
import { FetchOptions } from "./types/yt-response"
import { fetchChat, fetchLivePage } from "./requests"
import { RateLimitError, ScrapeError } from "./errors"

type LiveChatEvents = {
  start: (liveId: string) => void
  end: (reason?: string) => void
  chat: (chatItem: ChatItem) => void
  error: (err: Error | unknown) => void
}

/** Consecutive failures tolerated before giving up and ending the stream. */
const MAX_CONSECUTIVE_ERRORS = 5

/**
 * YouTubeライブチャット取得イベント
 */
export class LiveChat extends (EventEmitter as new () => TypedEmitter<LiveChatEvents>) {
  liveId?: string
  #options?: FetchOptions
  #running = false
  #timer?: NodeJS.Timeout
  #errorCount = 0
  readonly #interval: number
  readonly #id: YoutubeId
  readonly #chatType: ChatType

  /**
   * @param id channelId, liveId, or handle of the stream to follow.
   * @param interval Minimum milliseconds between polls. This is a *floor*: YouTube states how often
   *   it wants to be polled (typically every 10s) and we honour whichever is slower. Upstream
   *   treated this value as a fixed rate and so polled ~10x faster than YouTube asks for, which is
   *   the quickest way to get an IP rate-limited.
   * @param chatType `"top"` (default) reads YouTube's filtered "Top chat"; `"live"` reads every
   *   message ("Live chat"). Default is `"top"` to match YouTube's own default and keep existing
   *   consumers' behavior unchanged.
   */
  constructor(id: YoutubeId, interval = 1000, chatType: ChatType = "top") {
    super()
    if (!id || (!("channelId" in id) && !("liveId" in id) && !("handle" in id))) {
      throw TypeError("Required channelId or liveId or handle.")
    } else if ("liveId" in id) {
      this.liveId = id.liveId
    }

    this.#id = id
    this.#interval = interval
    this.#chatType = chatType
  }

  async start(): Promise<boolean> {
    if (this.#running) {
      return false
    }
    try {
      const options = await fetchLivePage(this.#id, this.#chatType)
      this.liveId = options.liveId
      this.#options = options
      this.#running = true
      this.#errorCount = 0

      this.emit("start", this.liveId)
      void this.#loop(options)
      return true
    } catch (err) {
      this.emit("error", err)
      return false
    }
  }

  stop(reason?: string) {
    if (!this.#running) {
      return
    }
    this.#running = false
    if (this.#timer) {
      clearTimeout(this.#timer)
      this.#timer = undefined
    }
    this.emit("end", reason)
  }

  /**
   * Poll until the stream ends or `stop()` is called.
   *
   * Self-scheduling rather than `setInterval`, because a fixed interval fires whether or not the
   * previous request has come back, so a slow response overlaps the next one and both send the
   * same continuation token.
   */
  async #loop(options: FetchOptions) {
    while (this.#running) {
      let delay = this.#interval

      try {
        const [chatItems, continuation, timeoutMs] = await fetchChat(options)
        if (!this.#running) {
          return
        }

        chatItems.forEach((chatItem) => this.emit("chat", chatItem))
        this.#errorCount = 0

        // No further continuation: YouTube has nothing left to give. The stream is over.
        if (!continuation) {
          this.stop("Live stream ended")
          return
        }

        options.continuation = continuation
        delay = Math.max(this.#interval, timeoutMs)
      } catch (err) {
        if (!this.#running) {
          return
        }
        this.emit("error", err)
        this.#errorCount++

        // A scrape failure means YouTube changed shape. Retrying cannot fix that.
        if (err instanceof ScrapeError) {
          this.stop(err.message)
          return
        }
        if (this.#errorCount >= MAX_CONSECUTIVE_ERRORS) {
          this.stop(`Stopped after ${this.#errorCount} consecutive errors. Last: ${String(err)}`)
          return
        }
        delay = this.#backoffFor(err)
      }

      await this.#sleep(delay)
    }
  }

  /** Exponential backoff with jitter, honouring Retry-After when YouTube sends one. */
  #backoffFor(err: unknown): number {
    if (err instanceof RateLimitError && err.retryAfterMs) {
      return err.retryAfterMs
    }
    const base = Math.min(this.#interval * 2 ** this.#errorCount, 60_000)
    return base + Math.random() * 1000
  }

  /** Interruptible sleep, `stop()` clears the timer rather than waiting it out. */
  #sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.#timer = setTimeout(resolve, ms)
    })
  }
}
