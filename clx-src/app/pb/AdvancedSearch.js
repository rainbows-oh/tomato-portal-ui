/************************************************
 * AdvancedSearch.js
 * Created at 2026. 11. 13. 오후 3:41:34.
 *
 * @author chwec
 ************************************************/

/**
 * 화면 폭이 이 값 이하이면 1320px 고정 폭 영역(grpAdvSearchWrap)을 가변 폭(100%)으로 전환
 * (고급 검색을 띄우는 쪽(Main)의 좌우 padding 이 그대로 여백이 된다. 1400 = 1320 + 40 × 2)
 */
var FLUID_BREAKPOINT = 1400;
/** 폭을 가변으로 전환할 영역 ID */
var FLUID_WIDTH_IDS = ["grpAdvSearchWrap"];
/** resize 핸들러 (dispose 시 해제용) */
var mfnFluidResize = null;

/*
 * 루트 컨테이너에서 load 이벤트 발생 시 호출.
 * 앱이 최초 구성된후 최초 랜더링 직후에 발생하는 이벤트 입니다.
 */
function onBodyLoad(/* cpr.events.CEvent */ e){
	// 화면 폭에 따라 고정 폭(1320px) 영역을 가변으로 전환
	applyFluidWidth();
	var vnTimer = null;
	mfnFluidResize = function() {
		clearTimeout(vnTimer);
		vnTimer = setTimeout(applyFluidWidth, 100);
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
	// 반응형 모듈이 레이아웃을 바꾼 뒤에 적용
	cpr.core.DeferredUpdateManager.INSTANCE.asyncExec(applyFluidWidth);
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

/*
 * 닫기 버튼(btnAdvSearchClose)에서 click 이벤트 발생 시 호출.
 * 고급 검색 패널을 띄운 메인(Main)의 closeAdvSearch 를 호출해 닫는다.
 */
function onBtnAdvSearchCloseClick(e) {
	var vcRootApp = app.getRootAppInstance();
	if (vcRootApp && vcRootApp !== app && vcRootApp.hasAppMethod("closeAdvSearch")) {
		vcRootApp.callAppMethod("closeAdvSearch");
	}
}
