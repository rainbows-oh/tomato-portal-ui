/************************************************
 * main_content.js
 * Created at 2026. 11. 10. 오후 5:13:51.
 *
 * @author chwec
 ************************************************/

var slidify = cpr.core.Module.require("module/cstm/Slidify_v2").init;

/** 헤더 슬라이더 */
var moHeaderSlider = null;
/** 사이드 슬라이더 */
var moSideSlider = null;

/**
 * 화면 폭이 이 값 이하이면 1320px 고정 폭 컨트롤을 가변 폭(100%)으로 전환
 * (컨텐츠 영역/슬라이드의 좌우 padding 40px 이 그대로 여백이 된다. 1400 = 1320 + 40 × 2)
 */
var FLUID_BREAKPOINT = 1400;
/** resize 핸들러 (dispose 시 해제용) */
var mfnFluidResize = null;

/** 모바일 스크린에서 헤더 슬라이더(grpHeaderSlider) 영역의 높이 */
var HEADER_SLIDER_MOBILE_HEIGHT = "400px";

/** 헤더 슬라이더 페이지네이션 점의 바닥 간격(px): PC/태블릿, 모바일 */
var HEADER_PAGING_OFFSET = 46;
var HEADER_PAGING_OFFSET_MOBILE = 146;

/*
 * 루트 컨테이너에서 load 이벤트 발생 시 호출.
 * 앱이 최초 구성된후 최초 랜더링 직후에 발생하는 이벤트 입니다.
 */
function onBodyLoad(/* cpr.events.CEvent */ e){
	moHeaderSlider = slidify(app.lookup("grpHeaderSlider"), {
		slidesPerView: 1,
		loop: false,				// loop=true 이면 점 클릭 이동이 비활성화되므로 false
		speed: 0.5,
		navigation: {
			enabled: false			// 좌우 화살표 없음 (점만 사용)
		},
		pagination: {
			enabled: true,
			clickable: true,		// 점 클릭 시 해당 슬라이드로 이동
			position: "overlay"		// 슬라이더 영역 안쪽 하단
		},
		paginationAlign: "left",	// 점 가로 정렬
		paginationLeft: getSlideTextLeft,	// 슬라이드 텍스트(아웃풋)의 좌측 시작 위치에 맞춤 (화면 폭에 따라 계산)
		paginationBulletSize: 8,	// 점 크기 8x8 (간격은 모듈 기본 8px)
		paginationHeight: 8,		// 점 영역 높이 = 점 크기(8px)
		paginationOffset: 46,		// 슬라이더 바닥에서 46px 위
		autoplay: {
			delay: 0				// 초. 마지막 슬라이드 다음에는 첫 슬라이드로 복귀
		}
	});	// init 내부에서 start() 까지 호출됨
	
	moSideSlider = slidify(app.lookup("grpSideSlider"), {
		slidesPerView: 1,
		loop: false,
		speed: 0.5,
		navigation: {
			enabled: false
		},
		pagination: {
			enabled: true,
			clickable: true,
			position: "overlay"
		},
		paginationAlign: "left",
		paginationLeft: 20,			// 슬라이더 좌측에서 20px (임의값 - 디자인 확인 필요)
		paginationBulletSize: 6,	// 점 크기 6x6
		paginationSpacing: 6,		// 점 간격 6px
		paginationHeight: 6,
		paginationOffset: 20,		// 슬라이더 바닥에서 20px 위 (임의값 - 디자인 확인 필요)
		autoplay: {
			delay: 0			// 자동 재생 없음 (점 클릭으로만 이동)
		}
	});
	
	// 시작 스크린이 태블릿/모바일인 경우에도 적용 (screen-change 는 변경 시에만 발생)
	applyMobileClass(app.targetScreen.name);
	applyHeaderSliderHeight(app.targetScreen.name);
	applyHeaderPagingOffset(app.targetScreen.name);
	
	// 화면 폭에 따라 고정 폭(1320px) 컨트롤을 가변으로 전환
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
	applyMobileClass(e.screen.name);
	applyHeaderSliderHeight(e.screen.name);
	applyHeaderPagingOffset(e.screen.name);
	
	// 반응형 모듈(tablet-fit/mobile-fit)이 레이아웃을 바꾼 뒤에 적용
	cpr.core.DeferredUpdateManager.INSTANCE.asyncExec(applyFluidWidth);
}

