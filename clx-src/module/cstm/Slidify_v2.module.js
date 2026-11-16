/************************************************
 * Slidify.module.js
 * eXBuilder6 CPR 컨트롤 기반 슬라이더 (swiper.js 로직)
 *
 * - DOM API 미사용. 모든 처리는 cpr.controls 컨트롤 API로 수행한다.
 *   (드래그 추적용 window 포인터 이벤트만 사용 — 참조 모듈과 동일)
 * - 이동은 네이티브 스크롤(innerContainer.scrollTo/adjustScroll)로 처리한다(참조 모듈과 동일).
 *   → 콘텐츠 페인 전체가 렌더되어 이동 중 백지가 없다. loop 은 reorderChild + adjustScroll 로 회전.
 * - ES5 / IE11 호환.
 *
 * 진입점:  var slider = init(target, options);
 *   target  : 컨트롤 객체  |  컨트롤 ID(문자열, appInstance.lookup)  |  컨트롤 스타일 클래스(문자열)
 *   options : 단일 옵션 객체. 문자열 target 일 때 options.appInstance 필수.
 *             ('app' 은 eXBuilder6 예약어이므로 옵션 키로 쓰지 않는다)
 *
 * [옵션 구조 — 중첩 네임스페이스]
 *   기능별로 옵션을 묶는다. 기존 평면 키(showNavigation, gridRows 등)도 하위호환으로 계속 동작한다.
 *     navigation : { enabled, prevButton, nextButton, buttonWidth, buttonHeight, edgeBehavior,
 *                    className, prevLabel, nextLabel, prevTooltip, nextTooltip }
 *     pagination : { enabled, container, clickable, position, offset }
 *     autoplay   : { delay, playButton, stopButton, playLabel, stopLabel, playTooltip, stopTooltip }
 *     grid       : { rows }
 *   그 외(공통): direction, slidesPerView, slidesPerGroup, spaceBetween, centeredSlides, initialSlide,
 *                speed, snapDuration, loop, threshold, longSwipesRatio, allowTouchMove,
 *                autoHeight, shadowPadding, breakpoints, on
 *
 * [접근성] 자동 생성 버튼에는 fieldLabel(aria-label)·tooltip(title)이 기본 부여되며 옵션으로 변경 가능하다.
 *          키보드 조작(Enter/Space/Click)은 eXBuilder6 Button 컨트롤이 자체 지원하므로 별도 처리하지 않는다.
 ************************************************/

/**
 * 이벤트 전파/기본동작 방지
 * @param {Event} e
 */
function eventStopper(e) {
	e.stopPropagation();
	e.preventDefault();
}

/**
 * 컨트롤 트리에서 스타일 클래스로 컨트롤을 탐색 (DOM 미사용).
 * @param {cpr.controls.UIControl} root
 * @param {String} cls
 * @return {cpr.controls.UIControl}
 */
function findControlByStyleClass(root, cls) {
	if (!root) {
		return null;
	}
	if (root.style && typeof root.style.hasClass === "function" && root.style.hasClass(cls)) {
		return root;
	}
	if (typeof root.getChildren === "function") {
		var children = root.getChildren();
		for (var i = 0; i < children.length; i++) {
			var found = findControlByStyleClass(children[i], cls);
			if (found) {
				return found;
			}
		}
	}
	return null;
}

/**
 * @class Slidify
 * @param {cpr.controls.Container|String} target 컨트롤 / 컨트롤 ID / 컨트롤 스타일 클래스
 * @param {Object} options
 */
function Slidify(target, options) {
	this._resolveContainer(target, options);
	/** @type cpr.controls.layouts.FlowLayout */
	this._layout = this._container.getLayout();
	this._applyOptions(options);
	this._bindHandlers();
}

/* =========================================================
 * 옵션 (prototype 기본값) — options 객체로 일괄 override 가능
 * ======================================================= */
/** 슬라이드 방향: "horizontal" | "vertical" */
Slidify.prototype.direction = "horizontal";
/** 한 화면에 표시할 슬라이드 수. 숫자 또는 "auto" */
Slidify.prototype.slidesPerView = 1;
/** 한 번 이동 시 넘길 슬라이드 수 */
Slidify.prototype.slidesPerGroup = 1;
/**
 * 그리드 행 수. 1 이면 단일 행(기본). 2 이상이면 카드를 이 수만큼 교차축으로 쌓은 "열"로 묶어
 * 각 열을 슬라이드로 취급한다(swiper 의 grid.rows 유사). 스냅/네비/페이지네이션은 열 기준.
 * 예) 카드 4개 + gridRows:2 + slidesPerView:2 → 2×2. 모바일은 breakpoints 에서 gridRows:1 로 한 줄 전환.
 */
Slidify.prototype.gridRows = 1;
/**
 * 슬라이드 간격(px). Number → 가로·세로 동일. 배열 [가로, 세로] → 각각 지정.
 * 주축(스크롤축=열 사이 간격)은 가로(가로슬라이더 기준), 교차축(그리드 행 사이 간격)은 세로.
 * 예) gridRows:2 에서 열 사이 20 / 행 사이 16 → spaceBetween: [20, 16]. 0 이면 컨테이너 레이아웃 간격 사용.
 */
Slidify.prototype.spaceBetween = 0;
/** 활성 슬라이드 가운데 정렬 */
Slidify.prototype.centeredSlides = false;
/**
 * 그림자 여백. box-shadow 가 클립되지 않도록 슬라이드를 교차축(가로슬라이더=세로)으로 이 값만큼
 * 줄이고 가운데 정렬해 클리핑 컨테이너 안에서 그림자 공간을 확보한다(가로 스크롤 없이).
 * 값: Number(전 방향 동일) 또는 CSS 배열 [v,h] / [t,h,b] / [t,r,b,l].
 *   - 교차축(가로슬라이더=상하 top/bottom): 슬라이드 교차 크기(높이)를 (start+end) 줄이고 여백 큰 쪽으로 정렬.
 *   - 주축(가로슬라이더=좌우 left/right): 슬라이드 폭 계산에서 (left+right) 를 추가로 빼 스크롤 끝쪽에 그림자 공간 확보.
 *   상하가 다르면 정렬로 처리(한 쪽 0 이면 정확). 예) box-shadow 0 6px 14px → [8,0,20] 또는 [0,14,20,14].
 */
Slidify.prototype.shadowPadding = 0;
/**
 * 교차축 높이를 콘텐츠에 맞춘다(가로 슬라이더=높이). true 면 렌더 후 모든 카드의 콘텐츠 높이를 측정해
 * 가장 큰 카드 높이로 통일(stretch) → 래퍼(그룹)는 그 최댓값으로 정해지고 나머지 카드도 그 높이로 늘어난다(잘림 없음).
 * grid 면 카드가 통일되어 열 높이도 자동으로 균일해진다(열 기준 통일). 슬라이더 그룹 높이는 화면에서 auto 여야 한다.
 * init·breakpoint 재빌드 시 재측정(같은 breakpoint 내 폭 변화는 재측정 안 함). shadowPadding 교차축은 트랙 패딩으로 별도 가산.
 */
Slidify.prototype.autoHeight = false;
/** 시작 슬라이드 인덱스(0-base) */
Slidify.prototype.initialSlide = 0;
/** 이동 애니메이션 길이(초) */
Slidify.prototype.speed = 0.4;
/** 드래그 후 스냅 애니메이션 길이(초) */
Slidify.prototype.snapDuration = 0.3;
/** 무한 루프 */
Slidify.prototype.loop = false;
/** 자동재생 간격(초). 0 이면 사용 안 함 */
Slidify.prototype.autoPlayDelay = 0;
/** 드래그 허용 */
Slidify.prototype.allowTouchMove = true;
/**
 * 스와이프 인정 임계 이동량(px). 드래그 총 이동량이 이 값 미만이면 "탭"으로 보고 위치를 되돌린다.
 * (카드 안의 버튼/링크 클릭이 미세 흔들림으로 슬라이드가 밀리는 것을 방지)
 */
Slidify.prototype.threshold = 5;
/**
 * 한 슬라이드 대비 이 비율 이상 끌면 손을 떼는 순간 다음(또는 이전) 그룹으로 넘긴다(0~1).
 * 미만이면 원래 스냅으로 되돌린다. 예) 0.5 → 절반 이상 끌면 이동. 낮출수록 조금만 끌어도 넘어간다.
 */
Slidify.prototype.longSwipesRatio = 0.5;
/** 페이지네이션 표시 */
Slidify.prototype.showPagination = true;
/** 페이지네이션 버튼 클릭 이동 */
Slidify.prototype.paginationClickable = true;
/**
 * 자동 페이지네이션 위치: "overlay"(슬라이더 영역 안쪽 하단에 겹침) | "below"(영역이 끝난 다음 아래).
 * "below" 는 슬라이더 아래에 공간이 있어야 한다.
 */
Slidify.prototype.paginationPosition = "overlay";
/**
 * 페이지네이션 세로 미세 조정(px). "below"면 영역 끝에서 이만큼 더 아래, "overlay"면 하단에서 이만큼 위.
 * 기본 0 = 영역 끝에 딱 붙음. (floatControl 이 위치를 인라인으로 잡으므로 CSS 대신 옵션으로 조정)
 */
Slidify.prototype.paginationOffset = 0;
/**
 * [PSE 확장] 페이지네이션 불릿 가로 정렬: "center"(기본) | "left" | "right"
 */
Slidify.prototype.paginationAlign = "center";
/**
 * [PSE 확장] 페이지네이션 불릿 영역의 좌측 여백(px). paginationAlign:"left" 일 때 슬라이더 좌측에서 떨어질 거리.
 */
Slidify.prototype.paginationLeft = 0;
/**
 * [PSE 확장] 페이지네이션 영역 높이(px). 지정하면 영역 높이를 이 값으로 고정하고,
 * "overlay" 에서 paginationOffset 이 "슬라이더 하단에서 불릿 아래끝까지의 거리" 가 된다. null 이면 기존 동작(auto, 20px 가정).
 */
Slidify.prototype.paginationHeight = null;
/**
 * [PSE 확장] 페이지네이션 불릿 크기(px, 정사각형). 지정하면 불릿 레이아웃 슬롯의 width/height 를 이 값으로 고정한다.
 * (CSS 만으로 줄이면 플로우 레이아웃 슬롯이 기본 폭으로 남아 불릿 간격이 spacing 보다 넓어진다.) null 이면 기존 동작.
 */
Slidify.prototype.paginationBulletSize = null;
/**
 * [PSE 확장] 페이지네이션 불릿 사이 간격(px). 기본 8.
 */
Slidify.prototype.paginationSpacing = 8;
/** 좌우 네비게이션 버튼 표시 */
Slidify.prototype.showNavigation = true;
/** 네비게이션 버튼 너비(px) */
Slidify.prototype.navigationButtonWidth = 30;
/** 네비게이션 버튼 높이(px). null 이면 슬라이더 높이(100%). 정사각형은 width 와 같은 값 지정 */
Slidify.prototype.navigationButtonHeight = null;
/**
 * 처음/끝에서 버튼 처리: "disable"(비활성 유지) | "hide"(숨김). loop 이면 항상 활성.
 * 스크롤 불가(콘텐츠가 뷰포트보다 작음)일 때도 이 방식으로 양쪽 버튼을 처리한다.
 */
Slidify.prototype.navigationEdgeBehavior = "disable";
/** 네비게이션 버튼 추가 클래스 */
Slidify.prototype.navigationButtonClassName = null;
/* 접근성: 자동 생성 네비 버튼의 aria-label(fieldLabel) — 옵션으로 변경 가능 */
Slidify.prototype.navigationPrevLabel = "이전 슬라이드";
Slidify.prototype.navigationNextLabel = "다음 슬라이드";
/* 접근성: 자동 생성 네비 버튼의 title(tooltip). null 이면 label 을 그대로 사용 */
Slidify.prototype.navigationPrevTooltip = null;
Slidify.prototype.navigationNextTooltip = null;
/** 외부 이전 버튼 — 컨트롤 / ID / 클래스 (지정 시 자동생성 안 함) */
Slidify.prototype.prevButton = null;
/** 외부 다음 버튼 — 컨트롤 / ID / 클래스 */
Slidify.prototype.nextButton = null;
/**
 * 외부 페이지네이션 컨테이너 — 컨트롤 / ID / 클래스.
 * - 일반 Container: 내부에 불릿 버튼을 자동 생성(가운데 정렬 FlowLayout 자동 적용).
 * - PageIndexer 컨트롤(cpr.controls.PageIndexer): 불릿 대신 컨트롤 API로 구동
 *   (스냅 1개 = 1페이지, selection-change → 해당 스냅 이동, 슬라이드 변경 시 currentPageIndex 동기화).
 */
