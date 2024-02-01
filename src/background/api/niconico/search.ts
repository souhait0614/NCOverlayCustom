import type { SearchQuery, Search, SearchData } from '@/types/niconico/search'
import { NICONICO_SEARCH_API } from '@/constants'
import { filterObject } from '@/utils/filterObject'
import { Logger } from '@/utils/logger'

export const search = async (
  query: SearchQuery
): Promise<SearchData[] | null> => {
  const params: { [key in keyof SearchQuery]: string } = {
    q: query.q,
    targets: query.targets.join(),
    fields:
      query.fields?.join() ||
      ['contentId', 'title', 'channelId', 'lengthSeconds', 'tags'].join(),
    _sort: query._sort ?? '+startTime',
    _offset: query._offset?.toString(),
    _limit: query._limit?.toString(),
    _context: query._context ?? 'NCOverlayHelper',
  }

  if (query.filters) {
    for (const field in query.filters) {
      if (query.filters[field] == null) continue

      for (const key in query.filters[field]) {
        if (query.filters[field][key] == null) continue

        const val = query.filters[field][key]
        params[`filters[${field}][${key}]`] =
          typeof val === 'number' ? Math.floor(val) : val
      }
    }
  }

  filterObject(params)

  const url = `${NICONICO_SEARCH_API}?${new URLSearchParams(params)}`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'NCOverlayHelper/1.0',
      },
    })
    const json: Search = await res.json()

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
