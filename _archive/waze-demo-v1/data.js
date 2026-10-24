/**
 * DUX (덕스) — 서비스 소개 및 인터랙티브 라이브 맵 데모 데이터
 * (실제 실시간 교통 API와 연결되지 않은 시연용 데모 데이터입니다)
 */

const DUX_DATA = {
  // 빠른 조건 칩
  quickChips: [
    { id: "slow_walk", label: "천천히 걷기", icon: "🐢", appendText: "천천히 걸을 거야." },
    { id: "no_stairs", label: "계단 피하기", icon: "🛗", appendText: "계단은 피하고 싶어." },
    { id: "less_walk", label: "오래 걷기 어려움", icon: "👟", appendText: "도보 구간이 짧았으면 좋겠어." },
    { id: "few_transfers", label: "환승 적게", icon: "🔄", appendText: "환승이 적은 길로 가고 싶어." },
    { id: "extra_time_ok", label: "5분 더 걸려도 편한 길", icon: "⏱️", appendText: "5분 정도 더 걸려도 편한 길로 갈래." },
    { id: "bike_ok", label: "따릉이 이용 가능", icon: "🚲", appendText: "자전거(따릉이)도 함께 탈 수 있어." }
  ],

  // 대표 시나리오
  sampleScenarios: [
    {
      id: "scenario_knee",
      tag: "보행 배려",
      title: "다리 통증 · 계단 없이 천천히",
      origin: "강남역 2번 출구",
      destination: "국립중앙박물관",
      prompt: "오늘 다리가 아파서 천천히 걸을 거야. 계단은 피하고, 5분 정도 더 걸려도 환승이 적은 길로 가고 싶어."
    },
    {
      id: "scenario_luggage",
      tag: "최소 도보",
      title: "무거운 캐리어 · 덜 걷는 길",
      origin: "수서역 SRT",
      destination: "서울성모병원",
      prompt: "무거운 여행 가방이 있어서 오래 걷기 어려워. 계단은 꼭 피하고 10분 더 걸려도 도보가 가장 짧은 길로 알려줘."
    },
    {
      id: "scenario_bike",
      tag: "자전거+지하철",
      title: "따릉이와 지하철 조합",
      origin: "홍대입구역 1번 출구",
      destination: "여의도 한강공원",
      prompt: "환승 여러 번 하는 건 싫고 자전거 이용 가능해. 버스 정체 없이 따릉이랑 지하철을 섞어서 갈 수 있을까?"
    },
    {
      id: "scenario_ambiguous",
      tag: "예외 안내",
      title: "물리적으로 불가능한 조건 테스트",
      origin: "강남역 2번 출구",
      destination: "국립중앙박물관",
      prompt: "대중교통이랑 자전거는 아예 안 타고 5분 안에 걸어서만 도착하게 해줘."
    }
  ],

  // 시나리오별 경로 및 상황 변화 데이터
  routesByScenario: {
    scenario_knee: {
      origin: "강남역 2번 출구",
      destination: "국립중앙박물관",
      candidates: [
        {
          id: "route_knee_best",
          rankType: "recommended",
          badgeText: "DUX 맞춤 추천",
          title: "저상버스 402번 + 4호선 (엘리베이터 환승)",
          totalMinutes: 31,
          baseSpeedMinutes: 27,
          diffFromFastest: "최단 대비 +4분",
          transferCount: 1,
          walkMinutes: 8,
          walkMeters: 340,
          modes: ["walk", "bus", "subway", "walk"],
          conditionMatch: "full",
          conditionMatchSummary: "필수 조건 100% 충족 · 계단 0곳 · 느린 걸음 반영",
          conditionChecks: [
            { label: "계단 0곳 (전 구간 저상버스·직결 엘리베이터)", status: "pass", required: true },
            { label: "천천히 걷기 반영 (도보 5분 → 여유 8분으로 계산)", status: "pass", required: false },
            { label: "환승 1회 · 최단 대비 +4분 이내", status: "pass", required: false }
          ],
          aiReason: "가장 빠른 경로보다 4분 더 걸리지만, 사당역 계단 환승 대신 지상 저상버스(402번)와 신용산역 직결 엘리베이터를 이용해 계단을 한 번도 오르지 않는 길입니다.",
          segments: [
            { mode: "walk", label: "평지 도보 3분", detail: "강남역 정류장까지 경사로 이동", badge: "단차 없음" },
            { mode: "bus", label: "402번 저상버스 16분", detail: "강남역 → 신용산역 (5정류장)", badge: "저상버스" },
            { mode: "subway", label: "4호선 7분", detail: "신용산역(엘리베이터) → 이촌역", badge: "🛗 직결 엘리베이터" },
            { mode: "walk", label: "박물관 나들길 5분", detail: "이촌역 무단차 연결통로 이동", badge: "무단차 통로" }
          ],
          mapGeometry: {
            color: "#00B8F5",
            strokeDash: "none",
            pathD: "M 100 320 C 175 285, 225 230, 320 185 L 440 135 L 555 100",
            nodes: [
              { x: 100, y: 320, label: "강남역", sub: "평지 승차", type: "start" },
              { x: 320, y: 185, label: "신용산역", sub: "🛗 엘리베이터 환승", type: "transfer" },
              { x: 555, y: 100, label: "국립중앙박물관", sub: "계단 0곳 도착", type: "end" }
            ],
            modeBadges: [
              { x: 205, y: 245, icon: "🚌", text: "402번 저상" },
              { x: 430, y: 142, icon: "🚇", text: "4호선 (1정거장)" }
            ]
          }
        },
        {
          id: "route_knee_direct",
          rankType: "alternative",
          badgeText: "무환승 대안",
          title: "간선 400번 저상버스 직통 (환승 0회)",
          totalMinutes: 35,
          baseSpeedMinutes: 32,
          diffFromFastest: "최단 대비 +8분",
          transferCount: 0,
          walkMinutes: 6,
          walkMeters: 260,
          modes: ["walk", "bus", "walk"],
          conditionMatch: "partial",
          conditionMatchSummary: "계단 제외·무환승 충족 · 희망 시간(+5분)보다 3분 더 소요",
          conditionChecks: [
            { label: "계단 0곳 (저상버스 직통)", status: "pass", required: true },
            { label: "환승 없음 (0회)", status: "pass", required: false },
            { label: "소요 시간 (+8분, 요청 +5분보다 3분 초과)", status: "warn", required: false }
          ],
          aiReason: "3분 정도 더 걸리지만 지하철 환승조차 없이 한 번에 박물관 앞 정류장까지 이동할 수 있어 다리 부담이 가장 적습니다.",
          segments: [
            { mode: "walk", label: "평지 도보 3분", detail: "강남역 정류장 이동", badge: "평지" },
            { mode: "bus", label: "400번 저상버스 29분", detail: "강남역 → 박물관 정류장 직통", badge: "무환승 저상" },
            { mode: "walk", label: "정문 진입로 3분", detail: "박물관 광장 평지 이동", badge: "경사로" }
          ],
          mapGeometry: {
            color: "#6366F1",
            strokeDash: "10 6",
            pathD: "M 100 320 C 210 340, 380 280, 485 190 L 555 100",
            nodes: [
              { x: 100, y: 320, label: "강남역", sub: "정류장 승차", type: "start" },
              { x: 370, y: 265, label: "반포대교 남단", sub: "무환승 통과", type: "transfer" },
              { x: 555, y: 100, label: "국립중앙박물관", sub: "정문 앞 하차", type: "end" }
            ],
            modeBadges: [
              { x: 335, y: 295, icon: "🚌", text: "400번 직통 (무환승)" }
            ]
          }
        },
        {
          id: "route_knee_fastest",
          rankType: "fastest_warning",
          badgeText: "일반 최단 시간 (조건 미충족)",
          title: "2호선 → 사당역 → 4호선 (일반 최단 경로)",
          totalMinutes: 27,
          baseSpeedMinutes: 23,
          diffFromFastest: "최단 기준",
          transferCount: 1,
          walkMinutes: 14,
          walkMeters: 680,
          modes: ["walk", "subway", "subway", "walk"],
          conditionMatch: "fail",
          conditionMatchSummary: "필수 조건 미충족: 사당역 환승 계단 42계단 포함",
          conditionChecks: [
            { label: "계단 피하기 미충족 (사당역 환승 계단 구간 포함)", status: "fail", required: true },
            { label: "환승 보행 동선 김 (느린 걸음 기준 도보 14분)", status: "warn", required: false }
          ],
          aiReason: "시간상 가장 빠르지만 사당역 환승 통로에 엘리베이터로 우회하기 어려운 계단이 있어 오늘 요청하신 '계단 피하기' 조건에 맞지 않습니다.",
          segments: [
            { mode: "walk", label: "지하역사 이동 5분", detail: "강남역 2호선 승강장 이동", badge: "일반 통로" },
            { mode: "subway", label: "2호선 → 사당역 9분", detail: "사당역 환승 통로 이동", badge: "⚠️ 계단 42칸" },
            { mode: "subway", label: "4호선 → 이촌역 9분", detail: "이촌역 하차", badge: "일반 승강장" },
            { mode: "walk", label: "도보 4분", detail: "박물관 이동", badge: "평지" }
          ],
          mapGeometry: {
            color: "#94A3B8",
            strokeDash: "5 6",
            pathD: "M 100 320 L 195 355 L 400 215 L 555 100",
            nodes: [
              { x: 100, y: 320, label: "강남역", sub: "2호선", type: "start" },
              { x: 195, y: 355, label: "사당역", sub: "⚠️ 계단 구간 주의", type: "warning" },
              { x: 555, y: 100, label: "국립중앙박물관", sub: "도착", type: "end" }
            ],
            modeBadges: [
              { x: 155, y: 345, icon: "⚠️", text: "사당역 계단 포함" }
            ]
          }
        }
      ],
      delayEvent: {
        id: "delay_bus_402",
        eventBadge: "이동 중 상황 변화 발생",
        eventTitle: "승차 예정 402번 버스 9분 지연",
        eventDetail: "강남대로 정체로 402번 저상버스 도착이 9분 지연되어 환승이 어려워졌습니다. 처음 요청하신 조건(계단 제외·천천히 걷기)을 그대로 유지한 대안을 찾았습니다.",
        preservedConditions: ["🛗 계단 피하기 유지", "🐢 천천히 걷기 유지", "🔄 환승 1회 유지"],
        currentDelayedRoute: {
          title: "기존 경로 유지 (402번 대기)",
          newTotalMinutes: 40,
          delayAdded: "+9분 지연",
          summary: "정류장에서 11분 이상 서서 대기해야 하며 총 40분이 걸립니다."
        },
        reroutedCandidate: {
          id: "route_knee_rerouted",
          rankType: "rerouted",
          badgeText: "조건 유지 재추천",
          title: "신분당선(엘리베이터) → 신사역 저상버스 400번 환승",
          totalMinutes: 35,
          baseSpeedMinutes: 31,
          diffFromFastest: "처음 계획보다 +4분 (지연 경로 대비 5분 단축)",
          transferCount: 1,
          walkMinutes: 7,
          walkMeters: 290,
          modes: ["walk", "subway", "bus", "walk"],
          conditionMatch: "full",
          conditionMatchSummary: "처음 조건(계단 0곳·천천히 걷기) 100% 유지",
          conditionChecks: [
            { label: "계단 0곳 유지 (신분당선 엘리베이터 + 400번 저상버스)", status: "pass", required: true },
            { label: "천천히 걷기 반영 (도보 7분 계산)", status: "pass", required: false },
            { label: "정류장 장기 입석 대기 방지 (2분 후 버스 도착)", status: "pass", required: false }
          ],
          aiReason: "4분 더 걸리지만 계단 없이 갈 수 있는 경로예요. 막히는 강남대로를 신분당선(엘리베이터 탑승)으로 통과한 뒤, 신사역 엘리베이터 출구 바로 앞 정류장에서 400번 저상버스를 탑승합니다.",
          segments: [
            { mode: "walk", label: "엘리베이터 탑승 3분", detail: "강남역 신분당선 전용 엘리베이터 이동", badge: "🛗 전용 엘리베이터" },
            { mode: "subway", label: "신분당선 5분", detail: "강남역 → 신사역 (정체 구간 지하 통과)", badge: "정시 운행" },
            { mode: "bus", label: "400번 저상버스 23분", detail: "신사역 엘리베이터 앞 승차 → 박물관 하차", badge: "저상 · 2분 후 도착" },
            { mode: "walk", label: "평지 진입로 4분", detail: "박물관 입구까지 평지 이동", badge: "단차 없음" }
          ],
          mapGeometry: {
            color: "#00E599",
            strokeDash: "none",
            pathD: "M 100 320 L 185 215 C 270 170, 400 160, 555 100",
            nodes: [
              { x: 100, y: 320, label: "강남역", sub: "🛗 신분당선 진입", type: "start" },
              { x: 185, y: 215, label: "신사역 (재추천)", sub: "🛗 출구 앞 저상버스", type: "transfer" },
              { x: 555, y: 100, label: "국립중앙박물관", sub: "계단 0곳 도착", type: "end" }
            ],
            modeBadges: [
              { x: 130, y: 255, icon: "🚇", text: "신분당선 우회" },
              { x: 355, y: 162, icon: "🚌", text: "400번 저상 환승" }
            ]
          }
        }
      }
    },

    scenario_luggage: {
      origin: "수서역 SRT",
      destination: "서울성모병원",
      candidates: [
        {
          id: "route_luggage_best",
          rankType: "recommended",
          badgeText: "DUX 맞춤 추천",
          title: "3호선(수서→고속터미널) 광폭 엘리베이터 직통",
          totalMinutes: 34,
          baseSpeedMinutes: 29,
          diffFromFastest: "최단 대비 +6분",
          transferCount: 0,
          walkMinutes: 7,
          walkMeters: 280,
          modes: ["walk", "subway", "walk"],
          conditionMatch: "full",
          conditionMatchSummary: "필수 조건 충족 · 계단 0곳 · 총 도보 280m",
          conditionChecks: [
            { label: "계단 0곳 (수서역 맞이방~3호선 광폭 엘리베이터)", status: "pass", required: true },
            { label: "도보 최소화 (총 도보 280m, 7분)", status: "pass", required: true },
            { label: "무환승 1회 탑승", status: "pass", required: false }
          ],
          aiReason: "무거운 가방을 끌고 버스를 갈아타는 대신, 수서역 맞이방에서 광폭 엘리베이터로 연결되는 3호선을 이용해 환승 없이 이동하고 병원 측 엘리베이터 출구로 안내합니다.",
          segments: [
            { mode: "walk", label: "맞이방 연결통로 3분", detail: "SRT 수서역 → 3호선 광폭 엘리베이터", badge: "🛗 광폭 엘리베이터" },
            { mode: "subway", label: "3호선 직통 27분", detail: "수서역 → 고속터미널역 (무환승 8정거장)", badge: "짐 여유칸 3-4" },
            { mode: "walk", label: "평지 보도 4분", detail: "3번 출구 엘리베이터 → 병원 정문", badge: "경사로 완비" }
          ],
          mapGeometry: {
            color: "#00B8F5",
            strokeDash: "none",
            pathD: "M 520 320 C 425 290, 310 245, 160 175",
            nodes: [
              { x: 520, y: 320, label: "수서역 SRT", sub: "🛗 광폭 엘리베이터", type: "start" },
              { x: 345, y: 255, label: "교대·도곡 통과", sub: "3호선 무환승", type: "transfer" },
              { x: 160, y: 175, label: "서울성모병원", sub: "🛗 3번출구 엘리베이터", type: "end" }
            ],
            modeBadges: [
              { x: 350, y: 225, icon: "🚇", text: "3호선 무환승 직통" }
            ]
          }
        },
        {
          id: "route_luggage_bus",
          rankType: "alternative",
          badgeText: "지상 이동 대안",
          title: "간선 401번 저상버스 + 지선 환승",
          totalMinutes: 39,
          baseSpeedMinutes: 35,
          diffFromFastest: "최단 대비 +11분",
          transferCount: 1,
          walkMinutes: 8,
          walkMeters: 310,
          modes: ["walk", "bus", "walk"],
          conditionMatch: "partial",
          conditionMatchSummary: "계단 없음 충족 · 캐리어 동반 시 환승 1회 필요",
          conditionChecks: [
            { label: "계단 0곳 (저상버스 이용)", status: "pass", required: true },
            { label: "버스 환승 1회 필요", status: "warn", required: false }
          ],
          aiReason: "지하로 내려가지 않고 지상에서만 이동할 수 있으나, 캐리어를 끌고 버스를 한 번 갈아타야 하므로 차선책으로 안내합니다.",
          segments: [
            { mode: "walk", label: "정류장 이동 4분", detail: "수서역 정류장 평지 이동", badge: "평지" },
            { mode: "bus", label: "401번 저상버스 31분", detail: "수서역 → 성모병원 사거리", badge: "저상버스" },
            { mode: "walk", label: "병원 진입 4분", detail: "정문 이동", badge: "경사로" }
          ],
          mapGeometry: {
            color: "#6366F1",
            strokeDash: "10 6",
            pathD: "M 520 320 C 430 215, 290 185, 160 175",
            nodes: [
              { x: 520, y: 320, label: "수서역 SRT", sub: "정류장", type: "start" },
              { x: 160, y: 175, label: "서울성모병원", sub: "하차", type: "end" }
            ],
            modeBadges: [
              { x: 330, y: 195, icon: "🚌", text: "저상버스 경로" }
            ]
          }
        }
      ],
      delayEvent: {
        id: "delay_elevator_outage",
        eventBadge: "시설 상태 변화 발생",
        eventTitle: "고속터미널역 3번 출구 엘리베이터 일시 점검",
        eventDetail: "하차 예정인 고속터미널역 출구 엘리베이터에 일시 점검이 발생했습니다. 계단 제외와 최소 도보 조건을 지키기 위해 교대역 엘리베이터+저상버스 경로로 다시 안내합니다.",
        preservedConditions: ["🛗 계단 피하기 유지", "👟 최소 도보 유지"],
        currentDelayedRoute: {
          title: "기존 경로 유지 (반대편 출구 우회)",
          newTotalMinutes: 42,
          delayAdded: "우회 도보 +8분",
          summary: "지하상가를 550m 이상 우회해야 해 무거운 짐 이동이 어렵습니다."
        },
        reroutedCandidate: {
          id: "route_luggage_rerouted",
          rankType: "rerouted",
          badgeText: "조건 유지 재추천",
          title: "3호선 교대역(엘리베이터) → 740번 저상버스 병원 본관 앞 하차",
          totalMinutes: 37,
          baseSpeedMinutes: 33,
          diffFromFastest: "처음 계획보다 +3분 (도보 거리 90m 단축)",
          transferCount: 1,
          walkMinutes: 5,
          walkMeters: 190,
          modes: ["walk", "subway", "bus", "walk"],
          conditionMatch: "full",
          conditionMatchSummary: "계단 0곳 유지 · 도보 거리 오히려 90m 단축",
          conditionChecks: [
            { label: "계단 0곳 유지 (교대역 엘리베이터 + 740번 저상버스)", status: "pass", required: true },
            { label: "도보 거리 단축 (280m → 190m, 5분)", status: "pass", required: true }
          ],
          aiReason: "3분 더 걸리지만, 점검 중인 엘리베이터 대신 한 정거장 전인 교대역에서 엘리베이터로 올라와 740번 저상버스를 타면 병원 본관 앞까지 걸음 수를 오히려 줄이면서 계단 없이 도착합니다.",
          segments: [
            { mode: "walk", label: "수서역 엘리베이터 2분", detail: "3호선 승강장 이동", badge: "🛗 엘리베이터" },
            { mode: "subway", label: "3호선 24분", detail: "수서역 → 교대역 하차", badge: "정시 운행" },
            { mode: "bus", label: "740번 저상버스 8분", detail: "교대역 → 서울성모병원 정문 앞", badge: "저상 · 3분 후 도착" },
            { mode: "walk", label: "본관 로비 3분", detail: "정류장 바로 앞 평지 100m", badge: "무단차 진입" }
          ],
          mapGeometry: {
            color: "#00E599",
            strokeDash: "none",
            pathD: "M 520 320 L 290 250 L 160 175",
            nodes: [
              { x: 520, y: 320, label: "수서역 SRT", sub: "출발", type: "start" },
              { x: 290, y: 250, label: "교대역 (재추천)", sub: "🛗 엘리베이터+저상", type: "transfer" },
              { x: 160, y: 175, label: "서울성모병원", sub: "본관 앞 하차", type: "end" }
            ],
            modeBadges: [
              { x: 405, y: 285, icon: "🚇", text: "3호선" },
              { x: 220, y: 205, icon: "🚌", text: "740번 저상" }
            ]
          }
        }
      }
    },

    scenario_bike: {
      origin: "홍대입구역 1번 출구",
      destination: "여의도 한강공원",
      candidates: [
        {
          id: "route_bike_best",
          rankType: "recommended",
          badgeText: "DUX 맞춤 추천",
          title: "2호선(홍대→당산) + 한강 자전거도로 따릉이 주행",
          totalMinutes: 24,
          baseSpeedMinutes: 24,
          diffFromFastest: "최단 대비 1분 단축",
          transferCount: 1,
          walkMinutes: 4,
          walkMeters: 220,
          modes: ["walk", "subway", "bike"],
          conditionMatch: "full",
          conditionMatchSummary: "따릉이+지하철 결합 · 도로 정체 회피 · 환승 1회",
          conditionChecks: [
            { label: "자전거(따릉이) + 지하철 조합 반영", status: "pass", required: true },
            { label: "버스 정체 회피 (평탄한 한강 자전거도로)", status: "pass", required: false },
            { label: "환승 1회 (지하철 → 따릉이)", status: "pass", required: false }
          ],
          aiReason: "2호선으로 당산역까지 5분 만에 이동한 뒤, 당산역 나들목 대여소에서 따릉이를 빌려 막힘없는 한강 자전거도로로 여의도까지 쾌적하게 달리는 경로입니다.",
          segments: [
            { mode: "walk", label: "승강장 이동 3분", detail: "홍대입구역 2호선 이동", badge: "에스컬레이터" },
            { mode: "subway", label: "2호선 5분", detail: "홍대입구역 → 당산역 (2정거장)", badge: "정시 운행" },
            { mode: "bike", label: "따릉이 주행 15분", detail: "당산역 대여소(9대 여유) → 여의도 반납 (2.3km)", badge: "🚲 전용 자전거길" },
            { mode: "walk", label: "공원 진입 1분", detail: "반납소 바로 앞", badge: "평지" }
          ],
          mapGeometry: {
            color: "#00B8F5",
            strokeDash: "none",
            pathD: "M 135 115 L 250 235 C 335 250, 425 245, 505 225",
            nodes: [
              { x: 135, y: 115, label: "홍대입구역", sub: "2호선 승차", type: "start" },
              { x: 250, y: 235, label: "당산역 대여소", sub: "🚲 따릉이 9대(데모)", type: "transfer" },
              { x: 505, y: 225, label: "여의도 한강공원", sub: "🚲 반납 도착", type: "end" }
            ],
            modeBadges: [
              { x: 190, y: 175, icon: "🚇", text: "2호선 (5분)" },
              { x: 380, y: 242, icon: "🚲", text: "한강 자전거길 2.3km" }
            ]
          }
        },
        {
          id: "route_bike_full",
          rankType: "alternative",
          badgeText: "전 구간 라이딩",
          title: "홍대 경의선숲길 → 양화대교 자전거 경사로 → 여의도",
          totalMinutes: 29,
          baseSpeedMinutes: 29,
          diffFromFastest: "최단 대비 +4분",
          transferCount: 0,
          walkMinutes: 2,
          walkMeters: 120,
          modes: ["bike"],
          conditionMatch: "full",
          conditionMatchSummary: "환승 0회 · 처음부터 끝까지 따릉이 주행",
          conditionChecks: [
            { label: "환승 없음 (전 구간 자전거 5.4km)", status: "pass", required: false },
            { label: "양화대교 자전거 경사로/엘리베이터 이용", status: "pass", required: false }
          ],
          aiReason: "대중교통을 전혀 타지 않고 처음부터 끝까지 자전거로만 이동하고 싶을 때 적합한 경로입니다.",
          segments: [
            { mode: "bike", label: "전 구간 따릉이 29분", detail: "홍대입구 → 합정 → 양화대교 → 여의도 (5.4km)", badge: "🚲 자전거 우선도로" }
          ],
          mapGeometry: {
            color: "#6366F1",
            strokeDash: "10 6",
            pathD: "M 135 115 C 120 205, 200 280, 505 225",
            nodes: [
              { x: 135, y: 115, label: "홍대입구역", sub: "🚲 따릉이 출발", type: "start" },
              { x: 505, y: 225, label: "여의도 한강공원", sub: "도착", type: "end" }
            ],
            modeBadges: [
              { x: 270, y: 265, icon: "🚲", text: "전 구간 라이딩 5.4km" }
            ]
          }
        }
      ],
      delayEvent: {
        id: "delay_bike_dock",
        eventBadge: "대여소 잔여 수량 변화",
        eventTitle: "당산역 대여소 따릉이 잔여 수량 부족 (1대 남음)",
        eventDetail: "당산역 출구 대여소의 자전거가 빠르게 소진되어 헛걸음할 가능성이 생겼습니다. 기존 조건(자전거+지하철, 환승 1회)을 유지한 합정역 대여소 경로로 다시 안내합니다.",
        preservedConditions: ["🚲 따릉이+지하철 유지", "🔄 환승 1회 유지"],
        currentDelayedRoute: {
          title: "기존 경로 유지 (당산역 하차)",
          newTotalMinutes: 33,
          delayAdded: "도보 전환 시 +9분",
          summary: "대여소에 자전거가 소진될 경우 도보로 1.8km를 걸어야 합니다."
        },
        reroutedCandidate: {
          id: "route_bike_rerouted",
          rankType: "rerouted",
          badgeText: "조건 유지 재추천",
          title: "2호선 합정역 하차 → 합정 대여소(14대 여유) + 한강 자전거길",
          totalMinutes: 27,
          baseSpeedMinutes: 27,
          diffFromFastest: "처음 계획보다 +3분 (자전거 14대 여유 확보)",
          transferCount: 1,
          walkMinutes: 4,
          walkMeters: 210,
          modes: ["walk", "subway", "bike"],
          conditionMatch: "full",
          conditionMatchSummary: "따릉이+지하철 조건 유지 · 대여 확실성 100%",
          conditionChecks: [
            { label: "자전거 대여 확실 (합정역 대여소 14대 거치 중)", status: "pass", required: true },
            { label: "환승 1회 유지 (2호선 → 따릉이)", status: "pass", required: false }
          ],
          aiReason: "3분 더 걸리지만 자전거가 14대 남아 있는 합정역에서 확실하게 따릉이를 빌려 한강 자전거길로 진입하는 안전한 대안입니다.",
          segments: [
            { mode: "subway", label: "2호선 3분", detail: "홍대입구역 → 합정역 (1정거장)", badge: "즉시 하차" },
            { mode: "bike", label: "따릉이 주행 24분", detail: "합정역(14대 여유) → 양화대교 엘리베이터 → 여의도", badge: "🚲 14대 여유(데모)" }
          ],
          mapGeometry: {
            color: "#00E599",
            strokeDash: "none",
            pathD: "M 135 115 L 170 190 C 255 225, 375 230, 505 225",
            nodes: [
              { x: 135, y: 115, label: "홍대입구역", sub: "출발", type: "start" },
              { x: 170, y: 190, label: "합정역 (재추천)", sub: "🚲 14대 여유", type: "transfer" },
              { x: 505, y: 225, label: "여의도 한강공원", sub: "도착", type: "end" }
            ],
            modeBadges: [
              { x: 325, y: 215, icon: "🚲", text: "합정 대여 → 한강 자전거길" }
            ]
          }
        }
      }
    }
  }
};