Slidify.prototype.paginationContainer = null;
/**
 * 자동재생 재생/정지 버튼 — 컨트롤 / ID / 클래스. autoPlayDelay > 0 일 때만 연결된다.
 * autoPlayToggleButton(재생, 예: .swiper-button-play) 클릭 → 재생,
 * autoStopToggleButton(정지, 예: .swiper-button-stop) 클릭 → 정지.
 * 한 쪽이 활성이면 다른 쪽은 visible=false (재생 중=정지 버튼만 노출, 정지 상태=재생 버튼만 노출).
 * playButton/pauseButton 은 같은 역할의 별칭(하위호환).
 */
Slidify.prototype.autoPlayToggleButton = null;   // 재생 버튼(정식 키. 별칭: autoplay.playButton / playButton)
Slidify.prototype.autoStopToggleButton = null;   // 정지 버튼(정식 키. 별칭: autoplay.stopButton / pauseButton)
/* 접근성: 자동재생 버튼이 자동 생성일 때의 aria-label / title */
Slidify.prototype.autoPlayPlayLabel = "재생";
Slidify.prototype.autoPlayStopLabel = "정지";
Slidify.prototype.autoPlayPlayTooltip = null;
Slidify.prototype.autoPlayStopTooltip = null;
/** 이벤트 핸들러 맵 { eventName: fn } */
Slidify.prototype.on = null;
/**
 * 반응형 브레이크포인트 (desktop-first = max-width 기준)
 * base 옵션은 가장 큰 화면(PC) 기준이고, 키는 "그 폭 이하일 때" 적용된다.
 * 예) { 1024: { slidesPerView: 1 }, 768: { spaceBetween: 8 } }
 *     → 폭 > 1024: base / 768 < 폭 ≤ 1024: {slidesPerView:1} / 폭 ≤ 768: {slidesPerView:1, spaceBetween:8}
 * 오버라이드 가능 키: slidesPerView / slidesPerGroup / spaceBetween / centeredSlides / direction
 */
Slidify.prototype.breakpoints = null;

/* 내부 상태 */
/** @type cpr.controls.Container */
Slidify.prototype._innerContainer = null;
/** @type cpr.controls.layouts.FlowLayout */
Slidify.prototype._innerLayout = null;
/** @type cpr.controls.UIControl[] */
Slidify.prototype._originalChildren = [];
Slidify.prototype._slideControls = null;
Slidify.prototype._size = 0;
Slidify.prototype._spacing = 0;
/** 교차축(그리드 행 사이) 간격 */
Slidify.prototype._crossSpacing = 0;
Slidify.prototype._slidesSize = null;
Slidify.prototype._activeIndex = 0;
Slidify.prototype._snapIndex = 0;
Slidify.prototype._knownPos = -1;
/** 드래그/합성이동 시작 시점의 스크롤 위치 */
Slidify.prototype._dragStartScroll = 0;
/** @type cpr.animation.Animator */
Slidify.prototype._activeAnimator = null;
Slidify.prototype._autoPlayTimerID = -1;
/** @type cpr.controls.Button */
Slidify.prototype._prevButton = null;
/** @type cpr.controls.Button */
Slidify.prototype._nextButton = null;
/** @type cpr.controls.UIControl 자동재생 재생/정지 버튼(상호 배타 visible) */
Slidify.prototype._playButton = null;
Slidify.prototype._stopButton = null;
/** @type SlidifyPagination */
Slidify.prototype._pagination = null;
Slidify.prototype._listeners = null;
/** breakpoint 로 오버라이드되기 전의 기준 옵션 스냅샷 */
Slidify.prototype._baseParams = null;
/** 현재 적용 중인 breakpoint 키(없으면 null) */
Slidify.prototype._currentBreakpoint = undefined;
/** loop 회전 보정으로 슬라이드가 원본 순서에서 얼마나 앞당겨졌는지(realIndex 계산용) */
Slidify.prototype._loopShift = 0;
/** 교차축 카드 크기가 "auto"(측정 통일 대상)인지 여부. _resolveCrossSizing 이 매 빌드마다 설정 */
Slidify.prototype._autoCross = false;
/** 드래그 시작 시점의 스냅 인덱스(longSwipesRatio 판정 기준) */
Slidify.prototype._dragStartSnap = 0;

/* =========================================================
 * target / 옵션 / 바인딩
 * ======================================================= */
/**
 * target 을 컨테이너 컨트롤로 해석한다. (DOM 미사용)
 * @param {cpr.controls.Container|String} target
 * @param {Object} options
 */
Slidify.prototype._resolveContainer = function(target, options) {
	options = options || {};
	var container = null;
	var app = options.appInstance || null;

	if (target && typeof target.getChildren === "function") {
		// 1) 컨트롤 객체
		container = target;
		if (!app && typeof target.getAppInstance === "function") {
			app = target.getAppInstance();
		}
	} else if (typeof target === "string") {
		if (!app) {
			throw new Error("[slidify] 문자열 target(ID/클래스)에는 options.appInstance 가 필요합니다.");
		}
		// 2) 컨트롤 ID
		var byId = app.lookup(target);
		if (byId && typeof byId.getChildren === "function") {
			container = byId;
		} else {
			// 3) 컨트롤 스타일 클래스
			container = findControlByStyleClass(app.getContainer(), target);
		}
	}

	if (!container) {
		throw new Error("[slidify] target 컨트롤을 찾지 못했습니다: " + target);
	}
	this._container = container;
	this._appInstance = app;
};

/**
 * options 객체를 인스턴스 속성에 머지한다.
 * 중첩 네임스페이스(navigation/pagination/autoplay/grid)와 별칭을 내부 평면 속성으로 정규화한 뒤 적용한다.
 * @param {Object} options
 */
Slidify.prototype._applyOptions = function(options) {
	this._listeners = {};
	if (!options) {
		return;
	}
	var flat = this._flattenOptions(options);
	var self = this;
	Object.keys(flat).forEach(function(key) {
		if (key === "appInstance") {
			return;
		}
		if (key === "on" && flat.on) {
			Object.keys(flat.on).forEach(function(evt) {
				self.addEventListener(evt, flat.on[evt]);
			});
			return;
		}
		if (key in self) {
			self[key] = flat[key];
		}
	});
};

/**
 * 중첩 네임스페이스(navigation/pagination/autoplay/grid)와 별칭을 내부 평면 옵션 키로 변환한다.
 * 기존 평면 키가 직접 들어오면 그대로 통과한다(하위호환). 같은 값은 중첩 > 평면 순으로 우선한다.
 * @param {Object} options
 * @return {Object} 평면화된 옵션
 */
Slidify.prototype._flattenOptions = function(options) {
	var flat = {};
	var k;
	// 0) 평면 키 먼저 복사(하위호환). 중첩이 나중에 덮어써 우선권을 갖는다.
	for (k in options) {
		if (options.hasOwnProperty(k)) { flat[k] = options[k]; }
	}
	// 1) 별칭 통일: playButton/pauseButton → autoPlayToggleButton/autoStopToggleButton
	if (options.playButton != null && flat.autoPlayToggleButton == null) { flat.autoPlayToggleButton = options.playButton; }
	if (options.pauseButton != null && flat.autoStopToggleButton == null) { flat.autoStopToggleButton = options.pauseButton; }
	delete flat.playButton;
	delete flat.pauseButton;
	// 2) 중첩 네임스페이스 → 평면 키 매핑
	var map = {
		navigation: {
			enabled: "showNavigation", prevButton: "prevButton", nextButton: "nextButton",
			buttonWidth: "navigationButtonWidth", buttonHeight: "navigationButtonHeight",
			edgeBehavior: "navigationEdgeBehavior", className: "navigationButtonClassName",
			prevLabel: "navigationPrevLabel", nextLabel: "navigationNextLabel",
			prevTooltip: "navigationPrevTooltip", nextTooltip: "navigationNextTooltip"
		},
		pagination: {
			enabled: "showPagination", container: "paginationContainer", clickable: "paginationClickable",
			position: "paginationPosition", offset: "paginationOffset"
		},
		autoplay: {
			delay: "autoPlayDelay", playButton: "autoPlayToggleButton", stopButton: "autoStopToggleButton",
			playLabel: "autoPlayPlayLabel", stopLabel: "autoPlayStopLabel",
			playTooltip: "autoPlayPlayTooltip", stopTooltip: "autoPlayStopTooltip"
		},
		grid: { rows: "gridRows" }
	};
	var groups = Object.keys(map);
	for (var g = 0; g < groups.length; g++) {
		var ns = groups[g];
		var sub = options[ns];
		if (!sub || typeof sub !== "object") { continue; }
		var keys = map[ns];
		for (var subKey in keys) {
			if (keys.hasOwnProperty(subKey) && sub.hasOwnProperty(subKey)) {
				flat[keys[subKey]] = sub[subKey];   // 중첩이 평면보다 우선
			}
		}
		delete flat[ns];   // 네임스페이스 자체는 내부 속성이 아니므로 제거
	}
	return flat;
};

Slidify.prototype._bindHandlers = function() {
	this._onMouseDown = this._onMouseDown.bind(this);
	this._onMouseMove = this._onMouseMove.bind(this);
	this._onMouseUp = this._onMouseUp.bind(this);
	this._onTouchStart = this._onTouchStart.bind(this);
	this._onTouchMove = this._onTouchMove.bind(this);
	this._onTouchEnd = this._onTouchEnd.bind(this);
	this._onResize = this._onResize.bind(this);
	// 브라우저 window resize 도 직접 구독한다(디바운스). eXBuilder6 화면이 고정 크기라
	// SystemTopics.RESIZE 가 실시간 창 리사이즈에 안 뜨는 경우가 있어 breakpoint 전환이 새로고침
	// 시에만 반영되는 문제를 막는다. breakpoint 는 window.innerWidth 기준이므로 window 이벤트가 정확.
	// maxWait: 연속 드래그 리사이즈 중에도 주기적으로 실행되어 경계 전환이 "멈춘 뒤"가 아니라
	// 드래그 도중에 반영되도록 한다(멈춤 후 trailing 만 있으면 시간차가 크게 느껴짐).
	this._onWindowResize = _.debounce(this._onResize, 80, { maxWait: 160 });
	this._updateActivePageButton = _.debounce(this._updateActivePageButton.bind(this), 50);
};

Slidify.prototype._isHorizontal = function() {
	return this.direction !== "vertical";
};

/**
 * shadowPadding(Number 또는 CSS 배열)을 {top,right,bottom,left}(px) 로 파싱.
 * Number → 전 방향 동일 / [v,h] / [t,h,b] / [t,r,b,l] (CSS 단축 규칙).
 * @return {{top:Number, right:Number, bottom:Number, left:Number}}
 */
Slidify.prototype._shadowSides = function() {
	var sp = this.shadowPadding;
	var zero = { top: 0, right: 0, bottom: 0, left: 0 };
	if (sp == null) { return zero; }
	function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
	var t, r, b, l;
	if (typeof sp === "number") {
		t = r = b = l = sp;
	} else if (Object.prototype.toString.call(sp) === "[object Array]") {
		if (sp.length === 1) { t = r = b = l = num(sp[0]); }
		else if (sp.length === 2) { t = b = num(sp[0]); r = l = num(sp[1]); }
		else if (sp.length === 3) { t = num(sp[0]); r = l = num(sp[1]); b = num(sp[2]); }
		else { t = num(sp[0]); r = num(sp[1]); b = num(sp[2]); l = num(sp[3]); }
	} else {
		return zero;
	}
	return { top: t, right: r, bottom: b, left: l };
};

/**
 * 교차축 시작/끝 여백. 가로 슬라이더=세로(start=top, end=bottom), 세로=좌우(start=left, end=right).
 * 슬라이드 교차 크기(가로슬라이더=높이)에서 (start+end) 만큼 뺀다.
 * @return {{start:Number, end:Number}}
 */
Slidify.prototype._crossShadowPads = function() {
	var s = this._shadowSides();
	return this._isHorizontal() ? { start: s.top, end: s.bottom } : { start: s.left, end: s.right };
};

/**
 * 주축(스크롤축) 여백 합. 가로 슬라이더=좌우(left+right), 세로=상하(top+bottom).
 * slidesPerView 로 산출하는 슬라이드 주축 크기(가로=width)에서 이만큼 더 빼, 스크롤 끝쪽에 그림자 공간을 남긴다.
 * @return {Number}
 */
Slidify.prototype._mainShadowTotal = function() {
	var s = this._shadowSides();
	return this._isHorizontal() ? (s.left + s.right) : (s.top + s.bottom);
};

