/**
 * Error taxonomy.
 *
 * The upstream library surfaced every failure as an opaque `error` event, so consumers could not
 * tell "the stream ended" apart from "we are being rate limited" apart from "YouTube changed its
 * HTML and our scraping broke". Those need different reactions, so they get different types.
 */

/** Base class for every error this library emits. */
export abstract class YoutubeChatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/**
 * The live page could not be scraped: a required token was missing.
 *
 * Almost always means YouTube changed its page shape and this library needs a patch — as opposed
 * to a transient failure. Consumers should treat this as "stop and alert", not "retry".
 */
export class ScrapeError extends YoutubeChatError {
  constructor(
    readonly field: string,
    message?: string
  ) {
    super(message ?? `Could not find "${field}" on the live page. YouTube's page shape may have changed.`)
  }
}

/** The requested stream does not exist, is not live, or is a finished/replay stream. */
export class NotLiveError extends YoutubeChatError {}

/** YouTube rate limited (429) or rejected (403) the request. */
export class RateLimitError extends YoutubeChatError {
  constructor(
    readonly status: number,
    readonly retryAfterMs?: number
  ) {
    super(
      `YouTube responded ${status}.` +
        (retryAfterMs ? ` Retry-After: ${Math.round(retryAfterMs / 1000)}s.` : "") +
        " Poll less aggressively or use a different IP."
    )
  }
}

/**
 * A chat response arrived but did not parse into the shape we expect.
 *
 * Like ScrapeError, this is a drift signal rather than a transient fault.
 */
export class ParseError extends YoutubeChatError {}
