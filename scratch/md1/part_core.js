/* ==========================================================================
   Core: helpers, i18n, API, shell behaviour, status dashboard
   ========================================================================== */
var CGI = "/cgi-bin-igd/";

var S = {
  lang: "en",
  mode: 0,
  page: "status",
  sub: "wl-basic",
  wanType: "dhcp",
  timers: {},
  busy: 0,
  data: {},
  traffic: null,
  survey: [],
  fwFile: null,
  logMode: "all",
  modeName: "router"
};

function $(id) { return document.getElementById(id); }
function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

function t(key) {
  var d = I18N[S.lang] || I18N.en;
  return (d && d[key]) || (I18N.en && I18N.en[key]) || key;
}

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : (d || 0); }

function pad2(n) { return n < 10 ? "0" + n : "" + n; }

function fmtUptime(misc) {
  var d = num(misc.srun_days), h = num(misc.srun_hours), m = num(misc.srun_minutes), s = num(misc.srun_seconds);
  if (d > 0) return d + t("unit.day") + " " + h + t("unit.h");
  if (h > 0) return h + t("unit.h") + " " + pad2(m) + t("unit.m");
  return m + t("unit.m") + " " + pad2(s) + t("unit.s");
}

function fmtBytes(bytes) {
  bytes = num(bytes);
  if (bytes < 1024) return bytes.toFixed(0) + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + " MB";
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

function fmtKb(kb) { return fmtBytes(num(kb) * 1024); }
function fmtRate(bps) { return fmtBytes(bps) + "/s"; }

function chip(el, text, cls) {
  if (!el) return;
  el.textContent = text;
  el.className = "chip" + (cls ? " " + cls : "");
}


/* ---------- busy mask ---------- */
var maskTimer = null;
function showMask(text) {
  var el = $("mask");
  if (!el) return;
  if (text && $("maskText")) $("maskText").textContent = text;
  el.classList.add("show");
  clearTimeout(maskTimer);
  maskTimer = setTimeout(function () { el.classList.remove("show"); }, 20000);
}
function hideMask(delay) {
  clearTimeout(maskTimer);
  maskTimer = setTimeout(function () {
    var el = $("mask");
    if (el) el.classList.remove("show");
  }, delay == null ? 200 : delay);
}

/* Keep browsers and password managers from auto-filling router fields. */
function hardenInputs(root) {
  all("input", root || document).forEach(function (inp) {
    var type = (inp.getAttribute("type") || "text").toLowerCase();
    if (type === "password") inp.setAttribute("autocomplete", "new-password");
    else if (type === "text" || type === "number" || type === "search") inp.setAttribute("autocomplete", "off");
    inp.setAttribute("autocapitalize", "off");
    inp.setAttribute("autocorrect", "off");
    inp.setAttribute("spellcheck", "false");
    inp.setAttribute("data-lpignore", "true");
    inp.setAttribute("data-1p-ignore", "true");
  });
}

/* ---------- toast ---------- */
var toastTimer = null;
function toast(msg, type) {
  var box = $("snackbar"), icon = $("snackIcon");
  if (!box) return;
  $("snackText").textContent = msg;
  box.className = type ? type : "";
  box.classList.add("show");
  var name = type === "ok" ? "check_circle" : type === "err" ? "error" : type === "warn" ? "warning" : "info";
  if (icon) icon.firstElementChild.setAttribute("href", "#i-" + name);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { box.classList.remove("show"); }, 3600);
}

