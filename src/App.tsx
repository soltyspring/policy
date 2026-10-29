import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  applyLabel, applyState, daysLeft, FIELD_LABELS, FIELDS, filterPolicies, freshCount, fromLiteRows, kstDate, SORT_KEYS, SORT_LABELS, sortPolicies, SOURCE_LABELS,
  type Field, type Policy, type PolicyIndexResponse, type PolicyLite, type SortKey, type SourceStatus, type SubscriptionState,
} from '../shared/policy';
import { createRegionIndex, REGIONS, type RegionData } from '../shared/regions';
import { api, ApiError, type AppConfig } from './api';
import { BellOn, Check, Chevron, Down, EmptyArt, FieldIcon, Logo, PinIcon, StepIcon } from './Art';
import { ageLabel, metaLine, periodLabel, pickedLabel, policyRegionLabel, uniqueTitles, type Picked } from './labels';
import { connectNative, createAuthCode, haptic, isNativeToss, openExternal, requestAgreement, shareApp } from './platform';

/** 새 정책 알림 캠페인 발송 코드. 동의 화면을 띄울 때도 이 코드를 써요. */
const NEW_TEMPLATE = import.meta.env.VITE_TOSS_NEW_TEMPLATE as string | undefined;
const RECENT_LIMIT = 3;
const PAGE = 20;
const REGION_KEY = 'policy:region:v1';
/** 목록 제목은 첫 화면 개수와 겹치지 않게 정렬 기준을 말해요. */
const LIST_TITLES: Record<SortKey, string> = { deadline: '마감이 가까운 정책', recent: '새로 올라온 정책', popular: '많이 본 정책', name: '가나다순 정책' };

type SheetKind =
  | { type: 'policy'; policy: PolicyLite }
  /** sido가 있으면 그 시·도의 시·군·구 목록, 없으면 시·도 목록 */
  | { type: 'region'; sido: string | null }
  | { type: 'sort' }
  | { type: 'setup' }
  | { type: 'settings' }
  | { type: 'doc'; kind: 'terms' | 'privacy' }
  | null;

function readPicked(): Picked {
  try {
    const v = JSON.parse(localStorage.getItem(REGION_KEY) ?? 'null');
    if (v && typeof v === 'object') return { sido: typeof v.sido === 'string' ? v.sido : null, sgg: typeof v.sgg === 'string' ? v.sgg : null };
  } catch { /* 처음 열었어요 */ }
  return { sido: null, sgg: null };
}

/** 개발 화면에서 `?notify=0`이면 알림 화면을 숨겨요(콘솔 스크린샷용). */
const forceNotifyOff = import.meta.env.DEV && new URLSearchParams(location.search).get('notify') === '0';

// ── 가벼운 목록 기억 ─────────────────────────────
/** 지역 하나의 가벼운 목록. key는 "시·도|시·군·구" */
interface RegionIndexData { key: string; version: string; updatedAt: string | null; sources: SourceStatus[]; items: PolicyLite[] }
const INDEX_KEY = 'policy:index:v1';
/** 이번에 연 동안 받은 지역별 목록(지역을 오가도 다시 받지 않아요) */
const memoryIndex = new Map<string, RegionIndexData>();
/** 연 정책 상세(같은 정책을 다시 열면 바로 보여요) */
const detailCache = new Map<string, Policy>();
const keyOf = (p: Picked) => `${p.sido ?? ''}|${p.sido ? p.sgg ?? '' : ''}`;
const toIndexData = (key: string, r: PolicyIndexResponse): RegionIndexData =>
  ({ key, version: r.version, updatedAt: r.updatedAt, sources: r.sources, items: fromLiteRows(r.rows) });
/** 마지막으로 본 지역의 목록은 기기에 저장해서, 다음에 열면 기다리지 않고 바로 보여 주고 뒤에서 새로 받아요. */
function readCachedIndex(p: Picked): RegionIndexData | null {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { key: string; at: number; data: PolicyIndexResponse };
    if (saved.key !== keyOf(p) || Date.now() - saved.at > 3 * 86400_000) return null;
    return toIndexData(saved.key, saved.data);
  } catch { return null; }
}
function writeCachedIndex(data: RegionIndexData, r: PolicyIndexResponse) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify({ key: data.key, at: Date.now(), data: r })); }
  catch { /* 저장 공간이 부족하면 기억하지 않아요 */ }
}

