/*******************************************************************************
 * Business Category :
 * Screen ID : udcComStatusSelection.js
 * Screen Name : 
 * Created Date :  2026. 10. 16. 오후 3:21:26
 * Creator : chwec
 * Revision History
 *******************************************************************************
 * Date				Name				Description
 *******************************************************************************
 * 
 *******************************************************************************/

/*******************************************************************************
 * Common Module Area
 *******************************************************************************/
 var util = createCommonUtil();

/*******************************************************************************
 * Business Common Module Area
 *******************************************************************************/
exports.getText = getText;


/*******************************************************************************
 * Local Variable Declarations within File
 *******************************************************************************/
/** 필터 카드(grpCard). 최초 표시 시 lookup 으로 얻어 보관한다. */
var vcCard = null;
/** 카드 높이(px). 고정 — 내용이 더 길면 카드 안에서 스크롤 (grpCard 의 레이아웃 scrollable) */
var VC_CARD_HEIGHT = 357;
/**no data 메시지 나올 때의 높이**/
//var VC_CARD_HEIGHT = 56;
/** 카드 너비(px) — PC/태블릿. 모바일(EXB-PART = 767px 이하)에서는 화면 폭에 맞춰 좌우 여백(VC_CARD_MARGIN_MOBILE)만 두고 자동으로 늘어나고 줄어든다 */
var VC_CARD_WIDTH = 440;
var VC_CARD_MARGIN_MOBILE = 16;
/** 모바일 스크린 이름 목록 (프로젝트 공통 설정: mobile, EXB-PART 등) */
var VC_SCREEN_MOBILE = AppProperties.SCREEN_MOBILE_NM;
/** 입력 영역(grpInputArea) 첫 번째 열(콤보박스) 너비 — PC/태블릿, 모바일 */
var VC_INPUT_COL_WIDTH = "160px";
var VC_INPUT_COL_WIDTH_MOBILE = "100px";
/** 선택 칩 영역(grpSelectChips)이 놓인 루트 폼레이아웃의 행 인덱스 */
var VC_CHIP_ROW_INDEX = 2;
/** 스크롤 추적 리스너 (카드 표시 중에만 등록) */
var vcScrollHandler = null;
/** requestAnimationFrame 중복 예약 방지 플래그 */
var vcScrollPending = false;
/** 카드 바깥 클릭 감지 리스너 (카드 표시 중에만 등록) */
var vcOutsideHandler = null;
/** 회사명 인풋을 눌렀는지 여부 (인풋 클릭은 카드 바깥 클릭으로 보지 않기 위한 플래그) */
var vbInputPressed = false;

/*******************************************************************************
 * Onload and Submission Call Area
 * (Contains related events and submission calls, along with callback functions invoked upon screen loading.)
 *******************************************************************************/


/*******************************************************************************
 * Validation Check Area
 *******************************************************************************/


/*******************************************************************************
 * User-Defined JavaScript Functions
 *******************************************************************************/
/**
 * Returns the text to be displayed for the UDC control in the grid's view mode.
 */
function getText() {
	// TODO: Write code to return the text to be displayed in the grid's view mode.
	return "";
};

/**
 * 필터 카드를 UDC 바로 아래에 플로팅하고 표시한다.
 * UDC 가 놓인 영역의 높이/레이아웃에 영향받지 않도록 최상위 앱(AppInstance)에 띄운다.
 * (이미 플로팅된 컨트롤이면 위치만 갱신된다)
 */
function openCard() {
	if (!vcCard) vcCard = app.lookup("grpCard");

	var vcHost = app.getHost();	// UDC 컨트롤 (단독 실행 시 null)
	var vcAnchor = vcHost ? vcHost : app.lookup("ipbCompanyName");
	var vcTargetApp = vcHost ? app.getRootAppInstance() : app;
	var vcRect = vcAnchor.getActualRect();

	var vbMobile = (VC_SCREEN_MOBILE.indexOf(vcTargetApp.targetScreen.name) != -1);
	var vsTop = (vcRect.bottom + 4) + "px";
	
	vcCard.visible = true;
	if (vbMobile) {
		/* 모바일: 좌우 여백만 두고 화면 폭에 맞춰 자동으로 늘어나고 줄어든다 */
		vcTargetApp.floatControl(vcCard, {
			left: VC_CARD_MARGIN_MOBILE + "px",
			right: VC_CARD_MARGIN_MOBILE + "px",
			top: vsTop,
			height: VC_CARD_HEIGHT + "px"
		});
	} else {
		vcTargetApp.floatControl(vcCard, {
			left: vcRect.left + "px",
			top: vsTop,
			width: VC_CARD_WIDTH + "px",
			height: VC_CARD_HEIGHT + "px"
		});
	}
};

/**
 * 카드 안의 회사 아이템(company-item 클래스를 가진 그룹)을 순서대로 반환한다.
 * @return {cpr.controls.Container[]} 회사 아이템 그룹 목록
 */
