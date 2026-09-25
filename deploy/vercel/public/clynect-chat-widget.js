(function () {
  "use strict";
  if (window.__clynectChatWidgetLoaded) return;
  window.__clynectChatWidgetLoaded = true;
  var script = document.currentScript;
  if (!script) return;
  var source = new URL(script.src, window.location.href);
  var chatOrigin = script.dataset.chatUrl || source.origin;
  var position = script.dataset.position === "left" ? "left" : "right";
  var buttonLabel = script.dataset.label || "Ouvrir Cly, le Copilot Clynect";
  var title = script.dataset.title || "Cly · Copilot IA";
  var greeting = script.dataset.greeting || "Bonjour, je suis Cly";
  var hint = script.dataset.hint || "Comment puis-je vous aider ?";
  var host = document.createElement("div");
  host.id = "clynect-chat-widget";
  host.setAttribute("data-position", position);
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" });
  var stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = new URL("/clynect-chat-widget.css", chatOrigin).href;
  root.appendChild(stylesheet);
  var launcher = document.createElement("button");
  launcher.className = "cly-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", buttonLabel);
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 5.25h13A3.25 3.25 0 0 1 21.75 8.5v6a3.25 3.25 0 0 1-3.25 3.25h-6.2l-4.65 3.1a.75.75 0 0 1-1.17-.62v-2.48H5.5a3.25 3.25 0 0 1-3.25-3.25v-6A3.25 3.25 0 0 1 5.5 5.25Z"/><circle cx="8" cy="11.5" r="1.15"/><circle cx="12" cy="11.5" r="1.15"/><circle cx="16" cy="11.5" r="1.15"/></svg>';
  var panel = document.createElement("section");
  panel.className = "cly-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-label", title);
  panel.hidden = true;
  var header = document.createElement("header");
  header.className = "cly-header";
  header.innerHTML = '<span class="cly-mark" aria-hidden="true">C</span><span><strong></strong><small>IA connectée</small></span>';
  header.querySelector("strong").textContent = title;
  var close = document.createElement("button");
  close.className = "cly-close";
  close.type = "button";
  close.setAttribute("aria-label", "Fermer le chat");
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  header.appendChild(close);
  var welcome = document.createElement("div");
  welcome.className = "cly-welcome";
  var welcomeTitle = document.createElement("strong");
  welcomeTitle.textContent = greeting;
  var welcomeHint = document.createElement("span");
  welcomeHint.textContent = hint;
  welcome.append(welcomeTitle, welcomeHint);
  var frameWrap = document.createElement("div");
  frameWrap.className = "cly-frame-wrap";
  panel.append(header, welcome, frameWrap);
  root.append(panel, launcher);
  var frame = null;
  function ensureFrame() {
    if (frame) return;
    frame = document.createElement("iframe");
    frame.className = "cly-frame";
    frame.title = title;
    frame.src = chatOrigin + "/?embed=widget";
    frame.allow = "clipboard-write";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frameWrap.appendChild(frame);
  }
  function setOpen(open) {
    if (open) ensureFrame();
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    launcher.classList.toggle("is-open", open);
    if (open) close.focus();
    else launcher.focus();
    window.dispatchEvent(new CustomEvent("clynect-chat:" + (open ? "open" : "close")));
  }
  launcher.addEventListener("click", function () { setOpen(panel.hidden); });
  close.addEventListener("click", function () { setOpen(false); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !panel.hidden) setOpen(false);
  });
  window.ClynectChat = {
    open: function () { setOpen(true); },
    close: function () { setOpen(false); },
    toggle: function () { setOpen(panel.hidden); },
  };
})();
