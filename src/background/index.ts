import type { ChromeMessage, ChromeResponse } from '@/types/chrome/message'
import { ChromeMessageTypeCheck } from '@/types/chrome/message'
import {
  VODS,
  VODS_ALLOW_CAPTURE,
  ACTION_ICONS_ENABLE,
  ACTION_ICONS_DISABLE,
  GITHUB_URL,
} from '@/constants'
import { ChromeStorageApi } from '@/utils/chrome/storage'
import { isSupport } from '@/utils/chrome/isSupport'
import { getCurrentTab } from '@/utils/chrome/getCurrentTab'
import { NiconicoApi } from './api/niconico'

console.log('[NCOverlay] background.js')

const manifest = chrome.runtime.getManifest()

const setContextMenu = (id: string | number, enabled: boolean) => {
  chrome.contextMenus.update(id, { enabled })
}

const setSidePanel = (tabId: number, enabled: boolean) => {
  const { side_panel } = manifest

  return chrome.sidePanel.setOptions({
    tabId,
    enabled,
    path: side_panel.default_path,
  })
}

chrome.action.disable()
chrome.action.setIcon({ path: ACTION_ICONS_DISABLE })
chrome.action.setBadgeBackgroundColor({ color: '#2389FF' })
chrome.action.setBadgeTextColor({ color: '#FFF' })

chrome.runtime.onInstalled.addListener(async (details) => {
  const { version } = manifest
  const settings = await ChromeStorageApi.getSettings()

  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({ url: `${GITHUB_URL}/blob/v${version}/README.md` })
  }

  if (
    details.reason === chrome.runtime.OnInstalledReason.UPDATE &&
    settings.showChangelog
  ) {
    chrome.tabs.create({ url: `${GITHUB_URL}/releases/tag/v${version}` })
  }
})

chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: 'ncoverlay:capture',
    title: 'スクリーンショット',
    contexts: ['action'],
    enabled: false,
  })
})

chrome.contextMenus.onClicked.addListener(async ({ menuItemId }, tab) => {
  if (typeof tab?.id === 'undefined') return

  const permissions = await chrome.permissions.contains({
    origins: [tab.url!],
  })

  if (!permissions) return

  if (menuItemId === 'ncoverlay:capture') {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [VODS, VODS_ALLOW_CAPTURE],
      func: (
        vods: typeof VODS,
        vodsAllowCapture: typeof VODS_ALLOW_CAPTURE
      ) => {
        const vod = document.documentElement.dataset.ncoVod as
          | keyof typeof VODS
          | undefined

        if (vod) {
          if (vodsAllowCapture.includes(vod)) {
            document.dispatchEvent(new Event('ncoverlay:capture'))
          } else {
            const vodName = vods[vod]
            const suppotedLists = vodsAllowCapture
              .map((v) => vods[v])
              .filter(Boolean)
              .join(' / ')

            alert(
              `${vodName}はスクリーンショット非対応です\n対応リスト: ${suppotedLists}`
            )
          }
        }
      },
    })
  }
})

chrome.runtime.onMessage.addListener(
  (
    message: ChromeMessage,
    sender,
    sendResponse: (response: ChromeResponse) => void
  ) => {
    let promise: Promise<any> | null = null

    // ニコニコ 検索
    if (ChromeMessageTypeCheck['niconico:search'](message)) {
      promise = NiconicoApi.search(message.body.query)
    }

    // ニコニコ 動画情報
    if (ChromeMessageTypeCheck['niconico:video'](message)) {
      promise = NiconicoApi.video(message.body.videoId, message.body.guest)
    }

    // ニコニコ コメント
    if (ChromeMessageTypeCheck['niconico:threads'](message)) {
      promise = NiconicoApi.threads(message.body.nvComment)
    }

    // 拡張機能 アクション 有効/無効
    if (ChromeMessageTypeCheck['chrome:action'](message)) {
      if (message.body) {
        chrome.action.enable(sender.tab?.id)
      } else {
        chrome.action.disable(sender.tab?.id)
      }

      chrome.action.setIcon({
        tabId: sender.tab?.id,
        path: message.body ? ACTION_ICONS_ENABLE : ACTION_ICONS_DISABLE,
      })
    }

    // 拡張機能 アクション バッジ
    if (ChromeMessageTypeCheck['chrome:action:badge'](message)) {
      chrome.action.setBadgeText({
        tabId: sender.tab?.id,
        text: message.body.toString(),
      })
    }

    // 拡張機能 アクション タイトル (ツールチップ)
    if (ChromeMessageTypeCheck['chrome:action:title'](message)) {
      chrome.action.setTitle({
        tabId: sender.tab?.id,
        title: message.body ? `${message.body} | NCOverlay` : '',
      })
    }

    // 拡張機能 サイドパネル 有効/無効
    if (ChromeMessageTypeCheck['chrome:side_panel'](message)) {
      chrome.sidePanel.setOptions({
        tabId: sender.tab?.id,
        enabled: message.body,
      })
    }

    if (promise) {
      promise
        .then((result) => {
          sendResponse({
            type: message.type,
            result: result,
          })
        })
        .catch((e) => {
          console.log('[NCOverlay] Error', e)

          sendResponse({
            type: message.type,
            result: null,
          })
        })

      return true
    }

    return false
  }
)

// ウィンドウ変更時
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  const tab = await getCurrentTab(windowId)
  const support = await isSupport(tab?.id)

  setContextMenu('ncoverlay:capture', support)
})

// タブ変更時
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const support = await isSupport(tabId)

  setContextMenu('ncoverlay:capture', support)

  if (support) {
    await setSidePanel(tabId, false)
    await setSidePanel(tabId, true)
  } else {
    await setSidePanel(tabId, false)
  }
})

const prevHostnames: { [tabId: number]: string } = {}

// タブ更新時
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  const support = await isSupport(tabId)

  if (tab.active) {
    setContextMenu('ncoverlay:capture', support)
  }

  if (support) {
    try {
      const { hostname } = new URL(info.url ?? '')

      if (hostname !== prevHostnames[tabId]) {
        await setSidePanel(tabId, false)
      }

      prevHostnames[tabId] = hostname
    } catch {}

    await setSidePanel(tabId, true)
  } else {
    await setSidePanel(tabId, false)

    delete prevHostnames[tabId]
  }
})
