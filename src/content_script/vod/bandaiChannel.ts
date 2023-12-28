import { NCOverlay } from '@/content_script/NCOverlay'
import { loadComments } from '@/content_script/utils/loadComments'
import { Logger } from '@/utils/logger'

export default async () => {
  const video = document.querySelector<HTMLVideoElement>(
    'video#bcplayer_html5_api'
  )

  if (!video) return

  const nco = new NCOverlay(video)

  const getInfo = () => {
    const titleElem = document.querySelector<HTMLElement>('#bch-series-title')
    const episodeElem = document.querySelector<HTMLElement>('#bch-story-title')
    const episodeTextElem = document.querySelector<HTMLElement>(
      '.bch-p-heading-mov__summary'
    )

    const title = titleElem?.textContent?.trim()
    const episodeNo = episodeElem?.firstChild?.textContent?.trim()
    const episodeText = episodeTextElem?.textContent?.trim()
    const episode = `${episodeNo ?? ''} ${episodeText ?? ''}`.trim()

    return {
      // 呪術廻戦 懐玉・玉折／渋谷事変
      title: title,
      // 第25話 懐玉
      episode: episode,
    }
  }

  nco.onLoadedmetadata = async function () {
    this.init()

    const info = getInfo()

    Logger.info('info', info)

    if (info.title && info.episode) {
      const title = `${info.title} ${info.episode}`

      Logger.info('title', title)

      await loadComments(this, {
        title: title,
        duration: this.video.duration ?? 0,
      })
    }
  }

  video.insertAdjacentElement('afterend', nco.canvas)
}