/* ---------- dialog ---------- */
var dialogOpen = false;
function dialog(opt) {
  var scrim = $("scrim");
  $("dialogTitle").textContent = opt.title || "";
  var body = $("dialogBody");
  body.innerHTML = "";
  if (typeof opt.body === "string") body.innerHTML = opt.body;
  else if (opt.body) body.appendChild(opt.body);
  hardenInputs(body);

  var acts = $("dialogActions");
  acts.innerHTML = "";
  (opt.actions || [{ label: t("common.ok"), primary: true }]).forEach(function (a) {
    var b = document.createElement("button");
    b.className = "btn " + (a.danger ? "btn-danger" : a.primary ? "btn-primary" : "btn-flat");
    b.textContent = a.label;
    b.addEventListener("click", function () {
      if (a.onClick) { if (a.onClick() === false) return; }
      closeDialog();
    });
    acts.appendChild(b);
  });
  scrim.classList.add("show");
  dialogOpen = true;
}
function closeDialog() { $("scrim").classList.remove("show"); dialogOpen = false; }
function confirmDialog(title, body, onOk, okLabel, danger) {
  dialog({
    title: title, body: body,
    actions: [
      { label: t("common.cancel") },
      { label: okLabel || t("common.confirm"), primary: !danger, danger: danger, onClick: onOk }
    ]
  });
}

/* ---------- API ---------- */
function parseData(text) {
  var s = String(text == null ? "" : text).trim();
  s = s.replace(/^content-type\s*:[^\r\n]*[\r\n]+/i, "").trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { }
  try { return eval("(" + s + ")"); } catch (e) { }
  return s;
}

function postQuiet(path, params, timeoutMs) {
  var usp = new URLSearchParams();
  var src = params || {};
  Object.keys(src).forEach(function (k) {
    var v = src[k];
    usp.append(k, v === undefined || v === null ? "" : String(v));
  });
  var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 25000);
  return fetch(CGI + path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: usp.toString(),
    signal: ctrl ? ctrl.signal : undefined
  }).catch(function () { }).then(function (r) { clearTimeout(timer); return r; });
}

function post(path, params) {
  var usp = new URLSearchParams();
  var src = params || {};
  Object.keys(src).forEach(function (k) {
    var v = src[k];
    usp.append(k, v === undefined || v === null ? "" : String(v));
  });
  return fetch(CGI + path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: usp.toString(),
    credentials: "same-origin",
    cache: "no-store"
  }).then(function (res) {
    if (res.status === 401) throw new Error("AUTH");
    return res.text();
  }).then(function (text) {
    return parseData(text);
  });
}

function resultOf(res) {
  if (Array.isArray(res)) {
    var first = String(res[0] == null ? "" : res[0]);
    var ok = first.toUpperCase() === "SUCCESS";
    var reboot = res.some(function (v) { return String(v).toLowerCase() === "reboot"; });
    return { ok: ok, code: first, reboot: reboot, raw: res };
  }
  if (res && typeof res === "object") return { ok: true, code: "SUCCESS", reboot: false, raw: res };
  return { ok: false, code: String(res == null ? "" : res), reboot: false, raw: res };
}

function errText(code) {
  if (!code) return t("err.generic");
  var key = "err." + code;
  var d = I18N[S.lang] || I18N.en;
  return d[key] || (I18N.en && I18N.en[key]) || t("err.generic") + " (" + code + ")";
}

function apply(path, params, opt) {
  opt = opt || {};
  showMask(t("common.saving"));
  return post(path, params).then(function (res) {
    var r = resultOf(res);
    if (!r.ok) {
      toast(errText(r.code), "err");
      var e = new Error("HANDLED");
      e.handled = true;
      throw e;
    }
    if (r.reboot || opt.reboot) {
      hideMask(0);
      restartRouter(opt.rebootPath || null);
      return r;
    }
    if (r.code === "save_only_need_reboot") toast(t("common.rebootNeeded"), "warn");
    else toast(opt.msg || t("common.saved"), "ok");
    if (opt.after) opt.after();
    return r;
  }).catch(function (e) {
    if (e && e.message === "AUTH") toast("HTTP 401 — " + t("err.generic"), "err");
    else if (!(e && e.handled)) toast(t("err.generic"), "err");
    return null;
  }).then(function (r) {
    hideMask(150);
    return r;
  });
}