/**
 * 교차축(가로슬라이더=높이) 사이징을 한 곳에서 결정한다.
 *
 * 설계 원칙(#5 잘림 수정의 핵심):
 *   - 그림자 여백(shadowPadding 교차축)은 "카드를 calc(100% - pad) 로 줄이는" 방식을 쓰지 않는다.
 *     대신 "트랙(클립 컨테이너)의 안쪽 패딩"으로 확보한다. → 카드는 잘리지 않고, shadowPadding 이
 *     높이 계산 모드를 바꾸지 않는다(시각 옵션과 레이아웃의 결합 해제).
 *   - autoHeight=true  → 카드 교차 크기 "auto"(측정 후 최댓값 통일). 트랙도 "auto".
 *   - autoHeight=false → 카드 "100%"(컨테이너 채움). 트랙 "100%".
 *   - 어느 경우든 그림자는 트랙 패딩(border-box 안쪽)에서 표시되어 클립되지 않는다.
 *
 * @return {{cardCross:String, trackCross:String, padStart:Number, padEnd:Number, autoCross:Boolean}}
 */
Slidify.prototype._resolveCrossSizing = function() {
	var pad = this._crossShadowPads();   // 교차축 그림자 여백 {start, end}
	var autoCross = !!this.autoHeight;
	this._autoCross = autoCross;          // _applyAutoHeight 가 측정 실행 여부 판단에 사용
	return {
		cardCross: autoCross ? "auto" : "100%",
		trackCross: autoCross ? "auto" : "100%",
		padStart: pad.start,
		padEnd: pad.end,
		autoCross: autoCross
	};
};

/**
 * spaceBetween 을 주축/교차축 간격으로 해석. Number → 양쪽 동일, 배열 [가로, 세로] → 각각.
 * main = 스크롤축 간격(가로슬라이더=가로, 세로슬라이더=세로), cross = 반대(그리드 행/열 간격).
 * @return {{main:Number, cross:Number}}
 */
Slidify.prototype._resolveSpacing = function() {
	var sb = this.spaceBetween;
	var h, v;
	if (Object.prototype.toString.call(sb) === "[object Array]") {
		h = parseFloat(sb[0]) || 0;
		v = parseFloat(sb.length > 1 ? sb[1] : sb[0]) || 0;
	} else if (typeof sb === "number" && sb > 0) {
		h = v = sb;
	} else {
		var lh = this._layout.horizontalSpacing || 0;
		var lv = this._layout.verticalSpacing || 0;
		h = lh || lv || 0;
		v = lv || lh || 0;
	}
	return this._isHorizontal() ? { main: h, cross: v } : { main: v, cross: h };
};

/* =========================================================
 * 이벤트 emitter (컨트롤 레벨 콜백)
 * ======================================================= */
Slidify.prototype.addEventListener = function(name, fn) {
	if (!this._listeners[name]) {
		this._listeners[name] = [];
	}
	this._listeners[name].push(fn);
	return this;
};
Slidify.prototype.removeEventListener = function(name, fn) {
	var arr = this._listeners[name];
	if (!arr) {
		return this;
	}
	if (!fn) {
		this._listeners[name] = [];
		return this;
	}
	for (var i = arr.length - 1; i >= 0; i--) {
		if (arr[i] === fn) {
			arr.splice(i, 1);
		}
	}
	return this;
};
Slidify.prototype._emit = function(name) {
	var arr = this._listeners[name];
	if (!arr) {
		return;
	}
	for (var i = 0; i < arr.length; i++) {
		arr[i].call(this, this);
	}
};

/* =========================================================
 * 구조 변환 (컨트롤 API)
 * ======================================================= */
Slidify.prototype._transform = function() {
	this._container.style.addClass("cl-unselectable");
	this._layout.scrollable = false;

	this._originalChildren = this._container.getChildren();
	// FlowLayout 의 spacing 은 deprecated → horizontalSpacing/verticalSpacing 사용.
	// spaceBetween 이 [가로,세로] 면 주축(스크롤축)/교차축(그리드 행) 간격을 분리한다.
	var sp = this._resolveSpacing();
	this._spacing = sp.main;         // 주축(열 사이) 간격 — 폭 계산/스냅/스크롤에 사용
	this._crossSpacing = sp.cross;   // 교차축(그리드 행 사이) 간격
	// 내부 트랙 FlowLayout 은 슬라이드 사이에만 간격을 주고 앞/뒤 끝 여백은 만들지 않는다(첫 슬라이드 flush).

	// 내부 트랙 컨테이너 (네이티브 스크롤 대상: scrollable=false 로 클립하고 scrollTo 로 이동)
	this._innerContainer = new cpr.controls.Container();
	// clipContent=true 로 클립해 모바일 가로 스크롤을 막는다. box-shadow 는 clipContent=false 로
	// 여는 대신 shadowPadding(교차축 여백)으로 클립 박스 안에서 표시한다(가로 스크롤 없이 그림자 보존).
	this._innerContainer.clipContent = true;
	var layout = new cpr.controls.layouts.FlowLayout();
	layout.lineWrap = false;
	layout.scrollable = false;
	// 트랙은 단일 라인이라 주축 간격만 의미 있다. 교차축 간격은 0(불필요한 마진 방지).
	layout.horizontalSpacing = this._isHorizontal() ? this._spacing : 0;
	layout.verticalSpacing = this._isHorizontal() ? 0 : this._spacing;
	this._innerContainer.setLayout(layout);
	this._innerLayout = layout;
	// 원본 컨테이너 레이아웃의 간격은 트랙이 담당하므로 0 으로
	this._layout.horizontalSpacing = 0;
	this._layout.verticalSpacing = 0;

	var isH = this._isHorizontal();

	// 교차축(가로슬라이더=높이) 사이징을 한 곳에서 결정한다.
	// 그림자 여백은 카드를 줄이지 않고 "트랙 안쪽 패딩"으로 확보한다(카드 잘림 방지 — #5).
	var cross = this._resolveCrossSizing();
	var autoCross = cross.autoCross;
	var crossSize = cross.cardCross;   // "auto"(autoHeight) 또는 "100%"
	// 그림자 여백을 트랙 FlowLayout 의 교차축 마진으로 확보한다.
	// 직접 CSS(style.css 로 .cl-container 에 padding 주입) 대신 레이아웃 속성을 쓴다 → CPR 레이아웃 계산과
	// 일관되고, 리빌드/리사이즈 시 레이아웃이 마진을 정상 반영한다. clipContent=true 안쪽 여백이라
	// box-shadow 는 잘리지 않고 주축 클립도 유지된다.
	if (cross.padStart > 0 || cross.padEnd > 0) {
		if (isH) {
			this._innerLayout.topMargin = cross.padStart;      // 가로 슬라이더: 교차축=상하
			this._innerLayout.bottomMargin = cross.padEnd;
		} else {
			this._innerLayout.leftMargin = cross.padStart;     // 세로 슬라이더: 교차축=좌우
			this._innerLayout.rightMargin = cross.padEnd;
		}
	}

	// 슬라이드 크기 제약
	var itemConstraint = isH ? { height: crossSize } : { width: crossSize };
	var itemSizeExpression;
	if (this.slidesPerView !== "auto") {
		// showCount 개가 뷰포트에 정확히 들어가도록: FlowLayout 은 각 슬라이드에 spacing 을 배분하므로
		// (showCount-1) 이 아니라 showCount 만큼 빼야 마지막 슬라이드가 잘리지 않는다(참조 모듈과 동일).
		// 주축 shadowPadding(가로슬라이더=좌우 합)도 빼서 슬라이드를 좁혀 스크롤 끝쪽에 그림자 공간을 남긴다.
		var mainPad = this._mainShadowTotal();
		var spanExpr = "(100% - " + (this.slidesPerView * this._spacing + mainPad) + "px) / " + this.slidesPerView;
		itemSizeExpression = "calc(" + spanExpr + ")";
		if (isH) {
			itemConstraint.width = itemSizeExpression;
		} else {
			itemConstraint.height = itemSizeExpression;
		}
	} else {
		itemSizeExpression = "auto";
		if (isH) {
			itemConstraint.width = "auto";
		} else {
			itemConstraint.height = "auto";
		}
	}

	// 가운데 정렬용 패더
	if (this.centeredSlides && this.loop === false && this.slidesPerView !== "auto") {
		var padder = new cpr.controls.Output();
		padder.style.addClass("slidify-placeholder");
		var padExpr = cpr.utils.Util.template("calc((100% - ${spacing} - ${eachWidth}) / 2 - ${spacing})", {
			eachWidth: itemSizeExpression,
			spacing: this._spacing + "px"
		});
		this._innerContainer.addChild(padder, isH ? { width: padExpr, height: "100%" } : { width: "100%", height: padExpr });
	}

	// 원본 자식들을 트랙으로 이전
	var self = this;
	var rows = (typeof this.gridRows === "number" && this.gridRows > 1) ? this.gridRows : 1;
	if (rows > 1) {
		// 그리드: 카드를 rows 개씩 "열(교차축 스택)" 컨테이너로 묶고, 열을 슬라이드(-snap-point)로 트랙에 추가.
		// → 스냅/네비/페이지네이션은 열 기준. slidesPerView = 화면에 보이는 열 수.
		var gap = this._crossSpacing;   // 그리드 행 사이 간격(교차축) — 주축 열 간격과 별개
		// 열 안에서 각 카드의 교차축 크기(가로슬라이더=높이): (100% - (rows-1)*gap) / rows.
		// autoHeight(측정) 면 카드 높이를 콘텐츠대로(auto) → 열 높이 = 카드 합(잘림 없음). 단순 케이스는 분할 고정.
		var cardCross = autoCross ? "auto" : ("calc((100% - " + ((rows - 1) * gap) + "px) / " + rows + ")");
		var kids = this._originalChildren;
		for (var ci = 0; ci < kids.length; ci += rows) {
			var col = new cpr.controls.Container();
			// 카드 box-shadow 가 열 컨테이너에서 클립되지 않도록(트랙의 shadowPadding 여백까지 뻗게).
			col.clipContent = false;
			var colLayout = new cpr.controls.layouts.FlowLayout();
			// 가로 슬라이더: 카드 폭 100% + lineWrap → 세로로 rows 개 스택.
			// 세로 슬라이더: 카드 높이 100% + lineWrap=false → 가로로 rows 개 나열.
			colLayout.lineWrap = isH;
			colLayout.scrollable = false;
			colLayout.horizontalSpacing = isH ? 0 : gap;
			colLayout.verticalSpacing = isH ? gap : 0;
			col.setLayout(colLayout);
			col.userAttr("-snap-point", "true");
			for (var ri = 0; ri < rows && (ci + ri) < kids.length; ri++) {
				var card = kids[ci + ri];
				col.addChild(card, isH ? { width: "100%", height: cardCross } : { width: cardCross, height: "100%" });
			}
			this._innerContainer.addChild(col, itemConstraint);
		}
	} else {
		this._originalChildren.forEach(function(each) {
			each.userAttr("-snap-point", "true");
			self._innerContainer.addChild(each, itemConstraint);
		});
	}
	this._slideControls = this._innerContainer.getChildren().filter(function(each) {
		return each.userAttr("-snap-point") === "true";
	});

	// autoHeight(측정) 면 트랙 교차축도 auto(콘텐츠 높이대로) → 슬라이더 그룹 높이가 콘텐츠를 따라간다.
	var trackConstraint = isH
		? { width: "100%", height: autoCross ? "auto" : "100%" }
		: { width: autoCross ? "auto" : "100%", height: "100%" };
	this._container.addChild(this._innerContainer, trackConstraint);

	// 트랙은 넘쳐도 클립되도록
	this._container.style.css({ "overflow": "hidden" });
	// slidesPerView:"auto" 는 슬라이드가 자연폭이라 CPR 콘텐츠 페인이 넘쳐 가로 스크롤이 생긴다.
	// CSS overflow:hidden 만으론 부족 → 타겟 그룹의 clipContent=true 로 클립한다.
	if (this.slidesPerView === "auto") {
		this._container.clipContent = true;
	}
};

/**
 * 트랙(내부 컨테이너)만 해체해 원본 자식을 컨테이너로 되돌린다. (breakpoint 재빌드용)
 * 페이지네이션/네비게이션은 유지하고 페이지네이션 불릿만 재구성한다.
 */
