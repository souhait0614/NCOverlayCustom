import { NCOverlay } from '@/content_script/NCOverlay'
import { NiconicoApi } from '@/content_script/api/niconico'
import { getThreads } from '@/content_script/utils/getThreads'

export default async () => {
  console.log('[NCOverlay] VOD: ABEMA')

  let nco: NCOverlay | null = null

  const getInfo = () => {
    const title = document.querySelector<HTMLElement>(
      '.com-video-EpisodeTitle__series-info'
    )
    const episode = document.querySelector<HTMLElement>(
      '.com-video-EpisodeTitle__episode-title'
    )

    return {
      title: title?.textContent?.trim(),
      episode: episode?.textContent?.trim(),
    }
  }

  const modify = async (video: HTMLVideoElement) => {
    console.log('[NCOverlay] modify()')

    await nco?.dispose()
    nco = null

    const player = video.closest<HTMLElement>('.com-vod-VODScreen__player')

    if (player) {
      nco = new NCOverlay(video)

      nco.onLoadedmetadata = async () => {
        const info = getInfo()
        console.log('[NCOverlay] info', info)

        if (info.title && info.episode) {
          const title = `${info.title} ${info.episode}`

          console.log('[NCOverlay] title', title)

          const searchResults = await NiconicoApi.search({
            title: title,
            duration: nco?.video.duration ?? 0,
          })

          if (searchResults) {
            const threads = await getThreads(
              ...searchResults.map((v) => v.contentId ?? '')
            )

            console.log('[NCOverlay] threads (filtered)', threads)

            if (threads) {
              await nco?.init(threads)
            } else {
              await nco?.dispose()
              nco = null
            }
          }
        }
      }

      player.appendChild(nco.canvas)
    }
  }

  const obs_config: MutationObserverInit = {
    childList: true,
    subtree: true,
  }
  const obs = new MutationObserver(async () => {
    obs.disconnect()

    if (nco && !document.contains(nco.video)) {
      await nco.dispose()
      nco = null
    } else if (location.pathname.startsWith('/video/episode/')) {
      if (!nco) {
        const video = document.querySelector<HTMLVideoElement>(
          '.com-a-Video__video > video[preload="metadata"]'
        )

        if (video) {
          await modify(video)
        }
      }
    }

    obs.observe(document, obs_config)
  })

  obs.observe(document, obs_config)
}
