import { getOptionsFromLivePage, parseChatData } from "../src/parser"
import { ScrapeError } from "../src/errors"
import { readFileSync } from "fs"

describe("Parser", () => {
  describe("parseChatData", () => {
    test("Normal", () => {
      const res = JSON.parse(readFileSync(__dirname + "/testdata/get_live_chat.normal.json").toString())
      const [chatItems, continuation] = parseChatData(res)
      expect(continuation).toBe("test-continuation:01")
      expect(chatItems).toMatchObject([
        {
          id: "id",
          author: {
            name: "authorName",
            thumbnail: {
              url: "https://author.thumbnail.url",
              alt: "authorName",
            },
            channelId: "channelId",
          },
          message: [
            {
              text: "Hello, World!",
            },
          ],
          isMembership: false,
          isVerified: false,
          isOwner: false,
          isModerator: false,
          timestamp: new Date("2021-01-01"),
        },
      ])
    })

    test("Included Global Emoji 1", () => {
      const res = JSON.parse(readFileSync(__dirname + "/testdata/get_live_chat.global-emoji1.json").toString())
      const [chatItems, continuation] = parseChatData(res)
      expect(continuation).toBe("test-continuation:01")
      expect(chatItems).toMatchObject([
        {
          id: "id",
          author: {
            name: "authorName",
            thumbnail: {
              url: "https://author.thumbnail.url",
              alt: "authorName",
            },
            channelId: "channelId",
          },
          message: [
            {
              url: "https://www.youtube.com/s/gaming/emoji/828cb648/emoji_u1f44f.svg",
              alt: ":clapping_hands:",
              isCustomEmoji: false,
              emojiText: "👏",
            },
          ],
          isMembership: false,
          isVerified: false,
          isOwner: false,
          isModerator: false,
          timestamp: new Date("2021-01-01"),
        },
      ])
    })

    test("Included Global Emoji 2", () => {
      const res = JSON.parse(readFileSync(__dirname + "/testdata/get_live_chat.global-emoji2.json").toString())
      const [chatItems, continuation] = parseChatData(res)
      expect(continuation).toBe("test-continuation:01")
      expect(chatItems).toMatchObject([
        {
          id: "id",
          author: {
            name: "authorName",
            thumbnail: {
              url: "https://author.thumbnail.url",
              alt: "authorName",
            },
            channelId: "channelId",
          },
          message: [
            {
              url: "https://www.youtube.com/s/gaming/emoji/0f0cae22/emoji_u1f44f_1f3ff.svg",
              alt: "",
              isCustomEmoji: false,
              emojiText: "👏🏿",
            },
          ],
          isMembership: false,
          isVerified: false,
          isOwner: false,
          isModerator: false,
          timestamp: new Date("2021-01-01"),
        },
      ])
    })

    test("Included Custom Emoji", () => {
      const res = JSON.parse(readFileSync(__dirname + "/testdata/get_live_chat.custom-emoji.json").toString())
      const [chatItems, continuation] = parseChatData(res)
      expect(continuation).toBe("test-continuation:01")
      expect(chatItems).toMatchObject([
        {
          id: "id",
          author: {
            name: "authorName",
            thumbnail: {
              url: "https://author.thumbnail.url",
              alt: "authorName",
            },
            channelId: "channelId",
          },
          message: [
            {
              url: "https://custom.emoji.url",
              alt: ":customEmoji:",
              isCustomEmoji: true,
              emojiText: ":customEmoji:",
            },
          ],
          isMembership: false,
          isVerified: false,
          isOwner: false,
          isModerator: false,
          timestamp: new Date("2021-01-01"),
        },
      ])
    })

    test("From Membership", () => {
      const res = JSON.parse(readFileSync(__dirname + "/testdata/get_live_chat.from-member.json").toString())
      const [chatItems, continuation] = parseChatData(res)
      expect(continuation).toBe("test-continuation:01")
      expect(chatItems).toMatchObject([
        {
          id: "id",
          author: {
            name: "authorName",
            thumbnail: {
              url: "https://author.thumbnail.url",
              alt: "authorName",
            },
            channelId: "channelId",
            badge: {
              label: "メンバー（6 か月）",
              thumbnail: {
                url: "https://membership.badge.url",
                alt: "メンバー（6 か月）",
              },
            },
          },
          message: [
            {
              text: "Hello, World!",
            },
          ],
          isMembership: true,
          isVerified: false,
          isOwner: false,
          isModerator: false,
          timestamp: new Date("2021-01-01"),
        },
      ])
    })

    test("Subscribe Membership", () => {
      const res = JSON.parse(readFileSync(__dirname + "/testdata/get_live_chat.subscribe-member.json").toString())
      const [chatItems, continuation] = parseChatData(res)
      expect(continuation).toBe("test-continuation:01")
      expect(chatItems).toMatchObject([
        {
          id: "id",
          author: {
            name: "authorName",
            thumbnail: {
              url: "https://author.thumbnail.url",
              alt: "authorName",
            },
            channelId: "channelId",
            badge: {
              label: "新規メンバー",
              thumbnail: {
                url: "https://membership.badge.url",
                alt: "新規メンバー",
              },
            },
          },
          message: [
            {
              text: "上級エンジニア",
            },
            {
              text: " へようこそ！",
            },
          ],
          isMembership: true,
          isVerified: false,
          isOwner: false,
          isModerator: false,
          timestamp: new Date("2021-01-01"),
        },
      ])
    })

    test("Super Chat", () => {
      const res = JSON.parse(readFileSync(__dirname + "/testdata/get_live_chat.super-chat.json").toString())
      const [chatItems, continuation] = parseChatData(res)
      expect(continuation).toBe("test-continuation:01")
      expect(chatItems).toMatchObject([
        {
          id: "id",
          author: {
            name: "authorName",
            thumbnail: {
              url: "https://author.thumbnail.url",
              alt: "authorName",
            },
            channelId: "channelId",
          },
          message: [
            {
              text: "Hello, World!",
            },
          ],
          superchat: {
            amount: "￥1,000",
            color: "#FFCA28",
          },
          isMembership: false,
          isVerified: false,
          isOwner: false,
          isModerator: false,
          timestamp: new Date("2021-01-01"),
        },
      ])
    })

    // Regression for #96: a super chat sent with money but no text has no `runs` at all, and
    // upstream mapped straight over undefined, one empty super chat killed the whole stream.
    test("Super Chat with no message text", () => {
      const res = JSON.parse(readFileSync(__dirname + "/testdata/get_live_chat.super-chat-no-msg.json").toString())
      const [chatItems] = parseChatData(res)
      expect(chatItems).toHaveLength(1)
      expect(chatItems[0].message).toEqual([])
      expect(chatItems[0].superchat).toMatchObject({ amount: expect.any(String) })
    })

    test("Super Sticker", () => {
      const res = JSON.parse(readFileSync(__dirname + "/testdata/get_live_chat.super-sticker.json").toString())
      const [chatItems, continuation] = parseChatData(res)
      expect(continuation).toBe("test-continuation:01")
      expect(chatItems).toMatchObject([
        {
          id: "id",
          author: {
            name: "authorName",
            thumbnail: {
              url: "https://author.thumbnail.url",
              alt: "authorName",
            },
            channelId: "channelId",
          },
          message: [],
          superchat: {
            amount: "￥90",
            color: "#1565C0",
            sticker: {
              url: "//super.sticker.url",
              alt: "superSticker",
            },
          },
          isMembership: false,
          isVerified: false,
          isOwner: false,
          isModerator: false,
          timestamp: new Date("2021-01-01"),
        },
      ])
    })

    test("From Verified User", () => {
      const res = JSON.parse(readFileSync(__dirname + "/testdata/get_live_chat.from-verified.json").toString())
      const [chatItems, continuation] = parseChatData(res)
      expect(continuation).toBe("test-continuation:01")
      expect(chatItems).toMatchObject([
        {
          id: "id",
          author: {
            name: "authorName",
            thumbnail: {
              url: "https://author.thumbnail.url",
              alt: "authorName",
            },
            channelId: "channelId",
          },
          message: [
            {
              text: "Hello, World!",
            },
          ],
          isMembership: false,
          isVerified: true,
          isOwner: false,
          isModerator: false,
          timestamp: new Date("2021-01-01"),
        },
      ])
    })

    test("From Moderator", () => {
      const res = JSON.parse(readFileSync(__dirname + "/testdata/get_live_chat.from-moderator.json").toString())
      const [chatItems, continuation] = parseChatData(res)
      expect(continuation).toBe("test-continuation:01")
      expect(chatItems).toMatchObject([
        {
          id: "id",
          author: {
            name: "authorName",
            thumbnail: {
              url: "https://author.thumbnail.url",
              alt: "authorName",
            },
            channelId: "channelId",
          },
          message: [
            {
              text: "Hello, World!",
            },
          ],
          isMembership: false,
          isVerified: false,
          isOwner: false,
          isModerator: true,
          timestamp: new Date("2021-01-01"),
        },
      ])
    })

    test("From Owner", () => {
      const res = JSON.parse(readFileSync(__dirname + "/testdata/get_live_chat.from-owner.json").toString())
      const [chatItems, continuation] = parseChatData(res)
      expect(continuation).toBe("test-continuation:01")
      expect(chatItems).toMatchObject([
        {
          id: "id",
          author: {
            name: "authorName",
            thumbnail: {
              url: "https://author.thumbnail.url",
              alt: "authorName",
            },
            channelId: "channelId",
          },
          message: [
            {
              text: "Hello, World!",
            },
          ],
          isMembership: false,
          isVerified: false,
          isOwner: true,
          isModerator: false,
          timestamp: new Date("2021-01-01"),
        },
      ])
    })

    test("No Chat", () => {
      const res = JSON.parse(readFileSync(__dirname + "/testdata/get_live_chat.no-chat.json").toString())
      const [chatItems, continuation] = parseChatData(res)
      expect(continuation).toBe("test-continuation:01")
      expect(chatItems).toStrictEqual([])
    })
  })

  describe("getOptionsFromLivePage", () => {
    test("Normal", () => {
      const res = readFileSync(__dirname + "/testdata/live-page.html").toString()
      const options = getOptionsFromLivePage(res)
      expect(options).toMatchObject({
        liveId: expect.any(String),
        apiKey: expect.any(String),
        clientVersion: expect.any(String),
        continuation: expect.any(String),
      })
    })

    test("Replay (Finished)", () => {
      const res = readFileSync(__dirname + "/testdata/replay_page.html").toString()
      expect(() => getOptionsFromLivePage(res)).toThrow("is finished live")
    })

    test("No such Live", () => {
      const res = readFileSync(__dirname + "/testdata/no_live_page.html").toString()
      expect(() => getOptionsFromLivePage(res)).toThrow(/^Live Stream was not found$/)
    })

    describe("chatType", () => {
      const page = readFileSync(__dirname + "/testdata/live-page.html").toString()

      // Measured against live YouTube: only the long continuations[0] token works at get_live_chat;
      // Top and Live differ by one selector byte (0x08 0x04 = Top, 0x08 0x01 = Live). "live" is the
      // Top token with that byte flipped. This is the fixture's Top token so patched.
      const LIVE_TOKEN =
        "0ofMyANxGlhDaWtxSndvWVZVTjRhMDlNWjJST2RXMTJWa2xSY1c0MWNITmZZa3BCRWd0a1kyaHhaRVpQVnpoRlNSb1Q2cWpkdVFFTkNndGtZMmh4WkVaUFZ6aEZTU0FCMAGCAQIIAYgBAaABnuPj1OGt9AKyAQA="

      test("defaults to Top chat (unchanged behavior)", () => {
        expect(getOptionsFromLivePage(page).continuation).toBe(getOptionsFromLivePage(page, "top").continuation)
      })

      test('chatType "live" flips the Top token\'s selector byte to the Live view', () => {
        expect(getOptionsFromLivePage(page, "live").continuation).toBe(LIVE_TOKEN)
      })

      test('"live" and "top" return different continuations', () => {
        expect(getOptionsFromLivePage(page, "live").continuation).not.toBe(
          getOptionsFromLivePage(page, "top").continuation
        )
      })

      test('"live" fails loud when the Top token has no selector byte to flip (no silent fallback)', () => {
        // A live page whose continuation decodes to bytes without a single 0x08 0x04 selector.
        const noSelector =
          '<link rel="canonical" href="https://www.youtube.com/watch?v=ID">' +
          '"INNERTUBE_API_KEY":"AIzaKEY","clientVersion":"2.20240101",' +
          '"liveChatRenderer":{"continuations":[{"reloadContinuationData":{"continuation":"AAAAAAAA"}}]}'
        expect(() => getOptionsFromLivePage(noSelector, "live")).toThrow(ScrapeError)
        // ...while "top" on the same page still succeeds, the failure is specific to the live flip.
        expect(getOptionsFromLivePage(noSelector, "top").continuation).toBe("AAAAAAAA")
      })

      test('"live" fails loud when the Top token is ambiguous (more than one selector byte)', () => {
        // "CAQIBA==" decodes to 08 04 08 04, two candidate selectors, so flipping would be a guess.
        const ambiguous =
          '<link rel="canonical" href="https://www.youtube.com/watch?v=ID">' +
          '"INNERTUBE_API_KEY":"AIzaKEY","clientVersion":"2.20240101",' +
          '"liveChatRenderer":{"continuations":[{"reloadContinuationData":{"continuation":"CAQIBA=="}}]}'
        expect(() => getOptionsFromLivePage(ambiguous, "live")).toThrow(ScrapeError)
      })

      test('"live" fails loud (ScrapeError, not URIError) on a malformed percent-encoded token', () => {
        // A truncated percent escape ("AA%GG") makes decodeURIComponent throw; it must surface as a
        // ScrapeError like every other live-selector failure, not leak a raw URIError.
        const malformed =
          '<link rel="canonical" href="https://www.youtube.com/watch?v=ID">' +
          '"INNERTUBE_API_KEY":"AIzaKEY","clientVersion":"2.20240101",' +
          '"liveChatRenderer":{"continuations":[{"reloadContinuationData":{"continuation":"AA%GG"}}]}'
        expect(() => getOptionsFromLivePage(malformed, "live")).toThrow(ScrapeError)
      })
    })
  })
})
