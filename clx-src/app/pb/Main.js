/************************************************
 * main.js
 * Created at 2026. 11. 10. 오후 4:56:39.
 *
 * @author chwec
 ************************************************/

/** 이 폭(px) 이하이면 모바일 검색 버튼 표시 (스크린 구분과 무관하게 화면 폭 기준) */
var SEARCH_MOBILE_MAX_WIDTH = 767;
/** 화면 폭이 SEARCH_MOBILE_MAX_WIDTH 이하일 때만 보이는 버튼 ID (초과 시 숨김) */
var MOBILE_ONLY_BUTTON_IDS = ["btnMSearch", "btnMAdvSearch"];
/** 모바일 검색 버튼이 보일 때(폭 767px 이하) 숨기는 컨트롤 ID (초과 시 보임) */
var MOBILE_HIDE_IDS = ["iptSearch", "btnAdvSearch"];
/** 태블릿부터(PC가 아닐 때) 보이는 컨트롤 ID (PC에서는 숨김) */
var NOT_PC_SHOW_IDS = ["btnMMenu"];
/** 태블릿부터(PC가 아닐 때) 숨기는 컨트롤 ID (PC에서는 보임) */
var NOT_PC_HIDE_IDS = ["udcComGnb1"];

/**
 * 화면 폭이 이 값 이하이면 1320px 고정 폭 영역(grpHeader, grpFooter)을 가변 폭(100%)으로 전환
 * (header-wrap 의 좌우 padding 이 그대로 여백이 된다. 1400 = 1320 + 40 × 2)
 */
var FLUID_BREAKPOINT = 1400;
/** 폭을 가변으로 전환할 영역 ID */
var FLUID_WIDTH_IDS = ["grpHeader", "grpFooter"];
/** resize 핸들러 (dispose 시 해제용) */
var mfnFluidResize = null;

/** 모바일 메뉴 패널(grpMobileSideMenu) ID / 좌측에 떠 있을 때의 폭 */
var MOBILE_MENU_ID = "grpMobileSideMenu";
var MOBILE_MENU_WIDTH = "300px";
/** 고급 검색 패널(grpMobileAdvSearch) ID */
var ADV_SEARCH_ID = "grpMobileAdvSearch";
/** btnAdvSearch 로 열 때 패널의 상단 위치 (헤더 높이) */
var ADV_SEARCH_TOP = "64px";
/** 떠 있는 패널 정보 {id, panel, parent, index, constraint, dim} (닫을 때 원래 위치로 복원). 없으면 null — 한 번에 하나만 열림 */
var moFloatPanel = null;
/** 페이지 스크롤을 잠그기 전의 html/body overflow 값 (잠금 해제 시 복원). 잠겨 있지 않으면 null */
var moScrollBackup = null;

/*
 * 루트 컨테이너에서 load 이벤트 발생 시 호출.
 * 앱이 최초 구성된후 최초 랜더링 직후에 발생하는 이벤트 입니다.
 */
function onBodyLoad(/* cpr.events.CEvent */ e){
	applyMobileOnlyButtons(app.targetScreen.name);
	
	// 화면 폭에 따라 고정 폭(1320px) 영역을 가변으로 전환
	applyFluidWidth();
	var vnTimer = null;
	mfnFluidResize = function() {
		clearTimeout(vnTimer);
		vnTimer = setTimeout(function() {
			applyFluidWidth();
			applyMobileOnlyButtons(app.targetScreen.name);
		}, 100);
	};
	window.addEventListener("resize", mfnFluidResize);
	app.getContainer().addEventListenerOnce("dispose", function() {
		window.removeEventListener("resize", mfnFluidResize);
		clearTimeout(vnTimer);
	});
}

/*
 * 루트 컨테이너에서 screen-change 이벤트 발생 시 호출.
 * 스크린 크기 변경 시 전파되는 이벤트.
 */
function onBodyScreenChange(/* cpr.events.CScreenChangeEvent */ e){
	applyMobileOnlyButtons(e.screen.name);

	// PC 로 돌아오면 떠 있는 모바일 메뉴를 닫는다 (PC 에서는 GNB 사용)
	if (moFloatPanel && moFloatPanel.id == MOBILE_MENU_ID && AppProperties.SCREEN_DEFAULT_NM.indexOf(e.screen.name) != -1) {
		closeFloatPanel();
	}
	// 고급 검색은 스크린에 따라 띄우는 모양이 다르므로(PC/태블릿: 상단 전체 폭, 모바일: 전체 화면) 닫는다
	if (moFloatPanel && moFloatPanel.id == ADV_SEARCH_ID) {
		closeFloatPanel();
	}
	
	// 반응형 모듈이 레이아웃을 바꾼 뒤에 적용
	cpr.core.DeferredUpdateManager.INSTANCE.asyncExec(applyFluidWidth);
}

