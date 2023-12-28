import { NCOverlay } from '@/content_script/NCOverlay'
import { loadComments } from '@/content_script/utils/loadComments'
import { Logger } from '@/utils/logger'

export default async () => {
  let nco: NCOverlay | null = null

  const getInfo = () => {
    const isAnime =
      document.querySelector(
        '#vod_modal a[href="/search/subgenre/2-1-101"]'
      ) !== null

    if (isAnime) {
      const titleElem = document.querySelector<HTMLElement>(
        'div[class^="ContentsDetailPlayerIntro__TitleStyle"] > p:last-child'
      )
      const episodeElem = document.querySelector<HTMLElement>(
        'div[class^="ContentsDetailPlayerIntro__TitleStyle"] > :is(h1, h2):first-child'
      )

      const title = titleElem?.textContent?.trim()
      const episode = episodeElem?.textContent?.trim()

      return {
        // 呪術廻戦 懐玉・玉折／渋谷事変（第2期）
        title: title,
        // 第25話「懐玉」
        episode: episode,
      }
    }

    return null
  }

  const modify = (video: HTMLVideoElement) => {
    Logger.info('modify()')

    nco = new NCOverlay(video)

    nco.onLoadedmetadata = async function () {
      this.init()

      const info = getInfo()

      Logger.info('info', info)

      if (info) {
        const words: string[] = []
        if (info.title) {
          words.push(info.title)
        }
        if (info.episode) {
          words.push(info.episode)
        }

        if (0 < words.length) {
          const title = words.join(' ')

          Logger.info('title', title)

          await loadComments(this, {
            title: title,
            duration: this.video.duration ?? 0,
          })
        }
      }
    }

    video.insertAdjacentElement('afterend', nco.canvas)
  }

  const obs_config: MutationObserverInit = {
    childList: true,
    subtree: true,
  }
  const obs = new MutationObserver(() => {
    obs.disconnect()

    if (nco && !document.contains(nco.video)) {
      nco.dispose()
      nco = null
    } else if (!nco) {
      if (new URLSearchParams(location.search).get('crid')) {
        const video = document.querySelector<HTMLVideoElement>(
          '#vod_modal .fullscreen video'
        )

        if (video) {
          modify(video)
        }
      }
    }

    obs.observe(document, obs_config)
  })

  obs.observe(document, obs_config)
}