function doGetCompanyItems() {
	return vcCard.getChildren().filter(function(each) {
		return each.style.hasClass("company-item");
	});
}

/**
 * 회사 아이템 그룹에서 회사명 아웃풋의 텍스트를 반환한다. (그룹의 직계 자식 아웃풋 중 fw-bold 클래스)
 * 카드는 floatControl 로 최상위 앱에 올라가 UDC 앱의 lookup 으로 찾을 수 없으므로 자식 컨트롤을 직접 탐색한다.
 * @param {cpr.controls.Container} pcItem 회사 아이템 그룹
 * @return {String} 회사명. 없으면 빈 문자열.
 */
function doGetCompanyName(pcItem) {
	var vaChildren = pcItem.getChildren();
	for (var i = 0; i < vaChildren.length; i++) {
		if (vaChildren[i].type === "output" && vaChildren[i].style.hasClass("fw-bold")) {
			return vaChildren[i].value || "";
		}
	}
	return "";
}

/**
 * 모든 회사 아이템의 active 클래스를 제거한다.
 */
function doClearActiveItems() {
	doGetCompanyItems().forEach(function(each) {
		each.style.removeClass("active");
	});
}

/**
 * 입력한 글자가 회사명에 포함된 첫 번째 아이템에만 active 클래스를 추가한다. (일치하는 아이템이 없으면 모두 해제)
 * @param {String} psKeyword 입력한 글자 (소문자)
 */
function doActivateFirstMatch(psKeyword) {
	var vbFound = false;
	
	doGetCompanyItems().forEach(function(each) {
		var vbMatch = !vbFound && doGetCompanyName(each).toLowerCase().indexOf(psKeyword) > -1;
		
		if (vbMatch) {
			each.style.addClass("active");
			vbFound = true;
		} else {
			each.style.removeClass("active");
		}
	});
}

/**
 * 화면 크기에 맞춰 입력 영역(grpInputArea)의 첫 번째 열 너비를 적용한다. (모바일 100px, 그 외 160px)
 */
function doApplyInputAreaLayout() {
	var vcLayout = app.lookup("grpInputArea").getLayout();
	var vsWidth = (VC_SCREEN_MOBILE.indexOf(app.targetScreen.name) != -1) ? VC_INPUT_COL_WIDTH_MOBILE : VC_INPUT_COL_WIDTH;

	vcLayout.setColumns([vsWidth, "1fr"]);
	/* setColumns 는 열 정의를 다시 만들어 숨김 상태가 초기화되므로, 앱 속성(sectorVisible)에 따라 콤보박스 열 표시 여부를 다시 적용 */
	doApplySectorVisible();
};

/**
 * 앱 속성(sectorVisible)에 따라 Sector 콤보박스(cmbSector)가 놓인 첫 번째 열의 표시 여부를 적용한다.
 */
function doApplySectorVisible() {
	app.lookup("grpInputArea").getLayout().setColumnVisible(0, app.getAppProperty("sectorVisible") === true);
};

/**
 * 앱 속성(placeholder)을 회사명 인풋(ipbCompanyName)의 placeholder 에 반영한다. 값이 비어 있으면 placeholder 를 지운다.
 */
function doApplyPlaceholder() {
	app.lookup("ipbCompanyName").placeholder = app.getAppProperty("placeholder") || "";
};

/**
 * 선택 칩 영역(grpSelectChips)을 표시한다.
 */
function doShowChipArea() {
	app.getContainer().getLayout().setRowVisible(VC_CHIP_ROW_INDEX, true);
};

/**
 * 필터 카드를 숨긴다. (플로팅 상태는 유지하고 visible 만 끈다 — 제거 후 재플로팅 시 렌더가 복구되지 않는 문제 회피)
 */
function closeCard() {
	if (vcCard) vcCard.visible = false;
	unbindScrollFollow();
	unbindOutsideClick();
};

/**
 * 노드가 필터 카드(company-card 클래스) 안에 속하는지 확인한다.
 * @param {Node} pnNode 이벤트 발생 노드
 * @return {Boolean}
 */
function doIsInsideCard(pnNode) {
	var vnNode = pnNode;
	while (vnNode) {
		if (typeof vnNode.className === "string" && (" " + vnNode.className + " ").indexOf(" company-card ") > -1) {
			return true;
		}
		vnNode = vnNode.parentNode;
	}
	return false;
};

/**
 * 카드 바깥을 눌렀을 때 카드를 닫는 리스너를 등록한다. (카드 안, 회사명 인풋을 누른 경우는 제외)
 * 인풋의 mousedown(컨트롤 이벤트)이 document 리스너보다 먼저 실행되어 vbInputPressed 로 구분한다.
 */