/**
 * PC 스크린이 아닐 때(태블릿, 모바일) Refresh 버튼(grpRefresh)에 icon 클래스를 추가한다. (PC 스크린은 제거)
 * @param {String} psScreenName 스크린 명
 */
function applyMobileClass(psScreenName) {
	var vcBtnRefresh = app.lookup("grpRefresh");
	if (!vcBtnRefresh) return;
	
	// PC 스크린이 아니면(태블릿, 모바일 등) 적용
	var vbNotPc = AppProperties.SCREEN_DEFAULT_NM.indexOf(psScreenName) == -1;
	
	if (vbNotPc) {
		vcBtnRefresh.style.addClass("icon");
	} else {
		vcBtnRefresh.style.removeClass("icon");
	}
}

/**
 * 모바일 스크린일 때 헤더 슬라이더 영역의 높이를 HEADER_SLIDER_MOBILE_HEIGHT 로, 그 외에는 원래 높이로 되돌린다.
 * (슬라이드는 슬라이더 높이를 따라가므로 슬라이더 영역만 바꾸면 된다)
 * @param {String} psScreenName 스크린 명
 */
function applyHeaderSliderHeight(psScreenName) {
	var vcSlider = app.lookup("grpHeaderSlider");
	if (!vcSlider) return;
	
	var vcParent = vcSlider.getParent();
	if (!vcParent) return;
	
	var voConstraint = vcParent.getConstraint(vcSlider);
	if (!voConstraint) return;
	
	var vsOrigin = vcSlider.userData("origin.height");
	if (ValueUtil.isNull(vsOrigin)) {
		vsOrigin = voConstraint.height;
		vcSlider.userData("origin.height", vsOrigin);
	}
	
	var vbMobile = AppProperties.SCREEN_MOBILE_NM.indexOf(psScreenName) != -1;
	var vsTarget = vbMobile ? HEADER_SLIDER_MOBILE_HEIGHT : vsOrigin;
	
	if (voConstraint.height !== vsTarget) {
		vcParent.updateConstraint(vcSlider, { height: vsTarget });
		
		// 높이가 바뀌었으므로 페이지네이션 점 위치를 다시 맞춤
		cpr.core.DeferredUpdateManager.INSTANCE.asyncExec(function() {
			if (moHeaderSlider) {
				moHeaderSlider.refreshPagination();
			}
		});
	}
}

/**
 * 헤더 슬라이더 페이지네이션 점의 바닥 간격을 스크린에 맞춘다.
 * (슬라이더 바닥에서 점 아래끝까지의 거리: PC/태블릿 HEADER_PAGING_OFFSET, 모바일 HEADER_PAGING_OFFSET_MOBILE)
 * @param {String} psScreenName 스크린 명
 */
function applyHeaderPagingOffset(psScreenName) {
	if (!moHeaderSlider) return;
	
	var vbMobile = AppProperties.SCREEN_MOBILE_NM.indexOf(psScreenName) != -1;
	var vnOffset = vbMobile ? HEADER_PAGING_OFFSET_MOBILE : HEADER_PAGING_OFFSET;
	
	if (moHeaderSlider.paginationOffset !== vnOffset) {
		moHeaderSlider.paginationOffset = vnOffset;
		
		// 슬라이더 높이 변경(applyHeaderSliderHeight)이 반영된 뒤에 점 위치를 다시 계산
		cpr.core.DeferredUpdateManager.INSTANCE.asyncExec(function() {
			if (moHeaderSlider) {
				moHeaderSlider.refreshPagination();
			}
		});
	}
}

/*
 * "Button" 버튼(btnTickerCollapse)에서 click 이벤트 발생 시 호출.
 * 사용자가 컨트롤을 클릭할 때 발생하는 이벤트.
 * 헤더 슬라이더 영역을 접거나 펼치고, 버튼 화살표 방향을 바꾼다.
 * 펼침: (기본) / 접힘: btn-ticker-expand (화살표 반전)
 * 접근성: 상태에 맞게 버튼의 fieldLabel(대체 텍스트)도 함께 바꾼다.
 */
function onBtnTickerCollapseClick(e) {
	var vcButton = e.control;
	var vbCollapse = !vcButton.style.hasClass("btn-ticker-expand");
	
	doToggleHeaderSlider(vbCollapse);
	
	if (vbCollapse) {
		vcButton.style.addClass("btn-ticker-expand");
		vcButton.fieldLabel = "Expand header slider";
	} else {
		vcButton.style.removeClass("btn-ticker-expand");
		vcButton.fieldLabel = "Collapse header slider";
	}
}

