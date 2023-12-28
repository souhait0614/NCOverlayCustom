import { NCOverlay } from '@/content_script/NCOverlay'
import { loadComments } from '@/content_script/utils/loadComments'
import { isVisible } from '@/utils/dom'
import { querySelectorAsync } from '@/utils/dom/querySelectorAsync'
import { formatedToSeconds } from '@/utils/formatedToSeconds'
import { Logger } from '@/utils/logger'

export default async () => {
  let nco: NCOverlay | null = null

  const getDetail = (): { title: string } | null => {
    const canonicalUrl = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]'
    )?.href

    const asin = canonicalUrl?.match(/(?<=\/dp\/)[0-9A-Z]+$/)?.[0] ?? ''
    const titleID =
      document.querySelector<HTMLInputElement>(
        '.dv-dp-node-watchlist input[name="titleID"]'
      )?.value ?? ''

    const data = JSON.parse(
      document.querySelector('#main > script[type="text/template"]')
        ?.textContent || '{}'
    )

    return (
      data.props?.state?.detail?.detail?.[asin] ??
      data.props?.state?.detail?.detail?.[titleID] ??
      null
    )
  }

  const getInfo = async () => {
    const detail = getDetail()

    Logger.info('detail', detail)

    const titleElem = document.querySelector<HTMLElement>(
      '.atvwebplayersdk-title-text'
    )
    const subtitleElem = document.querySelector<HTMLElement>(
      '.atvwebplayersdk-subtitle-text'
    )
    const timeindicatorElem = await querySelectorAsync<HTMLElement>(
      '.atvwebplayersdk-timeindicator-text:has(span)'
    )
    const se_raw =
      subtitleElem?.firstChild?.textContent?.trim().replace(/\s+/g, '') ?? ''

    const episodeText = subtitleElem?.lastChild?.textContent?.trim()

    // const seasonNum = Number(se_raw.match(/(?<=シーズン|Season)\d+/i)?.[0])
    const episodeNum = Number(se_raw.match(/(?<=エピソード|Ep\.)\d+/i)?.[0])

    const duration = (timeindicatorElem?.textContent?.split('/') ?? [])
      .map(formatedToSeconds)
      .reduce((s, v) => s + v, 0)

    return {
      // 呪術廻戦 懐玉・玉折／渋谷事変 || 呪術廻戦
      title: detail?.title || titleElem?.textContent?.trim(),
      // 第25話 懐玉
      episode: episodeText,
      // 25
      episodeNum: episodeNum,
      // 1435
      duration: duration,
    }
  }

  const modify = (video: HTMLVideoElement) => {
    Logger.info('modify()')

    const playerUIContainer = video
      .closest<HTMLElement>('.webPlayerSDKContainer')
      ?.querySelector<HTMLElement>('.webPlayerUIContainer')

    if (playerUIContainer) {
      nco = new NCOverlay(video)

      nco.onLoadedmetadata = async function () {
        this.init()

        const info = await getInfo()

        Logger.info('info', info)

        if (info.title) {
          const words: string[] = [info.title]
          if (info.episode) {
            words.push(info.episode)
          }

          const title = words.join(' ')

          Logger.info('title', title)

          await loadComments(this, {
            title: title,
            duration: info.duration,
            episodeNumber: info.episodeNum,
          })
        }
      }

      playerUIContainer.insertAdjacentElement('afterbegin', nco.canvas)
    }
  }

  const obs_config: MutationObserverInit = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  }
  const obs = new MutationObserver(() => {
    obs.disconnect()

    if (nco && (!document.contains(nco.video) || !isVisible(nco.video))) {
      nco.dispose()
      nco = null
    } else if (!nco) {
      const video = document.querySelector<HTMLVideoElement>(
        '.webPlayerSDKContainer video'
      )

      if (isVisible(video)) {
        modify(video)
      }
    }

    obs.observe(document, obs_config)
  })

  obs.observe(document, obs_config)
}
