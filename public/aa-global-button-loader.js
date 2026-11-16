(() => {
  "use strict";

  if (window.__aaButtonFX5) return;
  window.__aaButtonFX5 = true;

  const css = document.createElement("style");
  css.id = "aa-button-fx5-css";

  css.textContent = `
    @keyframes aa5Rotate {
      to { transform: rotate(360deg); }
    }

    @keyframes aa5Reverse {
      to { transform: rotate(-360deg); }
    }

    @keyframes aa5Appear {
      from { opacity: 0; scale: .65; }
      to { opacity: 1; scale: 1; }
    }

    @keyframes aa5Progress {
      from { transform: scaleX(0); }
      to { transform: scaleX(1); }
    }

    html body .aa-fx5-active {
      color: transparent !important;
      -webkit-text-fill-color: transparent !important;
      text-shadow: none !important;
      transition: color .12s ease !important;
    }

    html body .aa-fx5-active > * {
      visibility: hidden !important;
    }

    .aa-fx5-floating {
      position: fixed !important;
      width: 40px !important;
      height: 40px !important;
      z-index: 2147483646 !important;
      pointer-events: none !important;
      transform: translate(-50%, -50%) !important;
      animation: aa5Appear .18s ease-out both !important;
      color: var(--aa-fx5-ink, #087989) !important;
    }

    .aa-fx5-ring {
      position: absolute !important;
      inset: 7px !important;
      border: 2.5px solid transparent !important;
      border-top-color: currentColor !important;
      border-right-color: currentColor !important;
      border-radius: 50% !important;
      animation: aa5Rotate .75s linear infinite !important;
      filter: drop-shadow(0 0 4px currentColor);
    }

    .aa-fx5-inner {
      position: absolute !important;
      inset: 14px !important;
      border: 2px solid transparent !important;
      border-bottom-color: currentColor !important;
      border-left-color: currentColor !important;
      border-radius: 50% !important;
      animation: aa5Reverse .5s linear infinite !important;
    }

    .aa-fx5-dot {
      position: absolute !important;
      top: 3px !important;
      left: 17px !important;
      width: 6px !important;
      height: 6px !important;
      background: currentColor !important;
      border-radius: 50% !important;
      box-shadow: 0 0 8px currentColor !important;
      transform-origin: 3px 17px !important;
      animation: aa5Rotate 1s linear infinite !important;
    }

    #aa-fx5-progress {
      position: fixed !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      height: 3px !important;
      z-index: 2147483647 !important;
      background: linear-gradient(
        90deg, #087989, #20cddd, #ffffff
      ) !important;
      box-shadow: 0 0 12px #20cddd;
      pointer-events: none !important;
      transform-origin: left center;
      transform: scaleX(0);
      opacity: 0;
    }

    #aa-fx5-progress.aa-fx5-progress-on {
      opacity: 1 !important;
      animation: aa5Progress 1.3s ease-out forwards;
    }

    @media (prefers-reduced-motion: reduce) {
      .aa-fx5-floating,
      .aa-fx5-ring,
      .aa-fx5-inner,
      .aa-fx5-dot,
      #aa-fx5-progress {
        animation: none !important;
      }
    }
  `;

  document.head.appendChild(css);

  const progress = document.createElement("div");
  progress.id = "aa-fx5-progress";
  progress.setAttribute("aria-hidden", "true");
  document.body.appendChild(progress);

  let progressTimer;
  const activeButtons = new WeakSet();

  function startProgress() {
    progress.classList.remove("aa-fx5-progress-on");
    void progress.offsetWidth;
    progress.classList.add("aa-fx5-progress-on");

    clearTimeout(progressTimer);

    progressTimer = setTimeout(() => {
      progress.classList.remove("aa-fx5-progress-on");
    }, 1400);
  }

  function chooseInk(element) {
    const computed = getComputedStyle(element);
    const bg = computed.backgroundColor;
    const numbers = bg.match(/[\\d.]+/g);

    if (numbers && numbers.length >= 3) {
      const values = numbers.map(Number);
      const brightness =
        (values[0] * 299 +
         values[1] * 587 +
         values[2] * 114) / 1000;

      if (values.length === 3 || values[3] > 0.75) {
        return brightness < 155 ? "#ffffff" : "#087989";
      }
    }

    return computed.color || "#087989";
  }

  function animateButton(button) {
    if (!button.isConnected || activeButtons.has(button)) {
      return;
    }

    activeButtons.add(button);

    const rect = button.getBoundingClientRect();
    const oldBusy = button.getAttribute("aria-busy");

    const floating = document.createElement("span");
    floating.className = "aa-fx5-floating";
    floating.setAttribute("aria-hidden", "true");

    floating.style.left = rect.left + rect.width / 2 + "px";
    floating.style.top = rect.top + rect.height / 2 + "px";
    floating.style.setProperty(
      "--aa-fx5-ink",
      chooseInk(button)
    );

    for (const cls of [
      "aa-fx5-ring",
      "aa-fx5-inner",
      "aa-fx5-dot"
    ]) {
      const part = document.createElement("span");
      part.className = cls;
      floating.appendChild(part);
    }

    document.body.appendChild(floating);

    button.classList.add("aa-fx5-active");
    button.setAttribute("aria-busy", "true");

    const specified = Number(button.dataset.aaLoadingMs);
    const duration =
      Number.isFinite(specified) && specified > 0
        ? Math.max(400, Math.min(5000, specified))
        : 1300;

    setTimeout(() => {
      floating.remove();
      button.classList.remove("aa-fx5-active");
      activeButtons.delete(button);

      if (oldBusy === null) {
        button.removeAttribute("aria-busy");
      } else {
        button.setAttribute("aria-busy", oldBusy);
      }
    }, duration);
  }

  document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;

    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    ) return;

    const target = event.target.closest(
      "button, input[type='submit'], input[type='button'], a[href], [role='button']"
    );

    if (!target) return;

    if (
      target.matches(
        ":disabled, [aria-disabled='true'], [data-aa-no-spinner]"
      ) ||
      target.closest("[data-aa-spinner-off]") ||
      target.matches(
        "[aria-expanded], [aria-haspopup], [aria-pressed], [role='tab'], [role='switch']"
      )
    ) return;

    if (target.tagName === "A") {
      const href = target.getAttribute("href");

      if (
        !href ||
        href.startsWith("#") ||
        target.hasAttribute("download") ||
        target.getAttribute("target") === "_blank"
      ) return;

      let url;

      try {
        url = new URL(href, location.href);
      } catch {
        return;
      }

      if (url.origin !== location.origin) return;

      if (
        url.pathname !== location.pathname ||
        url.search !== location.search
      ) {
        startProgress();
      }

      const className = String(target.className);

      if (
        target.getAttribute("role") === "button" ||
        /button|btn|cta|action/i.test(className)
      ) {
        animateButton(target);
      }

      return;
    }

    if (
      target.type === "reset" ||
      (
        target.type === "submit" &&
        target.form &&
        !target.form.checkValidity()
      )
    ) return;

    animateButton(target);
  }, true);

  window.aaFX5Test = function () {
    const button = document.querySelector(
      "button:not([disabled])"
    );

    if (!button) {
      return "No enabled button found";
    }

    animateButton(button);
    return "V5 test animation started";
  };

  console.info("Allen Aligner Button FX V5 loaded");
})();
