import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRegionIndex, REGIONS, type RegionData, type RegionIndex } from '../shared/regions.ts';

/**
 * 지역 목록. 서버에서 주 1회 `npm run regions`가 REGIONS_PATH에 새 목록을 쓰면
 * 다음 요청부터 그 목록을 써요. 파일이 없거나 깨졌으면 앱과 같이 배포한 목록을 써요.
 */
export function regionLoader(path = process.env.REGIONS_PATH) {
  let cached: { mtime: number; index: RegionIndex } | null = null;
  const fallback = createRegionIndex(REGIONS);
  return (): RegionIndex => {
    if (!path || !existsSync(path)) return fallback;
    try {
      const mtime = statSync(path).mtimeMs;
      if (cached?.mtime === mtime) return cached.index;
      const data = JSON.parse(readFileSync(path, 'utf8')) as RegionData;
      if (!Array.isArray(data.sido) || data.sido.length < 10) return fallback;
      cached = { mtime, index: createRegionIndex(data) };
      return cached.index;
    } catch { return fallback; }
  };
}
