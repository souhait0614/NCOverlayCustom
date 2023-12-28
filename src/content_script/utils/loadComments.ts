import type { V1Thread } from '@xpadev-net/niconicomments'
import type { SearchData } from '@/types/niconico/search'
import type { VideoData } from '@/types/niconico/video'
import type { InitData, NCOverlay } from '@/content_script/NCOverlay'
import { WebExtStorageApi } from '@/utils/webext/storage'
import { getSearchData } from './getSearchData'
import { getVideoData } from './getVideoData'
import { getThreadsData } from './getThreadsData'
import { NiconicoApi } from '../api/niconico'
import { Logger } from '@/utils/logger'

// const SZBH_USER_IDS = [289866]

const filterSearchData = (
  searchData: SearchData[],
  options?: {
    channel?: boolean
  }
) => {
  return searchData.filter((val, idx, ary) => {
    return (
      // チャンネル
      options?.channel ? val.channelId != null : true
    )
  })
}

const filterVideoData = (
  videoData: VideoData[],
  options?: {
    anime?: boolean
  }
) => {
  return videoData.filter((val, idx, ary) => {
    return (
      // 公式アニメチャンネル
      options?.anime ? val.channel?.isOfficialAnime : true
    )
  })
}

const filterThreads = (threads: V1Thread[]) => {
  return threads.filter((val, idx, ary) => {
    return (
      // コメントあり
      0 < val.commentCount &&
      // かんたんコメント除外
      val.fork !== 'easy'
    )
  })
}

export const loadComments = async (
  nco: NCOverlay,
  info: Parameters<typeof getSearchData>[0]
) => {
  const settings = await WebExtStorageApi.getSettings()

  info.strictMatch = settings.strictMatch

  const initData: InitData[] = []

  // 通常
  const normalInitData = await loadCommentsNormal(info, NiconicoApi, settings.useNgList)
  initData.push(...normalInitData)

  // コメント専用動画
  if (settings.szbhMethod) {
    const szbhInitData = await loadCommentsSZBH(info, NiconicoApi, settings.useNgList)
    initData.push(...szbhInitData)
  }

  if (0 < initData.length) {
    nco.init(initData)
  }
}

/**
 * 通常のコメントを読み込み
 */
export const loadCommentsNormal = async (
  info: Parameters<typeof getSearchData>[0],
  niconicoApi: typeof NiconicoApi,
  useNgList: boolean
): Promise<InitData[]> => {
  Logger.info('loadCommentsNormal()')

  // 検索結果
  const searchData = await getSearchData(info, niconicoApi)
  if (!searchData) return []

  const videoIds = {
    normal: filterSearchData(searchData.normal, { channel: true }).map(
      (v) => v.contentId!
    ),
    splited: filterSearchData(searchData.splited, { channel: true }).map(
      (v) => v.contentId!
    ),
  }

  // 動画情報
  const videoData = await getVideoData(videoIds, niconicoApi)
  if (!videoData) return []

  videoData.normal = filterVideoData(videoData.normal)
  videoData.splited = filterVideoData(videoData.splited, { anime: true })

  // コメント情報
  const threadsData = await getThreadsData(videoData, niconicoApi, useNgList)
  if (!threadsData) return []

  const videoDataValues = Object.values(videoData).flat()

  // 分割されている動画の合計時間
  const splitedTotalDuration = videoData.splited
    .map((v) => v.video.duration)
    .reduce((s, v) => s + v, 0)

  const initData: InitData[] = []

  for (const data of videoDataValues) {
    const videoId = data.video.id
    const threads = threadsData[videoId]?.threads

    if (!threads) continue

    // コメントの位置を調整
    const duration = videoIds.normal.includes(videoId)
      ? data.video.duration
      : splitedTotalDuration
    const diff = info.duration - duration
    const offsetMs = Math.floor((diff / 2) * 1000)

    if (1000 <= Math.abs(offsetMs)) {
      for (const thread of threads) {
        for (const comment of thread.comments) {
          comment.vposMs += offsetMs
        }
      }
    }

    initData.push({
      videoData: data,
      threads: filterThreads(threads),
    })
  }

  return initData
}

/**
 * コメント専用動画のコメントを読み込み
 */
export const loadCommentsSZBH = async (
  info: Parameters<typeof getSearchData>[0],
  niconicoApi: typeof NiconicoApi,
  useNgList: boolean
): Promise<InitData[]> => {
  Logger.info('loadCommentsSZBH()')

  info.durationDiff = 65
  info.filters = {
    ...info.filters,
    ...{
      'genre.keyword': { '0': undefined },
      'tagsExact': { '0': 'コメント専用動画' },
    },
  }
  info.strictMatch = false

  // 検索結果
  const searchData = await getSearchData(info, niconicoApi)
  if (!searchData) return []

  const videoIds = {
    normal: filterSearchData(searchData.normal)
      .filter((v) => {
        return v.lengthSeconds! - (info.duration + 60) < 5
        // if (SZBH_USER_IDS.includes(v.userId ?? -1)) {
        //   return v.lengthSeconds! - (info.duration + 60) < 5
        // } else {
        //   return Math.abs(v.lengthSeconds! - info.duration) < 5
        // }
      })
      .map((v) => v.contentId!),
  }

  // 動画情報
  const videoData = await getVideoData(videoIds, niconicoApi)
  if (!videoData) return []

  videoData.normal = filterVideoData(videoData.normal)

  // コメント情報
  const threadsData = await getThreadsData(videoData, niconicoApi, useNgList)
  if (!threadsData) return []

  const videoDataValues = Object.values(videoData).flat()

  const initData: InitData[] = []

  for (const data of videoDataValues) {
    const videoId = data.video.id
    const threads = threadsData[videoId]?.threads

    if (!threads) continue

    // コメントの位置を調整
    const offsetMs =
      Math.floor(
        info.duration - data.video.duration
        // SZBH_USER_IDS.includes(data.owner?.id ?? -1)
        //   ? // 終わりを揃える
        //     info.duration - data.video.duration
        //   : // 中央を基準にする
        //     (info.duration - data.video.duration) / 2
      ) * 1000

    if (1000 <= Math.abs(offsetMs)) {
      for (const thread of threads) {
        for (const comment of thread.comments) {
          comment.vposMs += offsetMs
        }
      }
    }

    initData.push({
      videoData: data,
      threads: filterThreads(threads),
    })
  }

  return initData
}
