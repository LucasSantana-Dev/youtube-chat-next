# youtube-chat-next

> Fetch YouTube live chat without the official API. **Unofficial continuation** of [youtube-chat](https://github.com/LinaTsukusu/youtube-chat) by [LinaTsukusu](https://github.com/LinaTsukusu), now maintained for modern YouTube.

**Original repository:** https://github.com/LinaTsukusu/youtube-chat  
**This fork:** https://github.com/LucasSantana-Dev/youtube-chat-next  
**License:** MIT (original copyright preserved)

---

## How this works & what that means

This library scrapes YouTube's private InnerTube endpoint (`/youtubei/v1/live_chat/get_live_chat`) by extracting an API key and continuation token from the watch page. **It is not the official YouTube Data API.** It is not affiliated with, endorsed by, or supported by YouTube or Google.

### Reality check

- **It can break at any time without notice.** YouTube's client is constantly changing. This library has survived 3.5 years unmaintained (v2.2.0, Dec 2022 → now), and it still works on today's YouTube. But that is *not* a guarantee for next month or next year.
- **Automated access may violate YouTube's Terms of Service.** You are responsible for your own use. In practice, enforcement is technical (rate-limiting, IP blocks) rather than legal. Decide for yourself whether this fits your use case.
- **The official alternative exists.** The YouTube Data API v3's `liveChatMessages.list` is compliant and quota-bound. **Real tradeoff:** it requires OAuth and can realistically only read chat for streams you own or moderate, not arbitrary public streams. This library reads any public stream but carries the risks above.

### Best practices

- **Always attach an `error` listener.** Node's EventEmitter throws if an `error` event fires with no listener, which will crash your process.
- **Datacenter and cloud IPs are rate-limited more aggressively than residential ones.** If you deploy on AWS, Google Cloud, or DigitalOcean and hit limits, honour the `RateLimitError` and its `Retry-After`, lower your request volume (a larger `interval`), and stop after bounded retries rather than hammering through the limit.

---

## What changed in this fork

Verified against live YouTube on 2026-07-15:

1. **Respects YouTube's polling rate.** YouTube's response includes `timeoutMs` (typically 10000ms) saying how often to poll. Upstream polled every 1000ms, ignoring this—about 10× more requests than YouTube invites. Now `interval` is a floor; the library honours `max(interval, timeoutMs)`. Measured: 71 messages delivered, 4 requests instead of ~33.

2. **No longer mutates the global axios.** Upstream set `axios.defaults.headers.common["Accept-Encoding"] = "utf-8"`, changing the singleton for your entire application. Now uses a private axios instance.

3. **Detects stream end.** When a stream ends, `continuationContents` disappears from YouTube's response. Upstream crashed with `TypeError`, swallowed it, and retried forever. Now emits an `end` event cleanly.

4. **No overlapping requests.** Replaced `setInterval` with a self-scheduling fetch loop. If a request takes longer than the polling interval, upstream would fire overlapping requests. Now each fetch waits for the previous one to complete.

5. **Typed errors.** Four new error classes let you distinguish "YouTube changed the page shape" from "rate limited" from "stream finished":
   - `ScrapeError` — parsing failed (YouTube likely changed the HTML/JSON structure)
   - `NotLiveError` — channel is not currently live
   - `RateLimitError` — 429 or 403 from YouTube (back off and retry)
   - `ParseError` — response is malformed

6. **Backoff with jitter on rate limits.** On 429/403, honours the `Retry-After` header, adds random jitter, and gives up after 5 consecutive failures instead of looping forever.

7. **Locale pinned via Accept-Language.** YouTube localises the watch page by IP address, so parsing previously depended on where your process ran. Now forces `Accept-Language: en-US` so parsing is stable.

8. **axios upgraded 1.2.0 → 1.18.1.** Axios 1.2.0 did not properly decompress YouTube's gzip/brotli responses. Upgrade is required for correctness.

9. **Live contract test + daily CI canary.** The test suite runs on frozen 2022 YouTube fixtures (cannot detect drift). Now `npm run test:live` runs against live YouTube daily to catch regressions early.

---

## Getting started

### 1. Install

```bash
npm install youtube-chat-next
```

or

```bash
yarn add youtube-chat-next
```

### 2. Import

**JavaScript**
```javascript
const { LiveChat } = require("youtube-chat-next")
```

**TypeScript**
```typescript
import { LiveChat } from "youtube-chat-next"
```

### 3. Create an instance

```javascript
// Option A: Pass channelId (recommended)
// The library will fetch the current liveId automatically.
const liveChat = new LiveChat({ channelId: "CHANNEL_ID_HERE" })

// Option B: Pass liveId directly
// Use this if you already know the live stream ID.
const liveChat = new LiveChat({ liveId: "LIVE_ID_HERE" })

// Option C: Pass a YouTube handle (starts with @)
const liveChat = new LiveChat({ handle: "@channel_name" })

// Optional: Set the polling interval (milliseconds)
// Default is 1000. YouTube typically suggests 10000.
// The library will honour whichever is greater.
const liveChat = new LiveChat(
  { channelId: "CHANNEL_ID" },
  5000  // interval in milliseconds
)
```

### 4. Add event listeners

```typescript
// Fires when the fetch loop starts successfully.
// liveId: string
liveChat.on("start", (liveId) => {
  console.log("Live chat started for stream:", liveId)
})

// Fires when a message arrives.
// chat: ChatItem (see Types section below)
liveChat.on("chat", (chatItem) => {
  // message is a MessageItem[] — each item is either a text run or an emoji.
  const text = chatItem.message.map((m) => ("text" in m ? m.text : m.emojiText)).join("")
  console.log(`${chatItem.author.name}: ${text}`)
})

// Fires when the stream ends or an unrecoverable error occurs.
// reason: string | undefined
liveChat.on("end", (reason) => {
  console.log("Stream ended:", reason)
})

// Fires on errors. REQUIRED — never omit this.
// Distinguishing errors helps you respond correctly:
// - ScrapeError/ParseError: YouTube changed; alert and stop.
// - RateLimitError: Back off and retry.
// - NotLiveError: No stream currently live.
liveChat.on("error", (err) => {
  if (err instanceof RateLimitError) {
    console.error("Rate limited. Backing off...")
  } else if (err instanceof ScrapeError) {
    console.error("YouTube structure changed. Stopping.")
  } else {
    console.error("Error:", err)
  }
})
```

### 5. Start the fetch loop

```typescript
// start() resolves to true if the stream is live and fetching,
// or false if setup failed (check the emitted error).
const ok = await liveChat.start()
if (!ok) {
  console.log("Failed to start. See error event for details.")
}
```

### 6. Stop the loop

```typescript
liveChat.stop("Stream ended by caller")
```

---

## Types

### ChatItem

A single message from the live chat.

```typescript
interface ChatItem {
  id: string                         // Unique message ID
  author: {
    name: string
    thumbnail?: ImageItem          // User's avatar
    channelId: string
    badge?: {                       // e.g. "Moderator", "New member"
      thumbnail: ImageItem
      label: string
    }
  }
  message: MessageItem[]            // Array of text + emoji
  superchat?: {                      // Paid message (YouTube Super Chat)
    amount: string                  // e.g. "US$1.00"
    color: string                   // Hex color
    sticker?: ImageItem             // Animated sticker
  }
  isMembership: boolean             // Is channel member?
  isVerified: boolean               // Verified account?
  isOwner: boolean                  // Stream owner?
  isModerator: boolean              // Moderator?
  timestamp: Date                   // Message time
}
```

### MessageItem

A single text or emoji element within a message.

```typescript
type MessageItem = { text: string } | EmojiItem
```

### ImageItem

A reference to an image (thumbnail, emoji, sticker).

```typescript
interface ImageItem {
  url: string    // Full URL
  alt: string    // Alt text / emoji name
}
```

### EmojiItem

An emoji or custom emote.

```typescript
interface EmojiItem extends ImageItem {
  emojiText: string      // Emoji as text (e.g., "😀") or custom name
  isCustomEmoji: boolean // Is this a channel custom emote?
}
```

### Error types

```typescript
import { LiveChat, ScrapeError, NotLiveError, RateLimitError, ParseError } from "youtube-chat-next"

// All inherit from Error and include:
// - message: string
// - name: "ScrapeError" | "NotLiveError" | "RateLimitError" | "ParseError"
```

---

## Known limitations

- **Chat tab assumption.** The library follows YouTube's default chat tab, which appears to be **"Top chat"** (algorithmically filtered subset) rather than **"Live chat"** (all messages chronologically). This is strongly suspected but not yet definitively proven. Tracking as an open issue. If you require all messages unfiltered, the official YouTube Data API is the reliable option.

---

## Examples

### Basic: listen to a channel's current stream

```typescript
import { LiveChat } from "youtube-chat-next"

const liveChat = new LiveChat({ channelId: "UCxxxxxxxxxxxxxx" })

liveChat.on("start", (liveId) => {
  console.log("Listening to:", liveId)
})

liveChat.on("chat", (chatItem) => {
  console.log(`[${chatItem.author.name}] ${chatItem.message
    .map(m => ("text" in m ? m.text : m.emojiText))
    .join("")}`)
})

liveChat.on("end", (reason) => {
  console.log("Stream ended:", reason)
})

liveChat.on("error", (err) => {
  console.error("Error:", err.message)
})

await liveChat.start()
// Listen until stop() is called
```

### Log to file with error handling

```typescript
import { LiveChat, RateLimitError, ScrapeError } from "youtube-chat-next"
import fs from "fs"

const log = fs.createWriteStream("chat.log", { flags: "a" })

const liveChat = new LiveChat({ liveId: "KHRj-j02a1w" })

liveChat.on("chat", (chatItem) => {
  const line = `${chatItem.timestamp.toISOString()} | ${chatItem.author.name}: ${
    chatItem.message.map(m => ("text" in m ? m.text : m.emojiText)).join("")
  }\n`
  log.write(line)
})

liveChat.on("error", (err) => {
  if (err instanceof RateLimitError) {
    // Rate limited — back off and retry
    console.warn("Rate limited. Waiting before retry...")
    setTimeout(() => liveChat.start(), 30000)
  } else if (err instanceof ScrapeError) {
    // YouTube changed page structure — needs a code update
    log.write(`CRITICAL: ${err.message}\n`)
  } else {
    log.write(`ERROR: ${String(err)}\n`)
  }
})

await liveChat.start()
```

---

## References & credits

- **Original library:** [youtube-chat](https://github.com/LinaTsukusu/youtube-chat) by [LinaTsukusu](https://github.com/LinaTsukusu) — thank you for the foundation.
- Reverse-engineering reference: https://drroot.page/wp/?p=227
- Python equivalent: https://github.com/taizan-hokuto/pytchat

This fork exists because the original is unmaintained. It preserves the spirit and API of the original while fixing real-world issues discovered over 3+ years of use.

---

## License

MIT. See LICENSE for details. Original copyright by LinaTsukusu, modifications by contributors.
