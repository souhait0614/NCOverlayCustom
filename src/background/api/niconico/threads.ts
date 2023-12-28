import type { NvComment } from '@/types/niconico/video'
import type { Threads, ThreadsData } from '@/types/niconico/threads'
import { NICONICO_THREADS_API } from '@/constants'
import { Logger } from '@/utils/logger'

export type NvCommentBody = Omit<NvComment, 'server'> & {
  additionals: { when?: number }
}

export const threads = async (
  nvComment: NvCommentBody,
  server?: string
): Promise<ThreadsData | null> => {
  try {
    const res = await fetch(
      server ? `${server}/v1/threads` : NICONICO_THREADS_API,
      {
        method: 'POST',
        headers: {
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'X-Client-Os-Type': 'others',
        },
        body: JSON.stringify(nvComment),
      }
    )
    const json: Threads = await res.json()

    if (res.ok) {
      return json.data
    } else {
      Logger.info('Error', json)
    }
  } catch (e) {
    Logger.info('Error', e)
  }

  return null
}
