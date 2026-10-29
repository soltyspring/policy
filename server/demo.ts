import { kstDate } from '../shared/policy.ts';
import type { RawPolicy } from './sources/types.ts';
import type { Store } from './store.ts';

/** 개발·화면 테스트용 예시 정책. 운영에서는 쓰지 않아요. */
export function demoPolicies(today = kstDate()): RawPolicy[] {
  const day = (n: number) => kstDate(new Date(Date.parse(today) + n * 86400_000));
  const base = { summary: '', benefit: '', target: '', how: '', ageMin: null, ageMax: null, applyCode: 'period' as const };
  const y = (id: string, p: Partial<RawPolicy>): RawPolicy => ({
    ...base, id: `y-demo${id}`, source: 'youth', title: '', agency: '', field: 'etc', scope: 'national', sido: [], sgg: [],
    applyStart: null, applyEnd: null, views: 0, registeredAt: day(-30), url: 'https://www.youthcenter.go.kr', ...p,
  } as RawPolicy);
  const g = (id: string, p: Partial<RawPolicy>): RawPolicy => ({ ...y(id, p), id: `g-demo${id}`, source: 'gov24', url: 'https://www.gov.kr', ...p } as RawPolicy);
  return [
    y('1', { title: '청년 월세 한시 특별지원', agency: '국토교통부', field: 'housing', applyStart: day(-20), applyEnd: day(3), views: 98211, registeredAt: day(-2),
      summary: '부모와 따로 사는 무주택 청년에게 월세를 지원해요.', benefit: '월 최대 20만 원, 최대 12개월', target: '만 19~34세, 원가구 중위소득 100% 이하', how: '복지로 또는 주민센터에서 신청', ageMin: 19, ageMax: 34 }),
    y('2', { title: '광주청년 일경험드림', agency: '전남광주통합특별시', field: 'job', scope: 'regional', sido: ['12'], applyStart: day(-5), applyEnd: day(9), views: 15420, registeredAt: day(-4),
      summary: '지역 기업과 공공기관에서 일경험을 쌓을 수 있어요.', benefit: '월 활동비 지급', target: '만 18~39세 지역 거주 청년', how: '온라인 신청', ageMin: 18, ageMax: 39 }),
    y('3', { title: '북구 청년 창업공간 입주 지원', agency: '전남광주통합특별시 북구', field: 'job', scope: 'regional', sido: ['12'], sgg: ['12300'], applyStart: day(-1), applyEnd: day(14), views: 2311, registeredAt: day(-1),
      summary: '창업 초기 청년에게 사무 공간을 빌려줘요.', benefit: '최대 2년 무상 입주', target: '북구 거주 또는 사업장이 있는 예비·초기 창업자', how: '구청 누리집 공고 확인' }),
    y('4', { title: '청년도약계좌', agency: '금융위원회', field: 'welfare', applyCode: 'always', views: 210004, registeredAt: day(-200),
      summary: '매달 저축하면 정부 기여금과 비과세 혜택을 받아요.', benefit: '정부 기여금 + 이자소득 비과세', target: '만 19~34세, 개인소득 7,500만 원 이하', how: '취급 은행 앱에서 신청', ageMin: 19, ageMax: 34 }),
    y('5', { title: '서울 청년수당', agency: '서울특별시', field: 'job', scope: 'regional', sido: ['11'], applyStart: day(10), applyEnd: day(24), views: 54012, registeredAt: day(-6),
      summary: '구직 활동 중인 청년에게 활동 지원금을 줘요.', benefit: '월 50만 원, 최대 6개월', target: '만 19~34세 미취업 서울 청년', how: '서울청년포털 신청' }),
    y('6', { title: '강남구 청년 마음건강 상담', agency: '서울특별시 강남구', field: 'health', scope: 'regional', sido: ['11'], sgg: ['11680'], applyCode: 'always', views: 3120, registeredAt: day(-40),
      summary: '전문 상담사와 1:1 심리 상담을 받을 수 있어요.', benefit: '상담 10회 무료', target: '강남구 거주 청년', how: '전화 신청' }),
    y('7', { title: '수원시 청년 면접정장 대여', agency: '경기도 수원시', field: 'job', scope: 'regional', sido: ['41'], sgg: ['41110'], applyCode: 'always', views: 4870, registeredAt: day(-90),
      summary: '면접을 앞둔 청년에게 정장을 무료로 빌려줘요.', benefit: '연 3회 무료 대여', target: '수원시 거주 만 18~39세', how: '협약 업체 방문' }),
    y('8', { title: '국가장학금 2차 신청', agency: '교육부', field: 'education', applyStart: day(-12), applyEnd: day(1), views: 175230, registeredAt: day(-12),
      summary: '소득 수준에 따라 대학 등록금을 지원해요.', benefit: '학기당 최대 등록금 전액', target: '대학 재학생', how: '한국장학재단 누리집 신청' }),
    y('9', { title: '청년 전세보증금 반환보증 보증료 지원', agency: '국토교통부', field: 'housing', applyCode: 'always', views: 44120, registeredAt: day(-150),
      summary: '전세 사기 피해를 막는 보증보험 보증료를 돌려줘요.', benefit: '보증료 최대 40만 원', target: '만 19~39세 무주택 청년', how: '정부24 신청' }),
    y('10', { title: '청년 국가기술자격 시험 응시료 지원', agency: '고용노동부', field: 'education', applyStart: day(-60), applyEnd: day(-2), views: 30211, registeredAt: day(-60),
      summary: '국가기술자격 시험 응시료를 줄여 줘요.', benefit: '응시료 50% 할인', target: '만 34세 이하', how: 'Q-Net 신청', applyCode: 'closed' }),
    y('11', { title: '광산구 청년 문화패스', agency: '전남광주통합특별시 광산구', field: 'culture', scope: 'regional', sido: ['12'], sgg: ['12330'], applyStart: day(-3), applyEnd: day(27), views: 980, registeredAt: day(-3),
      summary: '공연·전시를 볼 수 있는 문화 포인트를 줘요.', benefit: '1인 15만 원', target: '광산구 거주 만 19~24세' }),
    y('12', { title: '청년 정책참여단 모집', agency: '전남광주통합특별시', field: 'participation', scope: 'regional', sido: ['12'], applyStart: day(-8), applyEnd: day(5), views: 1290, registeredAt: day(-8),
      summary: '지역 청년정책을 직접 제안하고 평가해요.', benefit: '활동 수당 지급', target: '만 19~39세 지역 청년' }),
    g('1', { title: '첫만남이용권', agency: '보건복지부', field: 'health', applyCode: 'always', views: 120400, registeredAt: day(-300),
      summary: '아이가 태어나면 바우처를 줘요.', benefit: '첫째 200만 원, 둘째 이상 300만 원', target: '출생 신고된 아동', how: '복지로·주민센터 신청' }),
    g('2', { title: '에너지바우처', agency: '산업통상자원부', field: 'welfare', applyStart: day(-30), applyEnd: day(40), views: 66320, registeredAt: day(-30),
      summary: '난방비·냉방비를 바우처로 지원해요.', benefit: '가구원 수에 따라 연 최대 70만 원', target: '기초생활수급 가구 중 노인·장애인 등', how: '주민센터 신청' }),
    g('3', { title: '북구 출산 축하금', agency: '전남광주통합특별시 북구', field: 'health', scope: 'regional', sido: ['12'], sgg: ['12300'], applyCode: 'always', views: 2210, registeredAt: day(-5),
      summary: '아이를 낳은 가정에 축하금을 줘요.', benefit: '첫째 100만 원', target: '북구에 6개월 이상 거주한 부모', how: '동 행정복지센터 신청' }),
    g('4', { title: '강남구 어르신 교통비 지원', agency: '서울특별시 강남구', field: 'welfare', scope: 'regional', sido: ['11'], sgg: ['11680'], applyCode: 'always', views: 8890, registeredAt: day(-120),
      summary: '어르신 대중교통비 일부를 돌려줘요.', benefit: '분기별 최대 4만 원', target: '강남구 거주 만 65세 이상', how: '동 주민센터 신청' }),
    g('5', { title: '경기도 청년 기본소득', agency: '경기도', field: 'welfare', scope: 'regional', sido: ['41'], applyStart: day(2), applyEnd: day(30), views: 40210, registeredAt: day(-1),
      summary: '경기도에 사는 만 24세 청년에게 지역화폐를 줘요.', benefit: '분기별 25만 원 지역화폐', target: '만 24세, 경기도 3년 이상 거주', how: '경기도 일자리재단 누리집' }),
    g('6', { title: '긴급복지 생계지원', agency: '보건복지부', field: 'welfare', applyCode: 'always', views: 52100, registeredAt: day(-400),
      summary: '갑자기 어려워진 가구에 생계비를 지원해요.', benefit: '4인 가구 월 183만 원', target: '위기 사유가 생긴 저소득 가구', how: '시·군·구청 또는 129' }),
  ];
}