function bindOutsideClick() {
	if (vcOutsideHandler) return;

	vcOutsideHandler = function(ev) {
		if (vbInputPressed) {
			vbInputPressed = false;
			return;
		}
		if (doIsInsideCard(ev.target)) return;
		closeCard();
	};
	document.addEventListener("mousedown", vcOutsideHandler, false);
};

/**
 * 카드 바깥 클릭 감지 리스너를 해제한다.
 */
function unbindOutsideClick() {
	if (!vcOutsideHandler) return;

	document.removeEventListener("mousedown", vcOutsideHandler, false);
	vcOutsideHandler = null;
	vbInputPressed = false;
};

/**
 * 스크롤 시 카드가 UDC(앵커) 위치를 따라가도록 갱신하는 리스너를 등록한다.
 * 플로팅 레이어는 스크롤 영역 밖에 있으므로, 중첩 스크롤까지 잡도록 capture 로 등록한다.
 * (브라우저 스크롤이 먼저 그려져 미세하게 흔들릴 수 있다)
 */
function bindScrollFollow() {
	if (vcScrollHandler) return;

	vcScrollHandler = function() {
		if (vcScrollPending) return;
		vcScrollPending = true;
		window.requestAnimationFrame(function() {
			vcScrollPending = false;
			if (!vcScrollHandler) return;	// 그 사이 해제됨
			if (app.getContainer().disposed) {
				unbindScrollFollow();
				return;
			}
			if (vcCard && vcCard.visible) openCard();
		});
	};
	window.addEventListener("scroll", vcScrollHandler, true);
};

/**
 * 스크롤 추적 리스너를 해제한다.
 */
function unbindScrollFollow() {
	if (!vcScrollHandler) return;

	window.removeEventListener("scroll", vcScrollHandler, true);
	vcScrollHandler = null;
};

/*******************************************************************************
 * Automatically Generated Event JavaScript Functions
 * (Event functions are automatically displayed below when events are created.)
 *******************************************************************************/

/*
 * 루트 컨테이너에서 load 이벤트 발생 시 호출.
 * 앱이 최초 구성되었을 때 화면 크기에 맞는 입력 영역 열 너비를 적용한다.
 */
function onBodyLoad(e) {
	doApplyInputAreaLayout();
	doApplyPlaceholder();
}

/*
 * 루트 컨테이너에서 property-change 이벤트 발생 시 호출.
 * 앱 속성(sectorVisible, placeholder)이 바뀌면 화면에 반영한다.
 */
function onBodyPropertyChange(e) {
	if (e.property === "sectorVisible") {
		doApplySectorVisible();
	}
	if (e.property === "placeholder") {
		doApplyPlaceholder();
	}
}

/*
 * 회사명 인풋(ipbCompanyName)에서 mousedown 이벤트 발생 시 호출.
 * 인풋을 누르는 것은 카드 바깥 클릭으로 보지 않도록 표시한다.
 */
function onIpbCompanyNameMousedown(e) {
	vbInputPressed = true;
}

/*
 * 루트 컨테이너에서 screen-change 이벤트 발생 시 호출.
 * 화면 크기(스크린)가 바뀌면 입력 영역 열 너비를 다시 적용한다.
 */
function onBodyScreenChange(e) {
	/* 카드가 열려 있으면 바뀐 화면 크기에 맞게 폭/위치를 다시 적용 */
	if (vcCard && vcCard.visible) openCard();
	doApplyInputAreaLayout();
}

/*
 * 회사 아이템 그룹(company-item)에서 click 이벤트 발생 시 호출.
 * 선택한 그룹에 active 클래스를 추가하고, 이전에 선택된 그룹은 company-item 단일 클래스로 되돌린다.
 */
function onCompanyItemClick(e) {
	var vcSelected = e.control;

	vcSelected.getParent().getChildren().forEach(function(each) {
		if (each !== vcSelected && each.style.hasClass("company-item")) {
			each.style.removeClass("active");
		}
	});
	vcSelected.style.addClass("active");

	/* 아이템이 선택되면 선택 칩 영역 표시 */
	doShowChipArea();
}

/*
 * 회사명 인풋(ipbCompanyName)에서 input 이벤트 발생 시 호출. (한 글자 입력할 때마다 반영)
 * 입력한 글자(대소문자 무시)가 회사명에 포함된 아이템을 찾아 첫 번째 일치 아이템에만 active 클래스를 추가한다.
 * 입력이 있으면 필터 카드를 열고, 비우면 active 를 모두 제거하고 카드를 닫는다.
 */
function onIpbCompanyNameInput(e) {
	var vsKeyword = (e.control.displayingText || "").toLowerCase();
	
	if (!vcCard) vcCard = app.lookup("grpCard");
	
	if (vsKeyword == "") {
		doClearActiveItems();
		closeCard();
		return;
	}

	openCard();
	bindScrollFollow();
	bindOutsideClick();
	doActivateFirstMatch(vsKeyword);
}
