import type { Video, VideoData } from '@/types/niconico/video'
import { NICONICO_VIDEO_API, NICONICO_VIDEO_GUEST_API } from '@/constants'
import { Logger } from '@/utils/logger'

const generateRandomStr = (len: number) => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

  return [...Array(len)]
    .map(() => chars[Math.floor(Math.random() * chars.length)])
    .join('')
}

export const video = async (
  id: string,
  guest: boolean = false
): Promise<VideoData | null> => {
  if (/^[a-z]+\d+$/.test(id)) {
    const now = Date.now().toString()
    const actionTrackId = `${generateRandomStr(10)}_${now}`

    const params = {
      _frontendId: '6',
      _frontendVersion: '0',
      actionTrackId: actionTrackId,
      t: now,
    }

    const url = `${guest ? NICONICO_VIDEO_GUEST_API : NICONICO_VIDEO_API
      }/${id}?${new URLSearchParams(params)}`

    try {
      const res = await fetch(url, {
        method: 'GET',
      })
      const json: Video = await res.json()

      if (res.ok) {
        return json.data
      } else {
        Logger.info('Error', json)
      }
    } catch (e) {
      Logger.info('Error', e)
    }
  }

  return null
}
