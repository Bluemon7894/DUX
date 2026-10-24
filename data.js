/**
 * DUX (덕스) — 홍보 웹사이트 설정 및 시연용 데이터
 *
 * ⚠️ 이 파일의 노선·정류장·지연·소요 시간은 모두 앱 경험을 설명하기 위한 시연용 예시입니다.
 *    실제 지도·교통 API와 연결되어 있지 않으며, 장소 이름도 가상의 이름을 사용합니다.
 */

/* 사이트 운영 설정 — 실제 채널이 준비되면 이 값만 채우면 됩니다. */
window.DUX_CONFIG = {
  // 출시 알림·체험 신청을 받을 API 엔드포인트 (POST, JSON {email, intent}). 비어 있으면 아무것도 전송하지 않습니다.
  signupEndpoint: "",
  // 문의 메일 주소. 비어 있으면 문의 링크 대신 "준비 중" 안내를 표시합니다.
  contactEmail: ""
};

window.DUX_DEMO = {
  isDemo: true,

  // 기능 카드 1 — 자연어 입력 예시 문장 (타이핑 애니메이션)
  promptExamples: [
    "오늘 다리가 아파서 천천히 걸을래.",
    "짐이 많아서 계단 없는 길로 가고 싶어.",
    "10분 더 걸려도 환승 적은 길이 좋아.",
    "자전거도 탈 수 있어. 언덕만 피해 줘."
  ],

  // 대표 시나리오 — 단계별 휴대폰 화면 상태
  story: {
    origin: "한빛동 집 앞",
    destination: "새솔 시립도서관",
    beats: [
      { eta: "출발 전", etaTone: "neutral", etaIcon: "chat" },
      { eta: "예상 31분", etaTone: "ok", etaIcon: "clock" },
      { eta: "지연 시 40분", etaTone: "warn", etaIcon: "alert" },
      { eta: "대안 찾는 중", etaTone: "search", etaIcon: "refresh" },
      { eta: "예상 35분 · 계단 0곳", etaTone: "ok", etaIcon: "check" }
    ]
  }
};
