/************************************************
 * EDGE-CPN-02-01_CompanyDetail.js
 * Created at 2026. 11. 23. 오후 1:04:44.
 *
 * @author chwec
 ************************************************/

/** 로고 이미지(img1) 영역: 로고가 놓인 칸(열) 폭 / 이미지 높이 — PC·태블릿 / 모바일 */
var LOGO_COLUMN_WIDTH = "160px";
var LOGO_COLUMN_WIDTH_MOBILE = "120px";
var LOGO_HEIGHT = 80;
var LOGO_HEIGHT_MOBILE = 60;

/*
 * 루트 컨테이너에서 load 이벤트 발생 시 호출.
 * 앱이 최초 구성된후 최초 랜더링 직후에 발생하는 이벤트 입니다.
 */
function onBodyLoad(/* cpr.events.CEvent */ e){
	// 시작 스크린이 모바일인 경우에도 적용 (screen-change 는 변경 시에만 발생)
	applyLogoLayout(app.targetScreen.name);
}

/*
 * 루트 컨테이너에서 screen-change 이벤트 발생 시 호출.
 * 스크린 크기 변경 시 전파되는 이벤트.
 */
function onBodyScreenChange(/* cpr.events.CScreenChangeEvent */ e){
	// 반응형 모듈이 레이아웃을 바꾼 뒤에 적용
	var vsScreenName = e.screen.name;
	cpr.core.DeferredUpdateManager.INSTANCE.asyncExec(function() {
		applyLogoLayout(vsScreenName);
	});
}

/**
 * 모바일 스크린이면 로고 이미지(img1)가 놓인 칸(열)을 LOGO_COLUMN_WIDTH_MOBILE(120px)로,
 * 이미지 높이를 LOGO_HEIGHT_MOBILE(60px)로 바꾸고, 그 외에는 원래 값(160px / 80px)으로 되돌린다.
 * @param {String} psScreenName 스크린 명
 */
function applyLogoLayout(psScreenName) {
	var vcImg = app.lookup("img1");
	if (!vcImg) return;
	
	var vcParent = vcImg.getParent();
	if (!vcParent) return;
	
	var vbMobile = AppProperties.SCREEN_MOBILE_NM.indexOf(psScreenName) != -1;
	
	// 첫 번째 열(1fr)은 그대로, 로고 열(두 번째)만 폭을 바꾼다
	vcParent.getLayout().setColumns(["1fr", vbMobile ? LOGO_COLUMN_WIDTH_MOBILE : LOGO_COLUMN_WIDTH]);
	vcParent.updateConstraint(vcImg, { height: vbMobile ? LOGO_HEIGHT_MOBILE : LOGO_HEIGHT });
}
