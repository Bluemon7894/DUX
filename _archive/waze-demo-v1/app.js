/**
 * DUX (덕스) — Waze 스타일 브랜드 웹사이트 & 인터랙티브 라이브 맵 컨트롤러
 */

(function () {
  "use strict";

  const state = {
    currentScenarioId: "scenario_knee",
    origin: "강남역 2번 출구",
    destination: "국립중앙박물관",
    promptText:
      "오늘 다리가 아파서 천천히 걸을 거야. 계단은 피하고, 5분 정도 더 걸려도 환승이 적은 길로 가고 싶어.",
    parsedConditions: null,
    activeChips: new Set(["slow_walk", "no_stairs", "few_transfers", "extra_time_ok"]),
    candidates: [],
    selectedRouteId: null,
    delayState: "idle" // "idle" | "active" | "applied" | "kept" | "muted"
  };

  const dom = {
    scenarioButtonsContainer: document.getElementById("scenario-buttons-container"),
    quickChipsContainer: document.getElementById("quick-chips-container"),
    inputOrigin: document.getElementById("input-origin"),
    inputDestination: document.getElementById("input-destination"),
    inputNlPrompt: document.getElementById("input-nl-prompt"),
    parsedConditionsList: document.getElementById("parsed-conditions-list"),
    btnSearchRoutes: document.getElementById("btn-search-routes"),
    btnResetInput: document.getElementById("btn-reset-input"),
    btnSwapLocations: document.getElementById("btn-swap-locations"),
    btnHeroTry: document.getElementById("btn-hero-try"),
    btnHeroReroute: document.getElementById("btn-hero-reroute"),

    ambiguityAlertBox: document.getElementById("ambiguity-alert-box"),
    ambiguityReasonText: document.getElementById("ambiguity-reason-text"),
    btnApplySuggestedFix: document.getElementById("btn-apply-suggested-fix"),

    resultsPanel: document.getElementById("results-panel"),
    resultsRouteSummary: document.getElementById("results-route-summary"),
    routeCandidatesContainer: document.getElementById("route-candidates-container"),

    contextStatusPill: document.getElementById("context-status-pill"),
    triggerBtnEventName: document.getElementById("trigger-btn-event-name"),
    btnTriggerDelay: document.getElementById("btn-trigger-delay"),
    delayMutedView: document.getElementById("delay-muted-view"),
    btnReopenDelay: document.getElementById("btn-reopen-delay"),
    delayAppliedView: document.getElementById("delay-applied-view"),
    appliedRouteTitle: document.getElementById("applied-route-title"),
    appliedRouteDesc: document.getElementById("applied-route-desc"),
    btnRevertDelay: document.getElementById("btn-revert-delay"),

    delayActiveModal: document.getElementById("delay-active-modal"),
    eventBadgeText: document.getElementById("event-badge-text"),
    eventTitleText: document.getElementById("event-title-text"),
    eventDetailText: document.getElementById("event-detail-text"),
    preservedConditionsChips: document.getElementById("preserved-conditions-chips"),
    rerouteAiReason: document.getElementById("reroute-ai-reason"),
    compCurrentTime: document.getElementById("comp-current-time"),
    compCurrentTitle: document.getElementById("comp-current-title"),
    compCurrentSummary: document.getElementById("comp-current-summary"),
    compRerouteTime: document.getElementById("comp-reroute-time"),
    compRerouteTitle: document.getElementById("comp-reroute-title"),
    compRerouteDiff: document.getElementById("comp-reroute-diff"),
    compRerouteChecks: document.getElementById("comp-reroute-checks"),
    btnAcceptReroute: document.getElementById("btn-accept-reroute"),
    btnKeepCurrent: document.getElementById("btn-keep-current"),
    btnDismissReroute: document.getElementById("btn-dismiss-reroute"),

    mapActiveRouteLabel: document.getElementById("map-active-route-label"),
    svgInactiveLayer: document.getElementById("svg-inactive-routes-layer"),
    svgActiveLayer: document.getElementById("svg-active-route-layer"),
    svgBadgesLayer: document.getElementById("svg-badges-layer"),
    svgNodesLayer: document.getElementById("svg-nodes-layer"),
    detailTotalPill: document.getElementById("detail-total-pill"),
    selectedRouteSegments: document.getElementById("selected-route-segments")
  };

  const MODE_META = {
    walk: { icon: "🚶", name: "도보" },
    bus: { icon: "🚌", name: "버스" },
    subway: { icon: "🚇", name: "지하철" },
    bike: { icon: "🚲", name: "따릉이" }
  };

  function init() {
    renderScenarioTabs();
    renderQuickChips();
    syncChipsFromText(state.promptText);
    updateParsedPreview();
    executeRouteSearch(false);
    bindEvents();
  }

  function renderScenarioTabs() {
    dom.scenarioButtonsContainer.innerHTML = "";
    DUX_DATA.sampleScenarios.forEach((sc) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scenario-btn" + (sc.id === state.currentScenarioId ? " active" : "");
      btn.innerHTML = `
        <span class="scenario-btn-badge">${escapeHtml(sc.tag)}</span>
        <span>${escapeHtml(sc.title)}</span>
      `;
      btn.addEventListener("click", () => selectScenarioPreset(sc.id));
      dom.scenarioButtonsContainer.appendChild(btn);
    });
  }

  function renderQuickChips() {
    dom.quickChipsContainer.innerHTML = "";
    DUX_DATA.quickChips.forEach((chip) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const isActive = state.activeChips.has(chip.id);
      btn.className = "quick-chip-btn" + (isActive ? " active" : "");
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      btn.innerHTML = `<span aria-hidden="true">${chip.icon}</span><span>${escapeHtml(chip.label)}</span>`;
      btn.addEventListener("click", () => toggleQuickChip(chip));
      dom.quickChipsContainer.appendChild(btn);
    });
  }

  function syncChipsFromText(text) {
    const parsed = parseNaturalLanguageConditions(text, state.origin, state.destination);
    state.activeChips.clear();
    if (parsed.constraints.walkSpeed === "slow") state.activeChips.add("slow_walk");
    if (parsed.constraints.avoidStairs) state.activeChips.add("no_stairs");
    if (parsed.constraints.maxWalkMinutes !== null) state.activeChips.add("less_walk");
    if (parsed.constraints.fewTransfers) state.activeChips.add("few_transfers");
    if (parsed.constraints.allowedExtraMinutes !== null) state.activeChips.add("extra_time_ok");
    if (parsed.constraints.allowBike) state.activeChips.add("bike_ok");
    renderQuickChips();
  }

  function toggleQuickChip(chip) {
    let text = dom.inputNlPrompt.value.trim();
    if (state.activeChips.has(chip.id)) {
      state.activeChips.delete(chip.id);
      text = text.replace(chip.appendText, "").trim();
    } else {
      state.activeChips.add(chip.id);
      text = text ? `${text} ${chip.appendText}` : chip.appendText;
    }
    dom.inputNlPrompt.value = text;
    state.promptText = text;
    renderQuickChips();
    updateParsedPreview();
  }

  function selectScenarioPreset(scenarioId) {
    const sc = DUX_DATA.sampleScenarios.find((s) => s.id === scenarioId);
    if (!sc) return;

    state.currentScenarioId = sc.id;
    state.origin = sc.origin;
    state.destination = sc.destination;
    state.promptText = sc.prompt;
    state.delayState = "idle";

    dom.inputOrigin.value = sc.origin;
    dom.inputDestination.value = sc.destination;
    dom.inputNlPrompt.value = sc.prompt;

    renderScenarioTabs();
    syncChipsFromText(sc.prompt);
    updateParsedPreview();
    executeRouteSearch(false);
  }

  function updateParsedPreview() {
    state.origin = dom.inputOrigin.value.trim() || "강남역 2번 출구";
    state.destination = dom.inputDestination.value.trim() || "국립중앙박물관";
    state.promptText = dom.inputNlPrompt.value;

    const parsed = parseNaturalLanguageConditions(state.promptText, state.origin, state.destination);
    state.parsedConditions = parsed;

    dom.parsedConditionsList.innerHTML = "";
    parsed.items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "parsed-item-card";
      card.innerHTML = `
        <div class="parsed-item-cat">
          <span>${escapeHtml(item.category)}</span>
          ${item.required ? '<span class="must-tag">필수</span>' : ""}
        </div>
        <div class="parsed-item-val">${escapeHtml(item.value)}</div>
      `;
      dom.parsedConditionsList.appendChild(card);
    });
  }

  function executeRouteSearch(scrollToResults = false) {
    updateParsedPreview();
    const parsed = state.parsedConditions;

    if (parsed.isAmbiguousOrImpossible) {
      dom.ambiguityAlertBox.classList.remove("hidden");
      dom.ambiguityReasonText.textContent = parsed.ambiguityReason;
      dom.resultsPanel.classList.add("hidden");
      return;
    }

    dom.ambiguityAlertBox.classList.add("hidden");
    dom.resultsPanel.classList.remove("hidden");

    const baseKey = DUX_DATA.routesByScenario[state.currentScenarioId]
      ? state.currentScenarioId
      : "scenario_knee";
    const bundle = DUX_DATA.routesByScenario[baseKey];

    const cloned = JSON.parse(JSON.stringify(bundle.candidates));
    if (parsed.constraints.walkSpeed !== "slow") {
      cloned.forEach((r) => {
        if (r.baseSpeedMinutes) r.totalMinutes = r.baseSpeedMinutes;
      });
    }

    state.candidates = cloned;
    state.selectedRouteId = cloned[0].id;
    state.delayState = "idle";

    dom.resultsRouteSummary.textContent = `${state.origin} → ${state.destination}`;

    renderRouteCandidates();
    renderSelectedRouteOnMapAndTimeline();
    renderDelayState(bundle.delayEvent);

    if (scrollToResults) {
      dom.resultsPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function renderRouteCandidates() {
    dom.routeCandidatesContainer.innerHTML = "";

    state.candidates.forEach((route) => {
      const isSelected = route.id === state.selectedRouteId;
      const card = document.createElement("article");
      card.className = `route-card${isSelected ? " selected" : ""}`;
      card.setAttribute("role", "option");
      card.setAttribute("aria-selected", isSelected ? "true" : "false");
      card.tabIndex = 0;

      let badgeClass = "badge-recommended";
      if (route.rankType === "rerouted") badgeClass = "badge-rerouted-card";
      else if (route.rankType === "alternative") badgeClass = "badge-alternative";
      else if (route.rankType === "fastest_warning") badgeClass = "badge-fastest-warn";

      const modeNames = route.modes
        .map((m) => (MODE_META[m] ? `${MODE_META[m].icon} ${MODE_META[m].name}` : m))
        .join(" · ");

      const checksHtml = route.conditionChecks
        .map((c) => {
          const icon = c.status === "pass" ? "✓" : c.status === "warn" ? "△" : "⚠️";
          return `<li>${icon} ${escapeHtml(c.label)}${c.required ? '<span class="req-pill">필수</span>' : ""}</li>`;
        })
        .join("");

      card.innerHTML = `
        <div class="route-card-top">
          <span class="route-rank-badge ${badgeClass}">${escapeHtml(route.badgeText)}</span>
          <div class="route-metrics-primary">
            <span class="route-total-time">${route.totalMinutes}분</span>
            <span class="route-time-diff">${escapeHtml(route.diffFromFastest)}</span>
          </div>
        </div>
        <h4 class="route-card-title">${escapeHtml(route.title)}</h4>
        <div class="route-stats-row">
          <span class="stat-pill">${modeNames}</span>
          <span class="stat-pill">환승 ${route.transferCount}회</span>
          <span class="stat-pill">도보 ${route.walkMinutes}분</span>
        </div>
        <div class="condition-verification-box match-${route.conditionMatch}">
          <div class="verification-summary-title">${escapeHtml(route.conditionMatchSummary)}</div>
          <ul class="verification-checks">${checksHtml}</ul>
        </div>
        <div class="route-ai-explanation">${escapeHtml(route.aiReason)}</div>
      `;

      const selectFn = () => {
        state.selectedRouteId = route.id;
        renderRouteCandidates();
        renderSelectedRouteOnMapAndTimeline();
      };

      card.addEventListener("click", selectFn);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectFn();
        }
      });

      dom.routeCandidatesContainer.appendChild(card);
    });
  }

  function renderSelectedRouteOnMapAndTimeline() {
    const activeRoute =
      state.candidates.find((r) => r.id === state.selectedRouteId) || state.candidates[0];
    if (!activeRoute) return;

    dom.mapActiveRouteLabel.textContent = `${activeRoute.title} (${activeRoute.totalMinutes}분)`;
    dom.detailTotalPill.textContent = `총 ${activeRoute.totalMinutes}분 · 환승 ${activeRoute.transferCount}회 · 도보 ${activeRoute.walkMinutes}분`;

    dom.svgInactiveLayer.innerHTML = "";
    dom.svgActiveLayer.innerHTML = "";
    dom.svgBadgesLayer.innerHTML = "";
    dom.svgNodesLayer.innerHTML = "";

    // 비활성 후보 경로
    state.candidates.forEach((cand) => {
      if (cand.id === activeRoute.id || !cand.mapGeometry) return;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", cand.mapGeometry.pathD);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#94A3B8");
      path.setAttribute("stroke-width", "5");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("opacity", "0.55");
      if (cand.mapGeometry.strokeDash && cand.mapGeometry.strokeDash !== "none") {
        path.setAttribute("stroke-dasharray", cand.mapGeometry.strokeDash);
      }
      dom.svgInactiveLayer.appendChild(path);
    });

    if (activeRoute.mapGeometry) {
      const geo = activeRoute.mapGeometry;

      // Waze 스타일 두꺼운 블랙 아웃라인 + 비비드 내부 경로선
      const borderPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      borderPath.setAttribute("d", geo.pathD);
      borderPath.setAttribute("fill", "none");
      borderPath.setAttribute("stroke", "#111315");
      borderPath.setAttribute("stroke-width", "14");
      borderPath.setAttribute("stroke-linecap", "round");
      dom.svgActiveLayer.appendChild(borderPath);

      const mainPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      mainPath.setAttribute("d", geo.pathD);
      mainPath.setAttribute("fill", "none");
      mainPath.setAttribute("stroke", geo.color || "#33CCFF");
      mainPath.setAttribute("stroke-width", "8");
      mainPath.setAttribute("stroke-linecap", "round");
      if (geo.strokeDash && geo.strokeDash !== "none") {
        mainPath.setAttribute("stroke-dasharray", geo.strokeDash);
      }
      dom.svgActiveLayer.appendChild(mainPath);

      (geo.modeBadges || []).forEach((b) => {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const width = Math.max(106, b.text.length * 9.5 + 34);
        g.innerHTML = `
          <rect x="${b.x - width / 2}" y="${b.y - 15}" width="${width}" height="28" rx="14" fill="#111315" />
          <text x="${b.x}" y="${b.y + 4}" fill="#FFFFFF" font-size="11.5" font-weight="800" text-anchor="middle">
            ${b.icon} ${escapeHtml(b.text)}
          </text>
        `;
        dom.svgBadgesLayer.appendChild(g);
      });

      (geo.nodes || []).forEach((node) => {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("filter", "url(#card-shadow)");

        let dotColor = "#33CCFF";
        if (node.type === "end") dotColor = "#00E599";
        if (node.type === "warning") dotColor = "#FF5C35";

        const labelY = node.y > 265 ? node.y + 28 : node.y - 30;
        const subY = labelY + 15;

        g.innerHTML = `
          <circle cx="${node.x}" cy="${node.y}" r="10" fill="${dotColor}" stroke="#111315" stroke-width="4" />
          <rect x="${node.x - 72}" y="${labelY - 14}" width="144" height="36" rx="10" fill="#FFFFFF" stroke="#111315" stroke-width="2" />
          <text x="${node.x}" y="${labelY}" fill="#111315" font-size="11.5" font-weight="900" text-anchor="middle">${escapeHtml(node.label)}</text>
          <text x="${node.x}" y="${subY}" fill="#0077A8" font-size="10.2" font-weight="800" text-anchor="middle">${escapeHtml(node.sub)}</text>
        `;
        dom.svgNodesLayer.appendChild(g);
      });
    }

    // 하단 구간별 타임라인 카드
    dom.selectedRouteSegments.innerHTML = "";
    (activeRoute.segments || []).forEach((seg) => {
      const meta = MODE_META[seg.mode] || { icon: "•", name: "이동" };
      const li = document.createElement("li");
      li.className = "segment-item";
      li.innerHTML = `
        <div class="segment-top">
          <span>${meta.icon} ${escapeHtml(seg.label)}</span>
          ${seg.badge ? `<span class="segment-badge">${escapeHtml(seg.badge)}</span>` : ""}
        </div>
        <div class="segment-detail">${escapeHtml(seg.detail)}</div>
      `;
      dom.selectedRouteSegments.appendChild(li);
    });
  }

  function renderDelayState(delayEvent) {
    if (!delayEvent) return;

    dom.triggerBtnEventName.textContent = delayEvent.eventTitle;
    dom.delayActiveModal.classList.add("hidden");
    dom.delayMutedView.classList.add("hidden");
    dom.delayAppliedView.classList.add("hidden");

    if (state.delayState === "idle") {
      dom.contextStatusPill.textContent = "정상 안내 중";
    } else if (state.delayState === "active") {
      dom.delayActiveModal.classList.remove("hidden");
      dom.contextStatusPill.textContent = "⚠️ 상황 변화 · 재추천 비교 중";
      populateDelayModal(delayEvent);
    } else if (state.delayState === "muted") {
      dom.delayMutedView.classList.remove("hidden");
      dom.contextStatusPill.textContent = "🔕 동일 알림 음소거됨";
    } else if (state.delayState === "applied") {
      dom.delayAppliedView.classList.remove("hidden");
      dom.contextStatusPill.textContent = "✅ 재추천 대안 안내 중";
      dom.appliedRouteTitle.textContent = `✅ 대안 적용됨: ${delayEvent.reroutedCandidate.title}`;
      dom.appliedRouteDesc.textContent = delayEvent.reroutedCandidate.aiReason;
    } else if (state.delayState === "kept") {
      dom.delayAppliedView.classList.remove("hidden");
      dom.contextStatusPill.textContent = "현재 경로 유지 중";
      dom.appliedRouteTitle.textContent = "현재 경로를 그대로 유지합니다";
      dom.appliedRouteDesc.textContent = "추가 지연이 커질 때만 다시 안내합니다.";
    }
  }

  function populateDelayModal(delayEvent) {
    dom.eventBadgeText.textContent = delayEvent.eventBadge;
    dom.eventTitleText.textContent = delayEvent.eventTitle;
    dom.eventDetailText.textContent = delayEvent.eventDetail;

    dom.preservedConditionsChips.innerHTML = delayEvent.preservedConditions
      .map((c) => `<span class="preserved-chip">${escapeHtml(c)}</span>`)
      .join("");

    const reroute = delayEvent.reroutedCandidate;
    dom.rerouteAiReason.textContent = reroute.aiReason;

    dom.compCurrentTime.textContent = `${delayEvent.currentDelayedRoute.newTotalMinutes}분 (${delayEvent.currentDelayedRoute.delayAdded})`;
    dom.compCurrentTitle.textContent = delayEvent.currentDelayedRoute.title;
    dom.compCurrentSummary.textContent = delayEvent.currentDelayedRoute.summary;

    dom.compRerouteTime.textContent = `${reroute.totalMinutes}분`;
    dom.compRerouteTitle.textContent = reroute.title;
    dom.compRerouteDiff.textContent = reroute.diffFromFastest;

    dom.compRerouteChecks.innerHTML = reroute.conditionChecks
      .map((c) => `<li>✓ ${escapeHtml(c.label)}</li>`)
      .join("");
  }

  function triggerDelayEvent() {
    if (state.currentScenarioId === "scenario_ambiguous") {
      selectScenarioPreset("scenario_knee");
    }

    const baseKey = DUX_DATA.routesByScenario[state.currentScenarioId]
      ? state.currentScenarioId
      : "scenario_knee";
    const delayEvent = DUX_DATA.routesByScenario[baseKey].delayEvent;
    if (!delayEvent) return;

    state.delayState = "active";
    renderDelayState(delayEvent);

    const reroutedCopy = JSON.parse(JSON.stringify(delayEvent.reroutedCandidate));
    if (!state.candidates.some((c) => c.id === reroutedCopy.id)) {
      state.candidates.unshift(reroutedCopy);
    }
    state.selectedRouteId = reroutedCopy.id;
    renderRouteCandidates();
    renderSelectedRouteOnMapAndTimeline();
  }

  function acceptReroutedPath() {
    const baseKey = DUX_DATA.routesByScenario[state.currentScenarioId]
      ? state.currentScenarioId
      : "scenario_knee";
    const delayEvent = DUX_DATA.routesByScenario[baseKey].delayEvent;
    if (!delayEvent) return;

    state.delayState = "applied";
    state.selectedRouteId = delayEvent.reroutedCandidate.id;
    renderDelayState(delayEvent);
    renderRouteCandidates();
    renderSelectedRouteOnMapAndTimeline();
  }

  function keepCurrentPath() {
    const baseKey = DUX_DATA.routesByScenario[state.currentScenarioId]
      ? state.currentScenarioId
      : "scenario_knee";
    const delayEvent = DUX_DATA.routesByScenario[baseKey].delayEvent;
    if (!delayEvent) return;

    state.candidates = state.candidates.filter((c) => c.id !== delayEvent.reroutedCandidate.id);
    if (state.candidates.length > 0) state.selectedRouteId = state.candidates[0].id;

    state.delayState = "kept";
    renderDelayState(delayEvent);
    renderRouteCandidates();
    renderSelectedRouteOnMapAndTimeline();
  }

  function dismissDelayAlert() {
    const baseKey = DUX_DATA.routesByScenario[state.currentScenarioId]
      ? state.currentScenarioId
      : "scenario_knee";
    const delayEvent = DUX_DATA.routesByScenario[baseKey].delayEvent;
    if (!delayEvent) return;

    state.candidates = state.candidates.filter((c) => c.id !== delayEvent.reroutedCandidate.id);
    if (state.candidates.length > 0) state.selectedRouteId = state.candidates[0].id;

    state.delayState = "muted";
    renderDelayState(delayEvent);
    renderRouteCandidates();
    renderSelectedRouteOnMapAndTimeline();
  }

  function bindEvents() {
    dom.inputNlPrompt.addEventListener("input", () => {
      syncChipsFromText(dom.inputNlPrompt.value);
      updateParsedPreview();
    });

    dom.inputOrigin.addEventListener("input", updateParsedPreview);
    dom.inputDestination.addEventListener("input", updateParsedPreview);

    dom.btnSwapLocations.addEventListener("click", () => {
      const tmp = dom.inputOrigin.value;
      dom.inputOrigin.value = dom.inputDestination.value;
      dom.inputDestination.value = tmp;
      updateParsedPreview();
      executeRouteSearch(false);
    });

    dom.btnSearchRoutes.addEventListener("click", () => executeRouteSearch(true));
    dom.btnResetInput.addEventListener("click", () => selectScenarioPreset("scenario_knee"));
    dom.btnApplySuggestedFix.addEventListener("click", () => selectScenarioPreset("scenario_knee"));

    dom.btnHeroTry.addEventListener("click", () => {
      document.getElementById("live-demo").scrollIntoView({ behavior: "smooth" });
      dom.inputNlPrompt.focus();
    });

    dom.btnHeroReroute.addEventListener("click", () => {
      document.getElementById("live-demo").scrollIntoView({ behavior: "smooth" });
      triggerDelayEvent();
    });

    dom.btnTriggerDelay.addEventListener("click", triggerDelayEvent);
    dom.btnAcceptReroute.addEventListener("click", acceptReroutedPath);
    dom.btnKeepCurrent.addEventListener("click", keepCurrentPath);
    dom.btnDismissReroute.addEventListener("click", dismissDelayAlert);
    dom.btnReopenDelay.addEventListener("click", triggerDelayEvent);
    dom.btnRevertDelay.addEventListener("click", () => executeRouteSearch(false));
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
