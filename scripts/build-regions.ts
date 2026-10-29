/**
 * 최신 시·도/시·군·구 목록을 만들어요.
 *   npm run regions
 * 후보 이름(scripts/region-candidates.ts)을 도로명주소 API로 하나씩 확인해서
 * 지금 주소 체계에 실제로 있는 이름과 법정동코드만 shared/regions.json에 남겨요.
 * 옛 이름으로 찾았을 때 새 이름이 나오면(예: 인천 서구 → 서해구) 그 이름도 더해요.
 */
import { renameSync, writeFileSync } from 'node:fs';
import { CANDIDATES } from './region-candidates.ts';
import { jusoSearch } from '../server/juso.ts';
import type { RegionData, Sido, Sgg } from '../shared/regions.ts';

const key = process.env.JUSO_API_KEY?.trim();
// 서버 타이머: 키가 없으면 실패로 쌓지 않고 건너뛰어요.
if (!key) { console.log('JUSO_API_KEY가 없어서 지역 목록 확인을 건너뛰어요.'); process.exit(0); }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
/** 검색 결과에 함께 나온 시·군·구. 옛 이름으로 찾았는데 새 이름이 나오면(인천 서구 → 서해구) 여기서 알아내요. */
const seen = new Map<string, Map<string, string>>();

/** "시도 시군구"로 검색해서 이름이 정확히 같은 결과의 5자리 코드를 돌려줘요. 없으면 null. */
async function verify(sido: string, sgg: string, keyword = `${sido} ${sgg}`.trim()): Promise<{ code: string; sido: string } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { items } = await jusoSearch(key!, keyword, 20);
      for (const i of items) if (i.siNm === sido && /^\d{10}$/.test(i.admCd)) {
        if (!seen.has(sido)) seen.set(sido, new Map());
        seen.get(sido)!.set(i.sggNm, i.admCd.slice(0, 5));
      }
      const hit = items.find(i => i.siNm === sido && i.sggNm === sgg && /^\d{10}$/.test(i.admCd));
      return hit ? { code: hit.admCd.slice(0, 5), sido: hit.siNm } : null;
    } catch (e) {
      // E0006(주소를 더 자세히)은 그 이름만으로는 찾을 수 없다는 뜻이에요.
      if ((e as { code?: string }).code === 'JUSO_E0006') return null;
      if (attempt === 2) throw e;
      await sleep(800);
    }
  }
  return null;
}

const out: Sido[] = [];
const dropped: string[] = [];
const discovered: string[] = [];
for (const c of CANDIDATES) {
  const sggs: Sgg[] = [];
  let sidoCode = '';
  if (c.sgg.length === 0) {
    // 시·군·구가 없는 세종은 시청 주소로 확인해요.
    const r = await verify(c.name, '', `${c.name} 한누리대로 2130`);
    if (!r) { dropped.push(c.name); continue; }
    sidoCode = r.code.slice(0, 2);
    sggs.push({ code: r.code, name: c.name.replace(/특별자치시$/, '시'), codes: [r.code] });
  }
  for (const entry of c.sgg) {
    if (typeof entry === 'string') {
      const r = await verify(c.name, entry);
      await sleep(120);
      if (!r) { dropped.push(`${c.name} ${entry}`); continue; }
      sidoCode ||= r.code.slice(0, 2);
      sggs.push({ code: r.code, name: entry, codes: [r.code] });
    } else {
      const [city, gus] = entry;
      const codes: string[] = [];
      const kept: string[] = [];
      for (const gu of gus) {
        const r = await verify(c.name, `${city} ${gu}`);
        await sleep(120);
        if (r) { codes.push(r.code); kept.push(gu); } else dropped.push(`${c.name} ${city} ${gu}`);
      }
      if (codes.length === 0) {
        // 일반구가 없어졌거나 아직 없으면 시 이름으로 확인해요.
        const r = await verify(c.name, city);
        if (!r) { dropped.push(`${c.name} ${city}`); continue; }
        codes.push(r.code);
      }
      // 일반구 코드(예: 41111·41113)는 시 코드(41110) 아래에 있어요.
      const cityCode = codes.length > 1 || kept.length ? codes[0].slice(0, 4) + '0' : codes[0];
      sidoCode ||= cityCode.slice(0, 2);
      sggs.push({ code: cityCode, name: city, codes: [...new Set([cityCode, ...codes])], gu: kept.length ? kept : undefined });
    }
  }
  if (!sidoCode) { dropped.push(c.name); continue; }
  // 후보에 없던 이름이 검색 결과에 나왔으면 더해요.
  for (const [name, code] of seen.get(c.name) ?? []) {
    if (!name || code.slice(0, 2) !== sidoCode || sggs.some(s => s.codes.includes(code))) continue;
    const [city, gu] = name.split(' ');
    const parent = gu ? sggs.find(s => s.name === city) : undefined;
    if (parent) { parent.codes.push(code); parent.gu = [...(parent.gu ?? []), gu]; }
    else sggs.push({ code: gu ? code.slice(0, 4) + '0' : code, name: city, codes: gu ? [code.slice(0, 4) + '0', code] : [code], gu: gu ? [gu] : undefined });
    discovered.push(`${c.name} ${name}`);
  }
  sggs.sort((a, b) => a.code.localeCompare(b.code));
  out.push({ code: sidoCode, name: c.name, short: c.short, sgg: sggs });
  console.log(`${c.name} (${sidoCode}) 시·군·구 ${sggs.length}곳`);
}

const data: RegionData = {
  updatedAt: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()),
  source: '행정안전부 도로명주소 API로 확인',
  sido: out,
};
const outPath = process.env.REGIONS_OUT || 'shared/regions.json';
const total = out.reduce((n, s) => n + s.sgg.length, 0);
// 주소 API가 잠깐 이상해서 많이 빠졌으면 저장하지 않아요(예전 목록 유지).
if (out.length < 15 || total < 200) { console.error(`확인된 지역이 너무 적어요(시·도 ${out.length}, 시·군·구 ${total}). 저장하지 않았어요.`); process.exit(2); }
const tmp = `${outPath}.tmp`;
writeFileSync(tmp, JSON.stringify(data, null, 1) + '\n');
renameSync(tmp, outPath);
console.log(`시·도 ${out.length}곳, 시·군·구 ${total}곳을 ${outPath}에 저장했어요.`);
if (dropped.length) console.log(`지금 주소 체계에 없는 후보: ${dropped.join(', ')}`);
if (discovered.length) console.log(`후보에 없었지만 찾은 이름(region-candidates.ts에 더해 주세요): ${discovered.join(', ')}`);
