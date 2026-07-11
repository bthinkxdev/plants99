(() => {
  // Populated from DB (recent products) via templates/base.html json_script.
  const FALLBACK_PHRASES = ["plants, pots, seeds…"];

  function airyPhrase(text) {
    return String(text || "")
      .trim()
      .split(/\s+/)
      .join(" ");
  }

  function readPhrasesFromPage() {
    var el = document.getElementById("storefront-search-typed-phrases");
    if (!el || !el.textContent) return null;
    try {
      var data = JSON.parse(el.textContent);
      if (!Array.isArray(data) || !data.length) return null;
      var out = [];
      for (var i = 0; i < data.length; i++) {
        var p = airyPhrase(data[i]);
        if (p) out.push(p);
      }
      return out.length ? out : null;
    } catch (e) {
      return null;
    }
  }

  var PHRASES = readPhrasesFromPage() || FALLBACK_PHRASES;

  const TYPE_MS = 70;
  const PAUSE_MS = 1600;
  const BETWEEN_MS = 400;
  const FADE_MS = 700;

  function sleep(ms, signal) {
    return new Promise(function (resolve) {
      if (signal && signal.aborted) {
        resolve();
        return;
      }
      var t = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener(
          "abort",
          function () {
            clearTimeout(t);
            resolve();
          },
          { once: true }
        );
      }
    });
  }

  function shouldRunForInput(input) {
    if (!input) return false;
    if (input.disabled || input.readOnly) return false;
    if ((input.value || "").trim().length > 0) return false;
    return true;
  }

  function setHintVisible(hint, visible) {
    if (!hint) return;
    hint.classList.toggle("typed-ghost-hint--hidden", !visible);
  }

  function clearGhost(ghost) {
    if (!ghost) return;
    ghost.classList.remove("is-fading");
    ghost.style.opacity = "1";
    ghost.textContent = "";
  }

  function renderPhrase(ghost, phrase) {
    clearGhost(ghost);
    var frag = document.createDocumentFragment();
    for (var i = 0; i < phrase.length; i++) {
      var span = document.createElement("span");
      span.className = "tg-ch";
      span.textContent = phrase.charAt(i);
      frag.appendChild(span);
    }
    ghost.appendChild(frag);
    return Array.prototype.slice.call(ghost.querySelectorAll(".tg-ch"));
  }

  async function typeIn(chars, signal) {
    for (var i = 0; i < chars.length; i++) {
      if (signal.aborted) return;
      chars[i].classList.add("is-in");
      await sleep(TYPE_MS, signal);
    }
  }

  async function floatFadeOut(ghost, chars, signal) {
    if (signal.aborted) {
      clearGhost(ghost);
      return;
    }
    ghost.classList.add("is-fading");
    for (var i = 0; i < chars.length; i++) {
      chars[i].style.animationDelay = i * 12 + "ms";
    }
    await sleep(FADE_MS, signal);
    clearGhost(ghost);
  }

  function suppressNativePlaceholder(input) {
    if (!input.dataset.nativePlaceholder) {
      input.dataset.nativePlaceholder = input.getAttribute("placeholder") || "";
    }
    input.setAttribute("placeholder", "");
    input.classList.add("typed-ghost-input");
  }

  function setupOne(wrapper) {
    if (wrapper.dataset.typedGhostBound === "1") return;
    wrapper.dataset.typedGhostBound = "1";

    var input = wrapper.querySelector('input[type="text"], input[type="search"]');
    var ghost = wrapper.querySelector(".typed-ghost");
    var hint = wrapper.querySelector(".typed-ghost-hint");
    if (!input || !ghost) return;

    suppressNativePlaceholder(input);

    var phraseIdx = 0;
    var runId = 0;
    var controller = null;

    function abortLoop() {
      runId += 1;
      if (controller) controller.abort();
      controller = null;
      clearGhost(ghost);
    }

    function syncVisibility() {
      var empty = shouldRunForInput(input);
      setHintVisible(hint, empty);
      if (!empty) clearGhost(ghost);
    }

    async function loop(myRun) {
      controller = new AbortController();
      var signal = controller.signal;

      while (myRun === runId && !signal.aborted) {
        syncVisibility();

        if (!shouldRunForInput(input)) {
          await sleep(200, signal);
          continue;
        }

        await sleep(BETWEEN_MS, signal);
        if (myRun !== runId || signal.aborted || !shouldRunForInput(input)) continue;

        var phrase = PHRASES[phraseIdx % PHRASES.length];
        phraseIdx += 1;

        // Render only when we are about to type — avoids empty/invisible
        // chars sitting over the input and revealing a leftover placeholder.
        var chars = renderPhrase(ghost, phrase);
        await typeIn(chars, signal);
        if (myRun !== runId || signal.aborted || !shouldRunForInput(input)) {
          clearGhost(ghost);
          continue;
        }

        await sleep(PAUSE_MS, signal);
        if (myRun !== runId || signal.aborted || !shouldRunForInput(input)) {
          clearGhost(ghost);
          continue;
        }

        await floatFadeOut(ghost, chars, signal);
        if (myRun !== runId || signal.aborted) {
          clearGhost(ghost);
          continue;
        }
        await sleep(180, signal);
      }
    }

    function restartLoop() {
      abortLoop();
      syncVisibility();
      if (shouldRunForInput(input)) {
        var myRun = runId;
        loop(myRun);
      }
    }

    input.addEventListener("focus", restartLoop);
    input.addEventListener("input", function () {
      abortLoop();
      syncVisibility();
      if (shouldRunForInput(input)) {
        var myRun = runId;
        loop(myRun);
      }
    });
    input.addEventListener("blur", restartLoop);

    window.addEventListener(
      "beforeunload",
      function () {
        input.setAttribute("placeholder", input.dataset.nativePlaceholder || "");
      },
      { once: true }
    );

    syncVisibility();
    if (shouldRunForInput(input)) {
      var myRun = runId;
      loop(myRun);
    }
  }

  function init() {
    document.querySelectorAll('[data-typed-ghost="search"].typed-ghost-wrap').forEach(setupOne);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
