/************************************************
 * udcComGnb.js
 * Created at 2026. 11. 12.
 *
 * 헤더 내비게이션(메가메뉴) UDC
 *  - 쉘(uicontrolshell)에 메뉴 DOM 을 직접 그린다. (우측 별도 영역 등 cl:navigationbar 로 불가능한 구조 대응)
 *  - ES5 문법
 *
 * [데이터셋 dsMenu]
 *   MENU_NM / MENU_ID / UP_MENU_ID / TOP_MENU_ID / CALL_PAGE
 *   - UP_MENU_ID == ''            : 상단 바 메뉴(1뎁스)
 *   - 1뎁스 자식이 있으면            : 패널의 한 열 (열 제목 = 1뎁스 메뉴명)
 *     - 자식(2뎁스)에 다시 자식이 있으면 : 그룹 제목(PSE, PDEx 등) + 3뎁스 항목 목록
 *     - 자식(2뎁스)이 말단이면         : 항목으로 바로 표시 (Products 등)
 *   - 1뎁스 자식이 없으면(말단)        : 열 없이 바에만 표시. 올리면 패널(우측 별도 영역)이 열린다 (Market Calendar 등)
 *   - 1뎁스 메뉴(상단 바 아이템): 올리면 패널이 열리고, 직접 누르면 해당 화면을 열고 패널은 닫는다. (현재는 콘솔 로그 "아이템 눌림"만 출력)
 *
 * [이벤트]
 *   menu-click : 말단 메뉴 클릭 시. userData = { menuId: String, callPage: String }
 ************************************************/

/************************************************
 * 공통
 ************************************************/

/** 패널 id 중복 방지용 시퀀스 */
var _gnbSeq = 0;

/** 호버 후 패널이 닫히기까지 대기 시간(ms) */
var GNB_CLOSE_DELAY = 150;

/**
 * 엘리먼트 생성 헬퍼
 * @param {String} psTag 태그명
 * @param {String} psClass? 클래스명
 * @param {String} psText? 텍스트
 * @return {HTMLElement}
 */
function createEl(psTag, psClass, psText) {
	var voEl = document.createElement(psTag);
	if (psClass) {
		voEl.className = psClass;
	}
	if (psText !== undefined && psText !== null) {
		voEl.textContent = psText;
	}
	return voEl;
}

/************************************************
 * GNB
 ************************************************/
