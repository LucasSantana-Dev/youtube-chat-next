import {
  Action,
  FetchOptions,
  GetLiveChatResponse,
  LiveChatMembershipItemRenderer,
  LiveChatPaidMessageRenderer,
  LiveChatPaidStickerRenderer,
  LiveChatTextMessageRenderer,
  MessageRun,
  Thumbnail,
} from "./types/yt-response"
import { ChatItem, ImageItem, MessageItem } from "./types/data"
import { NotLiveError, ScrapeError } from "./errors"

export function getOptionsFromLivePage(data: string): FetchOptions & { liveId: string } {
  const idResult = data.match(/<link rel="canonical" href="https:\/\/www.youtube.com\/watch\?v=(.+?)">/)
  if (!idResult) {
    throw new NotLiveError("Live Stream was not found")
  }
  const liveId = idResult[1]

  if (/['"]isReplay['"]:\s*(true)/.test(data)) {
    throw new NotLiveError(`${liveId} is finished live`)
  }

  const keyResult = data.match(/['"]INNERTUBE_API_KEY['"]:\s*['"](.+?)['"]/)
  if (!keyResult) {
    throw new ScrapeError("INNERTUBE_API_KEY")
  }

  const verResult = data.match(/['"]clientVersion['"]:\s*['"]([\d.]+?)['"]/)
  if (!verResult) {
    throw new ScrapeError("clientVersion")
  }

  // Anchor to liveChatRenderer's own continuation rather than taking the first "continuation" key
  // that appears anywhere in ~1.3MB of page HTML. The loose match happens to land on the right
  // token today, but only because of where YouTube currently orders its payload — any reshuffle
  // silently hands us an unrelated token instead of failing.
  const continuation = matchLiveChatContinuation(data)
  if (!continuation) {
    throw new ScrapeError("continuation")
  }

  return {
    liveId,
    apiKey: keyResult[1],
    clientVersion: verResult[1],
    continuation,
  }
}

/** Pull the live chat's own reload continuation out of the watch page. */
function matchLiveChatContinuation(data: string): string | undefined {
  const scoped = data.match(
    /"liveChatRenderer"\s*:\s*\{.*?"continuations"\s*:\s*\[\s*\{\s*"reloadContinuationData"\s*:\s*\{\s*"continuation"\s*:\s*"([^"]+)"/s
  )
  if (scoped) {
    return scoped[1]
  }
  // Fall back to upstream's loose match so a payload reshuffle degrades instead of hard-failing.
  return data.match(/['"]continuation['"]:\s*['"](.+?)['"]/)?.[1]
}

/**
 * get_live_chat レスポンスを変換
 *
 * Returns the items, the next continuation token, and the poll delay YouTube requests.
 * An empty continuation means the stream has ended and polling should stop.
 */
export function parseChatData(data: GetLiveChatResponse): [ChatItem[], string, number] {
  // When a stream ends — or YouTube returns an error payload — `continuationContents` is simply
  // absent. Upstream indexed straight through it, so this threw a TypeError that the polling loop
  // caught and retried forever, silently, until the process died.
  const liveChatContinuation = data?.continuationContents?.liveChatContinuation
  if (!liveChatContinuation) {
    return [[], "", 0]
  }

  let chatItems: ChatItem[] = []
  if (liveChatContinuation.actions) {
    chatItems = liveChatContinuation.actions
      .map((v) => parseActionToChatItem(v))
      .filter((v): v is NonNullable<ChatItem> => v !== null)
  }

  const continuationData = liveChatContinuation.continuations?.[0]
  const next = continuationData?.invalidationContinuationData ?? continuationData?.timedContinuationData
  return [chatItems, next?.continuation ?? "", next?.timeoutMs ?? 0]
}

/** サムネイルオブジェクトをImageItemへ変換 */
function parseThumbnailToImageItem(data: Thumbnail[], alt: string): ImageItem {
  const thumbnail = data.pop()
  if (thumbnail) {
    return {
      url: thumbnail.url,
      alt: alt,
    }
  } else {
    return {
      url: "",
      alt: "",
    }
  }
}

function convertColorToHex6(colorNum: number) {
  return `#${colorNum.toString(16).slice(2).toLocaleUpperCase()}`
}

/** メッセージrun配列をMessageItem配列へ変換 */
function parseMessages(runs: MessageRun[]): MessageItem[] {
  return runs.map((run: MessageRun): MessageItem => {
    if ("text" in run) {
      return run
    } else {
      // Emoji
      const thumbnail = run.emoji.image.thumbnails.shift()
      const isCustomEmoji = Boolean(run.emoji.isCustomEmoji)
      const shortcut = run.emoji.shortcuts ? run.emoji.shortcuts[0] : ""
      return {
        url: thumbnail ? thumbnail.url : "",
        alt: shortcut,
        isCustomEmoji: isCustomEmoji,
        emojiText: isCustomEmoji ? shortcut : run.emoji.emojiId,
      }
    }
  })
}

/** actionの種類を判別してRendererを返す */
function rendererFromAction(
  action: Action
):
  | LiveChatTextMessageRenderer
  | LiveChatPaidMessageRenderer
  | LiveChatPaidStickerRenderer
  | LiveChatMembershipItemRenderer
  | null {
  if (!action.addChatItemAction) {
    return null
  }
  const item = action.addChatItemAction.item
  if (item.liveChatTextMessageRenderer) {
    return item.liveChatTextMessageRenderer
  } else if (item.liveChatPaidMessageRenderer) {
    return item.liveChatPaidMessageRenderer
  } else if (item.liveChatPaidStickerRenderer) {
    return item.liveChatPaidStickerRenderer
  } else if (item.liveChatMembershipItemRenderer) {
    return item.liveChatMembershipItemRenderer
  }
  return null
}

/** an action to a ChatItem */
function parseActionToChatItem(data: Action): ChatItem | null {
  const messageRenderer = rendererFromAction(data)
  if (messageRenderer === null) {
    return null
  }
  let message: MessageRun[] = []
  if ("message" in messageRenderer) {
    message = messageRenderer.message.runs
  } else if ("headerSubtext" in messageRenderer) {
    message = messageRenderer.headerSubtext.runs
  }

  const authorNameText = messageRenderer.authorName?.simpleText ?? ""
  const ret: ChatItem = {
    id: messageRenderer.id,
    author: {
      name: authorNameText,
      thumbnail: parseThumbnailToImageItem(messageRenderer.authorPhoto.thumbnails, authorNameText),
      channelId: messageRenderer.authorExternalChannelId,
    },
    message: parseMessages(message),
    isMembership: false,
    isOwner: false,
    isVerified: false,
    isModerator: false,
    timestamp: new Date(Number(messageRenderer.timestampUsec) / 1000),
  }

  if (messageRenderer.authorBadges) {
    for (const entry of messageRenderer.authorBadges) {
      const badge = entry.liveChatAuthorBadgeRenderer
      if (badge.customThumbnail) {
        ret.author.badge = {
          thumbnail: parseThumbnailToImageItem(badge.customThumbnail.thumbnails, badge.tooltip),
          label: badge.tooltip,
        }
        ret.isMembership = true
      } else {
        switch (badge.icon?.iconType) {
          case "OWNER":
            ret.isOwner = true
            break
          case "VERIFIED":
            ret.isVerified = true
            break
          case "MODERATOR":
            ret.isModerator = true
            break
        }
      }
    }
  }

  if ("sticker" in messageRenderer) {
    ret.superchat = {
      amount: messageRenderer.purchaseAmountText.simpleText,
      color: convertColorToHex6(messageRenderer.backgroundColor),
      sticker: parseThumbnailToImageItem(
        messageRenderer.sticker.thumbnails,
        messageRenderer.sticker.accessibility.accessibilityData.label
      ),
    }
  } else if ("purchaseAmountText" in messageRenderer) {
    ret.superchat = {
      amount: messageRenderer.purchaseAmountText.simpleText,
      color: convertColorToHex6(messageRenderer.bodyBackgroundColor),
    }
  }

  return ret
}
