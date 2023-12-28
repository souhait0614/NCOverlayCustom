import type { V1Thread } from '@xpadev-net/niconicomments'
import type { WebExtStorageChanges } from '@/types/webext/storage'
import type {
  WebExtMessageType,
  WebExtMessage,
  WebExtMessageResponse,
} from '@/types/webext/message'
import type { VideoData } from '@/types/niconico/video'
import { WebExtMessageTypeCheck } from '@/types/webext/message'
import { KAWAII_REGEXP } from '@/constants'
import webext from '@/webext'
import NiconiComments from '@xpadev-net/niconicomments'
import { WebExtStorageApi } from '@/utils/webext/storage'
import { setActionBadge } from './utils/setActionBadge'
import { setActionTitle } from './utils/setActionTitle'
import { sendToPopup } from './utils/sendToPopup'
import { sendToSidePanel } from './utils/sendToSidePanel'
import { Logger } from '@/utils/logger'

export type InitData = {
  videoData: VideoData
  threads: V1Thread[]
}

export class NCOverlay {
  #video: HTMLVideoElement
  #canvas: HTMLCanvasElement

  #niconiComments: NiconiComments

  #initData: InitData[]

  #commentsCount: number = 0
  #kawaiiPct: number = 0
  #isPlaying: boolean = false
  #isLowPerformance: boolean = false
  // #loopIntervalMs: number = Math.floor(1000 / 60)

  onPlaying?: (this: this, e: Event) => void
  onPause?: (this: this, e: Event) => void
  onSeeked?: (this: this, e: Event) => void
  onTimeupdate?: (this: this, e: Event) => void
  onLoadedmetadata?: (this: this, e: Event) => void

  get video() {
    return this.#video
  }
  get canvas() {
    return this.#canvas
  }

  constructor(video: HTMLVideoElement, initData: InitData[] = []) {
    Logger.info('NCOverlay.video', video)

    // Videoにイベント追加
    this.#video = video
    this.#video.classList.add('NCOverlay-Video')
    this.#video.addEventListener('playing', this.#listener.playing)
    this.#video.addEventListener('pause', this.#listener.pause)
    this.#video.addEventListener('seeked', this.#listener.seeked)
    this.#video.addEventListener('timeupdate', this.#listener.timeupdate)
    this.#video.addEventListener(
      'loadedmetadata',
      this.#listener.loadedmetadata
    )

    // Canvas作成
    this.#canvas = document.createElement('canvas')
    this.#canvas.classList.add('NCOverlay-Canvas')
    this.#canvas.width = 1920
    this.#canvas.height = 1080

    this.init(initData)

    // メタデータを既に持っていた場合
    if (HTMLMediaElement.HAVE_METADATA <= this.#video.readyState) {
      Logger.info('video.readyState >= HAVE_METADATA')

      window.setTimeout(() => {
        this.#listener.loadedmetadata(new Event('loadedmetadata'))
      }, 100)
    }