/* ---------- router restart / wait ---------- */
function showWaitDialog(text) {
  $("dialogTitle").textContent = t("dlg.rebootTitle");
  $("dialogBody").innerHTML = '<div class="row" style="gap:12px"><svg class="ic" style="animation:spin 1s linear infinite"><use href="#i-sync"/></svg><span id="waitText">' + esc(text) + "</span></div>";
  $("dialogActions").innerHTML = "";
  $("scrim").classList.add("show");
}

function showWaitError(text) {
  $("dialogTitle").textContent = t("dlg.rebootTitle");
  $("dialogBody").innerHTML = '<div class="row" style="gap:12px"><svg class="ic" style="color:var(--danger)"><use href="#i-warning"/></svg><span id="waitText">' + esc(text) + "</span></div>";
  $("dialogActions").innerHTML = '<button class="btn btn-primary" onclick="closeDialog()">' + esc(t("common.close")) + "</button>";
  $("scrim").classList.add("show");
}

function waitForRouter(timeoutSec) {
  var start = Date.now();
  var failedOnce = false;
  return new Promise(function (resolve) {
    function tick() {
      if (Date.now() - start > (timeoutSec || 180) * 1000) return resolve(false);
      var ctrl = new AbortController();
      var to = setTimeout(function () { ctrl.abort(); }, 4000);
      fetch(CGI + "topstatus_interface_parame_show.cgi", { method: "POST", body: "noneed=noneed", headers: { "Content-Type": "application/x-www-form-urlencoded" }, cache: "no-store", signal: ctrl.signal })
        .then(function (r) { clearTimeout(to); return r.text(); })
        .then(function () {
          if (failedOnce) { resolve(true); return; }
          setTimeout(tick, 1500);
        })
        .catch(function () {
          failedOnce = true;
          setTimeout(tick, 2000);
        });
    }
    setTimeout(tick, 3000);
  });
}

/* Radio writes can bounce the Wi-Fi link we are browsing over: fire, then wait. */
function applyRadio(path, params) {
  toast(t("wl.applying"), "info");
  post(path, params).catch(function () { });
  showWaitDialog(t("wl.applying"));
  waitRadio(90000).then(function (ok) {
    if (ok) { closeDialog(); location.reload(); }
    else { $("waitText").textContent = t("err.generic"); }
  });
}

function waitRadio(timeoutMs) {
  var start = Date.now(), dropped = false, okCount = 0;
  return new Promise(function (resolve) {
    function tick() {
      if (Date.now() - start > timeoutMs) return resolve(false);
      var ctrl = new AbortController();
      var to = setTimeout(function () { ctrl.abort(); }, 4000);
      fetch(CGI + "topstatus_interface_parame_show.cgi", {
        method: "POST", body: "noneed=noneed",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        cache: "no-store", signal: ctrl.signal
      }).then(function (r) {
        clearTimeout(to);
        if (!r.ok) throw new Error("http");
        return r.text();
      }).then(function () {
        okCount++;
        if (dropped && okCount >= 1) return resolve(true);
        if (!dropped && okCount >= 6) return resolve(true);
        setTimeout(tick, 2000);
      }).catch(function () {
        clearTimeout(to);
        dropped = true; okCount = 0;
        setTimeout(tick, 2500);
      });
    }
    setTimeout(tick, 2500);
  });
}

function restartRouter(path) {  if (path) post(path, { noneed: "noneed" }).catch(function () { });
  showWaitDialog(t("dlg.waitReboot"));
  waitForRouter(200).then(function (ok) {
    if (ok) { toast(t("dlg.rebooted"), "ok"); setTimeout(function () { location.href = "/index.htm"; }, 800); }
    else { $("waitText").textContent = t("err.generic"); }
  });
  return false;
}

/* ---------- mode ---------- */
var MODE_MAP = { 0: "router", 1: "ap", 2: "client", 3: "repeater" };