/** 목록 더보기(20개씩)를 확인하려고 더하는 예시 정책 30개. 이름·기간·분야가 모두 달라요. */
export function extraDemoPolicies(today = kstDate()): RawPolicy[] {
  const day = (n: number) => kstDate(new Date(Date.parse(today) + n * 86400_000));
  const fields = ['job', 'housing', 'education', 'welfare', 'health', 'culture'] as const;
  const names = ['취업 준비', '주거 안정', '평생 학습', '생활 지원', '건강 검진', '문화 바우처'];
  return Array.from({ length: 30 }, (_, i) => ({
    id: `g-extra${i + 1}`, source: 'gov24' as const,
    title: `${names[i % 6]} 지원 ${Math.floor(i / 6) + 1}차`, agency: i % 3 === 0 ? '전남광주통합특별시' : '보건복지부', field: fields[i % 6],
    scope: i % 3 === 0 ? 'regional' as const : 'national' as const, sido: i % 3 === 0 ? ['12'] : [], sgg: [],
    summary: '예시 정책이에요.', benefit: '', target: '', how: '', ageMin: null, ageMax: null,
    applyStart: day(-10), applyEnd: day(10 + i), applyCode: 'period' as const, views: 100 * (30 - i), registeredAt: day(-20 - i), url: 'https://www.gov.kr',
  }));
}

export function seedDemo(store: Store) {
  const list = [...demoPolicies(), ...extraDemoPolicies()];
  const checkedAt = new Date().toISOString();
  for (const source of ['youth', 'gov24'] as const) {
    const items = list.filter(p => p.source === source);
    store.replaceSource(source, items);
    store.setMeta(`seeded:${source}`, checkedAt);
    store.setSourceStatus({ source, state: 'ok', count: items.length, checkedAt });
  }
  store.setMeta('updatedAt', checkedAt);
}