export default function App() {
  const [regionData, setRegionData] = useState<RegionData>(REGIONS);
  const idx = useMemo(() => createRegionIndex(regionData), [regionData]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [picked, setPicked] = useState<Picked>(readPicked);
  const [youthOnly, setYouthOnly] = useState(false);
  const [field, setField] = useState<Field | undefined>();
  const [openOnly, setOpenOnly] = useState(true);
  /** 지역을 골랐을 때 전국 정책을 빼고 볼지 */
  const [localOnly, setLocalOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('deadline');
  const [index, setIndex] = useState<RegionIndexData | null>(() => readCachedIndex(readPicked()));
  const [listError, setListError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /** 펼쳤을 때 보이는 개수(0이면 접힘: 3개만) */
  const [shown, setShown] = useState(0);
  const [sub, setSub] = useState<SubscriptionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const sheetRef = useRef<SheetKind>(null);
  sheetRef.current = sheet;

  const notifyOn = !!config?.notify && !forceNotifyOff;
  const query = useMemo(() => ({ sido: picked.sido ?? undefined, sgg: picked.sgg ?? undefined, youth: youthOnly, field, open: openOnly, national: !(picked.sido && localOnly), sort }), [picked, youthOnly, field, openOnly, localOnly, sort]);

  const showToast = useCallback((text: string) => { setToast(text); window.setTimeout(() => setToast(t => (t === text ? null : t)), 2800); }, []);

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig({ notify: false, intervalHours: 6 }));
    api.regions().then(d => { if (Array.isArray(d?.sido) && d.sido.length >= 10) setRegionData(d); }).catch(() => { /* 함께 배포한 목록을 써요 */ });
    // 뒤로 가기: 시·군·구 목록이면 시·도 목록으로, 다른 시트면 닫기, 없으면 미니앱 닫기
    const off = connectNative(() => {
      const s = sheetRef.current;
      if (s?.type === 'region' && s.sido) { setSheet({ type: 'region', sido: null }); return true; }
      if (s) { setSheet(null); return true; }
      return false;
    });
    return off;
  }, []);

  useEffect(() => { if (notifyOn && api.hasSession()) api.subscription().then(setSub).catch(() => setSub(null)); }, [notifyOn]);
  useEffect(() => { localStorage.setItem(REGION_KEY, JSON.stringify(picked)); }, [picked]);

  /**
   * 지역이 바뀔 때만 서버에서 가벼운 목록을 받아요(전국 정책 포함, 한 번에).
   * 분야·조건·정렬은 기기에서 바로 바꿔서 칩을 누르면 기다리지 않아요.
   * 받은 목록은 지역별로 기억하고, 마지막 지역은 기기에 저장해 다음에 열 때 바로 보여 줘요.
   */
  const regionKey = `${picked.sido ?? ''}|${picked.sido ? picked.sgg ?? '' : ''}`;
  const loadIndex = useCallback((signal?: AbortSignal) => {
    setListError(false);
    const memo = memoryIndex.get(regionKey) ?? readCachedIndex(picked);
    if (memo) setIndex(memo); // 기억한 목록을 먼저 보여 주고 뒤에서 새로 받아요
    setRefreshing(true);
    return api.index(picked, signal)
      .then(r => { const data = toIndexData(regionKey, r); memoryIndex.set(regionKey, data); writeCachedIndex(data, r); setIndex(data); })
      .catch(e => { if ((e as Error).name !== 'AbortError' && !memo) setListError(true); })
      .finally(() => { if (!signal?.aborted) setRefreshing(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionKey]);
  useEffect(() => {
    const ctrl = new AbortController();
    void loadIndex(ctrl.signal);
    return () => ctrl.abort();
  }, [loadIndex]);
  // 조건이 바뀌면 다시 3개부터 보여 줘요.
  useEffect(() => { setShown(0); }, [query]);

  const today = kstDate();
  const items = index?.key === regionKey ? index.items : index?.items ?? [];
  const view = useMemo(() => {
    const matched = filterPolicies(items, query, today);
    return {
      sorted: sortPolicies(matched, sort, today),
      open: query.open ? matched.length : filterPolicies(items, { ...query, open: true }, today).length,
      fresh: freshCount(matched, today),
    };
  }, [items, query, sort, today]);

  function choose(next: Picked, message?: string) {
    setPicked(next);
    setSheet(null);
    haptic('success');
    if (message) showToast(message);
  }
  /** 지역 버튼: 이미 고른 시·도가 있으면 그 시·군·구 목록부터 보여 줘요(같은 시·도 안에서 바꾸는 일이 가장 많아요). */
  const openRegion = () => setSheet({ type: 'region', sido: picked.sido && picked.sido !== '36' ? picked.sido : null });

  /** 새 정책 수를 누르면 최근 등록순으로 바꾸고 목록으로 내려가요. */
  function showFresh() {
    setSort('recent');
    document.getElementById('list-title')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  // ── 새 정책 알림(콘솔 캠페인 승인 뒤 서버 NOTIFY_ENABLED로 켜요) ──
  async function ensureSession() {
    if (api.hasSession()) return true;
    const code = await createAuthCode();
    if (!code) { showToast('토스 앱에서 이용할 수 있어요'); return false; }
    setSub(await api.connect(code));
    return true;
  }
  async function startNotify() {
    if (busy || !picked.sido) return;
    setBusy(true);
    try {
      const agreed = await requestAgreement(NEW_TEMPLATE);
      if (agreed !== 'agreed') {
        showToast(agreed === 'rejected' ? '알림을 받으려면 동의가 필요해요'
          : agreed === 'unsupported' ? (isNativeToss() ? '토스 앱을 최신 버전으로 업데이트해 주세요' : '토스 앱에서 알림을 받을 수 있어요')
          : agreed === 'not-ready' ? '알림 기능을 준비하고 있어요. 조금만 기다려 주세요' : '잠시 후 다시 시도해 주세요');
        return;
      }
      if (!(await ensureSession())) return;
      setSub(await api.save({ sido: picked.sido, sgg: picked.sgg }));
      haptic('success');
      setSheet(null);
      showToast(`${pickedLabel(picked, idx)}에 새 정책이 올라오면 알려드릴게요`);
    } catch (e) {
      haptic('error');
      showToast(e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요');
    } finally { setBusy(false); }
  }
  async function changeNotifyRegion() {
    if (!picked.sido) return;
    try { setSub(await api.save({ sido: picked.sido, sgg: picked.sgg })); showToast('알림 지역을 바꿨어요'); }
    catch (e) { if (e instanceof ApiError && e.status === 401) { setSub(null); setSheet(null); } showToast('저장하지 못했어요. 다시 시도해 주세요'); }
  }
  async function stopNotify() {
    try { setSub(await api.off()); setSheet(null); showToast('알림을 껐어요'); }
    catch (e) { if (e instanceof ApiError && e.status === 401) { setSub(null); setSheet(null); } showToast('저장하지 못했어요. 다시 시도해 주세요'); }
  }

  async function share() {
    const native = isNativeToss() || typeof navigator.share === 'function';
    showToast((await shareApp()) ? (native ? '공유했어요' : '소개 문구를 복사했어요') : '공유하지 못했어요');
  }

  const total = view.sorted.length;
  const visible = view.sorted.slice(0, shown || RECENT_LIMIT);
  const titles = useMemo(() => uniqueTitles(visible, idx), [visible, idx]);
  const regionText = pickedLabel(picked, idx);
  const ready = !!index;
  const noData = ready && items.length === 0 && index!.sources.every(s => s.state !== 'ok');
  const subscribed = !!sub?.subscribed;
  const resetFilters = () => { setYouthOnly(false); setField(undefined); setOpenOnly(false); setLocalOnly(false); };

  return (
    <div className={`app ${notifyOn ? 'has-cta' : ''}`}>
      <header className="top-bar">
        <Logo size={26} /><span className="brand-name">동네 정책 찾기</span>
      </header>

      <main>
        {/* 지역은 고르지 않아도 돼요. 버튼 하나로 "어디 기준인지"만 보여 주고, 누르면 시·도 → 시·군·구 순서로 골라요. */}
        <section className="hero" aria-labelledby="hero-title">
          <button className="region-button" onClick={openRegion} aria-label={`지역: ${pickedLabel(picked, idx, true)}. 바꾸기`}>
            <PinIcon /><span>{picked.sido ? regionText : '전국'}</span><Down />
          </button>
          <h1 id="hero-title">
            {ready ? <>지금 신청할 수 있는<br />정책 <b className="num">{view.open.toLocaleString('ko-KR')}</b>개</> : <>정책을 모으고 있어요</>}
          </h1>
          {ready && view.fresh > 0 ? (
            // 새 정책 수를 누르면 최근 등록순 목록으로 바로 가요.
            <button className="fresh-link" onClick={showFresh}>이번 주 새로 올라온 정책 {view.fresh}개<Chevron /></button>
          ) : (
            <p className="hero-sub">정부와 지자체 혜택을 한곳에 모았어요</p>
          )}
        </section>

        <section className="card list-card" aria-labelledby="list-title">
          {/* 정렬과 조건은 그 조건이 바꾸는 목록 바로 위에 둬요. */}
          <div className="list-head">
            <h2 id="list-title" className="section-title">{LIST_TITLES[sort]}</h2>
            <button className="sort-button" onClick={() => setSheet({ type: 'sort' })} aria-label={`정렬: ${SORT_LABELS[sort]}. 바꾸기`}>
              {SORT_LABELS[sort]}<Down />
            </button>
          </div>
          <div className="chips" role="group" aria-label="분야">
            <button aria-pressed={!field} className={!field ? 'on' : ''} onClick={() => setField(undefined)}>전체 분야</button>
            {FIELDS.map(f => <button key={f} aria-pressed={field === f} className={field === f ? 'on' : ''} onClick={() => setField(field === f ? undefined : f)}>{FIELD_LABELS[f]}</button>)}
          </div>
          <div className="checks" role="group" aria-label="조건">
            <CheckChip label="신청 가능" checked={openOnly} onChange={setOpenOnly} />
            <CheckChip label="청년 대상" checked={youthOnly} onChange={setYouthOnly} />
            {picked.sido && <CheckChip label="우리 지역만" checked={localOnly} onChange={setLocalOnly} />}
          </div>
          {!ready && !listError && <div className="skeleton-list" aria-label="불러오는 중"><span /><span /><span /></div>}
          {listError && !ready && <div className="empty"><EmptyArt /><p>정책을 불러오지 못했어요</p><button className="text-button" onClick={() => void loadIndex()}>다시 불러오기</button></div>}
          {noData && <div className="empty"><EmptyArt /><p>정책을 준비하고 있어요</p><span className="small">곧 채워질 거예요. 잠시 후 다시 확인해 주세요</span></div>}
          {ready && !noData && total === 0 && (
            <div className="empty"><EmptyArt /><p>조건에 맞는 정책이 없어요</p><button className="text-button" onClick={resetFilters}>조건 풀기</button></div>
          )}
          <ul className={`policy-list ${refreshing && index?.key !== regionKey ? 'is-stale' : ''}`} aria-busy={refreshing && index?.key !== regionKey}>
            {visible.map((p, i) => <PolicyRow key={p.id} policy={p} title={titles[i]} meta={metaLine(p, idx)} onOpen={() => setSheet({ type: 'policy', policy: p })} />)}
          </ul>
          {total > RECENT_LIMIT && !shown && (
            <button className="more-button" aria-expanded={false} onClick={() => setShown(PAGE)}>
              더보기 ({(total - RECENT_LIMIT).toLocaleString('ko-KR')}개)<Down />
            </button>
          )}
          {!!shown && (
            <div className="more-actions">
              {shown < total && (
                <button className="more-button" onClick={() => setShown(n => n + PAGE)}>{Math.min(PAGE, total - shown)}개 더 보기</button>
              )}
              <button className="more-button weak" aria-expanded={true} onClick={() => setShown(0)}>접기<Down open /></button>
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="how-title">
          <h2 id="how-title" className="section-title">이렇게 모아요</h2>
          <ol className="steps">
            <Step icon="source" title="공식 데이터만 써요" text="정부24 공공서비스 공공데이터를 모아요." />
            <Step icon="refresh" title={`${config?.intervalHours ?? 6}시간마다 새로 확인해요`} text="마감된 정책은 따로 표시해요." />
            <Step icon="apply" title="신청은 공식 페이지에서 해요" text="조건과 서류는 담당 기관 안내를 따라요." />
          </ol>
        </section>

        <section className="card share-card">
          <div><strong>이 지역에 사는 친구가 있나요?</strong><span>받을 수 있는 혜택을 같이 찾아봐요</span></div>
          <button className="pill-button" onClick={() => void share()}>공유하기</button>
        </section>

        <footer className="footer">
          <p>동네 정책 찾기는 정부·지자체와 관련 없는 개인 서비스예요. 실제 지원 조건과 신청 방법은 담당 기관의 공식 안내를 확인해 주세요.</p>
          <p className="sources">자료: {sourceCredit(index)}{index?.updatedAt ? ` · ${new Date(index.updatedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' })} 기준` : ''}</p>
          <p className="footer-links">
            <button onClick={() => setSheet({ type: 'doc', kind: 'terms' })}>이용약관</button>
            <button onClick={() => setSheet({ type: 'doc', kind: 'privacy' })}>개인정보 처리방침</button>
          </p>
          <p className="seller">운영 블루씨엘 · 문의 bluecl@bluecl.cloud</p>
        </footer>
      </main>

      {notifyOn && (
        <div className="bottom-cta">
          {subscribed
            ? <button className="cta weak" onClick={() => setSheet({ type: 'settings' })}><BellOn /> 새 정책 알림 받는 중</button>
            : <button className="cta" onClick={() => setSheet({ type: 'setup' })}><BellOn /> 새 정책이 올라오면 알려드릴까요?</button>}
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}

      {sheet?.type === 'policy' && <Sheet title={sheet.policy.title} onClose={() => setSheet(null)}><PolicyDetail policy={sheet.policy} region={policyRegionLabel(sheet.policy, idx)} /></Sheet>}
      {sheet?.type === 'region' && (
        <Sheet title="지역 고르기" onClose={() => setSheet(null)}>
          <RegionPicker data={regionData} picked={picked} sido={sheet.sido} onSido={code => setSheet({ type: 'region', sido: code })}
            onPick={p => choose(p, p.sido ? `${pickedLabel(p, idx)} 정책을 보여 드릴게요` : '전국 정책을 보여 드릴게요')} />
        </Sheet>
      )}
      {sheet?.type === 'sort' && (
        <Sheet title="정렬" onClose={() => setSheet(null)}>
          <h2 className="detail-title">어떤 순서로 볼까요?</h2>
          <div className="radio-list" role="radiogroup" aria-label="정렬">
            {SORT_KEYS.map(k => (
              <button key={k} role="radio" aria-checked={sort === k} className={sort === k ? 'on' : ''} onClick={() => { setSort(k); setSheet(null); }}>
                {SORT_LABELS[k]}{sort === k && <Check />}
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {sheet?.type === 'setup' && (
        <Sheet title="새 정책 알림" onClose={() => setSheet(null)}>
          <div className="settings">
            <h2 className="detail-title">{picked.sido ? <>{regionText}에 새 정책이 올라오면<br />알려드릴게요</> : <>알림 받을 지역을<br />먼저 골라 주세요</>}</h2>
            <p className="detail-summary">하루에 한 번까지만 보내요. 전국 정책은 알림에서 빼요.</p>
            {picked.sido
              ? <button className="cta full" onClick={() => void startNotify()} disabled={busy} aria-busy={busy}>{busy ? <span className="spinner" aria-label="연결 중" /> : '알림 받기'}</button>
              : <button className="cta full" onClick={openRegion}>지역 고르기</button>}
          </div>
        </Sheet>
      )}
      {sheet?.type === 'settings' && sub?.region && (
        <Sheet title="새 정책 알림" onClose={() => setSheet(null)}>
          <div className="settings">
            <h2 className="detail-title">{pickedLabel(sub.region, idx)} 새 정책을<br />알려드리고 있어요</h2>
            {(sub.region.sido !== picked.sido || sub.region.sgg !== picked.sgg) && picked.sido && (
              <button className="cta weak full" onClick={() => void changeNotifyRegion()}>{regionText}(으)로 바꾸기</button>
            )}
            {sub.since && <p className="small">{new Date(sub.since).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}부터 받고 있어요</p>}
            <button className="text-button danger" onClick={() => void stopNotify()}>알림 끄기</button>
          </div>
        </Sheet>
      )}
      {sheet?.type === 'doc' && <Sheet title={docTitle[sheet.kind]} onClose={() => setSheet(null)}><Doc kind={sheet.kind} /></Sheet>}
    </div>
  );
}

/** 실제로 쓰고 있는 출처만 적어요. */
function sourceCredit(index: RegionIndexData | null) {
  const ok = new Set(index?.sources.filter(s => s.state === 'ok').map(s => s.source));
  return [ok.has('gov24') || !index ? '행정안전부 대한민국 공공서비스 정보' : null, ok.has('youth') ? '한국고용정보원 온통청년' : null, '도로명주소'].filter(Boolean).join(', ');
}

function CheckChip({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`check-chip ${checked ? 'on' : ''}`}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="box" aria-hidden="true"><Check /></span>{label}
    </label>
  );
}

function PolicyRow({ policy, title, meta, onOpen }: { policy: PolicyLite; title: string; meta: string; onOpen: () => void }) {
  const st = applyState(policy);
  const left = daysLeft(policy.applyEnd);
  const tone = st === 'closed' ? 'closed' : st === 'always' ? 'always' : st === 'open' && left !== null && left <= 7 ? 'urgent' : 'normal';
  return (
    <li>
      <button className="policy-row" onClick={onOpen}>
        <FieldIcon field={policy.field} />
        <span className="policy-texts">
          <strong>{title}</strong>
          <span>{meta}</span>
        </span>
        <span className={`deadline ${tone}`}>{applyLabel(policy)}</span>
      </button>
    </li>
  );
}

/**
 * 정책 상세. 목록에 있는 칸(제목·기간·지역·담당)은 바로 보여 주고,
 * 긴 설명과 공식 페이지 주소는 열 때 한 번 받아 기억해요.
 */
function PolicyDetail({ policy, region }: { policy: PolicyLite; region: string }) {
  const [full, setFull] = useState<Policy | null>(() => detailCache.get(policy.id) ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (full) return;
    let alive = true;
    api.policy(policy.id).then(p => { detailCache.set(p.id, p); if (alive) setFull(p); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [policy.id, full]);
  const age = full ? ageLabel(full) : null;
  return (
    <div className="detail">
      <div className="badges">
        <span className={`badge ${policy.source}`}>{SOURCE_LABELS[policy.source]}</span>
        <span className="badge plain">{FIELD_LABELS[policy.field]}</span>
        <span className={`badge state-${applyState(policy)}`}>{applyLabel(policy)}</span>
      </div>
      <h2 className="detail-title">{policy.title}</h2>
      {full?.summary && <p className="detail-summary">{full.summary}</p>}
      <dl className="facts">
        <div><dt>지역</dt><dd>{region}</dd></div>
        <div><dt>신청 기간</dt><dd>{periodLabel(policy)}</dd></div>
        {age && <div><dt>나이</dt><dd>{age}</dd></div>}
        <div><dt>담당</dt><dd>{policy.agency}</dd></div>
      </dl>
      {!full && !failed && <div className="skeleton-list detail-skeleton" aria-label="자세한 내용 불러오는 중"><span /><span /></div>}
      {failed && <p className="small">자세한 내용을 불러오지 못했어요. 공식 페이지에서 확인해 주세요</p>}
      {full?.benefit && <section className="detail-block"><h3>지원 내용</h3><p>{full.benefit}</p></section>}
      {full?.target && <section className="detail-block"><h3>지원 대상</h3><p>{full.target}</p></section>}
      {full?.how && <section className="detail-block"><h3>신청 방법</h3><p>{full.how}</p></section>}
      <div className="sheet-cta">
        <button className="cta full" disabled={!full} aria-busy={!full && !failed} onClick={() => full && void openExternal(full.url)}>
          {full || failed ? '공식 페이지에서 확인하기' : <span className="spinner" aria-label="불러오는 중" />}
        </button>
        <p className="small center">조건과 서류는 공식 페이지에서 꼭 확인해 주세요</p>
      </div>
    </div>
  );
}

/**
 * 지역 고르기 시트. 시·도를 누르면 같은 시트에서 그 시·도의 시·군·구 목록으로 넘어가요.
 * 단계는 부모가 들고 있어서 토스 뒤로 가기가 "시·군·구 → 시·도 → 닫기" 순서로 움직여요.
 */
function RegionPicker({ data, picked, sido: sidoCode, onSido, onPick }: { data: RegionData; picked: Picked; sido: string | null; onSido: (code: string | null) => void; onPick: (p: Picked) => void }) {
  const sido = sidoCode ? data.sido.find(s => s.code === sidoCode) ?? null : null;
  const listRef = useRef<HTMLDivElement>(null);
  // 단계가 바뀌면 고른 칸(없으면 첫 칸)에 초점을 두고 보이게 해요.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>('button.on') ?? listRef.current?.querySelector<HTMLButtonElement>('button');
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest' });
  }, [sidoCode]);
  if (sido) {
    const whole = picked.sido === sido.code && !picked.sgg;
    return (
      <div className="region-picker">
        <button className="back-link" onClick={() => onSido(null)}><Chevron />시·도</button>
        <h2 className="detail-title">{sido.name}</h2>
        <div className="grid" ref={listRef} role="group" aria-label={`${sido.short} 시·군·구`}>
          <button className={whole ? 'on' : ''} aria-pressed={whole} onClick={() => onPick({ sido: sido.code, sgg: null })}>{sido.short} 전체</button>
          {sido.sgg.map(s => (
            <button key={s.code} className={picked.sgg === s.code ? 'on' : ''} aria-pressed={picked.sgg === s.code} onClick={() => onPick({ sido: sido.code, sgg: s.code })}>{s.name}</button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="region-picker">
      <h2 className="detail-title">어느 지역 정책을 볼까요?</h2>
      <div className="grid" ref={listRef} role="group" aria-label="시·도">
        <button className={!picked.sido ? 'on' : ''} aria-pressed={!picked.sido} onClick={() => onPick({ sido: null, sgg: null })}>전국</button>
        {data.sido.map(s => (
          <button key={s.code} className={picked.sido === s.code ? 'on' : ''} aria-pressed={picked.sido === s.code}
            onClick={() => (s.code === '36' ? onPick({ sido: s.code, sgg: null }) : onSido(s.code))}>{s.short}</button>
        ))}
      </div>
      <p className="small">{data.updatedAt} 행정구역 기준이에요</p>
    </div>
  );
}
function Step({ icon, title, text }: { icon: 'source' | 'refresh' | 'apply'; title: string; text: string }) {
  return <li className="step"><StepIcon kind={icon} /><span><strong>{title}</strong><span>{text}</span></span></li>;
}

function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  // 시트를 연 버튼을 처음 렌더할 때 한 번만 기억해요(StrictMode에서 effect가 두 번 돌아도 안전).
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; if (opener?.isConnected) opener.focus(); };
  }, [opener]);
  return (
    <dialog ref={ref} className="sheet" aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet-inner">
        <div className="sheet-handle" aria-hidden="true" />
        <button className="sheet-close" aria-label="닫기" onClick={onClose}><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
        {children}
      </div>
    </dialog>
  );
}

const docTitle = { terms: '이용약관', privacy: '개인정보 처리방침' } as const;

function Doc({ kind }: { kind: 'terms' | 'privacy' }) {
  const sections = {
    terms: [
      ['서비스 안내', '동네 정책 찾기는 블루씨엘이 운영하며, 행정안전부 대한민국 공공서비스 정보 등 공공데이터를 6시간 간격으로 모아 지역별로 보여 드리는 무료 참고용 서비스예요. 정부·지자체·토스와 제휴하거나 승인받은 서비스가 아니에요.'],
      ['정보의 한계', '수집 주기와 원 데이터 상태에 따라 정책 내용이 늦게 바뀌거나 빠질 수 있어요. 지원 대상·금액·기간은 담당 기관이 정하며, 신청 전에 공식 안내를 꼭 확인해 주세요.'],
      ['알림', '새 정책 알림은 사용자가 고른 지역에 새 정책이 올라오면 하루 한 번까지 토스 메시지로 보내요. 알림 설정에서 언제든 끌 수 있어요.'],
      ['변경과 문의', '서비스 내용이 바뀌거나 중단될 수 있으며 중요한 변경은 시행 7일 전에 앱에서 알려 드려요. 문의: bluecl@bluecl.cloud'],
    ],
    privacy: [
      ['수집하는 정보', '고른 동네(시·도, 시·군·구)는 이 기기에만 저장하고 서버로 보내지 않아요. 주소나 토스 계정 정보는 받지 않아요.'],
      ['알림을 받을 때', '새 정책 알림을 켜면 토스가 이 미니앱 전용으로 발급하는 사용자 식별키와 알림 지역을 저장해요. 이름·전화번호는 받지 않아요.'],
      ['보관 기간', '알림을 끄면 발송 대상에서 바로 빼고 30일 안에 식별키를 지워요. 서버 접속 기록은 14일 뒤 지워요.'],
      ['문의', '열람·삭제 요청은 bluecl@bluecl.cloud로 보내 주세요.'],
    ],
  }[kind];
  return <article className="doc"><h2 className="detail-title">{docTitle[kind]}</h2><p className="small">시행일 2026년 10월 29일</p>{sections.map(([t, d]) => <section key={t}><h3>{t}</h3><p>{d}</p></section>)}</article>;
}