/* op_mode alone cannot tell AP from Client: the radio mode (wlb_mode / wl_mode)
   is what actually distinguishes them on this firmware. */
function detectMode(op, wlMode) {
  if (op === 2) return "client";
  if (op === 3) return "repeater";
  var w = String(wlMode == null ? S.wlMode : wlMode).toLowerCase();
  if (w === "client" || w === "1") return "client";
  if (w === "repeater" || w === "4") return "repeater";
  if (op === 0) return "router";
  return "ap";
}

function currentWlMode() {
  var st = S.data.wlStatus && (S.data.wlStatus.sec_ap0 || S.data.wlStatus);
  if (st && st.wl_mode) return st.wl_mode;
  if (S.data.wl && S.data.wl.wlb_mode !== undefined) return S.data.wl.wlb_mode;
  return S.wlMode;
}

function applyMode(op, wlMode) {
  op = parseInt(op, 10);
  if (isNaN(op) || !(op in MODE_MAP)) op = 0;
  if (wlMode !== undefined) S.wlMode = wlMode;
  S.mode = op;
  var name = detectMode(op, S.wlMode);
  S.modeName = name;
  document.documentElement.setAttribute("data-mode", name);
  if (typeof renderLanModes === "function") renderLanModes();

  var chipEl = $("modeChip");
  if (chipEl) {
    chipEl.querySelector(".mc-text").textContent = t("mode." + name);
  }
  $("modeBannerTitle").textContent = t("mode." + name);
  $("modeBannerSub").textContent = t("mode." + name + ".sub");

  var icon = name === "router" ? "router" : name === "ap" ? "settings_input_antenna" : name === "client" ? "wifi_tethering" : "repeat";
  var bannerIcon = $("page-status").querySelector(".mode-banner .ic use");
  if (bannerIcon) bannerIcon.setAttribute("href", "#i-" + icon);

  // hardware mode governs which WAN concepts exist
  var wanTab = document.querySelector('.tab[data-page="wan"]');
  if (wanTab) wanTab.classList.toggle("hidden", name !== "router");
  var wanCard = $("wanCard");
  if (wanCard) wanCard.classList.toggle("hidden", name !== "router");
  var clientTab = document.querySelector('.tab[data-page="client"]');
  if (clientTab) clientTab.classList.toggle("hidden", !(name === "client" || name === "repeater"));
  if (S.page === "client" && !(name === "client" || name === "repeater")) switchPage("status");
}

/* ---------- navigation ---------- */
function switchPage(name) {
  if (!name || !$("page-" + name)) name = "status";
  if (name === "client" && !(S.modeName === "client" || S.modeName === "repeater")) name = "status";
  showMask(t("common.loading"));
  S.page = name;
  all(".tab").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-page") === name); });
  all(".page").forEach(function (p) { p.classList.toggle("active", p.id === "page-" + name); });
  window.scrollTo(0, 0);
  if (history.replaceState) history.replaceState(null, "", "#" + name);
  if (name !== "monitor" && typeof stopMonitor === "function") stopMonitor();
  return Promise.resolve(refreshPage(name)).catch(function () { }).then(function () {
    hideMask(250);
  });
}

function switchSub(id) {
  S.sub = id;
  all("#wlPills .pill").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-sub") === id); });
  all("#page-wireless .subpage").forEach(function (p) { p.classList.toggle("active", p.id === id); });
  if (id === "wl-basic") return loadWirelessBasic();
  if (id === "wl-sec") return loadWirelessSecurity();
  if (id === "wl-wps") return loadWps();
  if (id === "wl-acl") return loadWlAcl();
  if (id === "wl-survey") return loadSurvey(false);
  if (id === "wl-hosts") return loadHosts();
  if (id === "wl-adv") return loadAdvanced();
  return Promise.resolve();
}