Slidify.prototype._teardownTrack = function() {
	if (!this._innerContainer || this._innerContainer.disposed) {
		return;
	}
	var self = this;
	// dispose 전에 원본 자식들을 컨테이너로 이전(reparent) — 그래야 자식이 함께 dispose 되지 않는다.
	this._originalChildren.forEach(function(each) {
		self._container.addChild(each, self._isHorizontal() ? { height: "100%" } : { width: "100%" });
	});
	this._innerContainer.dispose();   // 남은 패더만 정리
	this._innerContainer = null;
	this._innerLayout = null;
	this._slideControls = null;
};

/* =========================================================
 * 시작 / 종료
 * ======================================================= */
Slidify.prototype.start = function() {
	if (this._container.getActualRect().width === 0) {
		cpr.core.DeferredUpdateManager.INSTANCE.asyncExec(this.start.bind(this));
		return;
	}

	// 반응형: 기준 옵션 스냅샷 후 현재 폭에 맞는 breakpoint 를 먼저 적용
	this._captureBaseParams();
	this._currentBreakpoint = this._applyBreakpointParams();

	this._transform();
	this._updateGrid();

	// 페이지네이션은 그리드(snapGrid) 확정 후 생성해야 불릿 개수가 정확하다.
	if (this.showPagination) {
		this._pagination = new SlidifyPagination(this);
	}

	if (this.allowTouchMove) {
		this._container.addEventListener("mousedown", this._onMouseDown);
		this._container.addEventListener("touchstart", this._onTouchStart);
	}
	this._container.addEventListenerOnce("dispose", this._handleDispose.bind(this));
	cpr.core.NotificationCenter.INSTANCE.subscribe(cpr.core.SystemTopics.RESIZE, this, this._onResize);
	// CPR RESIZE 가 실시간 창 리사이즈에 안 뜨는 환경 대비(breakpoint 전환 보장)
	if (typeof window !== "undefined" && window.addEventListener) {
		window.addEventListener("resize", this._onWindowResize);
	}

	this._initNavigation();

	// 초기 슬라이드(0 이어도 flush 정렬을 위해 스크롤 위치를 명시적으로 맞춘다)
	this.slideTo(this.initialSlide || 0, 0);
	this._updateActivePageButton();

	if (this.autoPlayDelay > 0) {
		this.autoPlay();
	}
	// 자동재생 버튼 연결은 autoPlay() 이후에 — 첫 시작 상태(재생 중)를 즉시 반영해
	// 정지 버튼(.swiper-button-stop)이 먼저 보이게 한다(재생 버튼 깜빡임 방지).
	this._initAutoPlayControls();

	// 렌더 확정 후: autoHeight 통일(측정→설정) → 오버레이 재배치(페이지네이션 실측 높이 기반 하단 공간 예약 포함)
	var self = this;
	cpr.core.DeferredUpdateManager.INSTANCE.asyncExec(function() {
		if (self._container.disposed) { return; }
		self._applyAutoHeight();
		self._layoutOverlays();
	});

	this._emit("init");
	return this;
};

Slidify.prototype._handleDispose = function() {
	this.stopAutoPlay();
	this._container.removeEventListener("mousedown", this._onMouseDown);
	this._container.removeEventListener("touchstart", this._onTouchStart);
	if (typeof window !== "undefined" && window.removeEventListener && this._onWindowResize) {
		window.removeEventListener("resize", this._onWindowResize);
	}
	cpr.core.NotificationCenter.INSTANCE.unsubcribeAllTopic(this);
	this._emit("beforeDestroy");
};

/* =========================================================
 * 반응형 breakpoints
 * ======================================================= */
/**
 * breakpoint 로 오버라이드 가능한 옵션 키 목록.
 * 레이아웃(트랙) 계열 + 페이지네이션/네비게이션 UI 계열 모두 포함.
 */
var SLIDIFY_BREAKPOINT_KEYS = [
	// 트랙/그리드
	"slidesPerView", "slidesPerGroup", "spaceBetween", "centeredSlides", "direction", "gridRows", "autoHeight",
	// 페이지네이션
	"showPagination", "paginationPosition", "paginationOffset", "paginationClickable",
	// 페이지네이션 [PSE 확장]
	"paginationAlign", "paginationLeft", "paginationSpacing", "paginationBulletSize", "paginationHeight",
	// 네비게이션
	"showNavigation", "navigationButtonWidth", "navigationButtonHeight", "navigationEdgeBehavior"
];

/** breakpoint 로 바뀔 수 있는 옵션들의 기준값을 스냅샷 */
Slidify.prototype._captureBaseParams = function() {
	this._baseParams = {};
	for (var i = 0; i < SLIDIFY_BREAKPOINT_KEYS.length; i++) {
		var k = SLIDIFY_BREAKPOINT_KEYS[i];
		this._baseParams[k] = this[k];
	}
};

/**
 * 현재 폭에 해당하는 breakpoint 키를 반환(desktop-first = max-width, 없으면 null).
 * 즉 base 는 가장 큰 화면(PC) 기준이고, `1024: {...}` 은 폭이 1024 이하일 때 적용된다.
 * width 이상인 키들 중 가장 작은 키(가장 좁은 상한)를 선택한다.
 */
Slidify.prototype._pickBreakpoint = function() {
	if (!this.breakpoints) {
		return null;
	}
	var width = (typeof window !== "undefined" && window.innerWidth) ? window.innerWidth : this._container.getViewPortRect().width;
	var keys = [];
	for (var key in this.breakpoints) {
		if (this.breakpoints.hasOwnProperty(key)) {
			var num = parseInt(key, 10);
			if (!isNaN(num)) { keys.push(num); }
		}
	}
	keys.sort(function(a, b) { return a - b; });
	var matched = null;
	for (var i = 0; i < keys.length; i++) {
		if (width <= keys[i]) { matched = keys[i]; break; }
	}
	return matched;
};

/** 기준값으로 리셋 후 매칭 breakpoint 옵션을 병합. 적용된 키 반환. */
Slidify.prototype._applyBreakpointParams = function() {
	if (!this._baseParams) { return null; }
	var self = this;
	// 1) 기준값(PC)으로 리셋
	SLIDIFY_BREAKPOINT_KEYS.forEach(function(k) {
		self[k] = self._baseParams[k];
	});
	// 2) 매칭 breakpoint 옵션 병합
	var bp = this._pickBreakpoint();
	if (bp != null) {
		var o = this.breakpoints[bp] || this.breakpoints[String(bp)];
		if (o) {
			o = this._flattenOptions(o);   // breakpoint 옵션도 중첩 네임스페이스 허용
			SLIDIFY_BREAKPOINT_KEYS.forEach(function(k) {
				if (o.hasOwnProperty(k)) { self[k] = o[k]; }
			});
		}
	}
	return bp;
};

/** breakpoint 전환 시 트랙을 해체 후 재구성(슬라이드 폭/간격/방향 반영) */
Slidify.prototype._rebuild = function() {
	// loop 은 물리 순서가 회전 중일 수 있으므로 원본 순서 페이지로 보존(재구성 후 _loopShift 는 0 으로 리셋된다)
	var keepReal = this.loop ? this._activePage() : this._snapIndex;
	this._applyBreakpointParams();

	this._teardownTrack();
	this._loopShift = 0;
	this._transform();
	this._updateGrid();

	// 네비게이션: breakpoint 로 show/버튼크기/edge동작이 바뀔 수 있으므로 토글 반영
	if (this.showNavigation) {
		this._initNavigation();   // 최초/재표시 모두 idempotent
	} else {
		this._teardownNavigation();
	}

	// 페이지네이션: show/position/offset 토글 반영 + 불릿 재구성(스냅 개수 변동)
	if (this.showPagination) {
		if (!this._pagination || (this._pagination.control && this._pagination.control.disposed)) {
			this._pagination = new SlidifyPagination(this);
		} else {
			this._pagination.rebuild();
		}
	} else {
		this._teardownPagination();
	}

	// 오버레이 재배치 + 네비 상태 갱신
	this._layoutOverlays();
	this._updateNavigationState();

	var target = keepReal;
	if (target > this._snapCount() - 1) { target = this._snapCount() - 1; }
	if (target < 0) { target = 0; }
	this.slideToSnap(target, 0);

	// autoHeight: 새 트랙(카드 auto)이 렌더된 뒤 통일 → 오버레이 재배치
	if (this.autoHeight) {
		var selfR = this;
		cpr.core.DeferredUpdateManager.INSTANCE.asyncExec(function() {
			if (selfR._container.disposed) { return; }
			selfR._applyAutoHeight();
			selfR._layoutOverlays();
		});
	}
};

/**
 * autoHeight: 모든 카드(원본 자식)의 콘텐츠 높이를 측정해 최댓값으로 통일(stretch).
 * → 래퍼(트랙/그룹)는 가장 큰 카드 높이로 정해지고 나머지 카드는 그 높이로 늘어난다(잘림 없음).
 * grid 면 카드가 통일되어 열 높이도 자동으로 균일해진다. (교차축 shadowPadding 은 트랙 패딩으로 별도 가산)
 * ※ 카드가 auto 로 렌더된 뒤(getOffsetRect 신뢰 가능) 호출해야 한다. init·breakpoint 재빌드 시 실행.
 */
Slidify.prototype._applyAutoHeight = function() {
	// 카드가 "100%"(컨테이너 채움) 모드면 측정/통일이 불필요하다. autoCross(=autoHeight)일 때만 측정한다.
	if (!this._autoCross || this._container.disposed) { return; }
	var kids = this._originalChildren;
	if (!kids || !kids.length) { return; }
	var isH = this._isHorizontal();
	var crossKey = isH ? "height" : "width";
	// 1) 최대 콘텐츠 교차 크기 측정
	var maxH = 0;
	for (var i = 0; i < kids.length; i++) {
		if (kids[i].disposed) { continue; }
		var r = kids[i].getOffsetRect();
		var h = isH ? r.height : r.width;
		if (h > maxH) { maxH = h; }
	}
	if (maxH <= 0) { return; }
	// 2) 모든 카드를 최댓값으로 통일(기존 constraint 유지 + 교차 크기만 갱신)
	for (var j = 0; j < kids.length; j++) {
		var c = kids[j];
		if (c.disposed) { continue; }
		var parent = c.getParent();
		if (!parent) { continue; }
		var cur = parent.getConstraint(c);
		var next = {};
		if (cur) { for (var k in cur) { if (cur.hasOwnProperty(k)) { next[k] = cur[k]; } } }
		next[crossKey] = maxH + "px";
		parent.updateConstraint(c, next);
	}
	cpr.core.DeferredUpdateManager.INSTANCE.update();
};

/* =========================================================
 * 측정 (스크롤 기반: 위치는 getOffsetRect 로 실시간, 크기만 캐시)
 * ======================================================= */
Slidify.prototype._updateGrid = function() {
	if (this._container.disposed) { return; }
	this._measureAndSnap();
	this._snapToClosest(0);
};

/** 슬라이드 크기 실측 + 컨트롤 목록/뷰포트 크기 갱신 */
Slidify.prototype._measureAndSnap = function() {
	var isH = this._isHorizontal();
	this._slideControls = this._innerContainer.getChildren().filter(function(each) {
		return each.userAttr("-snap-point") === "true";
	});
	this._slidesSize = [];
	for (var i = 0; i < this._slideControls.length; i++) {
		var r = this._slideControls[i].getOffsetRect();
		this._slidesSize.push(isH ? r.width : r.height);
	}
	var vp = this._container.getViewPortRect();
	this._size = isH ? vp.width : vp.height;
};

/* =========================================================
 * 스크롤 프리미티브 (참조 모듈과 동일: 네이티브 scrollTo/adjustScroll)
 * ======================================================= */