/**
 * 스크린에 따라 컨트롤의 표시 여부를 정한다.
 *  - MOBILE_ONLY_BUTTON_IDS : 화면 폭 767px 이하에서만 표시
 *  - MOBILE_HIDE_IDS        : 화면 폭 767px 이하에서 숨김 (모바일 검색 버튼과 반대로 동작)
 *  - NOT_PC_SHOW_IDS        : 태블릿부터(PC가 아닐 때) 표시
 *  - NOT_PC_HIDE_IDS        : 태블릿부터(PC가 아닐 때) 숨김
 * @param {String} psScreenName 스크린 명
 */
function applyMobileOnlyButtons(psScreenName) {
	var vbMobile = window.innerWidth <= SEARCH_MOBILE_MAX_WIDTH;
	var vbNotPc = AppProperties.SCREEN_DEFAULT_NM.indexOf(psScreenName) == -1;
	
	setVisibleByIds(MOBILE_ONLY_BUTTON_IDS, vbMobile);
	setVisibleByIds(MOBILE_HIDE_IDS, !vbMobile);
	setVisibleByIds(NOT_PC_SHOW_IDS, vbNotPc);
	setVisibleByIds(NOT_PC_HIDE_IDS, !vbNotPc);
}

/**
 * ID 목록의 컨트롤 표시 여부를 한꺼번에 바꾼다.
 * @param {String[]} paIds 컨트롤 ID 배열
 * @param {Boolean} pbVisible 표시 여부
 */
function setVisibleByIds(paIds, pbVisible) {
	paIds.forEach(function(psId) {
		var vcCtrl = app.lookup(psId);
		if (vcCtrl) {
			vcCtrl.visible = pbVisible;
		}
	});
}

/************************************************
 * 영역 폭 가변 (FLUID_BREAKPOINT 이하)
 ************************************************/

/**
 * 컨트롤의 폭 제약조건을 가변/원래 값으로 전환한다. (원래 값은 최초 호출 시 userData 에 보관)
 * @param {cpr.controls.UIControl} pcCtrl 대상 컨트롤
 * @param {Boolean} pbFluid true: 가변 폭 적용, false: 원래 폭 복원
 * @param {String} psFluidWidth 가변일 때 폭 (CSS 값)
 */
function setFluidWidth(pcCtrl, pbFluid, psFluidWidth) {
	var vcParent = pcCtrl.getParent();
	if (!vcParent) return;
	
	var voConstraint = vcParent.getConstraint(pcCtrl);
	if (!voConstraint) return;
	
	var vsOrigin = pcCtrl.userData("fluid.originWidth");
	if (ValueUtil.isNull(vsOrigin)) {
		vsOrigin = voConstraint.width;
		pcCtrl.userData("fluid.originWidth", vsOrigin);
	}
	
	var vsTarget = pbFluid ? psFluidWidth : vsOrigin;
	if (voConstraint.width !== vsTarget) {
		vcParent.updateConstraint(pcCtrl, { width: vsTarget });
	}
}

/**
 * 화면 폭이 FLUID_BREAKPOINT 이하이면 FLUID_WIDTH_IDS 영역을 가변(100%)으로, 초과하면 원래 폭으로 되돌린다.
 */
function applyFluidWidth() {
	var vbFluid = window.innerWidth <= FLUID_BREAKPOINT;
	
	FLUID_WIDTH_IDS.forEach(function(psId) {
		var vcCtrl = app.lookup(psId);
		if (vcCtrl) {
			setFluidWidth(vcCtrl, vbFluid, "100%");
		}
	});
}

/*
 * "Button" 버튼(btnMMenu)에서 click 이벤트 발생 시 호출.
 * 사용자가 컨트롤을 클릭할 때 발생하는 이벤트.
 */
function onBtnMMenuClick(e) {
	openMobileMenu();
}

/*
 * 모바일 메뉴 상단의 닫기 버튼(btnMobileMenuClose)에서 click 이벤트 발생 시 호출.
 */
function onBtnMobileMenuCloseClick(e) {
	closeFloatPanel();
}

/*
 * 고급 검색 버튼(btnAdvSearch, btnMAdvSearch)에서 click 이벤트 발생 시 호출.
 */
function onBtnAdvSearchClick(e) {
	// btnMAdvSearch(767px 이하에서 표시)로 열면 전체 화면, btnAdvSearch로 열면 헤더(64px) 아래 전체 폭
	openAdvSearch(e.control.id == "btnMAdvSearch");
}

/************************************************
 * 플로팅 패널 (모바일 메뉴 / 고급 검색)
 ************************************************/

/**
 * 패널을 원래 자리에서 꺼내 앱 위에 띄운다. (뒤에 어두운 배경을 깔고, 배경을 누르면 닫힘)
 * 닫을 때 원래 위치로 되돌린다. 다른 패널이 떠 있으면 먼저 닫는다.
 * @param {String} psId 띄울 패널 ID
 * @param {Object} poConstraint 떠 있을 때의 위치/크기 (XY 제약)
 * @param {String} [psDimTop] 어두운 배경의 상단 위치 (기본 "0px"). 헤더를 가리지 않으려면 헤더 높이를 지정
 */