function refreshPage(name) {
  if (name === "status") return loadStatus();
  if (name === "monitor") return loadMonitor();
  if (name === "wireless") return switchSub(S.sub || "wl-basic");
  if (name === "wan") return loadWan();
  if (name === "lan") return loadLan();
  if (name === "client") return loadWisp();
  if (name === "security") return loadSecurity();
  if (name === "system") return loadSystem();
  return Promise.resolve();
}

/* ---------- i18n apply ---------- */
function applyI18n() {
  document.documentElement.setAttribute("lang", S.lang === "zh" ? "zh-CN" : "en");
  document.title = "Netis WF2403 · " + (S.lang === "zh" ? "管理控制台" : "Admin Console");
  all("[data-i18n]").forEach(function (el) {
    var k = el.getAttribute("data-i18n");
    var v = t(k);
    if (v !== k) el.textContent = v;
  });
  all("[data-i18n-title]").forEach(function (el) { el.title = t(el.getAttribute("data-i18n-title")); });
  all("[data-i18n-ph]").forEach(function (el) { el.placeholder = t(el.getAttribute("data-i18n-ph")); });

  var langBtn = $("langBtn");
  if (langBtn) langBtn.title = S.lang === "zh" ? "Switch to English" : "切换到中文";
  $("langBtn").querySelector("use").setAttribute("href", "#i-language");

  // dynamic fragments
  applyMode(S.mode, S.wlMode);
  if (S.data.iface) renderWanStatus();
  if (S.data.wl) renderWirelessSummary();
  if (S.data.misc) renderDevice();
  if (S.data.adv) renderAdvanced();
  renderLeases(S.data.leases || []);
  renderClients();
  renderPortForward(S.data.pf || []);
  renderSurvey(S.survey, "#surveyTbody", false);
  renderSurvey(S.survey, "#wispTbody", true);
  updateTrafficLabels();
  if (S.page === "monitor" && typeof drawMonitor === "function") drawMonitor();
}

function updateTrafficLabels() {
  var stamp = $("trafficStamp");
  if (stamp) stamp.textContent = S.lang === "zh" ? "实时" : "live";
}

/* ==========================================================================
   STATUS
   ========================================================================== */
function get(path, params) {
  return post(path, params || { noneed: "noneed" });
}

/* Mode must be resolved before rendering any page reached by a deep link. */
function loadMode() {
  return Promise.all([
    get("wansetup_parame_show.cgi").catch(function () { return null; }),
    get("topstatus_wireless_show.cgi").catch(function () { return null; })
  ]).then(function (r) {
    if (r[0]) S.data.wanCfg = r[0];
    if (r[1]) S.data.wlStatus = r[1];
    if (r[0] && r[0].op_mode !== undefined) applyMode(r[0].op_mode, currentWlMode());
  });
}

function loadStatus() {
  var jobs = [
    get("topstatus_misc_show.cgi"),
    get("topstatus_interface_parame_show.cgi"),
    get("topstatus_statistics_show.cgi"),
    get("topstatus_wireless_show.cgi"),
    get("wansetup_parame_show.cgi"),
    get("topwl_wireless_show.cgi"),
    get("topstatus_dhcp_parame_show.cgi")
  ];
  return Promise.all(jobs.map(function (p) { return p.catch(function () { return null; }); }))
    .then(function (r) {
      S.data.misc = r[0];
      S.data.iface = r[1];
      S.data.stats = r[2];
      S.data.wlStatus = r[3];
      S.data.wanCfg = r[4];
      S.data.wl = r[5];
      S.data.dhcp = r[6];
      if (S.data.wanCfg && S.data.wanCfg.op_mode !== undefined) applyMode(S.data.wanCfg.op_mode, currentWlMode());
      renderStatus();
      return loadClients();
    })
    .catch(function () { /* keep last known values */ });
}

function renderStatus() {
  var misc = S.data.misc || {}, iface = S.data.iface || {}, stats = S.data.stats || {};
  renderDevice();
  renderWanStatus();
  renderWirelessSummary();
  renderLanSummary();
  renderTraffic(stats);
}

