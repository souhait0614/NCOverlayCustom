import { NCOverlay } from '@/content_script/NCOverlay'
import { loadComments } from '@/content_script/utils/loadComments'
import { Logger } from '@/utils/logger'

export default async () => {
  let nco: NCOverlay | null = null

  const getInfo = () => {
    const titleElem = document.querySelector<HTMLElement>(
      'div[class^="Header__TitleContainer"] > h2'
    )
    const episodeElem = document.querySelector<HTMLElement>(
      'div[class^="Header__TitleContainer"] > span'
    )

    return {
      // 呪術廻戦 懐玉・玉折／渋谷事変（第2期）
      title: titleElem?.textContent?.trim(),
      // #25 懐玉
      episode: episodeElem?.textContent?.trim(),
    }
  }

  const modify = (video: HTMLVideoElement) => {
    Logger.info('modify()')

    nco = new NCOverlay(video)

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
      if (location.pathname.startsWith('/play/')) {
        const video = document.querySelector<HTMLVideoElement>(
          'div[class^="Player__PlayerWrapper"] > video'
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