function openFloatPanel(psId, poConstraint, psDimTop) {
	if (moFloatPanel) closeFloatPanel();

	var vcPanel = app.lookup(psId);
	if (!vcPanel || vcPanel.isFloated()) return;

	var vcParent = vcPanel.getParent();
	var vcDim = new cpr.controls.Container();
	vcDim.setLayout(new cpr.controls.layouts.XYLayout());
	vcDim.style.addClass("mobile-dim");
	vcDim.addEventListener("click", closeFloatPanel);

	moFloatPanel = {
		id: psId,
		panel: vcPanel,
		parent: vcParent,
		index: vcParent.getChildren().indexOf(vcPanel),
		constraint: vcParent.getConstraint(vcPanel),
		dim: vcDim,
		blocker: null
	};

	vcPanel.visible = true;
	app.floatControl(vcDim, {
		top: psDimTop || "0px",
		right: "0px",
		bottom: "0px",
		left: "0px"
	});
	
	// 헤더를 가리지 않고 아래에서 열 때는 헤더 조작(GNB, 검색 등)을 막는 투명 덮개를 헤더 위에 올린다
	if (psDimTop && psDimTop !== "0px") {
		var vcBlocker = new cpr.controls.Container();
		vcBlocker.setLayout(new cpr.controls.layouts.XYLayout());
		vcBlocker.style.addClass("header-block");
		moFloatPanel.blocker = vcBlocker;
		app.floatControl(vcBlocker, {
			top: "0px",
			right: "0px",
			left: "0px",
			height: psDimTop
		});
	}
	app.floatControl(vcPanel, poConstraint);
	
	// 고급 검색이 열려 있는 동안 뒤의 페이지 스크롤을 막는다
	if (psId == ADV_SEARCH_ID) {
		lockPageScroll(true);
	}
}

/**
 * 페이지(html, body) 스크롤을 잠그거나 푼다. (잠그기 전의 overflow 값을 보관했다가 복원)
 * @param {Boolean} pbLock true: 잠금, false: 해제
 */
function lockPageScroll(pbLock) {
	var vaEls = [document.documentElement, document.body];
	if (pbLock) {
		if (moScrollBackup) return;
		moScrollBackup = vaEls.map(function(el) {
			return el.style.overflow;
		});
		vaEls.forEach(function(el) {
			el.style.overflow = "hidden";
		});
	} else {
		if (!moScrollBackup) return;
		vaEls.forEach(function(el, idx) {
			el.style.overflow = moScrollBackup[idx];
		});
		moScrollBackup = null;
	}
}

/**
 * 떠 있는 패널을 닫고 원래 위치로 되돌린다. (떠 있는 패널이 없으면 아무것도 하지 않음)
 */
function closeFloatPanel() {
	if (!moFloatPanel) return;

	var voInfo = moFloatPanel;
	moFloatPanel = null;
	lockPageScroll(false);

	voInfo.parent.insertChild(voInfo.index, voInfo.panel, voInfo.constraint);
	voInfo.panel.visible = false;
	app.getContainer().removeChild(voInfo.dim, true);
	if (voInfo.blocker) {
		app.getContainer().removeChild(voInfo.blocker, true);
	}
}

/**
 * 모바일 메뉴(grpMobileSideMenu)를 화면 좌측에 붙여 띄운다. (폭 MOBILE_MENU_WIDTH)
 */
function openMobileMenu() {
	openFloatPanel(MOBILE_MENU_ID, {
		top: "0px",
		left: "0px",
		bottom: "0px",
		width: MOBILE_MENU_WIDTH
	});
}

/**
 * 고급 검색(grpMobileAdvSearch)을 띄운다.
 * - btnAdvSearch  : 헤더 높이(ADV_SEARCH_TOP)만큼 아래에서 전체 폭으로
 * - btnMAdvSearch : 화면 전체를 차지해서 최상단에
 * @param {Boolean} pbFull true: 화면 전체, false: 헤더 아래 전체 폭
 */
function openAdvSearch(pbFull) {
	openFloatPanel(ADV_SEARCH_ID, pbFull ? {
		top: "0px",
		right: "0px",
		bottom: "0px",
		left: "0px"
	} : {
		top: ADV_SEARCH_TOP,
		right: "0px",
		left: "0px"
	}, pbFull ? "0px" : ADV_SEARCH_TOP);	// 헤더 아래로 열 때는 헤더를 딤 처리하지 않음
}
/** 고급 검색 화면(임베디드 앱 AdvancedSearch)의 닫기 버튼에서 callAppMethod("closeAdvSearch") 로 호출된다. */
exports.closeAdvSearch = closeFloatPanel;