function renderDevice() {
  var misc = S.data.misc || {}, iface = S.data.iface || {};
  if (!misc || !Object.keys(misc).length) return;
  var up = fmtUptime(misc);
  $("statUptime").textContent = up;
  $("sysUptime").textContent = up;
  $("sysFw").textContent = iface.version || "--";
  $("sysCpu").textContent = num(misc.srun_cpu).toFixed(1);
  var total = num(misc.total_memory), free = num(misc.free_memory);
  var used = Math.max(0, total - free);
  var pct = total > 0 ? Math.round(used * 100 / total) : 0;
  $("sysMem").textContent = fmtBytes(used * 1024) + " / " + fmtBytes(total * 1024) + " (" + pct + "%)";
  $("statMem").textContent = pct + "%";
  var meter = $("statMemMeter");
  meter.style.width = pct + "%";
  meter.parentNode.className = "meter" + (pct > 85 ? " err" : pct > 65 ? " warn" : "");
  if ($("fwVersion")) $("fwVersion").textContent = iface.version || t("common.unknown");
}

function renderWanStatus() {
  var iface = S.data.iface || {}, cfg = S.data.wanCfg || {};
  var type = (iface.conntype || cfg.conntype || "DHCP");
  type = type === "DHCP+" ? "DHCP" : type;
  $("wanType").textContent = type;
  $("wanTypeSub").textContent = type;
  $("statWanType").textContent = type;
  $("wanSub").textContent = type;
  $("statIp").textContent = iface.ip && iface.ip !== "0.0.0.0" ? iface.ip : "--";
  $("wanIp").textContent = iface.ip || "--";
  $("wanMask").textContent = iface.mask || "--";
  $("wanGw").textContent = iface.gw || "--";
  $("wanDns").textContent = (iface.pridns || "--") + (iface.secdns ? " · " + iface.secdns : "");
  var connected = String(iface.connected) === "1";
  var chipEl = $("wanConnChip");
  chip(chipEl, connected ? t("status.connected") : t("status.disconnected"), connected ? "ok" : "err");
  $("statWan").className = "stat " + (connected ? "ok" : "err");
  var btn = $("wanConnBtn");
  if (btn) {
    btn.querySelector("span").textContent = connected ? t("wan.disconnect") : t("wan.connect");
    btn.querySelector("use").setAttribute("href", connected ? "#i-link" : "#i-link");
  }
  $("wanTypeChip") && ($("wanTypeChip").textContent = type);
  var nonRouter = S.modeName !== "router";
  if ($("statWanLabel")) $("statWanLabel").textContent = nonRouter ? t("lan.ip") : t("status.wanIp");
  if (nonRouter && $("statWanLabel")) {
    $("statIp").textContent = iface.lan_ip || "--";
    $("statWanType").textContent = t("mode." + S.modeName);
    $("statWan").className = "stat ok";
  }
}

function renderLanSummary() {
  var iface = S.data.iface || {}, dhcp = S.data.dhcp || {};
  $("lanIp").textContent = iface.lan_ip || "--";
  $("lanMask").textContent = iface.lan_mask || "--";
  $("lanMac").textContent = iface.lan_mac || "--";
  var on = String(dhcp.dhcp_status) === "1";
  $("lanDhcp").textContent = on ? t("common.on") : t("common.off");
  $("lanPool").textContent = dhcp.start_ip ? dhcp.start_ip + " – " + dhcp.end_ip : "--";
}

function wlSecName(sec) {
  var s = String(sec || "");
  if (!s || s === "None" || s === "none") return t("wl.secNone");
  if (s === "WEP") return "WEP";
  return s.replace(/_/g, "-").replace("WPA-Only", "WPA-PSK").replace("WPA2-Only", "WPA2-PSK").replace("WPA-WPA2-Mixed", "WPA/WPA2");
}