/**
 * 헤더 슬라이더 영역(grpHeaderSlider)을 접거나 펼친다.
 * 페이지네이션 점은 슬라이더와 별개로 떠 있는(float) 컨트롤이라 함께 숨기거나 보인다.
 * @param {Boolean} pbCollapse true: 접기(숨김), false: 펼치기
 */
function doToggleHeaderSlider(pbCollapse) {
	var vcSlider = app.lookup("grpHeaderSlider");
	if (!vcSlider) return;
	
	var vcPagination = (moHeaderSlider && moHeaderSlider._pagination) ? moHeaderSlider._pagination.control : null;
	
	vcSlider.visible = !pbCollapse;
	if (vcPagination && !vcPagination.disposed) {
		vcPagination.visible = !pbCollapse;
	}
	
	// 펼친 뒤 레이아웃이 반영되면 페이지네이션 점 위치를 다시 맞춤
	if (!pbCollapse) {
		cpr.core.DeferredUpdateManager.INSTANCE.asyncExec(function() {
			if (moHeaderSlider) {
				moHeaderSlider.refreshPagination();
			}
		});
	}
}

/************************************************
 * 컨텐츠 폭 가변 (FLUID_BREAKPOINT 이하)
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
 * 화면 폭이 FLUID_BREAKPOINT 이하이면 1320px 고정 폭 컨트롤을 가변으로, 초과하면 원래대로 되돌린다.
 *  - 헤더 슬라이드 텍스트 그룹(slide-txt) 하위 아웃풋, 탭폴더, grpDashboard: 모든 스크린(PC/태블릿/모바일)에 적용
 */
function applyFluidWidth() {
	var vbFluid = window.innerWidth <= FLUID_BREAKPOINT;
	var vsFluidWidth = "100%";
	
	// 헤더 슬라이드 텍스트 그룹(slide > slide-txt) 하위 아웃풋
	var vcHeaderSlider = app.lookup("grpHeaderSlider");
	if (vcHeaderSlider) {
		vcHeaderSlider.getAllRecursiveChildren(false).filter(function(each) {
			var vcParent = each.getParent();
			return each instanceof cpr.controls.Output
				&& vcParent && vcParent.style.hasClass("slide-txt");
		}).forEach(function(each) {
			setFluidWidth(each, vbFluid, vsFluidWidth);
		});
	}
	
	// 탭폴더, 대시보드
	var vcContent = app.lookup("grpContent");
	if (vcContent) {
		vcContent.getChildren().filter(function(each) {
			return each instanceof cpr.controls.TabFolder;
		}).forEach(function(each) {
			setFluidWidth(each, vbFluid, vsFluidWidth);
		});
	}
	var vcDashboard = app.lookup("grpDashboard");
	if (vcDashboard) {
		setFluidWidth(vcDashboard, vbFluid, vsFluidWidth);
	}
	
	// 폭이 바뀐 뒤 페이지네이션 점을 슬라이드 텍스트 위치에 다시 맞춤
	cpr.core.DeferredUpdateManager.INSTANCE.asyncExec(function() {
		if (moHeaderSlider) {
			moHeaderSlider.refreshPagination();
		}
	});
}

/**
 * 헤더 슬라이드의 텍스트(첫 번째 슬라이드의 첫 아웃풋)가 슬라이드 좌측에서 시작하는 위치(px)를 반환한다.
 * 페이지네이션 점을 텍스트와 같은 위치에 맞추기 위한 값. (PC 1320px 가운데 정렬, 1400px 이하 padding 40/24/16 자동 반영)
 * @return {Number}
 */
function getSlideTextLeft() {
	var vcSlider = app.lookup("grpHeaderSlider");
	if (!vcSlider) return 0;
	
	var vaOutputs = vcSlider.getAllRecursiveChildren(false).filter(function(each) {
		var vcParent = each.getParent();
		return each instanceof cpr.controls.Output && vcParent && vcParent.style.hasClass("slide-txt");
	});
	if (vaOutputs.length === 0) return 0;
	
	var vcOutput = vaOutputs[0];
	var voOutRect = vcOutput.getActualRect();
	var voSlideRect = vcOutput.getParent().getActualRect();
	return Math.max(0, Math.round(voOutRect.left - voSlideRect.left));
}
