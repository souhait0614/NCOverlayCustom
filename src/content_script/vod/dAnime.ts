import { NCOverlay } from '@/content_script/NCOverlay'
import { loadComments } from '@/content_script/utils/loadComments'
import { DAnimeApi } from '@/content_script/api/danime'
import { Logger } from '@/utils/logger'

export default async () => {
  const video = document.querySelector<HTMLVideoElement>('video#video')

  if (!video) return

  const nco = new NCOverlay(video)

  nco.onLoadedmetadata = async function () {
    this.init()

    const partId = new URL(location.href).searchParams.get('partId')

    if (!partId) return

    const partData = await DAnimeApi.part(partId)

    Logger.info('DAnimeApi.part', partData)

    if (partData) {
      Logger.info('title', partData.title)

      await loadComments(this, {
        title: partData.title,
        duration: partData.partMeasureSecond,
      })
    }
  }

  video.insertAdjacentElement('afterend', nco.canvas)
}