function renderWirelessSummary() {
  var wl = S.data.wl || {};
  var st = (S.data.wlStatus && (S.data.wlStatus.sec_ap0 || S.data.wlStatus)) || {};
  $("wlSsid").textContent = wl.wlb_ssid || st.wl_ssid || "--";
  var m = num(wl.wlb_mode, 0);
  var modes = { 0: t("wl.modeAp"), 1: t("wl.modeClient"), 2: t("wl.modeWds"), 3: t("wl.modeApWds"), 4: t("wl.modeRepeater") };
  $("wlMode").textContent = modes[m] || "--";
  var ch = num(st.wl_chans) || num(wl.wlb_chan);
  $("wlChan").textContent = ch > 0 ? ch + " (" + channelMhz(ch) + " MHz)" : t("common.auto");
  $("wlSec").textContent = wlSecName(st.wl_security || "");
  var cx = num(S.data.hosts ? S.data.hosts.length : 0);
  $("wlClients").textContent = cx;
  $("statClients").textContent = cx;
  var on = String(wl.wlb_enable) === "1";
  chip($("wlStateChip"), on ? t("common.on") : t("common.off"), on ? "ok" : "err");
}

function channelMhz(ch) {
  return ch === 14 ? 2484 : 2407 + ch * 5;
}

function renderTraffic(stats) {
  if (!stats || stats.lan_rx_bytes === undefined) return;
  var now = Date.now();
  if (S.traffic) {
    var dt = Math.max(0.5, (now - S.traffic.at) / 1000);
    function rate(a, b) { return Math.max(0, (num(a) - num(b)) * 1024 / dt); }
    $("tWanRate").textContent = fmtRate(rate(stats.wan_rx_bytes, S.traffic.wan_rx) + rate(stats.wan_tx_bytes, S.traffic.wan_tx));
    $("tLanRate").textContent = fmtRate(rate(stats.lan_rx_bytes, S.traffic.lan_rx) + rate(stats.lan_tx_bytes, S.traffic.lan_tx));
    $("tWlanRate").textContent = fmtRate(rate(stats.wlan_rx_bytes, S.traffic.wlan_rx) + rate(stats.wlan_tx_bytes, S.traffic.wlan_tx));
  }
  S.traffic = {
    at: now,
    wan_rx: num(stats.wan_rx_bytes), wan_tx: num(stats.wan_tx_bytes),
    lan_rx: num(stats.lan_rx_bytes), lan_tx: num(stats.lan_tx_bytes),
    wlan_rx: num(stats.wlan_rx_bytes), wlan_tx: num(stats.wlan_tx_bytes)
  };
  $("tWanRx").textContent = fmtKb(stats.wan_rx_bytes);
  $("tWanTx").textContent = fmtKb(stats.wan_tx_bytes);
  $("tLanRx").textContent = fmtKb(stats.lan_rx_bytes);
  $("tLanTx").textContent = fmtKb(stats.lan_tx_bytes);
  $("tWlanRx").textContent = fmtKb(stats.wlan_rx_bytes);
  $("tWlanTx").textContent = fmtKb(stats.wlan_tx_bytes);
  var stamp = $("trafficStamp");
  if (stamp) stamp.textContent = (S.lang === "zh" ? "更新于 " : "updated ") + new Date().toLocaleTimeString();
}

/* ---------- clients ---------- */
function loadClients() {
  return Promise.all([
    get("dhcp_client_show.cgi").catch(function () { return []; }),
    get("wireless_ASSOCIATE_HOST_show.cgi").catch(function () { return null; })
  ]).then(function (r) {
    S.data.leases = Array.isArray(r[0]) ? r[0] : [];
    S.data.hosts = [];
    if (r[1] && r[1].sec_ap0 && Array.isArray(r[1].sec_ap0)) S.data.hosts = r[1].sec_ap0;
    renderClients();
    renderLeases(S.data.leases);
    renderHosts(S.data.hosts);
    $("statClients").textContent = Math.max(S.data.leases.length, S.data.hosts.length);
    $("wlClients").textContent = S.data.hosts.length;
    $("clientsSub").textContent = S.data.leases.length + (S.lang === "zh" ? " 条租约 · " : " leases · ") + S.data.hosts.length + (S.lang === "zh" ? " 台无线主机" : " wireless stations");
    return r;
  });
}