Slidify.prototype._scrollPos = function() {
	var vp = this._innerContainer.getViewPortRect();
	return this._isHorizontal() ? vp.x : vp.y;
};
Slidify.prototype._maxScroll = function() {
	var cp = this._innerContainer.getContentPaneRect();
	var vp = this._innerContainer.getViewPortRect();
	return this._isHorizontal() ? Math.max(cp.width - vp.width, 0) : Math.max(cp.height - vp.height, 0);
};
Slidify.prototype._isScrollable = function() {
	var cp = this._innerContainer.getContentPaneRect();
	var vp = this._innerContainer.getViewPortRect();
	return this._isHorizontal() ? (vp.width < cp.width) : (vp.height < cp.height);
};
Slidify.prototype._scrollToInstant = function(pos) {
	if (this._isHorizontal()) { this._innerContainer.scrollTo(pos, 0); }
	else { this._innerContainer.scrollTo(0, pos); }
};
Slidify.prototype._adjustScrollBy = function(d) {
	if (this._isHorizontal()) { this._innerContainer.adjustScroll(d, 0); }
	else { this._innerContainer.adjustScroll(0, d); }
};
Slidify.prototype._scrollAnimated = function(pos, duration) {
	if (duration == null) { duration = this.speed; }
	if (duration <= 0) { this._scrollToInstant(pos); return; }
	if (this._isHorizontal()) { this._innerContainer.scrollTo(pos, 0, duration, cpr.animation.TimingFunction.EASE_OUT_CUBIC); }
	else { this._innerContainer.scrollTo(0, pos, duration, cpr.animation.TimingFunction.EASE_OUT_CUBIC); }
};
Slidify.prototype._slidePos = function(control) {
	var r = control.getOffsetRect();
	return this._isHorizontal() ? r.x : r.y;
};
Slidify.prototype._slideSizeOf = function(control) {
	var r = control.getOffsetRect();
	return this._isHorizontal() ? r.width : r.height;
};
/**
 * 슬라이드를 좌(상)단에 flush 시키는 스크롤 위치.
 * FlowLayout 은 각 슬라이드에 margin(spacing)을 주므로 getOffsetRect().x 에 spacing 이 포함된다.
 * → 실제 정렬 스크롤 = x - spacing (참조 모듈과 동일). 이걸 빼먹으면 spacing 만큼 왼쪽으로 치우침.
 */
Slidify.prototype._slideScrollTarget = function(control) {
	return this._slidePos(control) - this._spacing;
};
Slidify.prototype._clampScroll = function(pos) {
	if (this.loop) { return pos; }
	var maxS = this._maxScroll();
	if (pos < 0) { return 0; }
	if (pos > maxS) { return maxS; }
	return pos;
};

/* ---------------------------------------------------------
 * loop 원본 순서 매핑
 * loop 은 _handleMove 에서 슬라이드를 1개씩 회전(reorderChild)시키므로 물리 배열(_slideControls)의
 * 순서가 계속 바뀐다. 그룹 경계를 "물리 인덱스" 로 잡으면 자식 수가 slidesPerGroup 으로
 * 나누어떨어지지 않을 때(n % group > 0) 한 바퀴 돌 때마다 경계가 원본 순서에서 밀린다.
 *   예) n=5, spv=2, group=2 → [0,1] [2,3] [4,0] 다음이 [1,2] 가 되어 이전 그룹을 다시 끌어옴.
 * → 그룹 경계는 항상 "원본 인덱스" 기준으로 판단한다.
 * ------------------------------------------------------- */
/** 물리 인덱스 → 원본(초기 배치) 인덱스 */
Slidify.prototype._origIndexOf = function(physIndex) {
	var n = this._slideControls.length;
	if (n === 0) { return 0; }
	return ((physIndex + this._loopShift) % n + n) % n;
};
/** 해당 물리 인덱스의 슬라이드가 원본 순서 기준 그룹의 시작인지 */
Slidify.prototype._isGroupStart = function(physIndex) {
	var group = this.slidesPerGroup || 1;
	return (this._origIndexOf(physIndex) % group) === 0;
};
/** 물리 인덱스 → 원본 순서 기준 페이지(그룹) 번호 */
Slidify.prototype._pageOfPhysical = function(physIndex) {
	return Math.floor(this._origIndexOf(physIndex) / (this.slidesPerGroup || 1));
};

/**
 * 스냅 기준 슬라이드(그룹 시작) 컨트롤 목록.
 * 비-loop: 끝(maxScroll)을 넘는 시작점은 만들지 않는다(마지막 스냅 1개로 수렴).
 *   예) slidesPerView:3, group:1, 총4개 → 스냅 [0-2],[1-3] = 2개(불렛 2개).
 * loop: 원본 인덱스가 group 배수인 슬라이드가 페이지 시작(개수는 ceil(n/group) 로 동일).
 *       반환 순서는 "현재 물리 순서" 이므로 인덱스는 회전에 따라 달라진다(위치 비교 전용).
 */
Slidify.prototype._snapSlides = function() {
	var group = this.slidesPerGroup || 1;
	var n = this._slideControls.length;
	var out = [];
	if (n === 0) { return out; }
	if (this.loop) {
		for (var i = 0; i < n; i++) {
			if (this._isGroupStart(i)) { out.push(this._slideControls[i]); }
		}
		if (!out.length) { out.push(this._slideControls[0]); }
		return out;
	}
	// 고정 slidesPerView: getContentPaneRect(레이아웃 확정 의존) 없이 산술로 스냅 개수 결정 → 첫 로드에도 정확.
	// 예) n=4, spv=3, group=1 → numSnaps=2, 시작 [0, 1].
	if (typeof this.slidesPerView === "number" && this.slidesPerView > 0) {
		var spv = this.slidesPerView;
		var lastStart = Math.max(n - spv, 0);
		var numSnaps = (n <= spv) ? 1 : (Math.ceil((n - spv) / group) + 1);
		for (var s = 0; s < numSnaps; s++) {
			out.push(this._slideControls[Math.min(s * group, lastStart)]);
		}
		return out;
	}
	// auto(가변 폭): 스크롤 위치로 끝을 판단(끝 넘는 스냅 제외)
	var maxS = this._maxScroll();
	var prev = null;
	for (var k = 0; k < n; k += group) {
		var target = this._clampScroll(this._slideScrollTarget(this._slideControls[k]));
		if (prev !== null && Math.abs(target - prev) < 1) { break; }   // 이미 끝에 도달 → 중복이라 중단
		out.push(this._slideControls[k]);
		prev = target;
		if (target >= maxS - 1) { break; }   // 이 스냅이 끝 → 더 만들지 않음
	}
	if (!out.length) { out.push(this._slideControls[0]); }
	return out;
};
Slidify.prototype._snapCount = function() {
	return this._snapSlides().length;
};
/** scrollPos 에 가장 가까운 슬라이드(개별) 인덱스 */
Slidify.prototype._closestSlideIndexByPos = function(scrollPos) {
	var best = 0, min = Number.MAX_VALUE;
	for (var i = 0; i < this._slideControls.length; i++) {
		var d = Math.abs(this._slideScrollTarget(this._slideControls[i]) - scrollPos);
		if (d < min) { min = d; best = i; }
	}
	return best;
};
/**
 * scrollPos 에 가장 가까운 스냅(그룹) 인덱스.
 * loop 은 물리 순서가 회전하므로 트랙 끝쪽 그룹 시작은 maxScroll 을 넘어 "도달 불가"일 수 있다.
 * (그 그룹은 회전이 더 일어난 뒤에 도달 가능해진다) → 후보에서 제외해야 엉뚱한 그룹으로 스냅되지 않는다.
 */
Slidify.prototype._closestSnapIndex = function(scrollPos) {
	var snaps = this._snapSlides();
	var maxS = this.loop ? this._maxScroll() : 0;
	var best = -1, min = Number.MAX_VALUE;
	var fallback = 0, fallbackMin = Number.MAX_VALUE;
	for (var i = 0; i < snaps.length; i++) {
		var target = this._slideScrollTarget(snaps[i]);
		var d = Math.abs(target - scrollPos);
		if (d < fallbackMin) { fallbackMin = d; fallback = i; }
		if (this.loop && target > maxS + 1) { continue; }   // 아직 도달 불가한 그룹
		if (d < min) { min = d; best = i; }
	}
	return best < 0 ? fallback : best;
};

/* =========================================================
 * 이동 API
 * ======================================================= */
Slidify.prototype.slideToSnap = function(snapIndex, duration) {
	if (this._container.disposed) { return this; }
	if (duration == null) { duration = this.speed; }
	if (this.loop) { return this._slideToLoopPage(snapIndex, duration); }
	var snaps = this._snapSlides();
	var len = snaps.length;
	if (len === 0) { return this; }
	if (snapIndex < 0) { snapIndex = this.loop ? len - 1 : 0; }
	if (snapIndex > len - 1) { snapIndex = this.loop ? 0 : len - 1; }
	this._snapIndex = snapIndex;
	this._scrollAnimated(this._clampScroll(this._slideScrollTarget(snaps[snapIndex])), duration);
	this._afterMove();
	return this;
};

/**
 * loop 전용 페이지 이동. 페이지는 "원본 순서" 기준(0 = 원본 0번 슬라이드가 왼쪽에 오는 화면).
 * 목표 슬라이드가 물리적으로 트랙 끝쪽이라 도달 불가하면 트랙을 앞→뒤로 회전시켜 도달 가능하게 만든다.
 * (회전은 스크롤 보정을 동반하므로 화면은 그대로 유지된다 — _handleMove 의 경계 처리와 동일한 방식)
 * @param {Number} page 원본 순서 기준 페이지(범위를 벗어나면 순환)
 * @param {Number} duration
 */
Slidify.prototype._slideToLoopPage = function(page, duration) {
	var n = this._slideControls.length;
	if (n === 0) { return this; }
	var group = this.slidesPerGroup || 1;
	var pages = Math.ceil(n / group);
	page = ((page % pages) + pages) % pages;

	// 원본 인덱스 → 물리 인덱스 (orig = (phys + _loopShift) % n)
	var phys = ((page * group - this._loopShift) % n + n) % n;
	for (var guard = 0; guard < n; guard++) {
		if (this._slideScrollTarget(this._slideControls[phys]) <= this._maxScroll() + 1) { break; }
		this._rotateForward();
		phys = (phys - 1 + n) % n;
	}
	this._snapIndex = page;
	var target = Math.min(this._slideScrollTarget(this._slideControls[phys]), this._maxScroll());
	this._scrollAnimated(target < 0 ? 0 : target, duration);
	this._afterMove();
	return this;
};

/**
 * loop: 첫 슬라이드를 트랙 끝으로 1칸 회전. 스크롤을 같은 양만큼 되돌려 화면은 그대로 둔다.
 * 드래그 중이면 기준 스크롤(_dragStartScroll)도 함께 보정한다.
 */
Slidify.prototype._rotateForward = function() {
	var n = this._slideControls.length;
	if (n === 0) { return; }
	var first = this._slideControls[0];
	var fix = this._slideSizeOf(first) + this._spacing;
	this._innerContainer.reorderChild(first, n);
	this._slideControls.push(this._slideControls.shift());
	this._dragStartScroll -= fix;
	this._adjustScrollBy(-fix);
	cpr.core.DeferredUpdateManager.INSTANCE.update();
	this._loopShift = (this._loopShift + 1) % n;
};

Slidify.prototype.slideTo = function(index, duration) {
	if (this._container.disposed || !this._slideControls.length) { return this; }
	if (duration == null) { duration = this.speed; }
	if (index < 0) { index = 0; }
	if (index > this._slideControls.length - 1) { index = this._slideControls.length - 1; }
	this._scrollAnimated(this._clampScroll(this._slideScrollTarget(this._slideControls[index])), duration);
	this._afterMove();
	return this;
};

Slidify.prototype.slideNext = function(duration) { return this._pageMove(1, duration); };
Slidify.prototype.slidePrev = function(duration) { return this._pageMove(-1, duration); };

/**
 * 한 그룹 이동(next/prev). 참조 모듈처럼 Animator 로 합성 드래그(_handleMove)를 구동한다.
 * _handleMove 가 즉시 scrollTo + 경계 reorder(loop)를 처리하므로 백지 없이 무한 스크롤이 된다.
 * @param {Number} dir +1 next / -1 prev
 * @param {Number} duration
 */
Slidify.prototype._pageMove = function(dir, duration) {
	if (this._container.disposed || this._activeAnimator) { return this; }
	if (!this._isScrollable()) { return this; }
	if (duration == null) { duration = this.speed; }

	this._knownPos = 0;
	this._dragStartScroll = this._scrollPos();
	var moveDist = this._groupDistance(dir);
	var me = this;
	var animator = new cpr.animation.Animator(duration, cpr.animation.TimingFunction.EASE_IN_OUT);
	animator.addTask(function(p) {
		// next(dir>0): delta>0 필요 → pointer = -(p*moveDist);  prev(dir<0): pointer = +(p*moveDist)
		me._handleMove(dir > 0 ? -(p * moveDist) : (p * moveDist));
	});
	this._activeAnimator = animator;
	animator.run().then((function() {
		this._activeAnimator = null;
		this._knownPos = -1;
		this._snapToClosest(0);
	}).bind(this));
	return this;
};

