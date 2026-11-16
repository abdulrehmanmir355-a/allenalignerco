(() => {
  "use strict";
  function init() {
    if (document.getElementById("aa-nav-more-button")) return;
    const candidates = Array.from(
      document.querySelectorAll("header nav, header [role='navigation']")
    );
    const nav = candidates.find(el => {
      const t = (el.textContent || "").toLowerCase();
      return t.includes("doctors") &&
        (t.includes("hr management") || t.includes("clinical management"));
    });
    if (!nav) {
      console.warn("AA NAV: Main navigation not identified; unchanged.");
      return false;
    }
    const header = nav.closest("header");
    if (!header || !nav.parentElement) return false;
    const parent = nav.parentElement;
    let track = nav;
    if (
      nav.children.length === 1 &&
      nav.firstElementChild.children.length > 1
    ) {
      track = nav.firstElementChild;
    }
    const items = Array.from(track.children);
    if (items.length < 3) {
      console.warn("AA NAV: Navigation structure needs inspection.");
      return false;
    }
    parent.style.display = "flex";
    parent.style.alignItems = "center";
    parent.style.flexWrap = "nowrap";
    parent.style.minWidth = "0";
    nav.style.flex = "1 1 0%";
    nav.style.minWidth = "0";
    nav.style.maxWidth = "100%";
    nav.style.overflow = "hidden";
    track.style.display = "flex";
    track.style.flexWrap = "nowrap";
    track.style.alignItems = "center";
    track.style.width = "max-content";
    track.style.maxWidth = "none";
    const saved = items.map(el => el.style.display);
    const button = document.createElement("button");
    button.id = "aa-nav-more-button";
    button.type = "button";
    button.textContent = "?";
    button.setAttribute("aria-label", "More navigation");
    button.setAttribute("aria-expanded", "false");
    Object.assign(button.style, {
      display: "none",
      flex: "0 0 auto",
      padding: "7px 11px",
      fontSize: "21px",
      color: "#113847",
      background: "#ffffff",
      border: "1px solid #cbd5d8",
      borderRadius: "8px",
      cursor: "pointer"
    });
    nav.insertAdjacentElement("afterend", button);
    const popup = document.createElement("div");
    popup.id = "aa-nav-overflow-popup";
    Object.assign(popup.style, {
      display: "none",
      position: "fixed",
      zIndex: "99999",
      width: "250px",
      maxWidth: "calc(100vw - 24px)",
      maxHeight: "70vh",
      overflowY: "auto",
      padding: "12px",
      background: "#ffffff",
      color: "#113847",
      border: "1px solid #dce5e8",
      borderRadius: "10px",
      boxShadow: "0 12px 30px #0002"
    });
    document.body.appendChild(popup);
    function closeMenu() {
      popup.style.display = "none";
      button.setAttribute("aria-expanded", "false");
    }
    function positionMenu() {
      const r = button.getBoundingClientRect();
      popup.style.top = Math.min(
        r.bottom + 6, window.innerHeight - 30
      ) + "px";
      popup.style.left = Math.max(
        12, Math.min(r.right - 250, window.innerWidth - 262)
      ) + "px";
    }
    function buildMenu(hidden) {
      popup.replaceChildren();
      hidden.forEach(el => {
        const group = document.createElement("div");
        group.style.padding = "7px 5px";
        group.style.borderBottom = "1px solid #eef2f3";
        const links = [];
        if (el.matches("a[href]")) links.push(el);
        el.querySelectorAll("a[href]").forEach(a => links.push(a));
        const title = document.createElement("strong");
        const first = el.querySelector("summary, button");
        title.textContent = (
          first?.textContent || el.textContent || "Navigation"
        ).trim().slice(0, 65);
        group.appendChild(title);
        links.forEach(a => {
          const link = document.createElement("a");
          link.href = a.href;
          link.textContent = (a.textContent || "Open").trim();
          Object.assign(link.style, {
            display: "block",
            padding: "8px",
            color: "#113847",
            textDecoration: "none",
            whiteSpace: "normal"
          });
          link.addEventListener("click", closeMenu);
          group.appendChild(link);
        });
        popup.appendChild(group);
      });
    }
    function calculate() {
      closeMenu();
      items.forEach((el, i) => {
        el.style.display = saved[i];
      });
      button.style.display = "none";
      const gap = parseFloat(
        getComputedStyle(track).columnGap
      ) || 0;
      const widths = items.map(el => el.getBoundingClientRect().width);
      const total = widths.reduce((a, b) => a + b, 0)
        + gap * Math.max(0, items.length - 1);
      if (total <= nav.clientWidth) return;
      button.style.display = "inline-flex";
      const available = Math.max(0, nav.clientWidth - 3);
      let used = 0;
      let count = 0;
      for (const width of widths) {
        const next = used + width + (count ? gap : 0);
        if (next > available) break;
        used = next;
        count++;
      }
      const hidden = items.slice(count);
      hidden.forEach(el => {
        el.style.display = "none";
      });
      buildMenu(hidden);
    }
    button.addEventListener("click", () => {
      const opening = popup.style.display === "none";
      if (!opening) return closeMenu();
      positionMenu();
      popup.style.display = "block";
      button.setAttribute("aria-expanded", "true");
    });
    document.addEventListener("click", event => {
      if (!button.contains(event.target) &&
          !popup.contains(event.target)) closeMenu();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeMenu();
    });
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", calculate);
    const observer = new ResizeObserver(calculate);
    observer.observe(parent);
    document.fonts?.ready.then(calculate);
    calculate();
    console.info("AA NAV: Dynamic overflow enabled.");
    return true;
  }
  if (document.readyState === "complete") {
    setTimeout(init, 350);
  } else {
    window.addEventListener("load", () => setTimeout(init, 350));
  }
})();