function renderClients() {
  var tb = $("clientsTbody");
  if (!tb) return;
  var leases = S.data.leases || [];
  var hosts = S.data.hosts || [];
  var byMac = {};
  hosts.forEach(function (h) { byMac[String(h.wl_AH_mac || "").toLowerCase()] = h; });
  var rows = leases.map(function (l) {
    var h = byMac[String(l.mac || "").toLowerCase()] || null;
    return {
      ip: l.ip, mac: l.mac,
      iface: h ? t("clients.wireless") : "LAN",
      link: h ? (num(h.wl_AH_rate) / 2) + " Mbps" : "—",
      signal: h ? "—" : "—"
    };
  });
  if (!rows.length && hosts.length) {
    rows = hosts.map(function (h) {
      return { ip: "—", mac: h.wl_AH_mac, iface: t("clients.wireless"), link: (num(h.wl_AH_rate) / 2) + " Mbps", signal: "—" };
    });
  }
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="5"><div class="empty"><svg class="ic"><use href="#i-devices"/></svg><span>' + esc(t("status.noClients")) + "</span></div></td></tr>";
    return;
  }
  tb.innerHTML = rows.map(function (r) {
    return "<tr><td class='mono'>" + esc(r.ip) + "</td><td class='mono'>" + esc(r.mac) + "</td><td>" + esc(r.iface) +
      "</td><td>" + esc(r.link) + "</td><td>" + esc(r.signal) + "</td></tr>";
  }).join("");
}

function renderLeases(leases) {
  var tb = $("leaseTbody");
  if (!tb) return;
  leases = leases || [];
  $("leaseSub").textContent = leases.length + (S.lang === "zh" ? " 条记录" : " entries");
  if (!leases.length) {
    tb.innerHTML = '<tr><td colspan="4"><div class="empty"><span>' + esc(t("common.none")) + "</span></div></td></tr>";
    return;
  }
  tb.innerHTML = leases.map(function (l) {
    return "<tr><td>" + esc(l.id) + "</td><td class='mono'>" + esc(l.ip) + "</td><td class='mono'>" + esc(l.mac) +
      "</td><td>" + esc(l.status === "Dynamic" ? (S.lang === "zh" ? "动态" : "Dynamic") : l.status) + "</td></tr>";
  }).join("");
}

function renderHosts(hosts) {
  var tb = $("hostsTbody");
  if (!tb) return;
  hosts = hosts || [];
  $("hostsSub").textContent = hosts.length + (S.lang === "zh" ? " 台在线" : " online");
  if (!hosts.length) {
    tb.innerHTML = '<tr><td colspan="5"><div class="empty"><svg class="ic"><use href="#i-people"/></svg><span>' + esc(t("wl.noStations")) + "</span></div></td></tr>";
    return;
  }
  tb.innerHTML = hosts.map(function (h) {
    return "<tr><td class='mono'>" + esc(h.wl_AH_mac) + "</td><td>" + (num(h.wl_AH_rate) / 2) + " Mbps</td><td>" + esc(String(h.wl_AH_mode || "").trim()) +
      "</td><td>" + esc(h.wl_AH_powS === "no" ? (S.lang === "zh" ? "否" : "No") : (S.lang === "zh" ? "是" : "Yes")) +
      "</td><td>" + esc(h.wl_AH_Etime) + " s</td></tr>";
  }).join("");
}

/* ---------- traffic labels ---------- */
