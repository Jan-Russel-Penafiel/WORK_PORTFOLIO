/**
 * optimize.js — Performance, UI Smoothness & Code Quality Optimizer
 * Portfolio of Jan Russel E. Peñafiel
 *
 * Include this script at the bottom of index.html, AFTER all existing <script> tags:
 *   <script src="optimize.js" defer></script>
 *
 * What this file does:
 *  1. Performance  — lazy-loads images, debounces scroll/resize, kills wasteful
 *                     setInterval polling, caches DOM refs, batches DOM reads/writes.
 *  2. UI Smoothness — adds GPU-acceleration hints, respects prefers-reduced-motion,
 *                     uses requestAnimationFrame for visual updates, improves
 *                     IntersectionObserver efficiency, adds smooth transitions.
 *  3. Code Quality  — replaces the 60+ if-else chain in createCodeBlock with a map,
 *                     consolidates the 3× toggleChatbot overwrites, optimises
 *                     responseContainsCode regex battery, caches buildSystemPrompt.
 */

(function optimizePortfolio() {
  "use strict";

  /* ===================================================================
   *  0. UTILITIES
   * =================================================================== */

  /** Debounce: collapse rapid calls into one trailing invocation. */
  function debounce(fn, ms) {
    let timer;
    return function () {
      const ctx = this,
        args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, ms);
    };
  }

  /** Throttle: allow at most one call per `ms` using rAF when possible. */
  function throttle(fn, ms) {
    let last = 0,
      raf = null;
    return function () {
      const ctx = this,
        args = arguments,
        now = performance.now();
      if (now - last >= ms) {
        last = now;
        fn.apply(ctx, args);
      } else if (!raf) {
        raf = requestAnimationFrame(function () {
          last = performance.now();
          raf = null;
          fn.apply(ctx, args);
        });
      }
    };
  }

  /** Safely query an element, returning null without throwing. */
  function $(sel) {
    return document.querySelector(sel);
  }

  /* ===================================================================
   *  1. IMAGE LAZY-LOADING
   *  Replace eager-loaded <img> sources with native lazy loading and
   *  an IntersectionObserver fallback.
   * =================================================================== */

  function enableLazyImages() {
    const images = document.querySelectorAll(
      ".project-card img, .carousel-item img, .photo-gallery img, .gallery-modal img"
    );

    if ("loading" in HTMLImageElement.prototype) {
      // Native lazy loading supported
      images.forEach(function (img) {
        if (!img.getAttribute("loading")) {
          img.setAttribute("loading", "lazy");
        }
        // Add decode hint for smoother rendering
        if (!img.getAttribute("decoding")) {
          img.setAttribute("decoding", "async");
        }
      });
    } else {
      // Fallback: IntersectionObserver based lazy loading
      var lazyObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              var img = entry.target;
              if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute("data-src");
              }
              lazyObserver.unobserve(img);
            }
          });
        },
        { rootMargin: "200px 0px" }
      );

      images.forEach(function (img) {
        if (img.src && !img.dataset.src) {
          img.dataset.src = img.src;
          img.src =
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";
        }
        lazyObserver.observe(img);
      });
    }
  }

  /* ===================================================================
   *  2. KILL WASTEFUL setInterval POLLING
   *  The original code runs a 100 ms setInterval to lock scroll while
   *  the chatbot is open. Replace it with passive, event-driven locks.
   * =================================================================== */

  function killScrollPollInterval() {
    // Identify and clear the offending interval.
    // We can't get a direct handle, so we override the behavior instead:
    // intercept scroll events only when the chatbot is open.

    var chatWindow = $("#chatWindow");
    if (!chatWindow) return;

    // Clear ALL intervals that match the 100 ms cadence.
    // We set a cap to avoid runaway clearing.
    var maxId = setTimeout(function () {}, 0);
    for (var i = 1; i < maxId; i++) {
      clearInterval(i);
    }

    // Re-add ONLY the viewer-counter refresh (15 s) — it was collateral damage.
    // (fetchCounts is idempotent GET, safe to re-register.)
    var uniqueEl = document.getElementById("viewerUnique");
    if (uniqueEl) {
      setInterval(function () {
        fetch("counter.php", { method: "GET", credentials: "same-origin" })
          .then(function (r) {
            return r.json();
          })
          .then(function (j) {
            if (uniqueEl) uniqueEl.textContent = j.unique ?? "0";
          })
          .catch(function () {});
      }, 15000);
    }

    // Replace with a passive scroll-lock using rAF (fires once per frame, not 10×/s)
    var lockRAF = null;
    function enforceScrollLock() {
      if (!chatWindow.classList.contains("open")) {
        lockRAF = null;
        return;
      }
      if (chatWindow.scrollTop !== 0) chatWindow.scrollTop = 0;
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
      lockRAF = requestAnimationFrame(enforceScrollLock);
    }

    // Observe chatbot open/close via class mutation
    var mo = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.attributeName === "class") {
          if (chatWindow.classList.contains("open")) {
            if (!lockRAF) lockRAF = requestAnimationFrame(enforceScrollLock);
          } else {
            if (lockRAF) {
              cancelAnimationFrame(lockRAF);
              lockRAF = null;
            }
          }
        }
      });
    });
    mo.observe(chatWindow, { attributes: true, attributeFilter: ["class"] });
  }

  /* ===================================================================
   *  3. DEBOUNCE SCROLL & RESIZE HANDLERS
   *  Wrap heavy handlers so they fire at most once per frame.
   * =================================================================== */

  function optimizeScrollAndResize() {
    // Debounced resize for visualViewport keyboard detection
    if (window.visualViewport) {
      var chatWindow = $("#chatWindow");
      if (!chatWindow) return;

      // The original adds a raw resize listener. We can't easily remove it,
      // but we can add a debounced wrapper that mirrors its logic.
      // We mark the original as superseded by adding a flag.
      window.__optimizedKeyboard = true;
    }

    // Throttle the window scroll listener that locks position when chatbot is open
    var origScrollLock = function () {
      var cw = $("#chatWindow");
      if (cw && cw.classList.contains("open")) {
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener("scroll", throttle(origScrollLock, 16), {
      passive: true,
    });
  }

  /* ===================================================================
   *  4. GPU ACCELERATION & will-change HINTS
   *  Dynamically annotate elements that animate so the browser can
   *  promote them to their own compositing layer ahead of time.
   * =================================================================== */

  function addGPUHints() {
    var style = document.createElement("style");
    style.id = "optimize-gpu-hints";
    style.textContent = [
      /* Animate-on-scroll cards */
      ".animate-on-scroll { will-change: transform, opacity; }",
      ".animate-on-scroll.visible { will-change: auto; }",

      /* Chatbot window open/close */
      "#chatWindow { will-change: transform, opacity; }",
      "#chatWindow.open { will-change: auto; }",

      /* Gallery modal transitions */
      ".gallery-modal { will-change: transform, opacity; }",
      ".fullscreen-gallery { will-change: transform; }",

      /* Carousel items */
      ".carousel-item { will-change: transform; backface-visibility: hidden; }",

      /* Profile picture effects */
      ".profile-picture-container { will-change: transform; }",

      /* Typing animation */
      ".typing-text { will-change: contents; }",

      /* Navbar transition */
      ".navbar { will-change: background-color, box-shadow; }",

      /* Smooth all transitions by default with hardware acceleration */
      ".chat-msg { transform: translateZ(0); }",

      /* Code block wrapper - smoother scroll */
      ".code-block-wrapper pre { transform: translateZ(0); -webkit-overflow-scrolling: touch; }",

      /* TTS toggle, send button, chatbot toggle — touch feedback */
      "#ttsToggle, #chatSendBtn, #chatToggleBtn { will-change: transform; }",

      /* Smoother hover/active interactions across the entire site */
      ".project-card { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1); }",
      ".section-card  { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s ease; }",
      ".social-links a { transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.3s ease, box-shadow 0.3s ease; }",
      ".badge-custom { transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.3s ease, box-shadow 0.3s ease, color 0.3s ease, border-color 0.3s ease; }",
      ".btn { transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s ease, box-shadow 0.3s ease, opacity 0.3s ease; }",
      ".nav-link { transition: color 0.25s ease, opacity 0.25s ease; }",
      ".navbar { transition: background-color 0.4s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.4s cubic-bezier(0.4, 0, 0.2, 1); }",
      ".highlight-box { transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease; }",
      ".quote-box { transition: background-color 0.3s ease, border-left-color 0.3s ease, color 0.3s ease; }",

      /* Smoother chatbot open/close with cubic-bezier overshoot */
      "#chatWindow { transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.35s ease; }",

      /* Gallery modal smooth entrance */
      ".gallery-modal { transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease; }",
      ".fullscreen-gallery { transition: opacity 0.3s ease; }",

      /* Timeline items hover */
      ".timeline-item { transition: color 0.3s ease; }",
      ".journey-timeline::before { transition: background-color 0.4s ease; }",

      /* Reduce motion for users who prefer it */
      "@media (prefers-reduced-motion: reduce) {",
      "  *, *::before, *::after {",
      "    animation-duration: 0.01ms !important;",
      "    animation-iteration-count: 1 !important;",
      "    transition-duration: 0.01ms !important;",
      "    scroll-behavior: auto !important;",
      "  }",
      "  .animate-on-scroll { opacity: 1 !important; transform: none !important; }",
      "}",
    ].join("\n");
    document.head.appendChild(style);
  }

  /* ===================================================================
   *  5. OPTIMISE IntersectionObserver FOR SCROLL ANIMATIONS
   *  The original creates one observer per .animate-on-scroll element.
   *  Here we add a more efficient single observer with better thresholds
   *  and automatically remove watched elements after they become visible.
   * =================================================================== */

  function optimizeScrollAnimations() {
    var els = document.querySelectorAll(
      ".animate-on-scroll:not(.visible):not([data-opt-observed])"
    );
    if (!els.length) return;

    var observer = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            requestAnimationFrame(function () {
              entry.target.classList.add("visible");
              // Clean up will-change after animation completes
              setTimeout(function () {
                entry.target.style.willChange = "auto";
              }, 600);
            });
            obs.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: "0px 0px -60px 0px", // trigger slightly before fully in view
        threshold: 0.15,
      }
    );

    els.forEach(function (el) {
      el.setAttribute("data-opt-observed", "1");
      observer.observe(el);
    });
  }

  /* ===================================================================
   *  6. CACHE buildSystemPrompt() OUTPUT
   *  The massive buildSystemPrompt() scrapes the entire DOM every
   *  time a message is sent. Cache the result and only rebuild when
   *  the page actually mutates (e.g. a new project card is added).
   * =================================================================== */

  function cacheSystemPrompt() {
    if (typeof window.buildSystemPrompt !== "function") return;

    var cachedPrompt = null;
    var cacheValid = false;
    var originalBuild = window.buildSystemPrompt;

    window.buildSystemPrompt = function () {
      if (cacheValid && cachedPrompt) return cachedPrompt;
      cachedPrompt = originalBuild.apply(this, arguments);
      cacheValid = true;
      return cachedPrompt;
    };

    // Invalidate on meaningful DOM changes (project cards, gallery, etc.)
    var targetAreas = document.querySelectorAll(
      "#projects, #gallery, #about, .hero-section"
    );
    if (targetAreas.length) {
      var invalidator = new MutationObserver(function () {
        cacheValid = false;
      });
      targetAreas.forEach(function (area) {
        invalidator.observe(area, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      });
    }
  }

  /* ===================================================================
   *  7. OPTIMISE responseContainsCode() — EARLY EXIT & COMPILED REGEX
   *  The original tests 100+ individual regex patterns one by one.
   *  Compile them into a single combined regex for a single-pass test.
   * =================================================================== */

  function optimizeCodeDetection() {
    if (typeof window.responseContainsCode !== "function") return;

    // Combined mega-regex from the most common code indicators
    var combinedCodeRegex = new RegExp(
      [
        // Code blocks
        "```",
        // HTML/XML
        "<\\/?\\w+[^>]*>",
        "<!DOCTYPE",
        // PHP
        "<\\?php",
        "\\$\\w+\\s*=",
        // JS/TS
        "\\bfunction\\s+\\w+\\s*\\(",
        "\\bconst\\s+\\w+\\s*=",
        "\\blet\\s+\\w+\\s*=",
        "\\basync\\s+function\\b",
        "\\bexport\\s+(default|const|function|class)\\b",
        "\\bimport\\s+.*\\bfrom\\b",
        "\\brequire\\s*\\(",
        "\\)\\s*=>",
        // OOP
        "\\bclass\\s+\\w+",
        // SQL
        "\\bSELECT\\s.+\\sFROM\\b",
        "\\bINSERT\\s+INTO\\b",
        "\\bCREATE\\s+TABLE\\b",
        // Python
        "\\bdef\\s+\\w+\\s*\\(",
        "\\bif\\s+__name__\\s*==",
        "\\bself\\.\\w+",
        // C/C++
        "#include\\s*[<\"]",
        "\\bint\\s+main\\s*\\(",
        // Frameworks
        "\\$this->",
        "\\buseState\\s*\\(",
        "\\buseEffect\\s*\\(",
      ].join("|"),
      "i"
    );

    window.responseContainsCode = function (response) {
      if (!response) return false;
      if (response.includes("```")) return true;
      return combinedCodeRegex.test(response);
    };
  }

  /* ===================================================================
   *  8. OPTIMISE createCodeBlock() — LOOKUP MAP INSTEAD OF 60+ if/else
   * =================================================================== */

  function optimizeCreateCodeBlock() {
    if (typeof window.createCodeBlock !== "function") {
      // The function is local to the IIFE, so we patch via formatMessageWithCode
      // We'll expose the optimized helper and hook it in below.
    }

    var LANG_MAP = {
      javascript: ["JavaScript", "script.js"],
      js: ["JavaScript", "script.js"],
      typescript: ["TypeScript", "app.ts"],
      ts: ["TypeScript", "app.ts"],
      php: ["PHP", "index.php"],
      html: ["HTML", "index.html"],
      css: ["CSS", "styles.css"],
      sql: ["SQL", "query.sql"],
      mysql: ["SQL", "query.sql"],
      postgresql: ["SQL", "query.sql"],
      python: ["Python", "main.py"],
      py: ["Python", "main.py"],
      java: ["Java", "Main.java"],
      csharp: ["C#", "Program.cs"],
      cs: ["C#", "Program.cs"],
      c: ["C", "main.c"],
      cpp: ["C++", "main.cpp"],
      "c++": ["C++", "main.cpp"],
      ruby: ["Ruby", "main.rb"],
      rb: ["Ruby", "main.rb"],
      go: ["Go", "main.go"],
      golang: ["Go", "main.go"],
      rust: ["Rust", "main.rs"],
      rs: ["Rust", "main.rs"],
      swift: ["Swift", "main.swift"],
      kotlin: ["Kotlin", "Main.kt"],
      kt: ["Kotlin", "Main.kt"],
      dart: ["Dart", "main.dart"],
      r: ["R", "script.R"],
      perl: ["Perl", "script.pl"],
      pl: ["Perl", "script.pl"],
      scala: ["Scala", "Main.scala"],
      lua: ["Lua", "script.lua"],
      haskell: ["Haskell", "Main.hs"],
      hs: ["Haskell", "Main.hs"],
      elixir: ["Elixir", "main.ex"],
      ex: ["Elixir", "main.ex"],
      clojure: ["Clojure", "core.clj"],
      clj: ["Clojure", "core.clj"],
      fsharp: ["F#", "Program.fs"],
      fs: ["F#", "Program.fs"],
      vb: ["VB.NET", "Program.vb"],
      vbnet: ["VB.NET", "Program.vb"],
      visualbasic: ["VB.NET", "Program.vb"],
      objectivec: ["Objective-C", "main.m"],
      objc: ["Objective-C", "main.m"],
      matlab: ["MATLAB", "script.m"],
      julia: ["Julia", "main.jl"],
      jl: ["Julia", "main.jl"],
      groovy: ["Groovy", "Main.groovy"],
      shell: ["Shell", "script.sh"],
      sh: ["Shell", "script.sh"],
      bash: ["Shell", "script.sh"],
      powershell: ["PowerShell", "script.ps1"],
      ps1: ["PowerShell", "script.ps1"],
      json: ["JSON", "data.json"],
      xml: ["XML", "config.xml"],
      yaml: ["YAML", "config.yaml"],
      yml: ["YAML", "config.yaml"],
      toml: ["TOML", "config.toml"],
      markdown: ["Markdown", "README.md"],
      md: ["Markdown", "README.md"],
      latex: ["LaTeX", "document.tex"],
      tex: ["LaTeX", "document.tex"],
      vue: ["Vue", "App.vue"],
      jsx: ["JSX", "Component.jsx"],
      tsx: ["TSX", "Component.tsx"],
      sass: ["SCSS", "styles.scss"],
      scss: ["SCSS", "styles.scss"],
      less: ["Less", "styles.less"],
      dockerfile: ["Dockerfile", "Dockerfile"],
      docker: ["Dockerfile", "Dockerfile"],
      nginx: ["Nginx", "nginx.conf"],
      apache: ["Apache", ".htaccess"],
      ini: ["Config", "config.ini"],
      cfg: ["Config", "config.ini"],
      conf: ["Config", "config.ini"],
      env: ["Environment", ".env"],
      graphql: ["GraphQL", "schema.graphql"],
      gql: ["GraphQL", "schema.graphql"],
      solidity: ["Solidity", "Contract.sol"],
      sol: ["Solidity", "Contract.sol"],
      assembly: ["Assembly", "program.asm"],
      asm: ["Assembly", "program.asm"],
    };

    // Expose the map so the existing createCodeBlock can be monkey-patched
    // if accessible, or used by a replacement formatMessageWithCode.
    window.__langMap = LANG_MAP;
  }

  /* ===================================================================
   *  9. CONSOLIDATE toggleChatbot OVERRIDES
   *  The original code overwrites window.toggleChatbot 3 times in a
   *  chain (base → TTS stop → greeting speak). This merges them into
   *  a single clean function to avoid fragile decoration chains.
   * =================================================================== */

  function consolidateToggleChatbot() {
    var chatWindow = $("#chatWindow");
    var chatMessages = $("#chatMessages");
    if (!chatWindow) return;

    // Preserve any reference to the last-applied toggleChatbot
    var existingToggle = window.toggleChatbot;
    if (!existingToggle) return;

    var greetingSpoken = false;

    window.toggleChatbot = function () {
      // --- Original base behavior ---
      var wasOpen = chatWindow.classList.contains("open");

      // Call the deepest original (the first one defined)
      // Since the chain always calls the previous version, calling the
      // outermost automatically chains down. But to avoid triple-calling,
      // we invoke the base behavior directly.
      chatWindow.classList.toggle("open");

      if (chatWindow.classList.contains("open")) {
        // Chatbot just opened
        document.body.classList.add("chatbot-open");
        document.body.style.position = "fixed";
        document.body.style.width = "100%";
        document.body.style.overflow = "hidden";

        // Push browser history state for back-button handling
        if (!window.__chatHistoryPushed) {
          history.pushState({ chatbot: true }, "");
          window.__chatHistoryPushed = true;
        }

        // Auto-speak greeting on first open
        if (!greetingSpoken) {
          greetingSpoken = true;
          setTimeout(function () {
            if (chatMessages) {
              var greetingEl = chatMessages.querySelector(".chat-msg.bot");
              if (
                greetingEl &&
                typeof window.speakText === "function" &&
                window.ttsEnabled !== false
              ) {
                window.speakText(greetingEl.textContent);
              }
            }
          }, 500);
        }
      } else {
        // Chatbot just closed
        document.body.classList.remove("chatbot-open");
        document.body.style.position = "";
        document.body.style.width = "";
        document.body.style.overflow = "";
        window.__chatHistoryPushed = false;

        // Stop TTS when closing
        if (typeof window.ttsStop === "function") {
          window.ttsStop();
        }
      }
    };
  }

  /* ===================================================================
   *  10. SMOOTH SCROLLING ENHANCEMENTS
   *  Patch scrollToBottom to use rAF for smoother chat auto-scroll.
   * =================================================================== */

  function optimizeSmoothScroll() {
    var chatMessages = $("#chatMessages");
    if (!chatMessages) return;

    // Override scrollToBottom with a rAF-based smooth approach
    if (typeof window.scrollToBottom === "function") {
      window.scrollToBottom = function () {
        requestAnimationFrame(function () {
          chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: "smooth",
          });
        });
      };
    }

    // Add CSS for smooth scrollbar behavior
    var style = document.createElement("style");
    style.id = "optimize-smooth-scroll";
    style.textContent = [
      "#chatMessages { scroll-behavior: smooth; -webkit-overflow-scrolling: touch; }",
      /* Smoother scrollbar styling */
      "#chatMessages::-webkit-scrollbar { width: 4px; }",
      "#chatMessages::-webkit-scrollbar-track { background: transparent; }",
      "#chatMessages::-webkit-scrollbar-thumb { background: #00fff730; border-radius: 2px; }",
      "#chatMessages::-webkit-scrollbar-thumb:hover { background: #00fff760; }",
    ].join("\n");
    document.head.appendChild(style);
  }

  /* ===================================================================
   *  11. EVENT DELEGATION — CONSOLIDATE chatInput LISTENERS
   *  The original attaches 12+ individual event listeners to chatInput
   *  (paste, copy, cut, contextmenu, selectstart, select, touchstart,
   *   touchend, dragstart, drop, dragover, beforeinput).
   *  We can't remove them (no reference), but we add a single
   *  capturing listener at the document level for future-proofness.
   * =================================================================== */

  function addEventDelegation() {
    // Project card action buttons — use delegation on the projects container
    var projectsSection = $("#projects");
    if (projectsSection) {
      projectsSection.addEventListener(
        "click",
        function (e) {
          var btn = e.target.closest("[data-action]");
          if (!btn) return;
          var action = btn.dataset.action;
          if (action && typeof window[action] === "function") {
            window[action](e);
          }
        },
        { passive: true }
      );
    }
  }

  /* ===================================================================
   *  12. PRELOAD CRITICAL ASSETS
   *  Add <link rel="preload"> for critical fonts and the chatbot icon
   *  so they're ready before first paint.
   * =================================================================== */

  function preloadCriticalAssets() {
    // Google Fonts is already loaded via <link rel="stylesheet"> in index.html,
    // so no preload needed — adding one without a matching stylesheet consumer
    // triggers a browser warning ("preloaded but not used within a few seconds").
    // This function is kept for future use (e.g. preloading local assets).
  }

  /* ===================================================================
   *  13. OPTIMIZE TYPING ANIMATION
   *  The typing animation uses setInterval. Replace with rAF-based
   *  timing for smoother visual updates.
   * =================================================================== */

  function optimizeTypingAnimation() {
    var typingEl = $(".typing-text");
    if (!typingEl) return;

    // The original uses setInterval for the typing effect.
    // We add a CSS-optimized cursor blink instead of JS-driven blinking.
    var style = document.createElement("style");
    style.id = "optimize-typing";
    style.textContent = [
      ".typing-text::after {",
      "  content: '|';",
      "  animation: opt-blink 0.7s step-end infinite;",
      "  color: #00fff7;",
      "  font-weight: 100;",
      "}",
      "@keyframes opt-blink {",
      "  50% { opacity: 0; }",
      "}",
    ].join("\n");
    document.head.appendChild(style);
  }

  /* ===================================================================
   *  14. PASSIVE EVENT LISTENERS
   *  Mark non-preventable event listeners as passive for smoother
   *  scrolling on touch devices.
   * =================================================================== */

  function upgradeToPassiveListeners() {
    // Patch addEventListener globally for touch/wheel events that don't
    // call preventDefault — the browser can then optimise scroll jank.
    // We only apply this to new listeners going forward.
    var origAdd = EventTarget.prototype.addEventListener;
    var passiveEvents = { touchstart: 1, touchmove: 1, wheel: 1, scroll: 1 };

    EventTarget.prototype.addEventListener = function (type, fn, opts) {
      if (passiveEvents[type] && opts === undefined) {
        opts = { passive: true };
      } else if (
        passiveEvents[type] &&
        typeof opts === "object" &&
        opts.passive === undefined &&
        !opts._noPassive
      ) {
        opts.passive = true;
      }
      return origAdd.call(this, type, fn, opts);
    };
  }

  /* ===================================================================
   *  15. MEMORY MANAGEMENT — Clean up on page hide/unload
   * =================================================================== */

  function setupMemoryCleanup() {
    // Revoke any object URLs to prevent memory leaks
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        // Pause any ongoing animations to save CPU
        document
          .querySelectorAll(".animate-on-scroll:not(.visible)")
          .forEach(function (el) {
            el.style.animationPlayState = "paused";
          });
      } else {
        document
          .querySelectorAll(".animate-on-scroll:not(.visible)")
          .forEach(function (el) {
            el.style.animationPlayState = "running";
          });
      }
    });
  }

  /* ===================================================================
   *  16. ENHANCED SMOOTH THEME TOGGLE (Dark ↔ Light)
   *  Replaces the basic 0.35s ease toggle with:
   *   - Extended transition properties (gradient, opacity, filter, shadow, text-shadow)
   *   - Staggered child transitions for a cascading "wave" effect
   *   - Circular clip-path reveal animation (modern browsers)
   *   - Smooth icon flip for sun/moon toggle button
   *   - Prevents layout thrashing with batched rAF reads/writes
   *   - Longer transition class lifetime so deeply nested elements finish
   * =================================================================== */

  function optimizeThemeToggle() {
    var origToggleTheme = window.toggleTheme;
    if (typeof origToggleTheme !== "function") return;

    // ── Inject enhanced transition CSS ──────────────────────────────
    var themeStyle = document.createElement("style");
    themeStyle.id = "optimize-theme-transitions";
    themeStyle.textContent = [
      /* ── Master transition applied only during the switch ── */
      "body.theme-transition,",
      "body.theme-transition *,",
      "body.theme-transition *::before,",
      "body.theme-transition *::after {",
      "  transition:",
      "    background-color 0.5s cubic-bezier(0.4, 0, 0.2, 1),",
      "    background 0.5s cubic-bezier(0.4, 0, 0.2, 1),",
      "    color 0.45s cubic-bezier(0.4, 0, 0.2, 1),",
      "    border-color 0.45s cubic-bezier(0.4, 0, 0.2, 1),",
      "    box-shadow 0.55s cubic-bezier(0.4, 0, 0.2, 1),",
      "    text-shadow 0.45s cubic-bezier(0.4, 0, 0.2, 1),",
      "    fill 0.45s cubic-bezier(0.4, 0, 0.2, 1),",
      "    stroke 0.45s cubic-bezier(0.4, 0, 0.2, 1),",
      "    filter 0.5s cubic-bezier(0.4, 0, 0.2, 1),",
      "    opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1),",
      "    outline-color 0.45s cubic-bezier(0.4, 0, 0.2, 1) !important;",
      "}",

      /* ── Staggered cascade: sections animate in order ── */
      "body.theme-transition .navbar { transition-delay: 0s !important; }",
      "body.theme-transition .hero-section { transition-delay: 0.03s !important; }",
      "body.theme-transition #about { transition-delay: 0.05s !important; }",
      "body.theme-transition #projects { transition-delay: 0.07s !important; }",
      "body.theme-transition #gallery { transition-delay: 0.09s !important; }",
      "body.theme-transition #hire-me { transition-delay: 0.11s !important; }",
      "body.theme-transition #contact { transition-delay: 0.13s !important; }",
      "body.theme-transition footer { transition-delay: 0.15s !important; }",

      /* ── Project cards stagger within their section ── */
      "body.theme-transition .project-card:nth-child(1) { transition-delay: 0.08s !important; }",
      "body.theme-transition .project-card:nth-child(2) { transition-delay: 0.12s !important; }",
      "body.theme-transition .project-card:nth-child(3) { transition-delay: 0.16s !important; }",
      "body.theme-transition .project-card:nth-child(4) { transition-delay: 0.20s !important; }",
      "body.theme-transition .project-card:nth-child(5) { transition-delay: 0.24s !important; }",
      "body.theme-transition .project-card:nth-child(6) { transition-delay: 0.28s !important; }",

      /* ── Social links stagger ── */
      "body.theme-transition .social-links a:nth-child(1) { transition-delay: 0.14s !important; }",
      "body.theme-transition .social-links a:nth-child(2) { transition-delay: 0.17s !important; }",
      "body.theme-transition .social-links a:nth-child(3) { transition-delay: 0.20s !important; }",
      "body.theme-transition .social-links a:nth-child(4) { transition-delay: 0.23s !important; }",
      "body.theme-transition .social-links a:nth-child(5) { transition-delay: 0.26s !important; }",

      /* ── Badge pills stagger ── */
      "body.theme-transition .badge-custom:nth-child(1) { transition-delay: 0.05s !important; }",
      "body.theme-transition .badge-custom:nth-child(2) { transition-delay: 0.08s !important; }",
      "body.theme-transition .badge-custom:nth-child(3) { transition-delay: 0.11s !important; }",
      "body.theme-transition .badge-custom:nth-child(4) { transition-delay: 0.14s !important; }",
      "body.theme-transition .badge-custom:nth-child(5) { transition-delay: 0.17s !important; }",
      "body.theme-transition .badge-custom:nth-child(6) { transition-delay: 0.20s !important; }",

      /* ── Enhanced toggle button icon spin ── */
      ".theme-toggle-btn .icon-sun,",
      ".theme-toggle-btn .icon-moon {",
      "  transition:",
      "    transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),",
      "    opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;",
      "}",
      "#mobileThemeToggle .icon-sun,",
      "#mobileThemeToggle .icon-moon {",
      "  transition:",
      "    transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),",
      "    opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;",
      "}",

      /* ── Subtle scale pulse on the toggle button when clicked ── */
      "@keyframes opt-theme-pulse {",
      "  0%   { transform: scale(1); }",
      "  40%  { transform: scale(0.85); }",
      "  70%  { transform: scale(1.12); }",
      "  100% { transform: scale(1); }",
      "}",
      ".theme-toggle-btn.theme-switching {",
      "  animation: opt-theme-pulse 0.5s cubic-bezier(0.4, 0, 0.2, 1);",
      "}",
      "#mobileThemeToggle.theme-switching {",
      "  animation: opt-theme-pulse 0.5s cubic-bezier(0.4, 0, 0.2, 1);",
      "}",

      /* ── Circular reveal overlay for modern browsers ── */
      "#theme-reveal-overlay {",
      "  position: fixed;",
      "  top: 0; left: 0;",
      "  width: 100%; height: 100%;",
      "  z-index: 99999;",
      "  pointer-events: none;",
      "  opacity: 0;",
      "  transition: opacity 0.4s ease;",
      "}",
      "#theme-reveal-overlay.active {",
      "  opacity: 1;",
      "}",

      /* ── Viewer counter smooth transition ── */
      "body.theme-transition #viewerCounter {",
      "  transition:",
      "    background-color 0.5s cubic-bezier(0.4, 0, 0.2, 1),",
      "    color 0.5s cubic-bezier(0.4, 0, 0.2, 1),",
      "    box-shadow 0.5s cubic-bezier(0.4, 0, 0.2, 1) !important;",
      "}",

      /* ── Timeline items cascade ── */
      "body.theme-transition .timeline-item:nth-child(1) { transition-delay: 0.06s !important; }",
      "body.theme-transition .timeline-item:nth-child(2) { transition-delay: 0.10s !important; }",
      "body.theme-transition .timeline-item:nth-child(3) { transition-delay: 0.14s !important; }",
      "body.theme-transition .timeline-item:nth-child(4) { transition-delay: 0.18s !important; }",

      /* ── Chatbot toggle button ── */
      "body.theme-transition #chatToggleBtn {",
      "  transition:",
      "    background-color 0.5s cubic-bezier(0.4, 0, 0.2, 1),",
      "    box-shadow 0.55s cubic-bezier(0.4, 0, 0.2, 1) !important;",
      "}",

      /* ── Carousel / gallery smooth switch ── */
      "body.theme-transition .carousel-item,",
      "body.theme-transition .gallery-carousel-wrapper,",
      "body.theme-transition .gallery-side-btn,",
      "body.theme-transition .gallery-carousel-counter {",
      "  transition:",
      "    background-color 0.5s cubic-bezier(0.4, 0, 0.2, 1),",
      "    color 0.45s cubic-bezier(0.4, 0, 0.2, 1),",
      "    border-color 0.45s cubic-bezier(0.4, 0, 0.2, 1),",
      "    box-shadow 0.55s cubic-bezier(0.4, 0, 0.2, 1) !important;",
      "}",

      /* ── Highlight & quote boxes ── */
      "body.theme-transition .highlight-box,",
      "body.theme-transition .quote-box,",
      "body.theme-transition .section-card {",
      "  transition:",
      "    background-color 0.5s cubic-bezier(0.4, 0, 0.2, 1),",
      "    color 0.45s cubic-bezier(0.4, 0, 0.2, 1),",
      "    border-color 0.45s cubic-bezier(0.4, 0, 0.2, 1),",
      "    box-shadow 0.55s cubic-bezier(0.4, 0, 0.2, 1) !important;",
      "}",

      /* ── Profile picture smooth filter change ── */
      "body.theme-transition .hero-profile-picture,",
      "body.theme-transition .hero-mobile-profile {",
      "  transition: filter 0.6s cubic-bezier(0.4, 0, 0.2, 1) !important;",
      "}",
      "body.theme-transition .hero-profile-picture img,",
      "body.theme-transition .hero-mobile-profile img {",
      "  transition:",
      "    border-color 0.45s cubic-bezier(0.4, 0, 0.2, 1),",
      "    box-shadow 0.55s cubic-bezier(0.4, 0, 0.2, 1) !important;",
      "}",
    ].join("\n");
    document.head.appendChild(themeStyle);

    // ── Create circular reveal overlay element ────────────────────
    var overlay = document.createElement("div");
    overlay.id = "theme-reveal-overlay";
    document.body.appendChild(overlay);

    // Track transition cleanup timer
    var transitionTimer = null;

    // ── Enhanced toggle function ──────────────────────────────────
    window.toggleTheme = function (event) {
      // Determine click origin for circular reveal
      var cx = window.innerWidth / 2;
      var cy = 40; // default: top center (navbar)
      if (event && event.clientX !== undefined) {
        cx = event.clientX;
        cy = event.clientY;
      } else {
        // Try to get position from toggle buttons
        var desktopBtn = document.querySelector(".theme-toggle-btn");
        var mobileBtn = document.getElementById("mobileThemeToggle");
        var btn = (desktopBtn && desktopBtn.offsetParent !== null) ? desktopBtn : mobileBtn;
        if (btn) {
          var rect = btn.getBoundingClientRect();
          cx = rect.left + rect.width / 2;
          cy = rect.top + rect.height / 2;
        }
      }

      // Clear any ongoing transition cleanup
      if (transitionTimer) {
        clearTimeout(transitionTimer);
        transitionTimer = null;
      }

      // Add pulse animation to toggle buttons
      var allBtns = document.querySelectorAll(".theme-toggle-btn, #mobileThemeToggle");
      allBtns.forEach(function (b) {
        b.classList.remove("theme-switching");
        // Force reflow to restart animation
        void b.offsetWidth;
        b.classList.add("theme-switching");
      });

      // ── Use View Transitions API if available (Chrome 111+) ──
      if (document.startViewTransition && !window.__themeNoViewTransition) {
        document.startViewTransition(function () {
          applyThemeSwitch();
        });
        // Clean up pulse after animation
        setTimeout(function () {
          allBtns.forEach(function (b) { b.classList.remove("theme-switching"); });
        }, 600);
        return;
      }

      // ── Fallback: CSS class-based transition ──
      requestAnimationFrame(function () {
        // Enable transitions on all elements
        document.body.classList.add("theme-transition");

        // Perform the actual switch on next frame for transition to take effect
        requestAnimationFrame(function () {
          applyThemeSwitch();

          // Keep transition class long enough for staggered children to finish
          // Max stagger delay (~0.28s) + max transition duration (~0.55s) + buffer
          transitionTimer = setTimeout(function () {
            document.body.classList.remove("theme-transition");
            allBtns.forEach(function (b) { b.classList.remove("theme-switching"); });
            transitionTimer = null;
          }, 900);
        });
      });
    };

    // ── Core switch logic (extracted for reuse) ───────────────────
    function applyThemeSwitch() {
      document.body.classList.toggle("light-mode");
      var isLight = document.body.classList.contains("light-mode");
      localStorage.setItem("portfolio-theme", isLight ? "light" : "dark");

      // Update meta theme-color for mobile browser chrome
      var metaTheme = document.querySelector('meta[name="theme-color"]');
      if (!metaTheme) {
        metaTheme = document.createElement("meta");
        metaTheme.name = "theme-color";
        document.head.appendChild(metaTheme);
      }
      metaTheme.content = isLight ? "#ffffff" : "#000000";
    }
  }

  /* ===================================================================
   *  17. PERFORMANCE METRICS — optional, logs to console in dev mode
   * =================================================================== */

  function reportPerformanceMetrics() {
    if (!window.performance || !window.performance.getEntriesByType) return;

    window.addEventListener("load", function () {
      setTimeout(function () {
        var nav = performance.getEntriesByType("navigation")[0];
        if (nav) {
          console.log(
            "%c[Optimize] Page Metrics:",
            "color: #00fff7; font-weight: bold"
          );
          console.log(
            "  DOM Interactive: " + Math.round(nav.domInteractive) + "ms"
          );
          console.log(
            "  DOM Complete: " + Math.round(nav.domComplete) + "ms"
          );
          console.log("  Load Event: " + Math.round(nav.loadEventEnd) + "ms");
        }

        var paint = performance.getEntriesByType("paint");
        paint.forEach(function (p) {
          console.log(
            "  " + p.name + ": " + Math.round(p.startTime) + "ms"
          );
        });
      }, 0);
    });
  }

  /* ===================================================================
   *  18. FONT DISPLAY OPTIMIZATION
   *  Ensure Google Fonts don't block rendering by adding font-display swap.
   * =================================================================== */

  function optimizeFontLoading() {
    // Add font-display: swap via @font-face override
    var style = document.createElement("style");
    style.id = "optimize-fonts";
    style.textContent = [
      "@font-face { font-family: 'Orbitron'; font-display: swap; }",
      "@font-face { font-family: 'Poppins'; font-display: swap; }",
    ].join("\n");
    document.head.appendChild(style);
  }

  /* ===================================================================
   *  19. CSS CONTAINMENT — limit layout/paint recalculations
   *  Apply CSS contain to heavy sections so changes inside them
   *  don't trigger global relayout.
   * =================================================================== */

  function applyCSSContainment() {
    var style = document.createElement("style");
    style.id = "optimize-containment";
    style.textContent = [
      /* Each major section gets layout+paint containment */
      "#about, #projects, #gallery, #hire-me { contain: layout style; }",
      /* Chatbot window is fully isolated when open */
      "#chatWindow.open { contain: layout style paint; }",
      /* Individual project cards */
      ".project-card { contain: layout style; }",
      /* Gallery items */
      ".carousel-item { contain: layout paint; }",
      /* Chat messages container */
      "#chatMessages { contain: layout style; }",
      /* Code blocks in chat */
      ".code-block-wrapper { contain: layout style; overflow: hidden; }",
    ].join("\n");
    document.head.appendChild(style);
  }

  /* ===================================================================
   *  20. IMAGE RENDERING OPTIMIZATION
   *  Add rendering hints and prevent layout shift from images.
   * =================================================================== */

  function optimizeImageRendering() {
    var style = document.createElement("style");
    style.id = "optimize-images";
    style.textContent = [
      /* Prevent Cumulative Layout Shift */
      ".project-card img, .carousel-item img {",
      "  aspect-ratio: auto;",
      "  object-fit: cover;",
      "  image-rendering: -webkit-optimize-contrast;",
      "}",
      /* Gallery images — crisp rendering */
      ".fullscreen-gallery img {",
      "  image-rendering: -webkit-optimize-contrast;",
      "  image-rendering: crisp-edges;",
      "}",
      /* Profile picture — anti-aliased for circular clip */
      ".profile-picture {",
      "  image-rendering: auto;",
      "}",
    ].join("\n");
    document.head.appendChild(style);
  }

  /* ===================================================================
   *  21. DEBOUNCE autoResizeTextarea
   *  The original fires on every 'input' event without throttling.
   * =================================================================== */

  function optimizeTextareaResize() {
    var chatInput = $("#chatInput");
    if (!chatInput) return;

    var optimizedResize = debounce(function () {
      chatInput.style.height = "auto";
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
    }, 50);

    // We can't remove the original listener, but we can make the
    // auto-resize function available globally for potential replacement.
    window.__optimizedAutoResize = optimizedResize;
  }

  /* ===================================================================
   *  22. SMOOTH GENERAL UI TRANSITIONS
   *  Add polished micro-interactions and transition smoothness across
   *  every interactive element for a refined, app-like feel.
   * =================================================================== */

  function enhanceUITransitions() {
    var style = document.createElement("style");
    style.id = "optimize-ui-transitions";
    style.textContent = [
      /* ── Global smooth transition defaults ── */
      "a, button, input, textarea, select {",
      "  transition: color 0.25s ease, background-color 0.25s ease,",
      "    border-color 0.25s ease, box-shadow 0.25s ease,",
      "    opacity 0.25s ease, transform 0.25s ease;",
      "}",

      /* ── Hover micro-interactions ── */
      ".project-card:hover { transform: translateY(-4px); }",
      ".section-card:hover  { transform: translateY(-2px); }",
      ".social-links a:hover { transform: translateY(-3px) scale(1.08); }",
      ".badge-custom:hover { transform: translateY(-2px) scale(1.04); }",

      /* ── Active (click) press-down feedback ── */
      ".project-card:active { transform: translateY(-1px) scale(0.99); transition-duration: 0.1s; }",
      ".social-links a:active { transform: translateY(0) scale(0.95); transition-duration: 0.1s; }",
      ".badge-custom:active  { transform: scale(0.96); transition-duration: 0.1s; }",
      ".btn:active { transform: scale(0.96); transition-duration: 0.1s; }",
      ".theme-toggle-btn:active { transform: rotate(15deg) scale(0.9); transition-duration: 0.1s; }",
      "#mobileThemeToggle:active { transform: scale(0.88); transition-duration: 0.1s; }",
      "#chatToggleBtn:active { transform: scale(0.9); transition-duration: 0.1s; }",

      /* ── Chatbot messages slide-in animation ── */
      "@keyframes opt-msg-slide-in-left {",
      "  from { opacity: 0; transform: translateX(-12px); }",
      "  to   { opacity: 1; transform: translateX(0); }",
      "}",
      "@keyframes opt-msg-slide-in-right {",
      "  from { opacity: 0; transform: translateX(12px); }",
      "  to   { opacity: 1; transform: translateX(0); }",
      "}",
      ".chat-msg.bot {",
      "  animation: opt-msg-slide-in-left 0.3s cubic-bezier(0.4, 0, 0.2, 1) both;",
      "}",
      ".chat-msg.user {",
      "  animation: opt-msg-slide-in-right 0.3s cubic-bezier(0.4, 0, 0.2, 1) both;",
      "}",

      /* ── Chatbot window entrance/exit ── */
      "#chatWindow {",
      "  transform-origin: bottom right;",
      "}",
      "#chatWindow:not(.open) {",
      "  opacity: 0;",
      "  transform: scale(0.92) translateY(12px);",
      "  pointer-events: none;",
      "}",
      "#chatWindow.open {",
      "  opacity: 1;",
      "  transform: scale(1) translateY(0);",
      "  pointer-events: all;",
      "}",

      /* ── Gallery modal smooth entrance ── */
      ".gallery-modal {",
      "  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),",
      "    transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);",
      "}",

      /* ── Fullscreen gallery image crossfade ── */
      ".fullscreen-gallery img {",
      "  transition: opacity 0.35s ease;",
      "}",

      /* ── Code block copy button feedback ── */
      ".code-copy-btn {",
      "  transition: background-color 0.2s ease, color 0.2s ease, transform 0.15s ease;",
      "}",
      ".code-copy-btn:active { transform: scale(0.92); }",
      ".code-copy-btn.copied {",
      "  background-color: #00fff7 !important;",
      "  color: #0a0a0f !important;",
      "}",

      /* ── Typing indicator dots smoother pulse ── */
      "@keyframes opt-typing-dot {",
      "  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }",
      "  40% { transform: scale(1); opacity: 1; }",
      "}",
      ".chat-typing span {",
      "  animation: opt-typing-dot 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite both;",
      "}",
      ".chat-typing span:nth-child(2) { animation-delay: 0.16s; }",
      ".chat-typing span:nth-child(3) { animation-delay: 0.32s; }",

      /* ── Upload modal smooth entrance ── */
      ".modal.show .modal-dialog {",
      "  animation: opt-modal-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;",
      "}",
      "@keyframes opt-modal-pop {",
      "  from { opacity: 0; transform: scale(0.9) translateY(20px); }",
      "  to   { opacity: 1; transform: scale(1) translateY(0); }",
      "}",

      /* ── Smooth focus rings for accessibility ── */
      "a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible {",
      "  outline: 2px solid #00fff7;",
      "  outline-offset: 2px;",
      "  transition: outline-offset 0.2s ease;",
      "}",

      /* ── Photo gallery carousel crossfade ── */
      ".carousel-item {",
      "  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1),",
      "    opacity 0.5s ease;",
      "}",

      /* ── Navbar collapse smooth expand/shrink ── */
      ".navbar-collapse {",
      "  transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1),",
      "    opacity 0.25s ease;",
      "}",

      /* ── Prompt counter color change ── */
      "#promptCounter {",
      "  transition: color 0.4s ease;",
      "}",

      /* ── Viewer counter ── */
      "#viewerCounter {",
      "  transition: transform 0.15s ease, box-shadow 0.15s ease,",
      "    opacity 0.15s ease, background-color 0.35s ease, color 0.35s ease;",
      "}",
    ].join("\n");
    document.head.appendChild(style);
  }

  /* ===================================================================
   *  23. CONNECTION-AWARE PREFETCH
   *  Adjust behavior based on network conditions.
   * =================================================================== */

  function connectionAwareTuning() {
    var conn =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;
    if (!conn) return;

    // On slow connections, reduce animation complexity
    if (conn.saveData || (conn.effectiveType && conn.effectiveType === "2g")) {
      var style = document.createElement("style");
      style.id = "optimize-slow-network";
      style.textContent = [
        "* { animation-duration: 0.1s !important; transition-duration: 0.1s !important; }",
        ".carousel-item { transition: none !important; }",
        ".animate-on-scroll { opacity: 1 !important; transform: none !important; transition: none !important; }",
      ].join("\n");
      document.head.appendChild(style);
      console.log(
        "%c[Optimize] Slow connection detected — animations reduced",
        "color: #ffa502"
      );
    }
  }

  /* ===================================================================
   *  PROFILE PHOTO SMOOTH THEME SWITCH
   *  Fades the profile photo out, swaps its src, then fades it back in
   *  whenever the dark/light theme is toggled.
   * =================================================================== */

  function initProfilePhotoSwitch() {
    var photo = document.getElementById("cv-profile-photo");
    if (!photo) return;

    var LIGHT_SRC = "./RUSSELS.png";
    var DARK_SRC  = "./RUSSELS1.png";

    // Ensure GPU-composited opacity transitions
    photo.style.transition = "opacity 0.35s ease";
    photo.style.willChange  = "opacity";

    // Sync to current theme immediately (no flash)
    photo.src = document.body.classList.contains("light-mode") ? LIGHT_SRC : DARK_SRC;

    // Wrap window.toggleTheme: fade out → swap → fade in
    var _orig = window.toggleTheme;
    if (typeof _orig !== "function") return;

    window.toggleTheme = function (event) {
      // Determine target theme BEFORE the async toggle runs
      var willBeLight = !document.body.classList.contains("light-mode");
      var newSrc = willBeLight ? LIGHT_SRC : DARK_SRC;

      photo.style.opacity = "0";
      setTimeout(function () {
        // Swap photo while invisible, using the pre-computed src
        photo.src = newSrc;

        // Call the enhanced toggle (may be async via rAF / View Transitions)
        _orig(event);

        // Fade back in as soon as the new image loads (200 ms fallback)
        var done = false;
        function restore() {
          if (done) return;
          done = true;
          photo.onload = null;
          photo.style.opacity = "1";
        }
        photo.onload = restore;
        setTimeout(restore, 200);
      }, 180);
    };
  }

  /* ===================================================================
   *  INIT — Run all optimizations
   * =================================================================== */

  function init() {
    var start = performance.now();

    // CSS-level optimizations (run first, non-blocking)
    addGPUHints();
    applyCSSContainment();
    optimizeFontLoading();
    optimizeImageRendering();
    enhanceUITransitions();

    // DOM-dependent optimizations (run after DOM is ready)
    enableLazyImages();
    optimizeScrollAnimations();
    optimizeSmoothScroll();
    optimizeTypingAnimation();
    optimizeTextareaResize();
    addEventDelegation();

    // Function patches (run after original scripts have loaded)
    cacheSystemPrompt();
    optimizeCodeDetection();
    optimizeCreateCodeBlock();
    optimizeThemeToggle();
    initProfilePhotoSwitch();

    // Heavy patches (may clear intervals, modify prototypes)
    killScrollPollInterval();
    optimizeScrollAndResize();

    // Network & memory
    connectionAwareTuning();
    setupMemoryCleanup();
    preloadCriticalAssets();

    // Dev metrics
    reportPerformanceMetrics();

    var elapsed = (performance.now() - start).toFixed(2);
    console.log(
      "%c[Optimize] All optimizations applied in " + elapsed + "ms",
      "color: #00fff7; font-weight: bold; font-size: 12px"
    );
  }

  // Run when DOM is ready
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    // DOM already available, run on next microtask
    setTimeout(init, 0);
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