var mainMenu = {
	/** @type HTMLElement */
	root: null,
	/** @type HTMLElement */
	bar: null,
	/** @type HTMLElement */
	panel: null,
	/** 패널을 여는 트리거(하위 메뉴가 있는 1뎁스 버튼) */
	triggers: [],
	/** @type HTMLElement */
	activeTrigger: null,
	closeTimer: null,

	/**
	 * 메뉴 DOM 을 쉘에 그린다.
	 */
	build: function() {
		var that = this;
		var dataSet = app.lookup("dsMenu");
		var contentNode = app.lookup("navigation").getContentNode();

		var panelId = "gnb-panel-" + (++_gnbSeq);

		that.root = createEl("nav", "gnb");
		that.root.setAttribute("aria-label", "Main menu");

		that.bar = createEl("ul", "gnb-bar");

		that.panel = createEl("div", "gnb-panel");
		that.panel.id = panelId;
		var inner = createEl("div", "gnb-panel-inner");
		that.panel.appendChild(inner);

		var rootMenus = dataSet.findAllRow("UP_MENU_ID == ''");
		rootMenus.forEach(function(menu) {
			var children = dataSet.findAllRow("UP_MENU_ID == '" + menu.getValue("MENU_ID") + "'");

			var listItem = createEl("li", "gnb-bar-item");
			var trigger = createEl("button", "gnb-trigger", menu.getValue("MENU_NM"));
			trigger.type = "button";

			if (children && children.length > 0) {
				// 하위 메뉴가 있으면 패널을 연다.
				trigger.setAttribute("aria-haspopup", "true");
				trigger.setAttribute("aria-expanded", "false");
				trigger.setAttribute("aria-controls", panelId);
				that.triggers.push(trigger);
				inner.appendChild(that.createColumn(menu, children, dataSet));
			} else {
				// 하위가 없는 메뉴: 마우스를 올리면 패널(우측 별도 영역 포함)을 열고, 누르면 바로 선택한다.
				trigger.setAttribute("aria-haspopup", "true");
				trigger.setAttribute("aria-expanded", "false");
				trigger.setAttribute("aria-controls", panelId);
				trigger._leafMenu = menu;
				that.triggers.push(trigger);
			}

			listItem.appendChild(trigger);
			that.bar.appendChild(listItem);
		});

		inner.appendChild(that.createAside(dataSet));

		that.root.appendChild(that.bar);
		that.root.appendChild(that.panel);
		contentNode.appendChild(that.root);
	},

	/**
	 * 패널의 한 열(1뎁스 메뉴 하나)을 만든다.
	 * @param {cpr.data.DataRow} menu 1뎁스 메뉴
	 * @param {cpr.data.DataRow[]} children 2뎁스 메뉴들
	 * @param {cpr.data.DataSet} dataSet
	 * @return {HTMLElement}
	 */
	createColumn: function(menu, children, dataSet) {
		var that = this;
		var column = createEl("div", "gnb-col");
		// 열 제목은 상단 바 아이템과 같은 링크 (누르면 해당 화면을 열고 패널을 닫는다. TODO: 화면 열기 연결 — 지금은 콘솔 로그만 출력)
		var title = createEl("h2", "gnb-col-title");
		var titleLink = createEl("button", "gnb-col-link", menu.getValue("MENU_NM"));
		titleLink.type = "button";
		titleLink.addEventListener("click", function() {
			console.log("아이템 눌림");
			that.close();
		});
		title.appendChild(titleLink);
		column.appendChild(title);

		/** 그룹에 속하지 않은 2뎁스 말단 항목이 담기는 목록 */
		var flatList = null;

		children.forEach(function(child) {
			var grandChildren = dataSet.findAllRow("UP_MENU_ID == '" + child.getValue("MENU_ID") + "'");

			if (grandChildren && grandChildren.length > 0) {
				var group = createEl("div", "gnb-group");
				group.appendChild(createEl("h3", "gnb-group-title", child.getValue("MENU_NM")));

				var groupList = createEl("ul", "gnb-list");
				grandChildren.forEach(function(item) {
					groupList.appendChild(that.createItem(item));
				});
				group.appendChild(groupList);
				column.appendChild(group);
			} else {
				if (flatList === null) {
					flatList = createEl("ul", "gnb-list gnb-list-flat");
					column.appendChild(flatList);
				}
				flatList.appendChild(that.createItem(child));
			}
		});

		return column;
	},

	/**
	 * 말단 메뉴 항목(li > button)
	 * @param {cpr.data.DataRow} item
	 * @return {HTMLElement}
	 */
	createItem: function(item) {
		var that = this;
		var listItem = createEl("li", "gnb-item");
		var button = createEl("button", "gnb-link", item.getValue("MENU_NM"));
		button.type = "button";
		button.addEventListener("click", function() {
			that.select(item);
		});
		listItem.appendChild(button);
		return listItem;
	},

	/**
	 * 패널 우측 별도 영역(Market Calendar 카드, 사이트 링크)
	 * @param {cpr.data.DataSet} dataSet
	 * @return {HTMLElement}
	 */
	createAside: function(dataSet) {
		var that = this;
		var aside = createEl("div", "gnb-aside");

		// Market Calendar 카드 (아이콘 + 문구 + 버튼)
		var card = createEl("div", "gnb-card");
		var head = createEl("div", "gnb-card-head");
		var icon = createEl("span", "gnb-card-icon");
		icon.setAttribute("aria-hidden", "true");
		var body = createEl("div", "gnb-card-body");
		body.appendChild(createEl("strong", "gnb-card-title", "Market Calendar"));
		body.appendChild(createEl("p", "gnb-card-desc", "Browse exchange and\ncompany events."));
		head.appendChild(icon);
		head.appendChild(body);
		card.appendChild(head);
		
		var openBtn = createEl("button", "gnb-card-btn", "Open Market Calendar");
		openBtn.type = "button";
		// 상단 바 아이템과 같은 링크 (누르면 해당 화면을 열고 패널을 닫는다. TODO: 화면 열기 연결 — 지금은 콘솔 로그만 출력)
		openBtn.addEventListener("click", function() {
			console.log("아이템 눌림");
			that.close();
		});
		card.appendChild(openBtn);
		aside.appendChild(card);
		
		// 사이트 바로가기 (새 창)
		var siteList = createEl("ul", "gnb-site-list");
		["PSE Site", "PDEx Site"].forEach(function(label) {
			var siteItem = createEl("li", "gnb-site-item");
			var link = createEl("a", "gnb-site-link", label);
			link.href = "#";
			link.target = "_blank";
			link.setAttribute("rel", "noopener noreferrer");
			link.setAttribute("title", label + " (새 창 열림)");
			link.appendChild(createEl("span", "gnb-site-icon"));
			siteItem.appendChild(link);
			siteList.appendChild(siteItem);
		});
		aside.appendChild(siteList);

		return aside;
	},

	/**
	 * 말단 메뉴 선택 → menu-click 이벤트 발행 후 패널 닫기
	 * @param {cpr.data.DataRow} menu
	 */
	select: function(menu) {
		var voEvent = new cpr.events.CUIEvent("menu-click", {
			userData: {
				menuId: menu.getValue("MENU_ID"),
				callPage: menu.getValue("CALL_PAGE")
			}
		});
		app.dispatchEvent(voEvent);
		this.close();
	},

	/**
	 * 패널 열기
	 * @param {HTMLElement} trigger 누른(올린) 1뎁스 버튼
	 */
	open: function(trigger) {
		this.cancelClose();

		this.triggers.forEach(function(each) {
			each.setAttribute("aria-expanded", each === trigger ? "true" : "false");
		});
		this.activeTrigger = trigger;

		// 패널은 화면 전체 폭(position: fixed) → 상단 바 바로 아래에 붙인다.
		this.panel.style.top = "64px";
		this.panel.classList.add("is-open");
	},

	/**
	 * 패널 닫기
	 */
	close: function() {
		this.cancelClose();
		this.triggers.forEach(function(each) {
			each.setAttribute("aria-expanded", "false");
		});
		this.activeTrigger = null;
		if (this.panel) {
			this.panel.classList.remove("is-open");
		}
	},

	/**
	 * 잠시 후 닫기 예약 (바 ↔ 패널 사이를 이동하는 동안 닫히지 않게 지연)
	 */
	scheduleClose: function() {
		var that = this;
		this.cancelClose();
		this.closeTimer = setTimeout(function() {
			that.close();
		}, GNB_CLOSE_DELAY);
	},

	cancelClose: function() {
		if (this.closeTimer !== null) {
			clearTimeout(this.closeTimer);
			this.closeTimer = null;
		}
	},

	/**
	 * 이벤트 연결
	 */
	attachEvents: function() {
		var that = this;

		that.triggers.forEach(function(trigger) {
			// 마우스를 올리면 하위 메뉴(패널)를 연다.
			trigger.addEventListener("mouseenter", function() {
				that.open(trigger);
			});
			// 아이템을 직접 누르면 해당 화면을 열고 하위 메뉴(패널)는 닫는다. (TODO: 화면 열기 연결 — 지금은 콘솔 로그만 출력)
			trigger.addEventListener("click", function() {
				console.log("아이템 눌림");
				that.close();
			});
		});

		// 바/패널 위에 있는 동안에는 유지, 벗어나면 잠시 후 닫기
		that.root.addEventListener("mouseenter", function() {
			that.cancelClose();
		});
		that.root.addEventListener("mouseleave", function() {
			that.scheduleClose();
		});

		// 바깥 클릭 시 닫기
		document.addEventListener("click", function(e) {
			if (!that.root.contains(e.target)) {
				that.close();
			}
		});

		// ESC 로 닫고 트리거로 포커스 복귀
		document.addEventListener("keydown", function(e) {
			if (e.key === "Escape" || e.keyCode === 27) {
				var voTrigger = that.activeTrigger;
				that.close();
				if (voTrigger) {
					voTrigger.focus();
				}
			}
		});

		// 포커스가 메뉴 밖으로 나가면 닫기 (Tab 이동)
		that.root.addEventListener("focusout", function(e) {
			var voNext = e.relatedTarget;
			if (voNext && !that.root.contains(voNext)) {
				that.close();
			}
		});
	},

	init: function() {
		this.build();
		this.attachEvents();
	}
};

/************************************************
 * 이벤트 핸들러
 ************************************************/

/*
 * 쉘에서 load 이벤트 발생 시 호출.
 * 쉘이 그려진 후 내용을 작성하는 이벤트.
 */
function onNavigationLoad(/* cpr.events.CEvent */ e) {
	// 서버로부터 메뉴를 받아오는 경우에는 해당 시점에 맞춰 init 호출 위치를 변경해야 한다.
	mainMenu.init();
}