/** 현재 위치에서 group 개 슬라이드 이동 거리(근사; 최종 스냅이 보정) */
Slidify.prototype._groupDistance = function(dir) {
	var group = this.slidesPerGroup || 1;
	var n = this._slideControls.length;
	if (n === 0) { return this._size; }
	var base = this._closestSlideIndexByPos(this._scrollPos());
	var dist = 0;
	if (this.loop) {
		// 고정 group 개가 아니라 "원본 순서의 다음(이전) 그룹 경계" 까지 이동한다.
		// n % group > 0 이면 마지막 그룹은 나머지 개수만 남으므로 이동량도 그만큼이어야 순서가 유지된다.
		//   예) n=5, group=2 → [4] 그룹에서 next 는 1칸만 이동해 [0,1] 로 복귀.
		for (var s = 0; s < n; s++) {
			var pi = dir > 0 ? (base + s) % n : (((base - 1 - s) % n) + n) % n;
			dist += this._slideSizeOf(this._slideControls[pi]) + this._spacing;
			if (this._isGroupStart(dir > 0 ? (pi + 1) % n : pi)) { break; }
		}
		return dist || this._size;
	}
	for (var g = 0; g < group; g++) {
		var idx = dir > 0 ? base + g : base - 1 - g;
		idx = ((idx % n) + n) % n;
		dist += this._slideSizeOf(this._slideControls[idx]) + this._spacing;
	}
	return dist || this._size;
};

/** 가장 가까운 스냅 슬라이드로 정렬 */
Slidify.prototype._snapToClosest = function(duration) {
	if (this._container.disposed) { return; }
	if (duration == null) { duration = this.snapDuration; }
	var snaps = this._snapSlides();
	if (!snaps.length) { return; }
	var idx = this._closestSnapIndex(this._scrollPos());
	// loop 의 스냅 배열 인덱스는 회전에 따라 달라진다 → 상태값은 항상 "원본 순서 페이지" 로 보관.
	this._snapIndex = this.loop ? this._pageOfPhysical(this._slideControls.indexOf(snaps[idx])) : idx;
	this._scrollAnimated(this._clampScroll(this._slideScrollTarget(snaps[idx])), duration);
	this._afterMove();
};

/**
 * 이동 확정 후 상태 반영. _snapIndex 는 호출한 이동 메서드가 목표로 이미 설정해 둔다
 * (애니메이션은 비동기라 여기서 scrollPos 로 다시 계산하면 이전 위치가 잡힘).
 */
Slidify.prototype._afterMove = function() {
	this._updateNavigationState();
	this._updateActivePageButton();
	this._emit("slideChange");
	this._emit("slideChangeTransitionEnd");
	if (!this.loop) {
		var pos = this._scrollPos();
		if (pos <= 1) { this._emit("reachBeginning"); }
		if (pos >= this._maxScroll() - 1) { this._emit("reachEnd"); }
	}
};

/** 페이지네이션/실사용에 쓰는 현재 페이지(loop 이면 원본 순서 기준 realIndex/group) */
Slidify.prototype._activePage = function() {
	if (this.loop) {
		if (this._slideControls.length === 0) { return 0; }
		return this._pageOfPhysical(this._closestSlideIndexByPos(this._scrollPos()));
	}
	return this._snapIndex;
};
Slidify.prototype.getActivePage = function() {
	return this._activePage();
};
Slidify.prototype.setActivePage = function(page, duration) {
	return this.slideToSnap(page, duration);
};

/* =========================================================
 * 드래그 / 터치 (컨트롤 이벤트 + window 포인터 — 참조 모듈과 동일)
 * ======================================================= */
Slidify.prototype._pointerPos = function(e) {
	var isH = this._isHorizontal();
	if (e.targetTouches && e.targetTouches.item) {
		var t = e.targetTouches.item(0);
		return isH ? t.clientX : t.clientY;
	}
	if (e.changedTouches && e.changedTouches.length) {
		var c = e.changedTouches[0];
		return isH ? c.clientX : c.clientY;
	}
	return isH ? e.clientX : e.clientY;
};

Slidify.prototype._onMouseDown = function(e) {
	if (e.button !== 0 || this._activeAnimator) { return; }
	this._dragStart(this._pointerPos(e));
	window.addEventListener("mouseup", this._onMouseUp);
	window.addEventListener("mousemove", this._onMouseMove);
	e.stopPropagation();
};
Slidify.prototype._onMouseMove = function(e) {
	this._handleMove(this._pointerPos(e));
	this._refreshNav();
	e.preventDefault();
};
Slidify.prototype._onMouseUp = function() {
	window.removeEventListener("mouseup", this._onMouseUp);
	window.removeEventListener("mousemove", this._onMouseMove);
	this._dragEnd();
};

Slidify.prototype._onTouchStart = function(e) {
	if (this._activeAnimator) { return; }
	this._dragStart(this._pointerPos(e));
	window.addEventListener("touchmove", this._onTouchMove, { passive: false });
	window.addEventListener("touchend", this._onTouchEnd);
	e.stopPropagation();
};
Slidify.prototype._onTouchMove = function(e) {
	this._handleMove(this._pointerPos(e));
	this._refreshNav();
	e.stopPropagation();
};
Slidify.prototype._onTouchEnd = function() {
	window.removeEventListener("touchmove", this._onTouchMove);
	window.removeEventListener("touchend", this._onTouchEnd);
	this._dragEnd();
};

Slidify.prototype._dragStart = function(pos) {
	this._knownPos = pos;
	this._dragStartScroll = this._scrollPos();
	this._dragStartSnap = this._snapIndex;   // longSwipesRatio 판정 기준(드래그 시작 스냅)
	this.stopAutoPlay();
	this._emit("touchStart");
};

/**
 * longSwipesRatio 판정에 쓸 기준 슬라이드 크기(주축, 간격 포함).
 * 드래그 시작 위치에서 가장 가까운 슬라이드 크기를 기준으로 한다.
 * @return {Number}
 */
Slidify.prototype._dragReferenceSlideSize = function() {
	if (!this._slideControls || !this._slideControls.length) { return this._size || 0; }
	var i = this._closestSlideIndexByPos(this._dragStartScroll);
	var sz = this._slideSizeOf(this._slideControls[i]) + this._spacing;
	return sz > 0 ? sz : (this._size || 0);
};
/**
 * 포인터/합성 드래그 처리(참조 모듈과 동일). 즉시 scrollTo + 경계에서 reorderChild/adjustScroll(loop).
 * 네이티브 스크롤이라 콘텐츠가 항상 렌더되어 백지가 없다.
 * @param {Number} pointer 포인터 좌표(합성 이동 시 0 기준 오프셋)
 */
Slidify.prototype._handleMove = function(pointer) {
	if (this._knownPos < 0) { return; }
	if (this._container.disposed) { return; }
	var container = this._innerContainer;
	var isH = this._isHorizontal();
	var vp = container.getViewPortRect();
	var cp = container.getContentPaneRect();
	var vpSize = isH ? vp.width : vp.height;
	var cpSize = isH ? cp.width : cp.height;
	if (vpSize >= cpSize) { return; }   // 스크롤 불가

	var delta = this._knownPos - pointer;
	var newScroll = this._dragStartScroll + delta;
	var n = this._slideControls.length;

	if (newScroll < 0) {
		if (!this.loop) { this._scrollToInstant(0); this._emit("touchMove"); return; }
		// 왼쪽 경계 초과: 마지막 슬라이드를 앞으로 회전
		var lastChild = this._slideControls[n - 1];
		container.reorderChild(lastChild, 0);
		this._slideControls.unshift(this._slideControls.pop());
		var fix = this._spacing + this._slideSizeOf(lastChild);
		this._dragStartScroll += fix;
		this._scrollToInstant(fix);
		cpr.core.DeferredUpdateManager.INSTANCE.update();
		this._loopShift = ((this._loopShift - 1) % n + n) % n;
		this._emit("touchMove");
		return;
	}
	if (newScroll + vpSize > cpSize) {
		if (!this.loop) { this._scrollToInstant(Math.max(cpSize - vpSize, 0)); this._emit("touchMove"); return; }
		// 오른쪽 경계 초과: 첫 슬라이드를 끝으로 회전
		var firstChild = this._slideControls[0];
		var fix2 = this._slideSizeOf(firstChild) + this._spacing;
		this._dragStartScroll -= fix2;
		container.reorderChild(firstChild, n);
		this._slideControls.push(this._slideControls.shift());
		this._adjustScrollBy(-fix2);
		cpr.core.DeferredUpdateManager.INSTANCE.update();
		this._loopShift = (this._loopShift + 1) % n;
		this._emit("touchMove");
		return;
	}
	this._scrollToInstant(newScroll);
	this._emit("touchMove");
};
Slidify.prototype._dragEnd = function() {
	if (this._knownPos < 0) { return; }
	this._knownPos = -1;

	var dragDelta = this._scrollPos() - this._dragStartScroll;   // + 다음방향 / - 이전방향
	var absDelta = Math.abs(dragDelta);

	if (absDelta < this.threshold) {
		// threshold 미만 = 탭 수준의 미세 흔들림 → 스와이프로 보지 않고 원래 위치로 복귀
		this._snapToClosest(this.snapDuration);
	} else if (this.loop) {
		// loop 은 드래그 중 물리 순서가 회전하므로 최근접 스냅으로 정렬(기존 동작 유지)
		this._snapToClosest(this.snapDuration);
	} else {
		// longSwipesRatio: 한 슬라이드 대비 비율 이상 끌었으면 그 방향 한 그룹 이동, 아니면 복귀.
		// 드래그 양과 무관하게 "한 스와이프 = 한 그룹"으로 예측 가능하게 동작한다.
		var slideSize = this._dragReferenceSlideSize();
		var ratio = slideSize > 0 ? (absDelta / slideSize) : 1;
		if (ratio >= this.longSwipesRatio) {
			this.slideToSnap(this._dragStartSnap + (dragDelta > 0 ? 1 : -1), this.snapDuration);
		} else {
			this.slideToSnap(this._dragStartSnap, this.snapDuration);
		}
	}

	this._emit("touchEnd");
	if (this.autoPlayDelay > 0) { this.autoPlay(); }
};

/* =========================================================
 * 자동재생
 * ======================================================= */
Slidify.prototype.autoPlay = function() {
	if (this._autoPlayTimerID >= 0) { return; }
	var self = this;
	this._autoPlayTimerID = setInterval(function() {
		if (!self.loop && self._scrollPos() >= self._maxScroll() - 1) {
			self.slideToSnap(0);
		} else {
			self.slideNext();
		}
	}, (this.autoPlayDelay + this.speed) * 1000);
	this._updateAutoPlayControls();
	this._emit("autoplayStart");
};
Slidify.prototype.stopAutoPlay = function() {
	if (this._autoPlayTimerID >= 0) {
		clearInterval(this._autoPlayTimerID);
		this._autoPlayTimerID = -1;
		this._updateAutoPlayControls();
		this._emit("autoplayStop");
	}
};

/**
 * 외부 재생/정지/토글 버튼을 연결(자동재생 사용 시에만). 리스너는 1회만 바인딩(userAttr 플래그).
 * play=재생, pause=정지, toggle=재생/정지 전환.
 */
Slidify.prototype._initAutoPlayControls = function() {
	if (this.autoPlayDelay <= 0) { return; }   // 자동재생 기능을 사용할 때만
	var self = this;
	// 별칭(playButton/pauseButton)은 _flattenOptions 에서 autoPlayToggleButton/autoStopToggleButton 으로 통일됨.
	this._playButton = this._resolveControl(this.autoPlayToggleButton);
	this._stopButton = this._resolveControl(this.autoStopToggleButton);
	// 접근성: 외부(개발자 배치) 버튼에도 라벨/툴팁을 반영. 옵션으로 문구 변경 가능.
	this._applyA11y(this._playButton, this.autoPlayPlayLabel, this.autoPlayPlayTooltip);
	this._applyA11y(this._stopButton, this.autoPlayStopLabel, this.autoPlayStopTooltip);
	this._bindAutoPlayButton(this._playButton, function() { self.autoPlay(); });
	this._bindAutoPlayButton(this._stopButton, function() { self.stopAutoPlay(); });
	this._updateAutoPlayControls();
};

/** @param {cpr.controls.UIControl} btn @param {Function} onClick */
Slidify.prototype._bindAutoPlayButton = function(btn, onClick) {
	if (!btn || btn.disposed) { return; }
	if (btn.userAttr("-slidify-ap-bound") === "true") { return; }
	btn.addEventListener("click", onClick);
	btn.addEventListener("mousedown", eventStopper);
	btn.userAttr("-slidify-ap-bound", "true");
};

/** 재생 상태에 맞춰 재생/정지 버튼을 상호 배타로 표시(한 쪽만 visible). */
Slidify.prototype._updateAutoPlayControls = function() {
	var playing = this._autoPlayTimerID >= 0;
	// 재생 중이면 정지 버튼만, 정지 상태면 재생 버튼만 노출
	if (this._playButton && !this._playButton.disposed && typeof this._playButton.visible !== "undefined") {
		this._playButton.visible = !playing;
	}
	if (this._stopButton && !this._stopButton.disposed && typeof this._stopButton.visible !== "undefined") {
		this._stopButton.visible = playing;
	}
};

