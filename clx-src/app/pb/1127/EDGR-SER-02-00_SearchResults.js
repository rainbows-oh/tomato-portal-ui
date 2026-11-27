/************************************************
 * EDGE-CDL-01-00_Disclosures_CompanyAnnouncements.js
 * Created at 2026. 11. 23. 오후 1:04:44.
 *
 * @author chwec
 ************************************************/

/*
 * 루트 컨테이너에서 load 이벤트 발생 시 호출.
 * 앱이 최초 구성된후 최초 랜더링 직후에 발생하는 이벤트 입니다.
 */
function onBodyLoad(/* cpr.events.CEvent */ e){
	// 시작 스크린이 모바일인 경우에도 적용 (screen-change 는 변경 시에만 발생)
	applyMenuLayout(app.targetScreen.name);
}

/*
 * 루트 컨테이너에서 screen-change 이벤트 발생 시 호출.
 * 스크린 크기 변경 시 전파되는 이벤트.
 */
function onBodyScreenChange(/* cpr.events.CScreenChangeEvent */ e){
	// 반응형 모듈이 레이아웃을 바꾼 뒤에 적용
	var vsScreenName = e.screen.name;
	cpr.core.DeferredUpdateManager.INSTANCE.asyncExec(function() {
		applyMenuLayout(vsScreenName);
	});
}

/*
 * 콤보 박스(cmbMobMenu)에서 selection-change 이벤트 발생 시 호출.
 * 모바일에서는 탭 헤더 대신 콤보 박스로 탭을 전환한다.
 */
function onCmbMobMenuSelectionChange(/* cpr.events.CSelectionEvent */ e){
	var vcCombo = e.control;
	var vcTab = app.lookup("grpSectionBody");

	// 콤보 항목 순서 = 탭 아이템 순서
	var vnIndex = vcCombo.getItems().indexOf(vcCombo.getItemByValue(vcCombo.value));
	var voTabItem = vcTab.getTabItems()[vnIndex];
	if (voTabItem) {
		vcTab.setSelectedTabItem(voTabItem);
	}
}

/**
 * 모바일 스크린이면 카테고리 콤보 영역(grpMobMenuSelect)을 보이고 탭 헤더를 숨긴다.
 * 그 외에는 반대로 되돌린다.
 * @param {String} psScreenName 스크린 명
 */
function applyMenuLayout(psScreenName) {
	var vcMenu = app.lookup("grpMobMenuSelect");
	var vcTab = app.lookup("grpSectionBody");
	var vbMobile = AppProperties.SCREEN_MOBILE_NM.indexOf(psScreenName) != -1;

	if (vbMobile) {
		// 콤보 값을 현재 선택된 탭에 맞춘다
		var vcCombo = app.lookup("cmbMobMenu");
		var vnIndex = vcTab.getTabItems().indexOf(vcTab.getSelectedTabItem());
		var voItem = vcCombo.getItems()[vnIndex];
		if (voItem) {
			vcCombo.value = voItem.value;
		}
	}

	vcMenu.visible = vbMobile;
	vcTab.hideHeader = vbMobile;
	
	// 헤더를 다시 보일 때는 바로 다시 그린다. 그리기가 지연되면 resize 처리가 먼저 실행되어
	// 아직 없는 화살표 버튼을 참조하는 런타임 에러(TabFolder._updateArrowButtons)가 발생한다.
	if (!vbMobile) {
		cpr.core.DeferredUpdateManager.INSTANCE.update();
	}
}