/**
 * 자연어 입력을 구조화된 이동 조건으로 변환하는 시연용 AI 파서
 */
function parseNaturalLanguageConditions(rawText, origin, destination) {
  const text = (rawText || "").trim();
  const parsed = {
    rawText: text,
    isAmbiguousOrImpossible: false,
    ambiguityReason: "",
    items: [],
    constraints: {
      walkSpeed: "normal",
      avoidStairs: false,
      maxWalkMinutes: null,
      fewTransfers: false,
      allowedExtraMinutes: null,
      allowBike: false
    }
  };

  if (!text) {
    parsed.items.push({
      category: "기본 탐색",
      value: "별도 조건 없음 (표준 경로)",
      type: "neutral",
      required: false
    });
    return parsed;
  }

  const onlyWalk = /(걸어서만|도보로만|안\s*타고.*걸어서)/.test(text);
  const unrealisticTime = /([1-5]분\s*(안에|이내)|당장\s*도착)/.test(text);
  if (onlyWalk && unrealisticTime) {
    parsed.isAmbiguousOrImpossible = true;
    parsed.ambiguityReason = `${origin}에서 ${destination}까지 대중교통이나 자전거 없이 5분 이내 도보로만 이동할 수 있는 물리적 경로가 없습니다.`;
  }

  if (/(천천히|느리게|다리가?\s*아파|무릎|발목|보행.*느림|걸음.*느려|무리하지)/.test(text)) {
    parsed.constraints.walkSpeed = "slow";
    parsed.items.push({
      category: "보행 속도",
      value: "천천히 걷기 (0.8x 여유 계산)",
      type: "adaptive",
      required: false
    });
  }

  if (/(계단.*(피하|없|제외|싫|힘들|어려)|엘리베이터|경사로|단차|캐리어|무거운\s*짐|유모차)/.test(text)) {
    parsed.constraints.avoidStairs = true;
    parsed.items.push({
      category: "필수 제외",
      value: "계단 0곳 (엘리베이터·저상버스)",
      type: "must",
      required: true
    });
  }

  if (/(오래\s*걷기|덜\s*걷|도보.*짧|걷는\s*게\s*힘들|조금만\s*걸|최소\s*도보|가방|짐)/.test(text)) {
    parsed.constraints.maxWalkMinutes = 10;
    parsed.items.push({
      category: "보행량 제한",
      value: "도보 10분 이내 우선",
      type: "preference",
      required: false
    });
  }

  if (/(환승.*(적게|최소|싫|줄여|없)|갈아타|한\s*번에)/.test(text)) {
    parsed.constraints.fewTransfers = true;
    parsed.items.push({
      category: "환승 선호",
      value: "환승 최소화 (0~1회)",
      type: "preference",
      required: false
    });
  }

  const extraMinMatch = text.match(/(\d+)\s*분\s*(정도\s*)?(더\s*걸려도|늦어도|여유|추가)/);
  if (extraMinMatch) {
    const mins = parseInt(extraMinMatch[1], 10);
    parsed.constraints.allowedExtraMinutes = mins;
    parsed.items.push({
      category: "시간 여유",
      value: `최단 대비 +${mins}분 허용`,
      type: "tolerance",
      required: false
    });
  } else if (/(더\s*걸려도|시간.*걸려도|조금\s*늦어도|편한\s*길)/.test(text)) {
    parsed.constraints.allowedExtraMinutes = 5;
    parsed.items.push({
      category: "시간 여유",
      value: "최단 대비 +5분 허용",
      type: "tolerance",
      required: false
    });
  }

  if (/(자전거|따릉이|라이딩)/.test(text)) {
    parsed.constraints.allowBike = true;
    parsed.items.push({
      category: "수단 확장",
      value: "따릉이 + 지하철 결합",
      type: "mode",
      required: false
    });
  }

  if (parsed.items.length === 0 && !parsed.isAmbiguousOrImpossible) {
    parsed.items.push({
      category: "맞춤 조건 해석",
      value: `"${text.slice(0, 28)}${text.length > 28 ? "..." : ""}" 반영`,
      type: "adaptive",
      required: false
    });
  }

  return parsed;
}