/* =========================================================
 * 네비게이션 (자동생성 or 외부 컨트롤 연결)
 * ======================================================= */
/** ref(컨트롤/ID/클래스) -> 컨트롤 */
Slidify.prototype._resolveControl = function(ref) {
	if (!ref) { return null; }
	if (typeof ref.addEventListener === "function" && typeof ref.getOffsetRect === "function") {
		return ref;
	}
	if (typeof ref === "string" && this._appInstance) {
		var byId = this._appInstance.lookup(ref);
		if (byId) { return byId; }
		return findControlByStyleClass(this._appInstance.getContainer(), ref);
	}
	return null;
};

Slidify.prototype._initNavigation = function() {
	if (!this.showNavigation) { return; }
	// 최초/재표시 모두 idempotent 하게 처리(breakpoint 토글 대응)
	this._ensureNavButton(true);
	this._ensureNavButton(false);
	this._updateNavigationState();
};

/**
 * prev/next 버튼을 보장한다. 없거나 disposed 면 (외부 컨트롤 해석 또는 자동 생성 후) 리스너를 1회 바인딩.
 * 이미 살아있으면 visible 만 켠다(breakpoint 재표시). 자동 버튼은 dispose→재생성이라 리스너 중복 없음,
 * 외부 버튼은 userAttr 플래그로 1회만 바인딩.
 * @param {Boolean} isPrev
 */
Slidify.prototype._ensureNavButton = function(isPrev) {
	var self = this;
	var cur = isPrev ? this._prevButton : this._nextButton;
	if (!cur || cur.disposed) {
		var extOpt = isPrev ? this.prevButton : this.nextButton;
		var ext = this._resolveControl(extOpt);
		var btn, isAuto;
		if (ext) {
			btn = ext; isAuto = false;
		} else {
			// 자동 버튼은 "안정적인 부모"에 float(컨테이너 자체에 두면 스크롤/loop update 때 깜빡임).
			// (placeholder float + style.css 재배치는 버튼을 래퍼 밖으로 밀어내 사라지게 함 → 금지)
			btn = this._createNavButton(isPrev ? "slidify-button-prev" : "slidify-button-next", isPrev);
			isAuto = true;
		}
		// 리스너 1회만 바인딩(외부 버튼 재표시 시 중복 방지; 자동 버튼은 새 객체라 항상 미바인딩)
		if (btn.userAttr("-slidify-nav-bound") !== "true") {
			if (isPrev) {
				btn.addEventListener("click", function() { self.stopAutoPlay(); self.slidePrev(); });
			} else {
				btn.addEventListener("click", function() { self.stopAutoPlay(); self.slideNext(); });
			}
			btn.addEventListener("mousedown", eventStopper);
			btn.userAttr("-slidify-nav-bound", "true");
		}
		if (isPrev) { this._prevButton = btn; this._prevButtonAuto = isAuto; }
		else { this._nextButton = btn; this._nextButtonAuto = isAuto; }
		cur = btn;
	}
	if (typeof cur.visible !== "undefined") { cur.visible = true; }
};

/** 네비게이션 해제(breakpoint 로 showNavigation=false). 자동 버튼은 dispose, 외부 버튼은 숨김. */
Slidify.prototype._teardownNavigation = function() {
	this._hideNavButton(true);
	this._hideNavButton(false);
};

/** @param {Boolean} isPrev */
Slidify.prototype._hideNavButton = function(isPrev) {
	var btn = isPrev ? this._prevButton : this._nextButton;
	var isAuto = isPrev ? this._prevButtonAuto : this._nextButtonAuto;
	if (!btn) { return; }
	if (isAuto) {
		if (!btn.disposed) { btn.dispose(); }
		if (isPrev) { this._prevButton = null; } else { this._nextButton = null; }
	} else if (!btn.disposed && typeof btn.visible !== "undefined") {
		btn.visible = false;   // 외부 버튼은 유지(참조/바인딩 보존)하고 숨기기만
	}
};

/** 페이지네이션 해제(breakpoint 로 showPagination=false). 자동은 dispose, 외부는 불릿 제거+숨김. */
Slidify.prototype._teardownPagination = function() {
	if (!this._pagination) { return; }
	var p = this._pagination;
	if (p.control && !p.control.disposed) {
		if (p._auto) {
			p.control.dispose();
		} else if (p._indexer) {
			// PageIndexer 는 컨트롤을 유지하고 숨기기만(자식 dispose 하면 컨트롤이 깨짐)
			if (typeof p.control.visible !== "undefined") { p.control.visible = false; }
		} else {
			var ch = p.control.getChildren();
			for (var i = ch.length - 1; i >= 0; i--) { ch[i].dispose(); }
			if (typeof p.control.visible !== "undefined") { p.control.visible = false; }
		}
	}
	this._pagination = null;
	// 하단 예약 공간 해제
	if (!this._container.disposed) { this._container.style.css({ "margin-bottom": "" }); }
};

/**
 * 슬라이드 영역(교차축) 크기 — 슬라이드 컨트롤 실측이 가장 신뢰 가능.
 * (슬라이드는 height:100% 라 가로 슬라이더에선 슬라이드 높이 = 슬라이더 영역 높이)
 */
Slidify.prototype._sliderCrossSize = function() {
	if (this._slideControls && this._slideControls.length && !this._slideControls[0].disposed) {
		var r = this._slideControls[0].getOffsetRect();
		var s = this._isHorizontal() ? r.height : r.width;
		if (s > 0) { return s; }
	}
	var vp = this._container.getViewPortRect();
	return this._isHorizontal() ? vp.height : vp.width;
};

/** 위치=부모기준 getOffsetRect, 세로 크기=슬라이드 영역 실측 으로 nav 버튼 constraint 계산 */
Slidify.prototype._navConstraint = function(isPrev) {
	var pos = this._container.getOffsetRect();
	var crossH = this._sliderCrossSize();
	var navW = this.navigationButtonWidth;
	var navH = (this.navigationButtonHeight != null) ? this.navigationButtonHeight : crossH;
	var top = pos.top + Math.max((crossH - navH) / 2, 0);
	// prev 는 슬라이더 좌측(left) 에, next 는 우측(right) 에 앵커한다.
	// next 를 left(=pos.left+pos.width-navW) 로 잡으면 모바일에서 getOffsetRect().width 가 부정확할 때
	// 오른쪽으로 오버플로우된다 → right 로 앵커해 부모 우측 기준으로 배치(오버플로우 방지).
	if (isPrev) {
		return { left: pos.left + "px", top: top + "px", width: navW + "px", height: navH + "px" };
	}
	// 슬라이더 우측 여백 = 부모폭 - (슬라이더 left + 슬라이더 width). 음수면 0(부모 우측에 딱).
	// 부모폭이 신뢰 불가하면 대칭(풀폭) 가정으로 pos.left 사용.
	var rightInset = pos.left;
	var parent = this._container.getParent();
	if (parent && typeof parent.getViewPortRect === "function") {
		var pw = parent.getViewPortRect().width;
		if (pw > 0) { rightInset = Math.max(pw - (pos.left + pos.width), 0); }
	}
	return { right: rightInset + "px", top: top + "px", width: navW + "px", height: navH + "px" };
};

/**
 * 웹 접근성 속성 부여: aria-label(fieldLabel) / title(tooltip).
 * tooltip 미지정(null)이면 label 을 tooltip 으로도 사용한다. 옵션으로 값을 바꾸면 그대로 반영된다.
 * @param {cpr.controls.UIControl} ctrl
 * @param {String} label
 * @param {String} tooltip
 */
Slidify.prototype._applyA11y = function(ctrl, label, tooltip) {
	if (!ctrl || ctrl.disposed) { return; }
	if (label != null && typeof ctrl.fieldLabel !== "undefined") { ctrl.fieldLabel = label; }
	var tip = (tooltip != null) ? tooltip : label;
	if (tip != null && typeof ctrl.tooltip !== "undefined") { ctrl.tooltip = tip; }
};

/** 네비게이션 버튼 생성 + 올바른 constraint 로 부모에 float(한 번에) */
Slidify.prototype._createNavButton = function(cls, isPrev) {
	var btn = new cpr.controls.Button();
	btn.style.addClass("slidify-button");
	btn.style.addClass(cls);
	if (this.navigationButtonClassName) {
		btn.style.addClass(this.navigationButtonClassName);
	}
	// 접근성: 자동 생성 버튼이라 라벨을 줄 곳이 여기뿐이다. 옵션(navigationPrevLabel 등)으로 변경 가능.
	// 키보드(Enter/Space/Click)는 eXBuilder6 Button 이 자체 지원하므로 별도 처리 불필요.
	this._applyA11y(btn,
		isPrev ? this.navigationPrevLabel : this.navigationNextLabel,
		isPrev ? this.navigationPrevTooltip : this.navigationNextTooltip);
	var parent = this._container.getParent();
	if (parent) { parent.floatControl(btn, this._navConstraint(isPrev)); }
	return btn;
};

/** 자동 버튼 위치 재조정(리사이즈). style.css 가 아니라 올바른 constraint 로 다시 floatControl → 래퍼째 재배치. */
Slidify.prototype._layoutNavButtons = function() {
	if (this._container.disposed) { return; }
	var parent = this._container.getParent();
	if (!parent) { return; }
	if (this._prevButtonAuto && this._prevButton && !this._prevButton.disposed) {
		parent.floatControl(this._prevButton, this._navConstraint(true));
	}
	if (this._nextButtonAuto && this._nextButton && !this._nextButton.disposed) {
		parent.floatControl(this._nextButton, this._navConstraint(false));
	}
};

/**
 * 처음/끝(또는 스크롤 불가) 버튼을 navigationEdgeBehavior 에 따라 disable/hide 처리.
 * 스크롤 위치가 아니라 목표 스냅 인덱스(_snapIndex) 기준 → 애니메이션/드래그 중에도 정확.
 */
Slidify.prototype._updateNavigationState = function() {
	var hide = (this.navigationEdgeBehavior === "hide");
	var atStart, atEnd;
	if (this.loop) {
		// loop 은 무한이므로 항상 활성
		atStart = false; atEnd = false;
	} else {
		// _isScrollable(getContentPaneRect 의존, 첫 로드에 불안정) 대신 _snapCount 로 판단.
		var count = this._snapCount();
		if (count <= 1) {
			atStart = true; atEnd = true;   // 스냅 1개 = 이동 불가 → 양쪽 막음
		} else {
			atStart = this._snapIndex <= 0;
			atEnd = this._snapIndex >= count - 1;
		}
	}
	this._applyNavButtonState(this._prevButton, atStart, hide);
	this._applyNavButtonState(this._nextButton, atEnd, hide);
};

/** 드래그 중 실시간으로 스냅 인덱스·버튼 상태 갱신 */
Slidify.prototype._refreshNav = function() {
	if (this._container.disposed) { return; }
	this._snapIndex = this.loop ? this._activePage() : this._closestSnapIndex(this._scrollPos());
	this._updateNavigationState();
};
Slidify.prototype._applyNavButtonState = function(btn, blocked, hide) {
	if (!btn || btn.disposed) { return; }
	if (hide) {
		if (typeof btn.visible !== "undefined") { btn.visible = !blocked; }
	} else {
		if (typeof btn.enabled !== "undefined") { btn.enabled = !blocked; }
		if (typeof btn.visible !== "undefined") { btn.visible = true; }
	}
};

/** 오버레이(자동 네비/페이지네이션) 재배치 — 초기 확정 후·리사이즈 시 */
Slidify.prototype._layoutOverlays = function() {
	if (this._container.disposed) { return; }
	if (this.showNavigation) { this._layoutNavButtons(); }
	if (this._pagination) {
		// paginationLeft 가 함수면 리사이즈마다 다시 계산해 반영
		if (typeof this.paginationLeft === "function") { this.refreshPagination(); }
		else { this._pagination.layout(); }
	}
	this._reservePaginationSpace();
};

/**
 * [PSE 확장] 페이지네이션 정렬(좌측 여백 등)과 위치를 다시 계산해 반영한다.
 * paginationLeft 를 함수로 지정했을 때, 컨텐츠 폭이 바뀐 뒤(예: 폭 가변 전환) 호출한다.
 */
Slidify.prototype.refreshPagination = function() {
	if (this._container.disposed || !this._pagination || !this._pagination.control || this._pagination.control.disposed) { return this; }
	if (!this._pagination._indexer) { this._pagination._applyLayout(); }
	this._pagination.layout();
	return this;
};

