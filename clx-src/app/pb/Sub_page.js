/************************************************
 * Sub_page.js
 * Created at 2026. 11. 23. 오전 11:30:10.
 *
 * @author chwec
 ************************************************/

/** 화면 폭이 이 값(px) 이하이면 사이드 내비게이션(grpSideNav)이 있는 구획(좌측 칸)을 숨김 */
var SIDE_NAV_HIDE_MAX_WIDTH = 1024;
/**
 * 화면 폭이 이 값 이하이면 1320px 고정 폭 영역(grpSubWrap)을 가변 폭(100%)으로 전환
 * (content-wrap 의 좌우 padding 40px 이 그대로 여백이 된다. 1400 = 1320 + 40 × 2)
 */
var FLUID_BREAKPOINT = 1400;
/** 폭을 가변으로 전환할 영역 ID */
var FLUID_WIDTH_IDS = ["grpSubWrap"];
/** resize 핸들러 (dispose 시 해제용) */
var mfnResize = null;

/*
 * 루트 컨테이너에서 load 이벤트 발생 시 호출.
 * 앱이 최초 구성된후 최초 랜더링 직후에 발생하는 이벤트 입니다.
 */
function onBodyLoad(/* cpr.events.CEvent */ e){
	applyResponsive();
	
	var vnTimer = null;
	mfnResize = function() {
		clearTimeout(vnTimer);
		vnTimer = setTimeout(applyResponsive, 100);
	};
	window.addEventListener("resize", mfnResize);
	app.getContainer().addEventListenerOnce("dispose", function() {
		window.removeEventListener("resize", mfnResize);
		clearTimeout(vnTimer);
	});
}

/*
 * 루트 컨테이너에서 screen-change 이벤트 발생 시 호출.
 * 스크린 크기 변경 시 전파되는 이벤트.
 */
function onBodyScreenChange(/* cpr.events.CScreenChangeEvent */ e){
	// 반응형 모듈이 레이아웃을 바꾼 뒤에 적용
	cpr.core.DeferredUpdateManager.INSTANCE.asyncExec(applyResponsive);
}

/**
 * 화면 폭에 따른 반응형 처리를 한꺼번에 적용한다. (고정 폭 영역 가변 전환 + 사이드 내비게이션 칸 숨김)
 */
function applyResponsive() {
	applyFluidWidth();
	applySideNavVisible();
}

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

/**
 * 화면 폭이 SIDE_NAV_HIDE_MAX_WIDTH 이하이면 grpSideNav 가 놓인 좌측 칸(레이아웃의 첫 번째 열)을 숨기고, 초과하면 다시 보인다.
 * (컨트롤의 visible 대신 레이아웃의 열 숨김을 사용 — 칸 간격까지 함께 사라지고, 되돌릴 때 배치가 어긋나지 않음)
 */
function applySideNavVisible() {
	var vcSideNav = app.lookup("grpSideNav");
	if (!vcSideNav) return;
	
	var vcParent = vcSideNav.getParent();
	if (!vcParent) return;
	
	vcParent.getLayout().setColumnVisible(0, window.innerWidth > SIDE_NAV_HIDE_MAX_WIDTH);
}
