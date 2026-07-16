import { getOptionsFromLivePage, parseChatData } from "../src/parser"
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
    // upstream mapped straight over undefined — one empty super chat killed the whole stream.
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
  })
})