/**
 * "below" 자동 페이지네이션은 floatControl(position:absolute)로 배치되어 레이아웃 높이를 차지하지 않는다.
 * → 페이지네이션 실측 높이 + paginationOffset 만큼 슬라이더 컨테이너 하단 마진으로 공간을 예약해
 *   아래 콘텐츠와 겹치지 않게 한다. (overlay 이거나 외부 컨테이너면 예약 불필요)
 * ※ 렌더 확정 후(getActualRect 신뢰 가능)에 호출해야 한다. 부모 레이아웃이 margin 을 반영하는지는
 *    화면 레이아웃 종류에 따르므로, 정밀 배치가 필요하면 paginationContainer(외부 컨트롤)를 권장.
 */
Slidify.prototype._reservePaginationSpace = function() {
	if (this._container.disposed) { return; }
	var reserve = 0;
	var need = (this._pagination && this._pagination._auto && this.showPagination
			&& this.paginationPosition === "below"
			&& this._pagination.control && !this._pagination.control.disposed);
	if (need) {
		var ph = this._paginationHeight();
		// 높이 측정이 아직 0(렌더 전)이면 offset 만이라도 반영하고, 다음 프레임에 재측정한다.
		reserve = ph + (this.paginationOffset || 0);
		if (ph <= 0 && !this._reserveRetried) {
			this._reserveRetried = true;
			var self = this;
			cpr.core.DeferredUpdateManager.INSTANCE.asyncExec(function() {
				self._reserveRetried = false;
				if (!self._container.disposed) { self._reservePaginationSpace(); }
			});
		}
	}
	this._container.style.css({ "margin-bottom": reserve ? (reserve + "px") : "" });
};

/** 페이지네이션 컨트롤의 실측 높이(getActualRect → getViewPortRect 순, 0 이면 0). */
Slidify.prototype._paginationHeight = function() {
	if (!this._pagination || !this._pagination.control || this._pagination.control.disposed) { return 0; }
	var c = this._pagination.control;
	var r = c.getActualRect();
	if (r && r.height > 0) { return r.height; }
	if (typeof c.getViewPortRect === "function") {
		var vp = c.getViewPortRect();
		if (vp && vp.height > 0) { return vp.height; }
	}
	return 0;
};

/* =========================================================
 * 리사이즈
 * ======================================================= */
Slidify.prototype._onResize = function() {
	if (this._container.disposed) { return; }
	// breakpoint 경계를 넘었으면 트랙을 재구성
	if (this.breakpoints) {
		var newBp = this._pickBreakpoint();
		if (newBp !== this._currentBreakpoint) {
			this._currentBreakpoint = newBp;
			this._rebuild();
			this._emit("breakpoint");
			this._emit("resize");
			return;
		}
	}
	this._updateGrid();
	this.slideToSnap(this._snapIndex, 0);
	this._layoutOverlays();
	this._emit("resize");
};

Slidify.prototype._updateActivePageButton = function() {
	if (this._container.disposed || !this._pagination) { return; }
	this._pagination.update(this._activePage());
};

/* =========================================================
 * 페이지네이션 (컨트롤 기반)
 * @param {Slidify} owner
 * ======================================================= */
function SlidifyPagination(owner) {
	this._owner = owner;
	var external = owner._resolveControl(owner.paginationContainer);

	// (1) PageIndexer 컨트롤이면 불릿 주입이 아니라 컨트롤 API로 구동(indexer 모드)
	if (external && SlidifyPagination._isPageIndexer(external)) {
		this.control = external;
		this._auto = false;
		this._indexer = true;
		if (typeof this.control.visible !== "undefined") { this.control.visible = true; }
		this._bindIndexer();
		this._populate();   // indexer init
		return;
	}

	// (2) 일반 컨테이너(외부) 또는 자동 생성 컨테이너 → 불릿 주입 모드
	if (external) {
		// 외부(사용자가 화면에 배치한) 컨테이너 → relative(화면 레이아웃 흐름)로 그대로 사용, 위치는 건드리지 않음
		this.control = external;
		this._auto = false;
		if (typeof this.control.visible !== "undefined") { this.control.visible = true; }
	} else {
		this.control = new cpr.controls.Container();
		this._auto = true;
	}
	// 불릿 정렬용 FlowLayout + 스타일 클래스는 자동/외부 공통 적용
	// → 외부 컨테이너를 연결만 해도 별도 레이아웃 설정 없이 불릿이 가운데 정렬된다.
	this._applyLayout();
	this.control.style.addClass("slidify-pagination");
	this._populate();
	this.layout();   // 자동이면 부모에 올바른 constraint 로 float(하단 안쪽), 외부면 no-op
}
/**
 * 불릿 정렬용 FlowLayout 구성/재구성. [PSE 확장] breakpoint 전환 시 정렬/좌측 여백/간격이 바뀔 수 있어 별도 메소드로 분리.
 */
SlidifyPagination.prototype._applyLayout = function() {
	var owner = this._owner;
	var layout = new cpr.controls.layouts.FlowLayout();
	layout.lineWrap = false;
	layout.scrollable = false;
	layout.horizontalAlign = owner.paginationAlign || "center";
	// [PSE 확장] paginationLeft 는 숫자(px) 또는 숫자를 반환하는 함수 (함수면 호출 시점의 값을 사용 → 화면 폭에 따라 달라지는 위치 대응)
	var vPaginationLeft = owner.paginationLeft;
	if (typeof vPaginationLeft === "function") {
		vPaginationLeft = vPaginationLeft.call(owner);
	}
	layout.leftMargin = vPaginationLeft || 0;
	layout.verticalAlign = "middle";
	layout.horizontalSpacing = (owner.paginationSpacing != null) ? owner.paginationSpacing : 8;
	layout.verticalSpacing = 8;
	this.control.setLayout(layout);
};
/** @type cpr.controls.Container */
SlidifyPagination.prototype.control = null;

/** 연결된 컨트롤이 eXBuilder6 PageIndexer 인지 판별. */
SlidifyPagination._isPageIndexer = function(ctrl) {
	return !!(typeof cpr !== "undefined" && cpr.controls && cpr.controls.PageIndexer
			&& ctrl instanceof cpr.controls.PageIndexer);
};

/** 현재 스냅 개수(그리드 확정 전이면 근사). */
SlidifyPagination.prototype._snapTotal = function() {
	var owner = this._owner;
	return owner._slideControls ? owner._snapCount()
		: Math.ceil(owner._originalChildren.length / owner.slidesPerView);
};

/** PageIndexer 초기화(스냅 1개 = 1페이지: pageRowCount=1, totalRowCount=스냅수). */
SlidifyPagination.prototype._initIndexer = function() {
	var pi = this.control;
	if (!pi || pi.disposed) { return; }
	var count = this._snapTotal();
	if (count < 1) { count = 1; }
	var current = (this._owner._activePage() || 0) + 1;   // 1-based
	if (current > count) { current = count; }
	if (current < 1) { current = 1; }
	this._syncing = true;   // 프로그램적 변경이 selection-change 피드백 루프를 일으키지 않게
	pi.pageRowCount = 1;
	if (!pi.viewPageCount) { pi.viewPageCount = count; }
	if (typeof pi.init === "function") { pi.init(count, 1, current); }
	pi.totalRowCount = count;
	pi.currentPageIndex = current;
	this._syncing = false;
};

/** PageIndexer 의 페이지 선택 → 해당 스냅으로 이동. (1회만 바인딩) */
SlidifyPagination.prototype._bindIndexer = function() {
	if (this._indexerBound) { return; }
	var self = this;
	var owner = this._owner;
	this.control.addEventListener("selection-change", function(e) {
		if (self._syncing) { return; }               // 프로그램적 동기화는 무시
		var np = (e && e.newSelection != null) ? Number(e.newSelection) : NaN;
		if (isNaN(np)) { return; }
		var target = np - 1;                          // 1-based 페이지 → 0-based 스냅
		if (target < 0) { target = 0; }
		if (target === owner._snapIndex) { return; }
		owner.stopAutoPlay();
		owner.slideToSnap(target, owner.speed);
	});
	this._indexerBound = true;
};

/**
 * 자동 페이지네이션을 슬라이더 하단 안쪽에 배치/재배치.
 * style.css 가 아니라 올바른 constraint 로 부모에 floatControl(래퍼째 위치) → 밀려서 사라지지 않는다.
 * 위치=부모기준 getOffsetRect, 크기=신뢰가능한 getViewPortRect.
 */
SlidifyPagination.prototype.layout = function() {
	if (!this._auto || this.control.disposed || this._owner._container.disposed) { return; }
	var c = this._owner._container;
	var parent = c.getParent();
	if (!parent) { return; }
	var owner = this._owner;
	var pos = c.getOffsetRect();
	var crossH = owner._sliderCrossSize();   // 슬라이드 영역 실측 높이
	var ph = owner.paginationHeight || 20;
	var off = owner.paginationOffset || 0;
	// "below": 영역이 끝나는 지점에 딱(offset 만큼만 아래로) / "overlay": 영역 안쪽 하단(offset 만큼 위로)
	var top = (owner.paginationPosition === "below")
		? (pos.top + crossH + off)
		: (pos.top + crossH - ph - off);
	parent.floatControl(this.control, {
		left: pos.left + "px",
		top: top + "px",
		width: "100%",   // 모바일에서 getOffsetRect().width 가 부정확한 경우 대비 — 부모 폭 기준
		height: owner.paginationHeight ? (owner.paginationHeight + "px") : "auto"   // 기본: 높이는 CSS 로 통제
	});
};

SlidifyPagination.prototype._populate = function() {
	if (this._indexer) { this._initIndexer(); return; }   // PageIndexer 는 컨트롤 API로 구동
	var owner = this._owner;
	var loopMode = owner.loop && owner._isScrollable();
	// 스냅 개수 = 실제 이동 가능한 위치 수(끝을 넘는 스냅 제외).
	var count = owner._slideControls ? owner._snapCount() : Math.ceil(owner._originalChildren.length / owner.slidesPerView);
	var self = this;
	for (var idx = 0; idx < count; idx++) {
		(function(i) {
			var bullet = new cpr.controls.Button();
			bullet.style.addClass("slidify-bullet");
			// 접근성: 불릿은 자동 생성 버튼이라 라벨을 여기서 부여(스크린리더 대응).
			owner._applyA11y(bullet, (i + 1) + "페이지", (i + 1) + "페이지로 이동");
			// loop 모드는 물리 순서가 계속 회전하므로 특정 페이지로의 클릭 이동은 비활성(표시 전용)
			if (owner.paginationClickable && !loopMode) {
				bullet.addEventListener("click", function() {
					owner.stopAutoPlay();
					owner.slideToSnap(i, owner.speed);
				});
			}
			// 크기는 CSS(.slidify-bullet)로 통제. 여기서는 최소치만 잡아 active 시 CSS 로 키울 수 있게 한다.
			self.control.addChild(bullet, owner.paginationBulletSize
				? { width: owner.paginationBulletSize + "px", height: owner.paginationBulletSize + "px", autoSize: "none" }
				: { minWidth: "8px", minHeight: "8px", autoSize: "none" });
		})(idx);
	}
};

SlidifyPagination.prototype.update = function(activeIndex) {
	if (this.control.disposed) { return; }
	if (this._indexer) {
		// PageIndexer: 현재 페이지 동기화(피드백 루프 방지)
		this._syncing = true;
		this.control.currentPageIndex = (activeIndex || 0) + 1;   // 1-based
		this._syncing = false;
		return;
	}
	this.control.getChildren().forEach(function(each, idx) {
		if (idx === activeIndex) {
			each.style.addClass("active");
		} else {
			each.style.removeClass("active");
		}
	});
};

/** breakpoint 재구성 등으로 스냅 개수가 바뀌면 불릿(또는 PageIndexer 페이지수)을 다시 만든다. */
SlidifyPagination.prototype.rebuild = function() {
	if (this.control.disposed) { return; }
	if (this._indexer) { this._initIndexer(); return; }   // 페이지 수/현재 페이지 재설정
	this._applyLayout();   // breakpoint 로 바뀐 정렬/좌측 여백/간격 반영
	var children = this.control.getChildren();
	for (var i = children.length - 1; i >= 0; i--) {
		children[i].dispose();
	}
	this._populate();
};

/* =========================================================
 * 팩토리 / 노출
 * @param {cpr.controls.Container|String} target
 * @param {Object} options
 * ======================================================= */
exports.init = function(target, options) {
	var view = new Slidify(target, options);
	view.start();
	return view;
};
exports.Slidify = Slidify;