    webext.storage.local.onChanged.addListener(this.#listener.storageOnChanged)
    webext.runtime.onMessage.addListener(this.#listener.onMessage)

    document.addEventListener('ncoverlay:capture', this.#listener.capture)
    document.addEventListener(
      'ncoverlay:capture:comments',
      this.#listener.captureComments
    )

    // 設定読み込み
    window.setTimeout(async () => {
      const settings = await WebExtStorageApi.getSettings()

      this.#canvas.style.display = settings.enable ? 'block' : 'none'
      this.#canvas.style.opacity = (settings.opacity / 100).toString()

      this.#isLowPerformance = settings.lowPerformance
      // this.setFPS(settings.lowPerformance ? 30 : 60)
    }, 0)

    Logger.info('new NCOverlay()', this)
  }

  init(initData?: InitData[]) {
    Logger.info('NCOverlay.init()', initData)

    sendToPopup(null)
    sendToSidePanel(null)

    const isPlaying = this.#isPlaying

    if (this.#niconiComments) {
      this.stop()
      this.clear()
    }

    this.#initData = initData ?? []
    this.#commentsCount = 0
    this.#kawaiiPct = 0

    const threads = this.#initData
      .flatMap((v) => v.threads)
      .filter(
        (val, idx, ary) =>
          idx === ary.findIndex((v) => v.id === val.id && v.fork === val.fork)
      )

    if (0 < threads.length) {
      let kawaiiCount = 0

      for (const { comments } of threads) {
        this.#commentsCount += comments.length
        kawaiiCount += comments.filter((v) => KAWAII_REGEXP.test(v.body)).length
      }

      Logger.info('commentsCount', this.#commentsCount)
      Logger.info('kawaiiCount', kawaiiCount)

      this.#kawaiiPct =
        Math.round((kawaiiCount / this.#commentsCount) * 100 * 10) / 10

      Logger.info(`kawaiiPct: ${this.#kawaiiPct}%`)
    }

    this.#niconiComments = new NiconiComments(
      this.#canvas,
      0 < threads.length ? threads : undefined,
      {
        mode: 'html5',
        format: 0 < threads.length ? 'v1' : 'empty',
      }
    )

    this.#render()

    if (isPlaying || !this.#video.paused) {
      this.start()
    }

    if (0 < this.#commentsCount) {
      setActionBadge(
        1000 <= this.#commentsCount
          ? `${Math.round((this.#commentsCount / 1000) * 10) / 10}k`
          : this.#commentsCount.toString()
      )
      setActionTitle(
        `${this.#commentsCount.toLocaleString()}件のコメント (かわいい率: ${this.#kawaiiPct
        }%)`
      )
    } else {
      setActionBadge('')
      setActionTitle('')
    }

    sendToPopup({
      initData: this.#initData,
      commentsCount: this.#commentsCount,
    })
    sendToSidePanel({
      initData: this.#initData,
      currentTime: this.#video.currentTime,
    })
  }

  dispose() {
    Logger.info('NCOverlay.dispose()')

    webext.storage.local.onChanged.removeListener(
      this.#listener.storageOnChanged
    )
    webext.runtime.onMessage.removeListener(this.#listener.onMessage)

    document.removeEventListener('ncoverlay:capture', this.#listener.capture)
    document.removeEventListener(
      'ncoverlay:capture:comments',
      this.#listener.captureComments
    )

    this.stop()
    this.clear()

    this.#video.classList.remove('NCOverlay-Video')
    this.#video.removeEventListener('playing', this.#listener.playing)
    this.#video.removeEventListener('pause', this.#listener.pause)
    this.#video.removeEventListener('seeked', this.#listener.seeked)
    this.#video.removeEventListener('timeupdate', this.#listener.timeupdate)
    this.#video.removeEventListener(
      'loadedmetadata',
      this.#listener.loadedmetadata
    )

    this.#canvas.remove()

    setActionBadge('')
    setActionTitle('')

    sendToPopup(null)
    sendToSidePanel(null)
  }

  add(initData: InitData[]) {
    Logger.info('NCOverlay.add()', initData)

    if (0 < initData.length) {
      this.#initData = [...this.#initData, ...initData].filter(
        (val, idx, ary) => {
          return (
            idx ===
            ary.findIndex(
              (v) => v.videoData.video.id === val.videoData.video.id
            )
          )
        }
      )

      this.init(this.#initData)
    }
  }

  remove(...videoIds: string[]) {
    Logger.info('NCOverlay.remove()', videoIds)

    if (0 < videoIds.length) {
      this.#initData = this.#initData.filter(
        (v) => !videoIds.includes(v.videoData.video.id)
      )

      this.init(this.#initData)
    }
  }

  clear() {
    this.#niconiComments.clear()
  }

  start() {
    if (!this.#isPlaying) {
      this.#isPlaying = true
      this.#loop()
    }
  }

  stop() {
    if (this.#isPlaying) {
      this.#isPlaying = false
    }
  }

  // setFPS(fps: number) {
  //   this.#loopIntervalMs = Math.floor(1000 / fps)
  // }

  capture(options: { commentsOnly?: boolean } = {}) {
    const canvas = document.createElement('canvas')
    canvas.width = this.#canvas.width
    canvas.height = this.#canvas.height

    const context = canvas.getContext('2d')!

    if (options.commentsOnly) {
      context.fillStyle = '#000'
      context.fillRect(0, 0, canvas.width, canvas.height)
    } else {
      context.drawImage(this.#video, 0, 0, canvas.width, canvas.height)
    }
    context.drawImage(this.#canvas, 0, 0)

    canvas.toBlob(
      (blob) => blob && window.open(URL.createObjectURL(blob)),
      'image/jpeg'
    )
  }

  #render() {
    this.#niconiComments.drawCanvas(Math.floor(this.#video.currentTime * 100))
  }

  #_time: number = -1

  #loop() {
    if (this.#isPlaying && 0 < this.#commentsCount) {
      this.#render()

      const currentTime = Math.floor(this.#video.currentTime)
      if (this.#_time !== currentTime) {
        this.#_time = currentTime
        sendToSidePanel({ currentTime })
      }

      if (this.#isLowPerformance) {
        window.setTimeout(() => this.#loop(), 33)
      } else {
        window.requestAnimationFrame(() => this.#loop())
      }
    }
  }

  #listener = {
    playing: (e: Event) => {
      Logger.info('Event: playing')

      this.start()

      this.onPlaying?.(e)
    },

    pause: (e: Event) => {
      Logger.info('Event: pause')

      this.stop()

      this.onPause?.(e)
    },

    seeked: (e: Event) => {
      Logger.info('Event: seeked', this.#video.currentTime)

      this.#render()

      this.onSeeked?.(e)
    },

    timeupdate: (e: Event) => {
      this.onTimeupdate?.(e)
    },

    loadedmetadata: (e: Event) => {
      Logger.info('Event: loadedmetadata')

      this.onLoadedmetadata?.(e)
    },

    capture: (e: Event) => {
      this.capture()
    },

    captureComments: (e: Event) => {
      this.capture({ commentsOnly: true })
    },

    onMessage: (
      message: WebExtMessage,
      sender: webext.Runtime.MessageSender,
      sendResponse: <T extends keyof WebExtMessageType>(
        response: WebExtMessageResponse<T>
      ) => void
    ) => {
      // ページから取得
      if (WebExtMessageTypeCheck('webext:getFromPage', message)) {
        sendResponse({
          type: message.type,
          result: {
            initData: this.#initData,
            commentsCount: this.#commentsCount,
            currentTime: this.#video.currentTime,
          },
        })

        return true
      }
    },

    storageOnChanged: (changes: WebExtStorageChanges) => {
      if (typeof changes.enable?.newValue !== 'undefined') {
        this.#canvas.style.display = changes.enable.newValue ? 'block' : 'none'
      }

      if (typeof changes.opacity?.newValue !== 'undefined') {
        this.#canvas.style.opacity = (changes.opacity.newValue / 100).toString()
      }

      if (typeof changes.lowPerformance?.newValue !== 'undefined') {
        this.#isLowPerformance = changes.lowPerformance.newValue
        // this.setFPS(changes.lowPerformance.newValue ? 30 : 60)
      }
    },
  }
}
