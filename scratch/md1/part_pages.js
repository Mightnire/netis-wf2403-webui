/* ==========================================================================
   Page controllers
   ========================================================================== */

/* ---------------- WIRELESS ---------------- */
var REGION_CHANNELS = { "1": [1, 11], "2": [1, 11], "3": [1, 13], "4": [10, 11], "5": [10, 13], "6": [1, 14] };

function fillChannels(select, region, selected) {
  var range = REGION_CHANNELS[String(region)] || [1, 13];
  var html = '<option value="0">' + esc(t("common.auto")) + "</option>";
  for (var ch = range[0]; ch <= range[1]; ch++) {
    html += '<option value="' + ch + '">' + ch + " (" + channelMhz(ch) + " MHz)</option>";
  }
  select.innerHTML = html;
  select.value = String(selected == null ? 0 : selected);
  if (!select.value) select.value = "0";
}

function loadWireless() {
  return loadWirelessBasic();
}

function loadWirelessBasic() {
  return Promise.all([
    get("topwl_wireless_show.cgi").catch(function () { return null; }),
    get("topstatus_wireless_show.cgi").catch(function () { return null; }),
    get("wansetup_parame_show.cgi").catch(function () { return null; })
  ]).then(function (r) {
    var wl = r[0] || {}, st = (r[1] && (r[1].sec_ap0 || r[1])) || {};
    if (!wl.wlb_ssid) return;
    S.data.wl = wl;
    S.data.wlStatus = r[1] || S.data.wlStatus;
    if (r[2] && r[2].op_mode !== undefined) applyMode(r[2].op_mode, wl.wlb_mode);

    $("wlEn").checked = String(wl.wlb_enable) === "1";
    $("wlSsidInput").value = wl.wlb_ssid || "";
    $("wlModeSel").value = String(num(wl.wlb_mode, 0));
    $("wlModeSel").disabled = true;
    $("wlModeSel").title = t("wl.modeLocked");
    $("wlWidth").value = String(num(wl.wlb_channel_width, 0));
    $("wlBandSel").value = String(num(wl.wlb_band, 10));
    $("wlBroad").checked = String(wl.wlb_net_type) === "1";

    var region = String(st.domain || "3");
    $("wlRegion").value = region;
    fillChannels($("wlChanSel"), region, num(wl.wlb_chan, 0));

    renderWirelessSummary();
    loadAdvanced();
  });
}

function saveWirelessBasic() {
  var wl = S.data.wl || {};
  var st = (S.data.wlStatus && (S.data.wlStatus.sec_ap0 || S.data.wlStatus)) || {};
  var params = {
    AP_SSID: $("wlSsidInput").value,
    wirel_bas_work_status: $("wlEn").checked ? "1" : "0",
    band: $("wlBandSel").value || "10",
    radio_mode: $("wlModeSel").value,
    net_type: $("wlBroad").checked ? "1" : "0",
    channel_width: $("wlWidth").value,
    Region: $("wlRegion").value,
    wireless_mac: st.wl_mac || wl.wl_mac || "",
    wirel_side_band: wl.wlb_side_band || "0",
    ap_chan: $("wlChanSel").value,
    client_type: wl.wlb_client_type || "0"
  };
  applyRadio("wire_bas_ap_set.cgi", params);
}
var SEC_MODES = { 0: "None", 1: "WEP", 2: "WPA_Only", 4: "WPA2_Only", 6: "WPA_WPA2_Mixed" };

function loadWirelessSecurity() {
  return get("topwl_wireless_show.cgi").then(function (wl) {
    if (!wl) return;
    S.data.wl = wl;
    $("secMode").value = String(num(wl.wls_ap_type, 0));
    var secMode = num(wl.wls_ap_type, 0);
    $("secKey").value = secMode === 1 ? (wl.wls_ap_wep_key || "") : (wl.wls_ap_wpa_key || "");
    $("secRekey").value = wl.wls_ap_wpa_keytime || "86400";
    var cipher = String(wl.wls_ap_wpa_tkaes || "2");
    $("secCipher").value = cipher === "1" ? "TKIP" : cipher === "3" ? "MIX_TKIP_AES" : "AES";
    updateSecFields();
  });
}

function updateSecFields() {
  var mode = num($("secMode").value);
  var wep = mode === 1;
  var open = mode === 0;
  $("secCipherRow").classList.toggle("hidden", wep || open);
  $("secKey").parentNode.classList.toggle("hidden", open);
  $("secKey").parentNode.querySelector("label").textContent = wep ? "WEP key" : t("wl.passphrase");
}

function saveWirelessSecurity() {
  var mode = num($("secMode").value);
  var key = $("secKey").value;
  if (mode !== 0 && !key) { toast(t("err.err_key"), "err"); return; }
  var params = wpaParams(mode, key);
  params.wpaCipherSuite = $("secCipher").value;
  params.wpaGrpReKeyTime = $("secRekey").value || "86400";
  applyRadio("wirel_sec_set.cgi", params);
}

function fillRateOptions() {
  var sel = $("advRateSel");
  if (!sel || sel.options.length) return;
  var html = '<option value="0">Auto</option>';
  var rates = ["1", "2", "5.5", "11", "6", "9", "12", "18", "24", "36", "48", "54"];
  rates.forEach(function (r, i) { html += '<option value="' + (i + 1) + '">' + r + " Mbps</option>"; });
  for (var m = 0; m <= 15; m++) html += '<option value="' + (13 + m) + '">MCS' + m + "</option>";
  sel.innerHTML = html;
}

function loadAdvanced() {
  return get("wirel_adv_parame_show.cgi").then(function (adv) {
    if (!adv) return;
    S.data.adv = adv;
    renderAdvanced();
  }).catch(function () { });
}

function renderAdvanced() {
  var a = S.data.adv;
  if (!a) return;
  fillRateOptions();
  $("advBeaconVal").value = a.beacon || "100";
  $("advRtsVal").value = a.rts || "2347";
  $("advFragVal").value = a.frag || "2346";
  $("advDtimVal").value = a.dtim || "3";
  $("advRateSel").value = String(a.rate || "0");
  $("advAggSel").value = a.ag_status || "Mixed";
  $("advAuthSel").value = a.auth_type || "Auto";
  $("advPreamSel").value = a.pream || "long";
  $("advPowerSel").value = String(a.output_power || "0");
  $("advShortGi").checked = a.shortgi === "on";
  $("advGmode").checked = a.gmode === "auto";
  $("advIsolation").checked = String(a.waln_partition) === "1";
  $("advIapp").checked = String(a.iapp) === "0";
  $("advWmm").checked = String(a.wmm) === "1";
}

function saveAdvanced() {
  var auth = $("advAuthSel").value;
  var gi = $("advShortGi").checked ? "on" : "off";
  var gm = $("advGmode").checked ? "auto" : "off";
  var pream = $("advPreamSel").value;
  var payload = {
    AuthMode: auth,
    secure_wep_auth_type: auth,
    Beacon: $("advBeaconVal").value.trim(),
    RTSThreshold: $("advRtsVal").value.trim(),
    Aggregation_status: $("advAggSel").value,
    Fragment: $("advFragVal").value.trim(),
    rate_mode: $("advRateSel").value,
    dtim: $("advDtimVal").value.trim(),
    sele_ShortGi_protection: gi,
    sele_ShortGi_protection1: gi,
    sele_Gmode_protection: gm,
    sele_Gmode_protection1: gm,
    Preamble: pream,
    Preamble1: pream,
    waln_partition: $("advIsolation").checked ? "1" : "0",
    iapp: $("advIapp").checked ? "0" : "1",
    output_power: $("advPowerSel").value,
    wmm: $("advWmm").checked ? "1" : "0",
    button: "Save"
  };
  applyRadio("wire_adv_set.cgi", payload);
}

function loadSurvey(force) {
  if (!force && S.survey.length) { renderSurvey(S.survey, "#surveyTbody", false); return Promise.resolve(); }
  var btn = $("surveyBtn");
  if (btn) { btn.disabled = true; btn.querySelector("span").textContent = t("wl.scanning"); }
  if (force) showMask(t("wl.scanning"));
  return get("wireless_SITE_SURVEY_show.cgi").then(function (list) {
    S.survey = Array.isArray(list) ? list : [];
    renderSurvey(S.survey, "#surveyTbody", false);
    renderSurvey(S.survey, "#wispTbody", true);
    if (btn) btn.querySelector("span").textContent = t("wl.scan");
  }).catch(function () {
    toast(t("err.generic"), "err");
    if (btn) btn.querySelector("span").textContent = t("wl.scan");
  }).finally(function () { if (btn) btn.disabled = false; if (force) hideMask(200); });
}

function renderSurvey(list, sel, withJoin) {
  var tb = $(sel.replace("#", ""));
  if (!tb) return;
  list = list || [];
  if (!list.length) {
    var hint = sel === "#wispTbody" ? t("wisp.scanHint") : t("wl.scanHint");
    tb.innerHTML = '<tr><td colspan="6"><div class="empty"><svg class="ic"><use href="#i-wifi"/></svg><span>' + esc(hint) + "</span></div></td></tr>";
    return;
  }
  tb.innerHTML = list.map(function (ap, i) {
    var sec = ap.wl_ss_secmo || "None";
    var sig = ap.wl_ss_sin || "--";
    var action = withJoin
      ? '<button class="btn btn-primary sm" data-join="' + i + '">' + esc(t("wl.join")) + "</button>"
      : "";
    return "<tr><td>" + esc(ap.wl_ss_ssid) + "</td><td class='mono'>" + esc(ap.wl_ss_bssid) + "</td><td>" + esc(ap.wl_ss_channel) +
      "</td><td>" + esc(sec) + "</td><td>" + esc(sig) + "</td><td class='actions'>" + action + "</td></tr>";
  }).join("");
  if (withJoin) {
    all("[data-join]", tb).forEach(function (b) {
      b.addEventListener("click", function () { joinWisp(list[parseInt(b.getAttribute("data-join"), 10)]); });
    });
  }
}

function loadHosts() {
  return Promise.all([
    get("wireless_ASSOCIATE_HOST_show.cgi").catch(function () { return null; }),
    get("topwl_wireless_show.cgi").catch(function () { return null; })
  ]).then(function (r) {
    var hosts = (r[0] && r[0].sec_ap0) || [];
    if (!Array.isArray(hosts)) hosts = [];
    S.data.hosts = hosts;
    renderHosts(hosts);
    if (r[1]) S.data.wl = r[1];
  });
}

/* ---------------- WAN ---------------- */
function loadWan() {
  return Promise.all([
    get("wansetup_parame_show.cgi").catch(function () { return null; }),
    get("topstatus_interface_parame_show.cgi").catch(function () { return null; }),
    get("dmz_nat_show.cgi").catch(function () { return null; }),
    get("ddns_wan_list_two_show.cgi").catch(function () { return null; })
  ]).then(function (r) {
    var c = r[0] || {}, iface = r[1] || {};
    S.data.wanCfg = c;
    S.data.iface = iface;
    S.data.dmz = r[2] || {};
    var type = String(c.conntype || iface.conntype || "DHCP").toLowerCase();
    if (type.indexOf("pppoe") >= 0) type = "pppoe";
    else if (type.indexOf("static") >= 0) type = "static";
    else type = "dhcp";
    setWanType(type);

    $("dhcpMtu").value = c.dhcp_mtu || "1496";
    $("dhcpDnsMode").value = c.dns_mode === "Auto" ? "auto" : "manual";
    $("dhcpDns1").value = c.dns_mode === "Auto" ? "" : (c.pridns || "");
    $("dhcpDns2").value = c.dns_mode === "Auto" ? "" : (c.secdns || "");
    toggleDnsRow();

    $("stIp").value = c.static_ip || "";
    $("stMask").value = c.static_mask || "";
    $("stGw").value = c.static_gw || "";
    $("stMtu").value = c.static_mtu || "1500";
    $("stDns1").value = c.pridns || "";
    $("stDns2").value = c.secdns || "";

    $("ppUser").value = c.pppoe_user || "";
    $("ppPass").value = c.pppoe_pass || "";
    $("ppMode").value = c.pppoe_type || "0";
    $("ppIdle").value = c.pppoe_idle || "5";
    $("ppMtu").value = c.pppoe_mtu || "1492";
    $("ppDns1").value = c.pridns || "";

    $("macCurrent").textContent = c.mac_addr || iface.mac || "--";
    $("macDefault").textContent = c.mac_default || "--";
    $("macInput").value = "";

    var d = r[3] || {};
    S.data.ddns = d;
    var ddnsOn = String(d.ddns_status) === "1";
    $("ddnsEnable").checked = ddnsOn;
    $("ddnsSp").value = String(d.ddns_name != null ? d.ddns_name : "0");
    $("ddnsUser").value = d.username || "";
    $("ddnsPass").value = d.userpass || "";
    $("ddnsHost").value = d.hostname || "";
    chip($("ddnsState"), ddnsOn ? t("common.on") : t("common.off"), ddnsOn ? "ok" : "");

    renderWanStatus();
  });
}

function setWanType(type) {
  S.wanType = type;
  all("#wanTypePills .pill").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-wantype") === type); });
  all("#page-wan .subpage").forEach(function (p) { p.classList.toggle("active", p.id === "wan-" + type); });
  $("wanTypeChip").textContent = type === "dhcp" ? "DHCP" : type === "static" ? t("wan.static") : "PPPoE";
}

function toggleDnsRow() {
  $("dhcpDnsRow").classList.toggle("hidden", $("dhcpDnsMode").value === "auto");
}

function saveWan() {
  var type = S.wanType;
  var params = { wan_op_mode: "0" };
  if (type === "dhcp") {
    params.mtu_value = $("dhcpMtu").value;
    params.dns_ip_aa = $("dhcpDnsMode").value === "manual" ? $("dhcpDns1").value : "";
    params.dns_ip_bb = $("dhcpDnsMode").value === "manual" ? $("dhcpDns2").value : "";
    return apply("wan_work_mode_dhcp_set.cgi", params, { after: function () { setTimeout(loadWan, 1200); } });
  }
  if (type === "static") {
    params.wan_ip_address = $("stIp").value;
    params.subnet_mask = $("stMask").value;
    params.def_gateway = $("stGw").value;
    params.mtu_value = $("stMtu").value;
    params.dns_ip_aa = $("stDns1").value;
    params.dns_ip_bb = $("stDns2").value;
    params.Secondary_IP_enable = (S.data.wanCfg && S.data.wanCfg.more_dmz && S.data.wanCfg.more_dmz.enable) || "0";
    params.wan_Secondary_ip_address = (S.data.wanCfg && S.data.wanCfg.more_dmz && S.data.wanCfg.more_dmz.Secondary_Ip) || "0.0.0.0";
    params.Secondary_subnet_mask = (S.data.wanCfg && S.data.wanCfg.more_dmz && S.data.wanCfg.more_dmz.Secondary_Mask) || "0.0.0.0";
    params.dmz_ip = (S.data.wanCfg && S.data.wanCfg.more_dmz && S.data.wanCfg.more_dmz.Secondary_Dmz) || "0.0.0.0";
    return apply("wan_work_mode_static_ip_set.cgi", params, { after: function () { setTimeout(loadWan, 1200); } });
  }
  params.pppoe_account = $("ppUser").value;
  params.pppoe_password = $("ppPass").value;
  params.pppoe_connect_mode = $("ppMode").value;
  params.pppoe_out_time = $("ppIdle").value;
  params.mtu_value = $("ppMtu").value;
  params.dns_ip_aa = $("ppDns1").value;
  params.dns_ip_bb = "";
  params.version = "none";
  return apply("wan_work_mode_pppoeset.cgi", params, { after: function () { setTimeout(loadWan, 1500); } });
}

function toggleWanConnection() {
  var iface = S.data.iface || {};
  var connected = String(iface.connected) === "1";
  function go() {
    apply("wan_connect_disconnect.cgi", { wanid: "0", linkstatus: connected ? "0" : "1" }, {
      msg: connected ? t("wan.disconnect") : t("wan.connect"),
      after: function () { setTimeout(function () { loadStatus(); loadWan(); }, 4000); }
    });
  }
  if (connected) confirmDialog(t("wan.disconnect"), t("wan.disconnectConfirm"), go, t("wan.disconnect"));
  else go();
}

function detectWan() {
  var btn = $("wanDetectBtn");
  btn.disabled = true;
  $("wanDetectHint").textContent = t("wan.detecting");
  post("wan_connect_aotu_set.cgi", {}).then(function (d) {
    var s = String(d == null ? "" : d).trim().replace(/^["']|["']$/g, "");
    if (s === "pppoe") { setWanType("pppoe"); $("wanDetectHint").textContent = t("wan.detectedPppoe"); }
    else if (s === "static") { setWanType("static"); $("wanDetectHint").textContent = t("wan.detectedStatic"); }
    else { setWanType("dhcp"); $("wanDetectHint").textContent = t("wan.detectedDhcp"); }
    toast($("wanDetectHint").textContent, "ok");
  }).catch(function () {
    $("wanDetectHint").textContent = "";
    toast(t("err.generic"), "err");
  }).then(function () { btn.disabled = false; });
}

function saveWanMac() {
  var mac = $("macInput").value.trim();
  if (!/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(mac)) { toast(t("err.err_mac"), "err"); return; }
  apply("wan_work_mode_mac_set.cgi", { physical_address: mac }, { after: function () { setTimeout(loadWan, 1200); } });
}

function saveDdns() {
  apply("DDNSset.cgi", {
    buttontype: "",
    ddns_name1: "",
    def_wan_set: "2",
    wan_id: "1",
    ddns_flag: $("ddnsEnable").checked ? "1" : "0",
    ddns_sp: $("ddnsSp").value,
    ddns_user_id: $("ddnsUser").value.trim(),
    ddns_user_password: $("ddnsPass").value,
    ddns_user_host: $("ddnsHost").value.trim()
  }, { after: function () { setTimeout(loadWan, 1500); } });
}

/* ---------------- LAN ---------------- */
function renderLanModes() {
  var map = { router: "lanModeRouter", ap: "lanModeAp", client: "lanModeClient", repeater: "lanModeClient" };
  ["lanModeRouter", "lanModeAp", "lanModeClient"].forEach(function (id) {
    var el = $(id);
    if (el) el.classList.remove("active");
  });
  var active = $(map[S.modeName] || "lanModeRouter");
  if (active) active.classList.add("active");
}

function loadLan() {
  return Promise.all([
    get("topstatus_interface_parame_show.cgi").catch(function () { return null; }),
    get("dhcp_config_dhcp_parame_show.cgi").catch(function () { return null; }),
    get("dhcp_client_show.cgi").catch(function () { return []; }),
    get("routing_table_list_two_show.cgi").catch(function () { return []; })
  ]).then(function (r) {
    var iface = r[0] || {}, dhcp = r[1] || {};
    ROUTES = Array.isArray(r[3]) ? r[3] : [];
    renderRoutes();
    renderLanModes();
    if (iface.lan_ip) {
      S.data.iface = iface;
      $("lanIpRouter").value = iface.apr_lan_ip || iface.lan_ip;
      $("lanMaskRouter").value = iface.apr_lan_mask || iface.lan_mask;
      $("lanIpAp").value = iface.ap_lan_ip || "";
      $("lanMaskAp").value = iface.ap_lan_mask || "";
      $("lanIpClient").value = iface.client_lan_ip || "";
      $("lanMaskClient").value = iface.client_lan_mask || "";
      renderLanSummary();
    }
    if (dhcp.enable !== undefined) {
      $("dhcpEnable").checked = String(dhcp.enable) === "1";
      $("dhcpStart").value = dhcp.start_ip || "";
      $("dhcpEnd").value = dhcp.end_ip || "";
      $("dhcpLease").value = dhcp.lease_time || "86400";
      S.data.leases = Array.isArray(r[2]) ? r[2] : [];
      renderLeases(S.data.leases);
      renderReservations(dhcp.ip_reserve || []);
    }
  });
}

function renderReservations(list) {
  var tb = $("reserveTbody");
  if (!tb) return;
  list = list || [];
  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="3"><div class="empty"><span>' + esc(t("common.none")) + "</span></div></td></tr>";
    return;
  }
  tb.innerHTML = list.map(function (x, idx) {
    var mac = x.mac || (typeof x === "string" ? x.split(",")[0] : "--");
    var ip = x.ip || (typeof x === "string" ? x.split(",")[1] : "--");
    var id = x.id != null ? x.id : idx;
    return "<tr><td class='mono'>" + esc(mac) + "</td><td class='mono'>" + esc(ip) + "</td><td class='actions'>" +
      '<button class="iconbtn" data-rsvdel="' + esc(id) + '" title="' + esc(t("sec.delete")) + '"><svg class="ic sm"><use href="#i-delete"/></svg></button></td></tr>';
  }).join("");
  all("[data-rsvdel]", tb).forEach(function (b) {
    b.addEventListener("click", function () {
      var id = b.getAttribute("data-rsvdel");
      confirmDialog(t("sec.delete"), t("sec.delConfirm"), function () {
        apply("dhcp_list_delete.cgi", { delete_list_entry: id }, {
          msg: t("lan.reserveDeleted"), after: function () { setTimeout(loadLan, 800); }
        });
      }, t("sec.delete"), true);
    });
  });
}

function addReservation() {
  var body = document.createElement("div");
  body.innerHTML =
    '<div class="field"><label>' + esc(t("lan.reserveMac")) + '</label><div class="input-with-sel"><input type="text" id="rsvMac" maxlength="17" placeholder="00:11:22:33:44:55"><span class="devsel-slot" data-target="rsvMac" data-kind="mac"></span></div></div>' +
    '<div class="field"><label>' + esc(t("lan.reserveIp")) + '</label><div class="input-with-sel"><input type="text" id="rsvIp" maxlength="15" placeholder="192.168.1.50"><span class="devsel-slot" data-target="rsvIp" data-kind="ip"></span></div></div>';
  fillDeviceSlots(body);
  dialog({
    title: t("lan.addReserve"), body: body,
    actions: [
      { label: t("common.cancel") },
      {
        label: t("common.save"), primary: true, onClick: function () {
          var mac = $("rsvMac").value.trim(), ip = $("rsvIp").value.trim();
          if (!/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(mac)) { toast(t("err.err_mac"), "err"); return false; }
          if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) { toast(t("err.err_ip"), "err"); return false; }
          apply("dhcp_ip_reserving_add.cgi", { lan_mac_address: mac, lanipaddre: ip }, {
            msg: t("lan.reserveAdded"), after: function () { setTimeout(loadLan, 900); }
          });
        }
      }
    ]
  });
}

function saveLan() {
  var fields = [
    ["lan_ip_address", "lanIpRouter", "lanMaskRouter"],
    ["ap_lan_ip_address", "lanIpAp", "lanMaskAp"],
    ["client_lan_ip_address", "lanIpClient", "lanMaskClient"]
  ];
  var params = {};
  for (var i = 0; i < fields.length; i++) {
    var ip = $(fields[i][1]).value.trim(), mask = $(fields[i][2]).value.trim();
    if (ip) params[fields[i][0]] = ip;
    if (mask) params[fields[i][0].replace("_ip_address", "_sub_mask")] = mask;
  }
  confirmDialog(t("lan.title"), t("lan.rebootWarn"), function () {
    apply("lan_setup.cgi", params, { reboot: true, msg: t("common.saved") });
  }, t("common.saveApply"));
}

function saveDhcp() {
  var on = $("dhcpEnable").checked ? "1" : "0";
  var params = {
    dhcp_server_on: on,
    dhcp_on: on,
    dhcp_server_start_ip: $("dhcpStart").value.trim(),
    dhcp_server_end_ip: $("dhcpEnd").value.trim(),
    dhcp_server_start_time: $("dhcpLease").value.trim()
  };
  apply("dhcp_setup.cgi", params, { after: function () { setTimeout(loadLan, 1000); } });
}

/* ---------------- WISP ---------------- */
function loadWisp() {
  return Promise.all([
    get("topwl_wireless_show.cgi").catch(function () { return null; }),
    get("topstatus_interface_parame_show.cgi").catch(function () { return null; }),
    get("topstatus_wireless_show.cgi").catch(function () { return null; }),
    get("wansetup_parame_show.cgi").catch(function () { return null; })
  ]).then(function (r) {
    var wl = r[0] || {}, iface = r[1] || {}, st = (r[2] && (r[2].sec_ap0 || r[2])) || {};
    if (r[3] && r[3].op_mode !== undefined) applyMode(r[3].op_mode, wl.wlb_mode);
    S.data.wl = wl;

    var prof = wl.reapter || wl.repeater || {};
    var clientMode = S.modeName === "client" || S.modeName === "repeater";
    var ssid = clientMode ? (prof.repeater_ssid || wl.wlb_ssid || st.wl_ssid || "--") : "--";
    $("wispSsid").textContent = clientMode && ssid !== "--" ? "WISP-" + ssid : ssid;
    $("wispBssid").textContent = st.connect_mac || "--";
    var ch = num(wl.wlb_chan) || num(st.wl_chans);
    $("wispChan").textContent = ch > 0 ? ch : t("common.auto");
    $("wispSignal").textContent = st.wl_link_status !== undefined ? (String(st.wl_link_status) === "1" ? "100%" : "--") : "--";
    $("wispLocalIp").textContent = iface.lan_ip || "--";
    var linked = String(st.wl_link_status) === "1";
    chip($("wispStateChip"), linked ? t("status.connected") : t("status.disconnected"), linked ? "ok" : "err");
    $("wispLinkSub").textContent = t("mode." + S.modeName);
  });
}

function wispScan() {
  var btn = $("wispScanBtn");
  btn.disabled = true;
  btn.querySelector("span").textContent = t("wl.scanning");
  return loadSurvey(true).then(function () {
    renderSurvey(S.survey, "#wispTbody", true);
  }).finally(function () {
    btn.disabled = false;
    btn.querySelector("span").textContent = t("wisp.scanCta");
  });
}

function joinWisp(ap) {
  if (!ap) return;
  if (!(S.modeName === "client" || S.modeName === "repeater")) { toast(t("wisp.needClient"), "warn"); return; }
  var body = document.createElement("div");
  var sec = String(ap.wl_ss_secmo || "None");
  var isOpen = /none|open/i.test(sec);
  body.innerHTML = '<p class="muted small" style="margin-bottom:12px">' + esc(t("wisp.joinBody")) + "</p>" +
    '<div class="kv"><span class="kv-key">SSID</span><span class="kv-val">' + esc(ap.wl_ss_ssid) + "</span></div>" +
    '<div class="kv"><span class="kv-key">BSSID</span><span class="kv-val mono">' + esc(ap.wl_ss_bssid) + "</span></div>" +
    '<div class="kv"><span class="kv-key">' + esc(t("wl.security")) + "</span><span class=\"kv-val\">" + esc(sec) + "</span></div>" +
    '<div class="field" style="margin-top:14px"><label>' + esc(t("wisp.pwdLabel")) + '</label><input type="password" id="joinPwd" maxlength="63" ' + (isOpen ? "disabled" : "") + "></div>";
  dialog({
    title: t("wisp.joinTitle"),
    body: body,
    actions: [
      { label: t("common.cancel") },
      {
        label: t("wl.join"), primary: true, onClick: function () {
          doJoinWisp(ap, isOpen ? "" : ($("joinPwd") ? $("joinPwd").value : ""));
          return false; // keep the progress dialog open; doJoinWisp closes it
        }
      }
    ]
  });
}

function secModeFromString(s) {
  s = String(s || "").toUpperCase();
  if (/NONE|OPEN/.test(s)) return 0;
  if (/WEP/.test(s)) return 1;
  if (/WPA2/.test(s)) return 4;   // WPA2-PSK works with WPA/WPA2 mixed APs and associates faster
  return 2;
}

function wpaParams(mode, key) {
  var wpaMode = SEC_MODES[mode] || "None";
  var keySize = "40", keyMode = "asc", wpaPersonal = "0";
  if (mode === 1) {
    if (/^[0-9a-fA-F]{10}$/.test(key)) { keySize = "40"; keyMode = "hex"; }
    else if (/^[0-9a-fA-F]{26}$/.test(key)) { keySize = "104"; keyMode = "hex"; }
    else if (key.length === 13) { keySize = "104"; }
  } else if (/^[0-9a-fA-F]{64}$/.test(key)) {
    wpaPersonal = "1";
  }
  return {
    wpaMode: wpaMode, KeySize0: keySize, keymode: keyMode, ap_wpa_mode: wpaPersonal,
    KeyVal1: mode === 1 ? key : "", KeyVal2: mode === 1 ? key : "",
    KeyVal3: mode === 1 ? key : "", KeyVal4: mode === 1 ? key : "",
    TxKey: "1", wpaCipherSuite: "AES",
    PreKeyVal: key, PreKeyVal_len: String(key.length), wpaPhrase: key,
    wpaGrpReKeyTime: "86400"
  };
}

function ensureOk(res) {
  var r = resultOf(res);
  if (!r.ok) {
    var e = new Error(r.code || "FAILED");
    e.handled = true;
    throw e;
  }
  return r;
}

function postRetry(path, params, tries, delay) {
  return post(path, params).catch(function (e) {
    if (tries <= 1) throw e;
    return new Promise(function (res) { setTimeout(res, delay); }).then(function () {
      return postRetry(path, params, tries - 1, delay);
    });
  });
}

function waitForLink(timeoutMs) {
  var start = Date.now();
  return new Promise(function (resolve) {
    function tick() {
      if (Date.now() - start > timeoutMs) return resolve(false);
      post("topstatus_wireless_show.cgi", { noneed: "noneed" }).then(function (d) {
        var st = d && (d.sec_ap0 || d);
        if (st && String(st.wl_link_status) === "1") return resolve(true);
        setTimeout(tick, 2000);
      }).catch(function () { setTimeout(tick, 2500); });
    }
    setTimeout(tick, 1500);
  });
}

function doJoinWisp(ap, pwd) {
  var wl = S.data.wl || {};
  var st = (S.data.wlStatus && (S.data.wlStatus.sec_ap0 || S.data.wlStatus)) || {};
  var mode = secModeFromString(ap.wl_ss_secmo);
  var base = {
    AP_SSID: ap.wl_ss_ssid,
    wirel_bas_work_status: wl.wlb_enable || "1",
    band: wl.wlb_band || "10",
    radio_mode: "1",
    net_type: wl.wlb_net_type || "1",
    channel_width: wl.wlb_channel_width || "1",
    Region: st.domain || "3",
    wireless_mac: st.wl_mac || "",
    wirel_side_band: wl.wlb_side_band || "0",
    ap_chan: "0",
    client_type: "0"
  };
  showWaitDialog(t("wisp.joining"));
  postRetry("wire_bas_ap_set.cgi", base, 3, 3000)
    .then(function (res) {
      ensureOk(res);
      if (mode === 0) return null;           // open network: basic call already cleared security
      return postRetry("wirel_sec_set.cgi", wpaParams(mode, pwd || ""), 3, 3000);
    })
    .then(function (res) {
      if (res) ensureOk(res);
      return postQuiet("wl_site_surver_connect.cgi", { ssid: ap.wl_ss_ssid, bssid: ap.wl_ss_bssid }, 25000);
    })
    .then(function () {
      return waitForLink(45000);
    })
    .then(function (linked) {
      closeDialog();
      if (linked) toast(t("wisp.joined"), "ok");
      else toast(t("wisp.joinTimeout"), "warn");
      loadWisp();
      loadStatus();
    })
    .catch(function (e) {
      closeDialog();
      toast(e && e.handled ? errText(e.message) : t("err.generic"), "err");
    });
}

/* ---------------- SECURITY ---------------- */
function refreshSecuritySoon() {
  setTimeout(loadSecurity, 1200);
  setTimeout(loadSecurity, 3000);
}

function loadSecurity() {
  return Promise.all([
    get("virtual_service_list_show.cgi").catch(function () { return []; }),
    get("dmz_nat_show.cgi").catch(function () { return null; }),
    get("upnp_misc_show.cgi").catch(function () { return null; }),
    get("filter_mac_list_show.cgi").catch(function () { return []; }),
    get("filter_ip_filter_ip_list.cgi").catch(function () { return []; }),
    get("filter_dns_list_show.cgi").catch(function () { return []; }),
    get("port_trigger_list_show.cgi").catch(function () { return []; }),
    get("sys_time_show.cgi").catch(function () { return null; }),
    get("vpn_virtual_show.cgi").catch(function () { return null; }),
    get("ftp_port_show.cgi").catch(function () { return null; })
  ]).then(function (r) {
    S.data.pf = Array.isArray(r[0]) ? r[0] : [];
    renderPortForward(S.data.pf);
    var dmz = r[1] || {};
    S.data.dmz = dmz;
    DMZ_STATE.normal = String(dmz.dmz_enable) === "1";
    $("dmzIp").value = dmz.dmz_ip || "";

    DMZ_STATE.super = String(dmz.super_dmz_enable) === "1";
    renderDmzState();
    $("superDmzMac").value = dmz.super_dmz_mac && dmz.super_dmz_mac !== "00:00:00:00:00:00" ? dmz.super_dmz_mac : "";
    $("upnpEnable").checked = String((r[2] || {}).upnp_enable) === "1";
    PT = Array.isArray(r[6]) ? r[6] : [];
    renderPortTriggers();
    var st = r[7] || {}, vpn = r[8] || {}, ftp = r[9] || {};
    $("advIgmp").checked = String((st.igmp || {}).enable) === "1";
    $("advPptp").checked = String(vpn.enable_pptp) === "1";
    $("advL2tp").checked = String(vpn.enable_l2tp) === "1";
    $("advIpsec").checked = String(vpn.enable_ipsec) === "1";
    $("advFtp").checked = String(ftp.enable) === "1";
    $("advFtpPort").value = ftp.ftp_port || "21";
    return Promise.all([loadAcl(), loadQos()]);
  });
}

function renderPortForward(list) {
  var tb = $("pfTbody");
  if (!tb) return;
  list = list || [];
  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="6"><div class="empty"><svg class="ic"><use href="#i-call_split"/></svg><span>' + esc(t("sec.pfEmpty")) + "</span></div></td></tr>";
    return;
  }
  tb.innerHTML = list.map(function (x) {
    var id = x.id != null ? x.id : x.comment;
    return "<tr><td>" + esc(x.comment) + "</td><td class='mono'>" + esc(x.ip) + "</td><td>" + esc(x.proto) +
      "</td><td>" + esc(x.out_Port) + "</td><td>" + esc(x.in_Port) + "</td><td class='actions'>" +
      '<button class="iconbtn" data-pfdel="' + esc(id) + '" title="' + esc(t("sec.delete")) + '"><svg class="ic sm"><use href="#i-delete"/></svg></button></td></tr>';
  }).join("");
  all("[data-pfdel]", tb).forEach(function (b) {
    b.addEventListener("click", function () {
      var id = b.getAttribute("data-pfdel");
      confirmDialog(t("sec.delete"), t("sec.delConfirm"), function () {
        apply("virtual_service_list_del.cgi", { virtual_del_rulename: id, virtual_del_rulename1: "" }, {
          msg: t("sec.deleted"), after: function () { setTimeout(loadSecurity, 800); }
        });
      }, t("sec.delete"), true);
    });
  });
}

function addPortForward() {
  var body = document.createElement("div");
  body.innerHTML =
    '<div class="field"><label>' + esc(t("sec.ruleName")) + '</label><input type="text" id="pfName" maxlength="16" placeholder="' + esc(t("sec.ruleNamePh")) + '"></div>' +
    '<div class="field"><label>' + esc(t("sec.targetIp")) + '</label><div class="input-with-sel"><input type="text" id="pfIp" maxlength="15" placeholder="192.168.0.100"><span class="devsel-slot" data-target="pfIp" data-kind="ip"></span></div></div>' +
    '<div class="field"><label>' + esc(t("sec.proto")) + '</label><select id="pfProto">' +
      '<option value="0">ALL</option><option value="1">TCP</option><option value="2">UDP</option>' +
      '<option value="1">HTTP</option><option value="1">HTTPS</option><option value="1">FTP</option>' +
      '<option value="1">POP3</option><option value="1">SMTP</option><option value="2">DNS</option>' +
      '<option value="1">TELNET</option><option value="2">IPSEC</option><option value="1">PPTP</option>' +
      '<option value="1">Windows Terminal Client</option><option value="1">GuruGuru</option>' +
      '<option value="1">H323 VoIP Phone</option><option value="2">Soribada</option>' +
    '</select></div>' +
    '<div class="field-row">' +
      '<div class="field"><label>' + esc(t("sec.wanPortStart")) + '</label><input type="text" id="pfExtA" maxlength="5" inputmode="numeric"></div>' +
      '<div class="field"><label>' + esc(t("sec.wanPortEnd")) + '</label><input type="text" id="pfExtB" maxlength="5" inputmode="numeric"></div>' +
      '<div class="field"><label>' + esc(t("sec.lanPort")) + '</label><input type="text" id="pfIntA" maxlength="5" inputmode="numeric"></div>' +
    '</div>';
  fillDeviceSlots(body);
  var presets = [
    ["", "", ""], ["", "", ""], ["", "", ""],
    ["80", "80", ""], ["443", "443", ""], ["21", "21", ""], ["110", "110", ""],
    ["25", "25", ""], ["53", "53", ""], ["23", "23", ""], ["500", "500", ""],
    ["1723", "1723", ""], ["3389", "3389", ""], ["9292", "9292", ""],
    ["1720", "1720", ""], ["22321", "22321", ""]
  ];
  dialog({
    title: t("sec.addTitle"), body: body,
    actions: [
      { label: t("common.cancel") },
      {
        label: t("common.save"), primary: true, onClick: function () {
          var name = $("pfName").value.trim();
          var ip = $("pfIp").value.trim();
          var a = $("pfExtA").value.trim();
          var b = $("pfExtB").value.trim() || a;
          var inPort = $("pfIntA").value.trim();
          if (!name) { toast(t("err.err_name"), "err"); return false; }
          if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) { toast(t("err.err_ip"), "err"); return false; }
          if (!/^\d{1,5}$/.test(a) || !/^\d{1,5}$/.test(b) || !/^\d{1,5}$/.test(inPort) ||
              +a < 1 || +a > 65535 || +b < 1 || +b > 65535 || +inPort < 1 || +inPort > 65535 || +b < +a) {
            toast(t("err.err_port"), "err"); return false;
          }
          apply("virtual_service_add.cgi", {
            rule_name: name, virtual_ip: ip, proto_select: $("pfProto").value,
            port_ext_a: a, port_ext_a2: b, port_int_a: inPort
          }, { msg: t("sec.added"), after: function () { refreshSecuritySoon(); } });
        }
      }
    ]
  });
  $("pfProto").addEventListener("change", function () {
    var p = presets[this.selectedIndex] || ["", "", ""];
    $("pfExtA").value = p[0];
    $("pfExtB").value = p[1];
    $("pfIntA").value = p[1] || p[0];
  });
}

var DMZ_STATE = { normal: false, super: false };

function renderDmzState() {
  var on = DMZ_TAB === "super" ? DMZ_STATE.super : DMZ_STATE.normal;
  $("dmzHeadEnable").checked = on;
  $("dmzIp").disabled = !DMZ_STATE.normal;
  $("superDmzMac").disabled = !DMZ_STATE.super;
  $("dmzSaveLabel").textContent = DMZ_TAB === "super" ? t("sec.saveSuperDmz") : t("sec.saveDmz");
}

function saveDmz() {
  apply("dmz.cgi", { dmz_on: DMZ_STATE.normal ? "1" : "0", dmz_ip_address: $("dmzIp").value.trim() }, {
    after: function () { setTimeout(loadSecurity, 800); }
  });
}

function saveSuperDmz() {
  var mac = $("superDmzMac").value.trim();
  if (DMZ_STATE.super && !/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(mac)) {
    toast(t("err.err_mac"), "err");
    return;
  }
  apply("super_dmz_set.cgi", {
    super_dmz_on: DMZ_STATE.super ? "1" : "0",
    super_dmzipaddr: mac || "00:00:00:00:00:00"
  }, { after: function () { setTimeout(loadSecurity, 800); } });
}

var DMZ_TAB = "normal";

function setDmzTab(tab) {
  DMZ_TAB = tab;
  all("#dmzPills .pill").forEach(function (p) {
    p.classList.toggle("active", p.getAttribute("data-dmz") === tab);
  });
  $("dmz-normal").classList.toggle("active", tab === "normal");
  $("dmz-super").classList.toggle("active", tab === "super");
  renderDmzState();
}

function saveActiveDmz() {
  var isSuper = DMZ_TAB === "super";
  var mac = $("superDmzMac").value.trim();
  var ip = $("dmzIp").value.trim();
  var req = [];
  if (isSuper) {
    if (DMZ_STATE.super && !/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(mac)) {
      toast(t("err.err_mac"), "err");
      return;
    }
    req.push(post("super_dmz_set.cgi", {
      super_dmz_on: DMZ_STATE.super ? "1" : "0",
      super_dmzipaddr: mac || "00:00:00:00:00:00"
    }));
    if (S.data.dmz && String(S.data.dmz.dmz_enable) === "1") {
      req.push(post("dmz.cgi", { dmz_on: "0", dmz_ip_address: ip }));
    }
  } else {
    if (DMZ_STATE.normal && !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
      toast(t("err.err_ip"), "err");
      return;
    }
    req.push(post("dmz.cgi", {
      dmz_on: DMZ_STATE.normal ? "1" : "0",
      dmz_ip_address: ip
    }));
    if (S.data.dmz && String(S.data.dmz.super_dmz_enable) === "1") {
      req.push(post("super_dmz_set.cgi", {
        super_dmz_on: "0",
        super_dmzipaddr: mac || "00:00:00:00:00:00"
      }));
    }
  }
  Promise.all(req.map(function (p) { return p.then(ensureOk); })).then(function () {
    toast(t("sec.dmzSaved"), "ok");
    setTimeout(loadSecurity, 1000);
  }).catch(function () { toast(t("err.generic"), "err"); });
}

function saveUpnp() {
  apply("UPnPSet.cgi", { checkbox_upnp: $("upnpEnable").checked ? "on" : "off" }, {
    after: function () { setTimeout(loadSecurity, 800); }
  });
}

/* ---------------- SYSTEM ---------------- */
var TZ_LIST = [
  ["12 1", "(GMT-12:00) Eniwetok, Kwajalein"],
  ["11 1", "(GMT-11:00) Midway, Samoa"],
  ["10 1", "(GMT-10:00) Hawaii"],
  ["9 1", "(GMT-09:00) Alaska"],
  ["8 1", "(GMT-08:00) Los Angeles"],
  ["7 1", "(GMT-07:00) Arizona"],
  ["6 1", "(GMT-06:00) Mexico City"],
  ["5 1", "(GMT-05:00) New York"],
  ["4 1", "(GMT-04:00) Caracas"],
  ["3 1", "(GMT-03:00) Buenos Aires"],
  ["2 1", "(GMT-02:00) Atlantic"],
  ["1 1", "(GMT-01:00) Azores"],
  ["0 1", "(GMT+00:00) London, Lisbon"],
  ["-1 1", "(GMT+01:00) Paris, Berlin, Rome"],
  ["-2 1", "(GMT+02:00) Athens, Jerusalem"],
  ["-3 1", "(GMT+03:00) Moscow, Riyadh"],
  ["-4 1", "(GMT+04:00) Abu Dhabi, Muscat"],
  ["-5 1", "(GMT+05:00) Islamabad, Karachi"],
  ["-6 1", "(GMT+06:00) Almaty, Dhaka"],
  ["-7 1", "(GMT+07:00) Bangkok, Jakarta"],
  ["-8 1", "(GMT+08:00) Beijing, Hong Kong"],
  ["-9 1", "(GMT+09:00) Tokyo, Seoul"],
  ["-10 1", "(GMT+10:00) Sydney, Guam"],
  ["-11 1", "(GMT+11:00) Magadan, Solomon"],
  ["-12 1", "(GMT+12:00) Auckland, Wellington"],
  ["-12 2", "(GMT+13:00) Nuku'alofa"]
];

function fillTimezones(selected) {
  var sel = $("tzSelect");
  sel.innerHTML = TZ_LIST.map(function (z) {
    return '<option value="' + z[0] + '">' + esc(z[1]) + "</option>";
  }).join("");
  if (selected) sel.value = selected;
}

function loadSystem() {
  return Promise.all([
    get("sys_time_show.cgi").catch(function () { return null; }),
    get("topstatus_misc_show.cgi").catch(function () { return null; }),
    get("topstatus_interface_parame_show.cgi").catch(function () { return null; }),
    get("web_setup_show.cgi").catch(function () { return null; })
  ]).then(function (r) {
    var tm = r[0] || {};
    S.data.time = tm;
    if (tm.sys_time_now) $("timeNow").textContent = tm.sys_time_now;
    fillTimezones(tm.timezone);
    $("ntpServer").value = tm.time_server || "";
    if (r[2]) { $("fwVersion").textContent = r[2].version || "--"; S.data.iface = r[2]; }
    if (r[1]) { S.data.misc = r[1]; renderDevice(); $("pwdUser").value = r[1].user_name || "guest"; }
    var rm = r[3] || {};
    S.data.remote = rm;
    $("remoteEnable").checked = String(rm.remote_enable) === "1";
    $("remotePort").value = rm.remote_port || "8080";
    $("remotePort").disabled = !$("remoteEnable").checked;
    return loadLog(S.logMode);
  });
}

/* ---------------- SYSTEM LOGS / WOL / REMOTE ---------------- */
function logPad(s, n) {
  s = String(s == null ? "" : s);
  while (s.length < n) s += " ";
  return s;
}

function logCatLabel(cat) {
  var c = String(cat || "").trim().toLowerCase();
  if (c === "wlan") return "WLAN";
  if (c === "klogd") return "KERNEL";
  return c.toUpperCase();
}

function logEventLabel(ev) {
  var key = "log.ev." + ev;
  var label = t(key);
  return label === key ? String(ev) : label;
}

function parseSystemLog(s) {
  var m = s.match(/^([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})\s*,([^,]*),([\s\S]*)$/);
  if (!m) return "";
  var months = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
                 Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
  var time = (months[m[1]] || m[1]) + "-" + logPad(m[2], 2) + " " + m[3];
  return logPad(time, 19) + "  " + logPad(logCatLabel(m[4]), 8) + m[5].trim();
}

function parseConnectionLog(s) {
  var m = s.match(/^(\d+),CONNECTION,([^,]+),([^,]*),([^,]*),([^,]*),([\s\S]*)$/);
  if (!m) return "";
  var time = m[2].trim();
  var proc = String(m[3] || "").toUpperCase();
  var arr = [];
  try { arr = JSON.parse(m[6]); } catch (e) { arr = []; }
  var ev = arr.length ? String(arr[0]) : "";
  var args = arr.slice(1).filter(function (v) { return v !== "" && v != null; }).join(" ");
  var msg = ev ? logEventLabel(ev) : m[6].trim();
  return logPad(time, 19) + "  " + logPad(proc, 8) + msg + (args ? " " + args : "");
}

function loadLog(mode) {
  S.logMode = mode || S.logMode || "all";
  all("#logPills .pill").forEach(function (b) {
    b.classList.toggle("active", b.getAttribute("data-log") === S.logMode);
  });
  $("logBox").textContent = t("common.loading");
  return post("sys_log_get.cgi", { mode_name: S.logMode === "connect" ? "connect" : "all" }).then(function (res) {
    var parts = typeof res === "string" ? res.split(";") : (Array.isArray(res) ? res : []);
    var lines = [];
    parts.forEach(function (raw) {
      if (typeof raw !== "string") return;
      var s = raw.trim();
      if (!s) return;
      if (/^\d+,CONNECTION,/.test(s)) {
        if (S.logMode === "connect") lines.push(parseConnectionLog(s) || s);
      } else {
        if (S.logMode === "connect") return;
        lines.push(parseSystemLog(s) || s);
      }
    });
    renderLog(lines);
  }).catch(function () {
    $("logBox").textContent = t("sys.logEmpty");
  });
}

function renderLog(lines) {
  var shown = lines.slice(-400);
  $("logBox").textContent = shown.length ? shown.join("\n") : t("sys.logEmpty");
  $("logCount").textContent = lines.length + (S.lang === "zh" ? " 条" : " entries");
}

function clearLog() {
  confirmDialog(t("sys.logClear"), t("sys.logClearConfirm"), function () {
    apply("sys_log_clean.cgi", { log_name: S.logMode === "connect" ? "CONNECTION" : "ALL" }, {
      msg: t("sys.logCleared"), after: function () { setTimeout(function () { loadLog(S.logMode); }, 600); }
    });
  }, t("sys.logClear"), true);
}

function saveRemote() {
  var on = $("remoteEnable").checked ? "1" : "0";
  apply("Remote_Management_set.cgi", {
    enable_web_far_status: on, remote_enable: on, remote_port: $("remotePort").value.trim()
  }, { after: function () { setTimeout(loadSystem, 800); } });
}

function sendWol() {
  var mac = $("wolMac").value.trim();
  if (!/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(mac)) { toast(t("err.err_mac"), "err"); return; }
  apply("wakeup.cgi", { computermac: mac }, { msg: t("sys.wolSent") });
}

function saveTime() {
  apply("misc_system_gmt_set.cgi", { timezone: $("tzSelect").value, time_server: $("ntpServer").value.trim() }, {
    msg: t("sys.timeSaved"), after: function () { setTimeout(loadSystem, 1200); }
  });
}

function savePassword() {
  var oldP = $("pwdOld").value, user = $("pwdUser").value.trim();
  var p1 = $("pwdNew").value, p2 = $("pwdNew2").value;
  if (!p1) { toast(t("err.err_password"), "err"); return; }
  if (p1 !== p2) { toast(t("sys.pwdMismatch"), "err"); return; }
  showMask(t("common.saving"));
  post("UserPassSet.cgi", { old_password: oldP, user_name: user, password1: p1, password2: p2 }).then(function (res) {
    var r = resultOf(res);
    if (!r.ok) { toast(errText(r.code), "err"); return; }
    toast(t("sys.pwdChanged"), "ok");
    setTimeout(function () { location.href = "/index.htm"; }, 1200);
  }).catch(function () { toast(t("err.generic"), "err"); }).then(function () { hideMask(150); });
}

function firmwarePicked(file) {
  if (file && !/\.bin$/i.test(file.name)) {
    toast(t("sys.onlyBin"), "err");
    $("fwFile").value = "";
    S.fwFile = null;
    $("fwFileName").textContent = t("sys.noFile");
    $("fwUpgradeBtn").disabled = true;
    return;
  }
  S.fwFile = file || null;
  $("fwFileName").textContent = file ? file.name + " · " + fmtBytes(file.size) : t("sys.noFile");
  $("fwUpgradeBtn").disabled = !file;
}

function upgradeFirmware() {
  if (!S.fwFile) return;
  var file = S.fwFile;
  confirmDialog(t("sys.fwTitle"), t("sys.fwHint") + "<br><br><b>" + esc(file.name) + "</b>", function () {
    var fd = new FormData();
    fd.append("put_file", file, file.name);
    showWaitDialog(t("dlg.upgradeBody"));
    fetch(CGI + "put_file.cgi", { method: "POST", body: fd, credentials: "same-origin" })
      .catch(function () { /* the router may reboot before answering */ })
      .then(function () { return waitForRouter(180); })
      .then(function (ok) {
        if (ok) { toast(t("dlg.upgradeDone"), "ok"); setTimeout(function () { location.href = "/index.htm"; }, 1200); }
        else { showWaitError(t("dlg.upgradeFail")); }
      })
      .catch(function () { showWaitError(t("dlg.upgradeFail")); });
    return false;
  }, t("sys.upgrade"));
}

function rebootRouter() {
  confirmDialog(t("dlg.rebootTitle"), t("dlg.rebootBody"), function () {
    return restartRouter("reboot.cgi");
  }, t("dlg.confirmReboot"));
}

function factoryReset() {
  confirmDialog(t("dlg.resetTitle"), t("dlg.resetBody"), function () {
    return restartRouter("RestoreDefault.cgi");
  }, t("sys.resetNow"), true);
}

/* ---------------- MONITOR ---------------- */
var MON = {
  points: 90,
  cpu: [],
  mem: [],
  traffic: {
    wan: { rx: [], tx: [] },
    lan: { rx: [], tx: [] },
    wlan: { rx: [], tx: [] }
  },
  iface: "wan",
  last: null,
  timer: null
};

function monPush(arr, v) {
  arr.push(v);
  if (arr.length > MON.points) arr.shift();
}

function monColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#3f51b5";
}

function monAlpha(hex, a) {
  var h = String(hex).replace("#", "");
  if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
  var n = parseInt(h, 16);
  if (!isFinite(n)) return "rgba(63,81,181," + a + ")";
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}

function niceCeil(v) {
  if (!(v > 0)) return 1;
  var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
  var m = v / p;
  var n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return n * p;
}

function drawChart(cv, series, opt) {
  if (!cv || !cv.clientWidth) return;
  opt = opt || {};
  var dpr = window.devicePixelRatio || 1;
  var w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  var ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  var pl = opt.left || 46, pr = 8, pt = 8, pb = 16;
  var n = opt.points || MON.points;
  var values = [];
  series.forEach(function (s) { s.data.forEach(function (v) { values.push(v); }); });
  var max = opt.max || niceCeil(Math.max.apply(null, values.concat([0])));
  if (!(max > 0)) max = 1;

  var grid = monColor("--divider") || "rgba(0,0,0,.12)";
  var label = monColor("--text-3") || "rgba(0,0,0,.38)";
  ctx.font = '10px Roboto, "Segoe UI", Arial, sans-serif';
  ctx.textBaseline = "middle";

  var plotW = w - pl - pr, plotH = h - pt - pb;
  var maxLen = 0;
  series.forEach(function (s) { if (s.data.length > maxLen) maxLen = s.data.length; });
  var m = Math.max(2, Math.min(n, maxLen));

  for (var i = 0; i <= 4; i++) {
    var gy = pt + plotH * i / 4;
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = grid;
    ctx.beginPath();
    ctx.moveTo(pl, gy);
    ctx.lineTo(w - pr, gy);
    ctx.stroke();
    ctx.globalAlpha = 1;
    var val = max * (1 - i / 4);
    ctx.fillStyle = label;
    ctx.textAlign = "right";
    ctx.fillText(opt.format ? opt.format(val) : String(Math.round(val)), pl - 8, gy);
  }

  function xAt(idx) { return pl + (idx / (m - 1)) * plotW; }
  function yAt(v) { return pt + plotH - (Math.min(Math.max(v, 0), max) / max) * plotH; }

  series.forEach(function (s) {
    var d = s.data;
    if (!d.length) return;
    ctx.beginPath();
    d.forEach(function (v, idx) {
      var x = xAt(idx), y = yAt(v);
      if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    if (opt.fill) {
      ctx.lineTo(xAt(d.length - 1), pt + plotH);
      ctx.lineTo(pl, pt + plotH);
      ctx.closePath();
      ctx.fillStyle = monAlpha(s.color, 0.12);
      ctx.fill();
    }
    var lx = xAt(d.length - 1), ly = yAt(d[d.length - 1]);
    ctx.beginPath();
    ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.fill();
  });

  if (!values.length) {
    ctx.fillStyle = label;
    ctx.textAlign = "center";
    ctx.fillText(opt.empty || t("mon.noData"), pl + plotW / 2, pt + plotH / 2);
  }
}

function drawMonitor() {
  if (!$("cpuChart") || S.page !== "monitor") return;
  var primary = monColor("--primary");
  var accent = monColor("--accent");
  var pct = function (v) { return Math.round(v) + "%"; };

  drawChart($("cpuChart"), [{ data: MON.cpu, color: primary }], { max: 100, format: pct, fill: true });
  drawChart($("memChart"), [{ data: MON.mem, color: accent }], { max: 100, format: pct });

  var tr = MON.traffic[MON.iface];
  drawChart($("trafficChart"), [
    { data: tr.rx, color: primary },
    { data: tr.tx, color: accent }
  ], { format: function (v) { return (v / 1024).toFixed(v >= 10240 ? 0 : 1) + " KB/s"; }, left: 64, empty: t("mon.noData") });

  if ($("monRxDot")) $("monRxDot").style.background = primary;
  if ($("monTxDot")) $("monTxDot").style.background = accent;
  $("monRxNow").textContent = tr.rx.length ? fmtRate(tr.rx[tr.rx.length - 1]) : "--";
  $("monTxNow").textContent = tr.tx.length ? fmtRate(tr.tx[tr.tx.length - 1]) : "--";
}

function sampleMonitor() {
  return Promise.all([
    get("topstatus_misc_show.cgi").catch(function () { return null; }),
    get("topstatus_statistics_show.cgi").catch(function () { return null; })
  ]).then(function (r) {
    var misc = r[0], st = r[1];
    if (misc && misc.total_memory !== undefined) {
      var total = num(misc.total_memory), free = num(misc.free_memory);
      var memPct = total > 0 ? Math.max(0, Math.min(100, (total - free) * 100 / total)) : 0;
      var cpuPct = Math.max(0, Math.min(100, num(misc.srun_cpu)));
      monPush(MON.cpu, cpuPct);
      monPush(MON.mem, memPct);
      $("monCpuNow").textContent = cpuPct.toFixed(1) + "%";
      $("monMemNow").textContent = Math.round(memPct) + "%";
    }
    if (st && st.wan_rx_bytes !== undefined) {
      var now = Date.now();
      if (MON.last) {
        var dt = Math.max(0.5, (now - MON.last.at) / 1000);
        ["wan", "lan", "wlan"].forEach(function (k) {
          monPush(MON.traffic[k].rx, Math.max(0, (num(st[k + "_rx_bytes"]) - MON.last[k + "_rx"]) * 1024 / dt));
          monPush(MON.traffic[k].tx, Math.max(0, (num(st[k + "_tx_bytes"]) - MON.last[k + "_tx"]) * 1024 / dt));
        });
      }
      MON.last = {
        at: now,
        wan_rx: num(st.wan_rx_bytes), wan_tx: num(st.wan_tx_bytes),
        lan_rx: num(st.lan_rx_bytes), lan_tx: num(st.lan_tx_bytes),
        wlan_rx: num(st.wlan_rx_bytes), wlan_tx: num(st.wlan_tx_bytes)
      };
    }
    drawMonitor();
  }).catch(function () { });
}

function startMonitor() {
  stopMonitor();
  MON.last = null;
  sampleMonitor();
  MON.timer = setInterval(function () {
    if (!document.hidden) sampleMonitor();
  }, 2000);
}

function stopMonitor() {
  if (MON.timer) { clearInterval(MON.timer); MON.timer = null; }
}

function loadMonitor() {
  startMonitor();
  return Promise.resolve();
}

/* ---------------- ACCESS CONTROL (MAC / IP / URL) ---------------- */
var ACL = {
  tab: "mac",
  aclStatus: { mac: "1", ip: "1", url: "1" },
  lists: { mac: [], ip: [], url: [] }
};

var ACL_SCHED = {
  dates: "all", times: "all",
  everyday_checkbox: "on",
  checkbox_sun: "Sun", checkbox_mon: "Mon", checkbox_tue: "Tue", checkbox_wed: "Wed",
  checkbox_thu: "Thu", checkbox_fri: "Fri", checkbox_sat: "Sat",
  all_day_checkbox: "on", sele_time_start: "00:00", sele_time_end: "00:00"
};

function aclRuleText(v) { return String(v) === "1" ? t("sec.allow") : t("sec.deny"); }
function aclSchedText(x) {
  var d = String(x.dates || "all") === "all" ? t("sec.everyday") : String(x.dates);
  var tm = String(x.times || "all") === "all" ? t("sec.allDay") : String(x.times);
  return d + " · " + tm;
}
function aclEmpty(cols) {
  return '<tr><td colspan="' + cols + '"><div class="empty"><span>' + esc(t("sec.aclEmpty")) + "</span></div></td></tr>";
}

var ACL_DAYS = [["Sun", "day.sun"], ["Mon", "day.mon"], ["Tue", "day.tue"], ["Wed", "day.wed"], ["Thu", "day.thu"], ["Fri", "day.fri"], ["Sat", "day.sat"]];

function aclTimeOptions(min, max, withLast) {
  var out = "";
  for (var m = min; m <= max; m += 30) {
    var h = Math.floor(m / 60), mm = m % 60;
    var v = (h < 10 ? "0" + h : h) + ":" + (mm < 10 ? "0" + mm : mm);
    out += '<option value="' + v + '">' + v + "</option>";
  }
  if (withLast) out += '<option value="23:59">23:59</option>';
  return out;
}

function aclScheduleHtml() {
  var days = ACL_DAYS.map(function (d, i) {
    return '<label class="daychk"><input type="checkbox" id="aclDay' + i + '" value="' + d[0] + '" checked disabled>' + esc(t(d[1])) + "</label>";
  }).join("");
  return '<div class="sched">' +
    '<div class="sched-row"><label class="chk-inline"><input type="checkbox" id="aclEveryday" checked> ' + esc(t("sec.everyday")) + "</label></div>" +
    '<div class="sched-days" id="aclDays">' + days + "</div>" +
    '<div class="sched-row"><label class="chk-inline"><input type="checkbox" id="aclAllDay" checked> ' + esc(t("sec.allDay")) + "</label>" +
    '<span class="sched-times"><select id="aclStart" disabled>' + aclTimeOptions(0, 23 * 60, false) + "</select>" +
    '<span class="dash">–</span><select id="aclEnd" disabled>' + aclTimeOptions(30, 23 * 60, true) + "</select></span></div>" +
    "</div>";
}

function aclScheduleValues() {
  var everyday = $("aclEveryday").checked;
  var dates = "all";
  if (!everyday) {
    var arr = [];
    all("#aclDays input").forEach(function (cb) { if (cb.checked) arr.push(cb.value); });
    if (arr.length) dates = arr.join(" ");
  }
  var allDay = $("aclAllDay").checked;
  var start = $("aclStart").value, end = $("aclEnd").value;
  var times = allDay || (start === "00:00" && end === "00:00") ? "all" : start + "-" + end;
  return {
    dates: dates, times: times,
    everyday_checkbox: "on",
    checkbox_sun: "Sun", checkbox_mon: "Mon", checkbox_tue: "Tue", checkbox_wed: "Wed",
    checkbox_thu: "Thu", checkbox_fri: "Fri", checkbox_sat: "Sat",
    all_day_checkbox: "on", sele_time_start: start, sele_time_end: end
  };
}

function refreshAclSoon() {
  setTimeout(loadAcl, 1200);
  setTimeout(loadAcl, 3400);
}

function loadAcl() {
  return Promise.all([
    get("filter_mac_enable_show.cgi").catch(function () { return null; }),
    get("filter_mac_list_show.cgi").catch(function () { return []; }),
    get("filter_ip_filter_ip_show.cgi").catch(function () { return null; }),
    get("filter_ip_filter_ip_list.cgi").catch(function () { return []; }),
    get("filter_dns_status_show.cgi").catch(function () { return null; }),
    get("filter_dns_list_show.cgi").catch(function () { return []; })
  ]).then(function (r) {
    var macSt = r[0] || {}, ipSt = r[2] || {}, urlSt = r[4] || {};
    $("macAclEnable").checked = String(macSt.enable) === "1";
    $("macAclRule").value = String(macSt.rule_status) === "1" ? "1" : "0";
    $("ipAclEnable").checked = String(ipSt.ip_flag) === "1";
    $("ipAclRule").value = String(ipSt.ip_rule) === "1" ? "1" : "0";
    $("urlAclEnable").checked = String(urlSt.status_enable) === "1";
    $("urlAclRule").value = String(urlSt.rule_enable) === "1" ? "1" : "0";
    ACL.aclStatus.url = urlSt.acl_status || "1";
    ACL.lists.mac = Array.isArray(r[1]) ? r[1] : [];
    ACL.lists.ip = Array.isArray(r[3]) ? r[3] : [];
    ACL.lists.url = Array.isArray(r[5]) ? r[5] : [];
    renderAcl();
  });
}

function renderAcl() {
  var mac = ACL.lists.mac || [];
  var mt = $("macAclTbody");
  mt.innerHTML = mac.length ? mac.map(function (x) {
    return "<tr><td>" + esc(x.describ || "") + "</td><td class='mono'>" + esc(x.mac) + "</td><td>" + esc(aclSchedText(x)) +
      "</td><td>" + esc(aclRuleText(x.rule_name)) +
      "</td><td class='actions'><button class='iconbtn' data-acldel='mac' data-id='" + esc(x.id) + "'><svg class='ic sm'><use href='#i-delete'/></svg></button></td></tr>";
  }).join("") : aclEmpty(5);

  var ip = ACL.lists.ip || [];
  var it = $("ipAclTbody");
  it.innerHTML = ip.length ? ip.map(function (x) {
    return "<tr><td>" + esc(x.describe || "") + "</td><td class='mono'>" + esc(x.ip) + "</td><td>" + esc(x.ptmp || "") +
      "</td><td>" + esc(x.port || "") + "</td><td>" + esc(aclSchedText(x)) + "</td><td>" + esc(aclRuleText(x.rule_name)) +
      "</td><td class='actions'><button class='iconbtn' data-acldel='ip' data-id='" + esc(x.id) + "'><svg class='ic sm'><use href='#i-delete'/></svg></button></td></tr>";
  }).join("") : aclEmpty(7);

  var url = ACL.lists.url || [];
  var ut = $("urlAclTbody");
  ut.innerHTML = url.length ? url.map(function (x) {
    return "<tr><td>" + esc(x.keyword || "") + "</td><td>" + esc(aclSchedText(x)) + "</td><td>" + esc(aclRuleText(x.rule_name)) +
      "</td><td class='actions'><button class='iconbtn' data-acldel='url' data-id='" + esc(x.id) + "'><svg class='ic sm'><use href='#i-delete'/></svg></button></td></tr>";
  }).join("") : aclEmpty(4);
}

function saveAclEnable(kind) {
  var on = $(kind + "AclEnable").checked ? "1" : "0";
  var rule = $(kind + "AclRule").value;
  var path, params;
  if (kind === "mac") {
    path = "filter_mac_enable.cgi";
    params = { mac_flag: on, enable_mac: on, mac_rule: rule, enable_mac_rule: rule };
  } else if (kind === "ip") {
    path = "filter_ip_enable_set.cgi";
    params = { ip_flag: on, enable_ip: on, ip_rule: rule, enable_ip_rule: rule };
  } else {
    path = "filter_url_service_enable.cgi";
    params = { url_flag: on, enable_url: on, dns_rule: rule, enable_dns_rule: rule, filter_url_aclstat: ACL.aclStatus.url };
  }
  apply(path, params, { after: function () { refreshAclSoon(); } });
}

function addAclRule() {
  var kind = ACL.tab;
  var body = document.createElement("div");
  var ruleSelect = '<div class="field"><label>' + esc(t("sec.rule")) + '</label><select id="aclRule">' +
    '<option value="1">' + esc(t("sec.allow")) + '</option><option value="0">' + esc(t("sec.deny")) + "</option></select></div>";

  if (kind === "mac") {
    body.innerHTML = '<div class="field"><label>' + esc(t("sec.descr")) + '</label><input type="text" id="aclName" maxlength="30"></div>' +
      '<div class="field"><label>' + esc(t("clients.mac")) + '</label><div class="input-with-sel"><input type="text" id="aclMac" maxlength="17" placeholder="00:11:22:33:44:55"><span class="devsel-slot" data-target="aclMac" data-kind="mac"></span></div></div>' + ruleSelect;
  } else if (kind === "ip") {
    body.innerHTML = '<div class="field"><label>' + esc(t("sec.descr")) + '</label><input type="text" id="aclName" maxlength="30"></div>' +
      '<div class="field"><label>' + esc(t("clients.ip")) + '</label><div class="input-with-sel"><input type="text" id="aclIp" maxlength="15" placeholder="192.168.0.50"><span class="devsel-slot" data-target="aclIp" data-kind="ip"></span></div></div>' +
      '<div class="field"><label>' + esc(t("sec.proto")) + '</label><select id="aclProto"><option value="0">ALL</option><option value="1">TCP</option><option value="2">UDP</option></select></div>' +
      '<div class="field"><label>' + esc(t("sec.intPort")) + ' (' + esc(t("common.optional")) + ')</label><input type="text" id="aclPort" maxlength="5" placeholder="80"></div>' + ruleSelect;
  } else {
    body.innerHTML = '<div class="field"><label>' + esc(t("sec.keyword")) + '</label><input type="text" id="aclKeyword" maxlength="63" placeholder="example.com"></div>' + ruleSelect;
  }

  body.innerHTML += aclScheduleHtml();
  fillDeviceSlots(body);

  dialog({
    title: t("sec.addRule"), body: body,
    actions: [
      { label: t("common.cancel") },
      {
        label: t("common.save"), primary: true, onClick: function () {
          var rule = $("aclRule").value;
          var params;
          if (kind === "mac") {
            var mac = $("aclMac").value.trim();
            if (!/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(mac)) { toast(t("err.err_mac"), "err"); return false; }
            params = Object.assign({ mac_describe: $("aclName").value.trim(), rule: rule, mac_address: mac, mac_allow_deny: "0" }, aclScheduleValues());
            apply("filter_mac_add.cgi", params, { msg: t("sec.added"), after: function () { refreshAclSoon(); } });
          } else if (kind === "ip") {
            var ip = $("aclIp").value.trim();
            if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) { toast(t("err.err_ip"), "err"); return false; }
            var port = $("aclPort").value.trim() || "0";
            params = Object.assign({ rule_name: $("aclName").value.trim(), rule: rule, SrcIpFrom: ip, proto: $("aclProto").value, dest_port_a: port, dest_port_b: port }, aclScheduleValues());
            apply("filter_ip_add.cgi", params, { msg: t("sec.added"), after: function () { refreshAclSoon(); } });
          } else {
            var kw = $("aclKeyword").value.trim();
            if (!kw) { toast(t("err.err_name"), "err"); return false; }
            params = Object.assign({ rule: rule, filter_url_keyword1: kw, submitbutton: "Add" }, aclScheduleValues());
            apply("filter_url_add.cgi", params, { msg: t("sec.added"), after: function () { refreshAclSoon(); } });
          }
        }
      }
    ]
  });

  $("aclEveryday").addEventListener("change", function () {
    var on = this.checked;
    all("#aclDays input").forEach(function (cb) { cb.disabled = on; if (on) cb.checked = true; });
  });
  $("aclAllDay").addEventListener("change", function () {
    $("aclStart").disabled = this.checked;
    $("aclEnd").disabled = this.checked;
  });
}

function deleteAcl(kind, id) {
  confirmDialog(t("sec.delete"), t("sec.delConfirm"), function () {
    var path, params;
    if (kind === "mac") {
      path = "filter_mac_allow_del.cgi";
      params = { filter_allow_mac_del_page: "", filter_mac_id: id, filter_mac_change_rule: "del" };
    } else if (kind === "ip") {
      path = "filter_ip_item_del.cgi";
      params = { filter_ip_page: "", filter_ip_id: id, filter_ip_change_rule: "del" };
    } else {
      path = "filter_url_item_del.cgi";
      params = { filter_url_del_page: "", del_url_value: id, filter_dns_change_rule: "del" };
    }
    apply(path, params, { msg: t("sec.deleted"), after: function () { refreshAclSoon(); } });
  }, t("sec.delete"), true);
}

/* ---------------- QOS ---------------- */
var QOS = { lan: "192.168.0.1", list: [] };

function loadQos() {
  return Promise.all([
    get("qos_policy_module_show.cgi").catch(function () { return null; }),
    get("qos_policy_list_show.cgi").catch(function () { return []; })
  ]).then(function (r) {
    var mod = r[0] || {}, o = mod.qos_obj || {};
    QOS.lan = mod.lan_ip_addr || QOS.lan;
    $("qosEnable").checked = String(o.enable) === "1";
    $("qosAutoUp").checked = String(o.auto) === "1";
    $("qosUp").value = o.speed || "0";
    $("qosUp").disabled = $("qosAutoUp").checked;
    $("qosAutoDown").checked = String(o.auto_down) === "1";
    $("qosDown").value = o.speed_down || "0";
    $("qosDown").disabled = $("qosAutoDown").checked;
    renderQos(Array.isArray(r[1]) ? r[1] : []);
  });
}

function qosBw(v) {
  return String(v) === "0" || v === "" ? t("common.auto") : String(v);
}

function renderQos(list) {
  QOS.list = list || [];
  var tb = $("qosTbody");
  if (!QOS.list.length) {
    tb.innerHTML = '<tr><td colspan="7"><div class="empty"><span>' + esc(t("qos.empty")) + "</span></div></td></tr>";
    return;
  }
  tb.innerHTML = QOS.list.map(function (x) {
    return "<tr><td>" + esc(x.name || "") + "</td><td class='mono'>" + esc(x.fp_buf || "") + "</td><td>" + esc(qosBw(x.bandwidth)) +
      "</td><td>" + esc(qosBw(x.down_bandwidth)) + "</td><td>" + esc(qosBw(x.max_bandwidth)) + "</td><td>" + esc(qosBw(x.max_down_bandwidth)) +
      "</td><td class='actions'><button class='iconbtn' data-qosdel='" + esc(x.id) + "'><svg class='ic sm'><use href='#i-delete'/></svg></button></td></tr>";
  }).join("");
}

function refreshQosSoon() {
  setTimeout(loadQos, 1200);
  setTimeout(loadQos, 3200);
}

function saveQos() {
  apply("qos_enable_set.cgi", {
    flage: "enable",
    qos_enable: $("qosEnable").checked ? "1" : "0",
    enable_qos_rule: $("qosAutoUp").checked ? "1" : "0",
    uplink_val: $("qosUp").value.trim() || "0",
    qos_down_rule: $("qosAutoDown").checked ? "1" : "0",
    uplink_down_val: $("qosDown").value.trim() || "0"
  }, { after: refreshQosSoon });
}

function addQosRule() {
  var prefix = String(QOS.lan).split(".").slice(0, 3).join(".") + ".";
  var body = document.createElement("div");
  body.innerHTML =
    '<div class="field"><label>' + esc(t("qos.name")) + '</label><input type="text" id="qosName" maxlength="30"></div>' +
    '<div class="field-row"><div class="field"><label>' + esc(t("qos.ipStart")) + '</label><div class="input-with-sel"><input type="text" id="qosIpStart" maxlength="15" placeholder="' + esc(prefix + "50") + '"><span class="devsel-slot" data-target="qosIpStart" data-kind="ip"></span></div></div>' +
    '<div class="field"><label>' + esc(t("qos.ipEnd")) + '</label><div class="input-with-sel"><input type="text" id="qosIpEnd" maxlength="15" placeholder="' + esc(prefix + "50") + '"><span class="devsel-slot" data-target="qosIpEnd" data-kind="ip"></span></div></div></div>' +
    '<div class="field-row"><div class="field"><label>' + esc(t("qos.minUp")) + '</label><input type="text" id="qosMinUp" maxlength="6" value="0"></div>' +
    '<div class="field"><label>' + esc(t("qos.minDown")) + '</label><input type="text" id="qosMinDown" maxlength="6" value="0"></div></div>' +
    '<div class="field-row"><div class="field"><label>' + esc(t("qos.maxUp")) + '</label><input type="text" id="qosMaxUp" maxlength="6" value="0"></div>' +
    '<div class="field"><label>' + esc(t("qos.maxDown")) + '</label><input type="text" id="qosMaxDown" maxlength="6" value="0"></div></div>';
  fillDeviceSlots(body);
  dialog({
    title: t("qos.addRule"), body: body,
    actions: [
      { label: t("common.cancel") },
      {
        label: t("common.save"), primary: true, onClick: function () {
          var s = $("qosIpStart").value.trim(), e = $("qosIpEnd").value.trim();
          var re = /^(\d{1,3}\.){3}\d{1,3}$/;
          if (!re.test(s) || !re.test(e)) { toast(t("err.err_ip"), "err"); return false; }
          if (s.split(".").slice(0, 3).join(".") !== prefix.slice(0, -1) ||
              e.split(".").slice(0, 3).join(".") !== prefix.slice(0, -1)) {
            toast(t("qos.subnetErr"), "err"); return false;
          }
          var minU = $("qosMinUp").value.trim(), minD = $("qosMinDown").value.trim();
          var maxU = $("qosMaxUp").value.trim(), maxD = $("qosMaxDown").value.trim();
          if ((maxU !== "0" && +maxU < +minU) || (maxD !== "0" && +maxD < +minD)) {
            toast(t("qos.maxErr"), "err"); return false;
          }
          apply("qos_add.cgi", {
            comment: $("qosName").value.trim(),
            addip1: s.split(".")[3], addip2: e.split(".")[3],
            strIpStart: s, strIpEnd: e,
            bandwidth: minU || "0", down_bandwidth: minD || "0",
            max_bandwidth: maxU || "0", max_down_bandwidth: maxD || "0"
          }, { msg: t("sec.added"), after: refreshQosSoon });
        }
      }
    ]
  });
}

function deleteQos(id) {
  confirmDialog(t("sec.delete"), t("sec.delConfirm"), function () {
    apply("qos_item_del.cgi", { filter_qos_id: id }, { msg: t("sec.deleted"), after: refreshQosSoon });
  }, t("sec.delete"), true);
}

/* ---------------- WPS ---------------- */
function loadWps() {
  return get("wirel_wps_data_show.cgi").then(function (d) {
    S.data.wps = d || {};
    var on = String((d || {}).enable) === "1";
    chip($("wpsState"), on ? t("common.on") : t("common.off"), on ? "ok" : "");
    $("wpsToggleBtn").querySelector("span").textContent = on ? t("wl.wpsDisable") : t("wl.wpsEnable");
    if (d && d.pin_host) $("wpsPin").value = d.pin_host;
  }).catch(function () { });
}

function wpsAction(mode) {
  var on = S.data.wps && String(S.data.wps.enable) === "1";
  var en = mode === "enable" ? (on ? "0" : "1") : "1";
  var payload = {
    wps_mode: mode,
    wps_enable: en,
    pin_host: $("wpsPin").value.trim()
  };
  if (mode === "pbc" || mode === "pin") payload.wps_new_user_type = mode;
  if (mode === "enable") {
    showMask(t("wl.wpsApplying"));
    post("wire_wps_set.cgi", payload).catch(function () { }).then(function () {
      setTimeout(function () {
        hideMask();
        location.hash = "#wireless";
        location.reload();
      }, 12000);
    });
    return;
  }
  apply("wire_wps_set.cgi", payload, { msg: t("wl.wpsStarted"), after: function () { setTimeout(loadWps, 1200); } });
}

/* ---------------- WIRELESS ACCESS CONTROL ---------------- */
var WLACL = { list: [], mf: 0 };

function refreshWlAclSoon() {
  setTimeout(loadWlAcl, 1000);
  setTimeout(loadWlAcl, 2800);
}

function loadWlAcl() {
  return get("topwl_ac_filter_show.cgi").then(function (d) {
    d = d || {};
    WLACL.mf = parseInt(d.mf_enable || "0", 10);
    $("wlAclEnable").checked = WLACL.mf !== 0;
    $("wlAclMode").value = WLACL.mf === 2 ? "deny" : "allow";
    WLACL.list = Array.isArray(d.data) ? d.data : [];
    renderWlAcl();
  }).catch(function () { });
}

function renderWlAcl() {
  var tb = $("wlAclTbody");
  if (!WLACL.list.length) {
    tb.innerHTML = '<tr><td colspan="3"><div class="empty"><span>' + esc(t("sec.aclEmpty")) + "</span></div></td></tr>";
    return;
  }
  tb.innerHTML = WLACL.list.map(function (x) {
    return "<tr><td>" + esc(x.mac_comment || "") + "</td><td class='mono'>" + esc(x.macstr) +
      "</td><td class='actions'><button class='iconbtn' data-wlacldel='" + esc(x.id) + "'><svg class='ic sm'><use href='#i-delete'/></svg></button></td></tr>";
  }).join("");
}

function saveWlAcl() {
  apply("wire_filter_mac_set.cgi", {
    wire_enable_filter: $("wlAclEnable").checked ? "enable" : "disable",
    FilterMode: $("wlAclMode").value
  }, { after: refreshWlAclSoon });
}

function addWlAcl() {
  var body = document.createElement("div");
  body.innerHTML =
    '<div class="field"><label>' + esc(t("sec.descr")) + '</label><input type="text" id="wlAclName" maxlength="30"></div>' +
    '<div class="field"><label>' + esc(t("clients.mac")) + '</label><div class="input-with-sel"><input type="text" id="wlAclMac" maxlength="17" placeholder="00:11:22:33:44:55"><span class="devsel-slot" data-target="wlAclMac" data-kind="mac"></span></div></div>';
  fillDeviceSlots(body);
  dialog({
    title: t("sec.addRule"), body: body,
    actions: [
      { label: t("common.cancel") },
      {
        label: t("common.save"), primary: true, onClick: function () {
          var mac = $("wlAclMac").value.trim();
          if (!/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(mac)) { toast(t("err.err_mac"), "err"); return false; }
          apply("wire_filter_mac_add.cgi", { comment: $("wlAclName").value.trim(), mac_address: mac },
            { msg: t("sec.added"), after: refreshWlAclSoon });
        }
      }
    ]
  });
}

function deleteWlAcl(id) {
  apply("wire_filter_mac_del.cgi", { del_mac: id }, { msg: t("sec.deleted"), after: refreshWlAclSoon });
}

/* ---------------- STATIC ROUTING ---------------- */
var ROUTES = [];

function refreshRoutesSoon() {
  setTimeout(loadRoutes, 900);
  setTimeout(loadRoutes, 2500);
}

function loadRoutes() {
  return get("routing_table_list_two_show.cgi").then(function (list) {
    ROUTES = Array.isArray(list) ? list : [];
    renderRoutes();
  }).catch(function () { });
}

function renderRoutes() {
  var tb = $("routeTbody");
  if (!ROUTES.length) {
    tb.innerHTML = '<tr><td colspan="5"><div class="empty"><span>' + esc(t("route.empty")) + "</span></div></td></tr>";
    return;
  }
  tb.innerHTML = ROUTES.map(function (x) {
    return "<tr><td>" + esc(x.type) + "</td><td class='mono'>" + esc(x.ip) + "</td><td class='mono'>" + esc(x.mask) +
      "</td><td class='mono'>" + esc(x.gw) + "</td><td class='actions'><button class='iconbtn' data-routedel='" + esc(x.id) +
      "'><svg class='ic sm'><use href='#i-delete'/></svg></button></td></tr>";
  }).join("");
}

function addRoute() {
  var body = document.createElement("div");
  body.innerHTML =
    '<div class="field"><label>' + esc(t("route.type")) + '</label><select id="routeType"><option value="0">NET</option><option value="1">HOST</option></select></div>' +
    '<div class="field"><label>' + esc(t("route.target")) + '</label><input type="text" id="routeTarget" maxlength="15" placeholder="10.0.0.0"></div>' +
    '<div class="field"><label>' + esc(t("route.mask")) + '</label><input type="text" id="routeMask" maxlength="15" value="255.255.255.0" placeholder="255.255.255.0"></div>' +
    '<div class="field"><label>' + esc(t("route.gateway")) + '</label><input type="text" id="routeGw" maxlength="15" placeholder="192.168.0.1"></div>';
  dialog({
    title: t("route.add"), body: body,
    actions: [
      { label: t("common.cancel") },
      {
        label: t("common.save"), primary: true, onClick: function () {
          var ip = $("routeTarget").value.trim();
          var mask = $("routeType").value === "1" ? "255.255.255.255" : $("routeMask").value.trim();
          var gw = $("routeGw").value.trim();
          var re = /^(\d{1,3}\.){3}\d{1,3}$/;
          if (!re.test(ip) || !re.test(mask) || !re.test(gw)) { toast(t("err.err_ip"), "err"); return false; }
          apply("routing_tab_add.cgi", {
            type: $("routeType").value, double_ap_enable: "0",
            target_ip_value: ip, mask_value: mask, gateway_value: gw
          }, { msg: t("route.added"), after: refreshRoutesSoon });
        }
      }
    ]
  });
  $("routeType").addEventListener("change", function () {
    var mask = $("routeMask");
    if (this.value === "1") {
      mask.setAttribute("data-prev", mask.value);
      mask.value = "255.255.255.255";
      mask.disabled = true;
    } else {
      mask.disabled = false;
      var prev = mask.getAttribute("data-prev");
      mask.value = prev || "255.255.255.0";
    }
  });
}

function deleteRoute(id) {
  apply("routing_tab_del.cgi", { del_if: id, routing_del_page: "" }, { msg: t("sec.deleted"), after: refreshRoutesSoon });
}

/* ---------------- PORT TRIGGERING ---------------- */
var PT = [];

function refreshPtSoon() {
  setTimeout(loadSecurity, 1000);
  setTimeout(loadSecurity, 2800);
}

function renderPortTriggers() {
  var tb = $("ptTbody");
  if (!PT.length) {
    tb.innerHTML = '<tr><td colspan="4"><div class="empty"><span>' + esc(t("pt.empty")) + "</span></div></td></tr>";
    return;
  }
  tb.innerHTML = PT.map(function (x) {
    return "<tr><td>" + esc(x.comment || "") + "</td><td class='mono'>" + esc(x.buf1 || "") +
      "</td><td class='mono'>" + esc(x.proto || "") + "</td><td class='actions'><button class='iconbtn' data-ptdel='" +
      esc(x.id) + "'><svg class='ic sm'><use href='#i-delete'/></svg></button></td></tr>";
  }).join("");
}

function addPortTrigger() {
  var body = document.createElement("div");
  body.innerHTML =
    '<div class="field"><label>' + esc(t("pt.preset")) + '</label><select id="ptPreset">' +
      '<option value="0">' + esc(t("pt.none")) + '</option>' +
      '<option value="1">GuruGuru</option><option value="2">BuddyBuddy</option><option value="3">Enppy</option>' +
      '<option value="4">Pruna TCP</option><option value="5">Pruna UDP</option></select></div>' +
    '<div class="field"><label>' + esc(t("sec.ruleName")) + '</label><input type="text" id="ptName" maxlength="30"></div>' +
    '<div class="field-row">' +
      '<div class="field"><label>' + esc(t("pt.trigProto")) + '</label><select id="ptTrigProto"><option value="6">TCP</option><option value="17">UDP</option></select></div>' +
      '<div class="field"><label>' + esc(t("pt.trigPorts")) + '</label><input type="text" id="ptTrigPorts" maxlength="21" placeholder="31200"></div>' +
    '</div>' +
    '<div class="field-row">' +
      '<div class="field"><label>' + esc(t("pt.fwdProto")) + '</label><select id="ptFwdProto"><option value="6">TCP</option><option value="17">UDP</option></select></div>' +
      '<div class="field"><label>' + esc(t("pt.fwdPorts")) + '</label><input type="text" id="ptFwdPorts" maxlength="31" placeholder="9292"></div>' +
    '</div>';
  var presets = {
    1: ["GuruGuru", "6", "31200", "", "6", "9292"],
    2: ["BuddyBuddy", "6", "941", "", "6", "987"],
    3: ["Enppy", "6", "4001", "", "6", "4901,7878"],
    4: ["Pruna TCP", "6", "4661", "", "6", "4661,4662"],
    5: ["Pruna UDP", "17", "4665", "", "17", "4665,4672"]
  };
  dialog({
    title: t("sec.addRule"), body: body,
    actions: [
      { label: t("common.cancel") },
      {
        label: t("common.save"), primary: true, onClick: function () {
          var name = $("ptName").value.trim();
          var a = $("ptTrigPorts").value.trim(), fwd = $("ptFwdPorts").value.trim();
          if (!name) { toast(t("err.err_name"), "err"); return false; }
          if (!/^\d{1,5}(-\d{1,5})?$/.test(a) || !/^\d{1,5}(,\d{1,5})*$/.test(fwd)) {
            toast(t("err.err_port"), "err"); return false;
          }
          apply("igd_port_trigger_add.cgi", {
            rule_name: name, trigger_proto_sele: $("ptTrigProto").value,
            port_trigger_a: a.split("-")[0], port_trigger_b: a.split("-")[1] || "",
            forward_proto_sele: $("ptFwdProto").value, forward_port: fwd, port_select: "0"
          }, { msg: t("sec.added"), after: refreshPtSoon });
        }
      }
    ]
  });
  $("ptPreset").addEventListener("change", function () {
    var p = presets[this.value];
    if (!p) {
      $("ptName").value = ""; $("ptTrigProto").value = "6"; $("ptTrigPorts").value = "";
      $("ptFwdProto").value = "6"; $("ptFwdPorts").value = "";
      return;
    }
    $("ptName").value = p[0]; $("ptTrigProto").value = p[1]; $("ptTrigPorts").value = p[2] + (p[3] ? "-" + p[3] : "");
    $("ptFwdProto").value = p[4]; $("ptFwdPorts").value = p[5];
  });
}

function deletePortTrigger(id) {
  apply("igd_port_trigger_del.cgi", { del_rulename: id }, { msg: t("sec.deleted"), after: refreshPtSoon });
}

function saveAdvNet() {
  var igmp = $("advIgmp").checked ? "1" : "0";
  var pptp = $("advPptp").checked ? "1" : "0";
  var l2tp = $("advL2tp").checked ? "1" : "0";
  var ipsec = $("advIpsec").checked ? "1" : "0";
  var ftpOn = $("advFtp").checked ? "1" : "0";
  var ftpPort = $("advFtpPort").value.trim() || "21";
  if (!/^\d{1,5}$/.test(ftpPort) || +ftpPort < 1 || +ftpPort > 65535) { toast(t("err.err_port"), "err"); return; }
  Promise.all([
    post("Igmp_proxy_StatusSet.cgi", { enable: igmp }),
    post("vpn_status.cgi", {
      pptp: pptp, pptp_enable: pptp,
      alg_l2tp: l2tp, l2tp_enable: l2tp,
      ipsec: ipsec, ipsec_enable: ipsec
    }),
    post("ftp_private.cgi", { ftp_enable: ftpOn, ftp_port: ftpPort })
  ]).then(function () {
    toast(t("adv.saved"), "ok");
    setTimeout(loadSecurity, 1200);
  }).catch(function () { toast(t("err.generic"), "err"); });
}

/* ---------------- CONNECTED DEVICE PICKER ---------------- */
S.devices = S.devices || [];
var devicesPromise = null;

function loadDevices(force) {
  if (!force && devicesPromise) return devicesPromise;
  devicesPromise = Promise.all([
    get("dhcp_client_show.cgi").catch(function () { return []; }),
    get("wireless_ASSOCIATE_HOST_show.cgi").catch(function () { return null; })
  ]).then(function (r) {
    var map = {};
    (Array.isArray(r[0]) ? r[0] : []).forEach(function (d) {
      var mac = String(d.mac || "").toLowerCase();
      if (!mac) return;
      map[mac] = { mac: mac, ip: d.ip || "" };
    });
    var wl = r[1] || {};
    (Array.isArray(wl.sec_ap0) ? wl.sec_ap0 : []).forEach(function (d) {
      var mac = String(d.wl_AH_mac || "").toLowerCase();
      if (!mac) return;
      if (!map[mac]) map[mac] = { mac: mac, ip: "" };
    });
    S.devices = Object.keys(map).map(function (k) { return map[k]; });
    return S.devices;
  }).catch(function () { return []; });
  return devicesPromise;
}

function fillDeviceSlots(root) {
  return loadDevices().then(function () {
    var slots = (root || document).querySelectorAll(".devsel-slot");
    Array.prototype.forEach.call(slots, function (slot) {
      var kind = slot.getAttribute("data-kind") || "ip";
      var target = slot.getAttribute("data-target");
      var opts = ['<option value="">' + esc(t("dev.pick")) + "</option>"];
      S.devices.forEach(function (d) {
        var v = kind === "ip" ? d.ip : d.mac;
        if (!v) return;
        var label = (d.ip ? d.ip + " · " : "") + d.mac;
        opts.push('<option value="' + esc(v) + '">' + esc(label) + "</option>");
      });
      slot.innerHTML = '<button type="button" class="iconbtn devpick" data-target="' + esc(target) + '" data-kind="' + esc(kind) +
        '" title="' + esc(t("dev.pick")) + '"><svg class="ic sm"><use href="#i-devices"/></svg></button>';
    });
  });
}

function closeDevicePicker() {
  var p = $("devpop");
  if (p) p.parentNode.removeChild(p);
}

function openDevicePicker(target, kind, anchor) {
  loadDevices(true).then(function () {
    closeDevicePicker();
    var list = S.devices.filter(function (d) { return kind === "ip" ? !!d.ip : !!d.mac; });
    var pop = document.createElement("div");
    pop.className = "devpop";
    pop.id = "devpop";
    if (!list.length) {
      pop.innerHTML = '<p class="muted small" style="margin:8px">' + esc(t("dev.none")) + "</p>";
    } else {
      pop.innerHTML = list.map(function (d) {
        var v = kind === "ip" ? d.ip : d.mac;
        var sub = kind === "ip" ? d.mac : (d.ip || "");
        return '<button type="button" class="devrow" data-val="' + esc(v) + '"><span class="mono">' + esc(v) +
          '</span><span class="muted small">' + esc(sub) + "</span></button>";
      }).join("");
    }
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect();
    var w = 300, h = Math.min(300, pop.offsetHeight || 80);
    var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    pop.style.width = w + "px";
    Array.prototype.forEach.call(pop.querySelectorAll(".devrow"), function (row) {
      row.addEventListener("click", function () {
        var input = $(target);
        if (input) input.value = row.getAttribute("data-val");
        closeDevicePicker();
      });
    });
  });
}

/* ---------------- EVENT WIRING ---------------- */
function ripple(e) {
  var host = e.target.closest(".btn, .pill, .tab, .iconbtn, .fab");
  if (!host) return;
  var r = host.getBoundingClientRect();
  var s = Math.max(r.width, r.height);
  var sp = document.createElement("span");
  sp.className = "ripple";
  sp.style.width = sp.style.height = s + "px";
  sp.style.left = (e.clientX - r.left - s / 2) + "px";
  sp.style.top = (e.clientY - r.top - s / 2) + "px";
  host.appendChild(sp);
  setTimeout(function () { sp.remove(); }, 600);
}

function bind() {
  document.addEventListener("mousedown", ripple);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && dialogOpen) closeDialog(); });
  $("scrim").addEventListener("click", function (e) { if (e.target === $("scrim")) closeDialog(); });

  $("tabbar").addEventListener("click", function (e) {
    var b = e.target.closest(".tab");
    if (b) switchPage(b.getAttribute("data-page"));
  });

  $("langBtn").addEventListener("click", function () {
    S.lang = S.lang === "zh" ? "en" : "zh";
    localStorage.setItem("wf_lang", S.lang);
    applyI18n();
    loadStatus();
    if (S.page === "system") loadSystem();
  });

  $("fabRefresh").addEventListener("click", function () { refreshPage(S.page); });

  $("wlPills").addEventListener("click", function (e) {
    var b = e.target.closest(".pill");
    if (!b) return;
    showMask(t("common.loading"));
    Promise.resolve(switchSub(b.getAttribute("data-sub"))).catch(function () { }).then(function () { hideMask(200); });
  });

  $("wanTypePills").addEventListener("click", function (e) {
    var b = e.target.closest(".pill");
    if (b) setWanType(b.getAttribute("data-wantype"));
  });

  $("wlRegion").addEventListener("change", function () {
    fillChannels($("wlChanSel"), this.value, 0);
  });
  $("wlWidth").addEventListener("change", function () {
    fillChannels($("wlChanSel"), $("wlRegion").value, $("wlChanSel").value);
  });
  $("secMode").addEventListener("change", updateSecFields);
  $("dhcpDnsMode").addEventListener("change", toggleDnsRow);

  $("wlSaveBtn").addEventListener("click", saveWirelessBasic);
  $("secSaveBtn").addEventListener("click", saveWirelessSecurity);
  $("wpsToggleBtn").addEventListener("click", function () { wpsAction("enable"); });
  $("wpsGenBtn").addEventListener("click", function () { wpsAction("mkpin"); });
  $("wpsPbcBtn").addEventListener("click", function () { wpsAction("pbc"); });
  $("wpsPinBtn").addEventListener("click", function () { wpsAction("pin"); });
  $("wlAclSave").addEventListener("click", saveWlAcl);
  $("wlAclAddBtn").addEventListener("click", addWlAcl);
  $("wlAclTbody").addEventListener("click", function (e) {
    var b = e.target.closest("[data-wlacldel]");
    if (b) deleteWlAcl(b.getAttribute("data-wlacldel"));
  });
  $("surveyBtn").addEventListener("click", function () { loadSurvey(true); });
  $("hostsRefreshBtn").addEventListener("click", loadHosts);
  $("advSaveBtn").addEventListener("click", saveAdvanced);

  $("wanSaveBtn").addEventListener("click", saveWan);
  $("wanRefreshBtn").addEventListener("click", function () { loadStatus(); loadWan(); });
  $("wanConnBtn").addEventListener("click", toggleWanConnection);
  $("wanDetectBtn").addEventListener("click", detectWan);
  $("macSaveBtn").addEventListener("click", saveWanMac);
  $("ddnsSaveBtn").addEventListener("click", saveDdns);
  $("macCloneBtn").addEventListener("click", function () {
    var mac = (S.data.wanCfg || {}).mac_clone || "";
    if (!mac) { toast(t("err.err_mac"), "err"); return; }
    $("macInput").value = mac;
  });
  $("macDefaultBtn").addEventListener("click", function () {
    var mac = (S.data.wanCfg || {}).mac_default || $("macDefault").textContent;
    $("macInput").value = String(mac).replace(/[^0-9a-fA-F:]/g, "");
  });

  $("lanSaveBtn").addEventListener("click", saveLan);
  $("dhcpSaveBtn").addEventListener("click", saveDhcp);
  $("leaseRefreshBtn").addEventListener("click", loadLan);

  $("wispScanBtn").addEventListener("click", wispScan);
  $("wispRefreshBtn").addEventListener("click", loadWisp);

  $("pfAddBtn").addEventListener("click", addPortForward);
  $("ptAddBtn").addEventListener("click", addPortTrigger);
  $("ptTbody").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ptdel]");
    if (b) deletePortTrigger(b.getAttribute("data-ptdel"));
  });
  $("reserveAddBtn").addEventListener("click", addReservation);
  $("routeAddBtn").addEventListener("click", addRoute);
  $("routeTbody").addEventListener("click", function (e) {
    var b = e.target.closest("[data-routedel]");
    if (b) deleteRoute(b.getAttribute("data-routedel"));
  });
  $("macAclSave").addEventListener("click", function () { saveAclEnable("mac"); });
  $("ipAclSave").addEventListener("click", function () { saveAclEnable("ip"); });
  $("urlAclSave").addEventListener("click", function () { saveAclEnable("url"); });
  $("aclAddBtn").addEventListener("click", addAclRule);
  $("qosSaveBtn").addEventListener("click", saveQos);
  $("advNetSave").addEventListener("click", saveAdvNet);
  $("qosAddBtn").addEventListener("click", addQosRule);
  $("qosAutoUp").addEventListener("change", function () { $("qosUp").disabled = this.checked; });
  $("qosAutoDown").addEventListener("change", function () { $("qosDown").disabled = this.checked; });
  $("qosTbody").addEventListener("click", function (e) {
    var b = e.target.closest("[data-qosdel]");
    if (b) deleteQos(b.getAttribute("data-qosdel"));
  });
  $("aclPills").addEventListener("click", function (e) {
    var b = e.target.closest(".pill");
    if (!b) return;
    ACL.tab = b.getAttribute("data-acl");
    all("#aclPills .pill").forEach(function (x) { x.classList.toggle("active", x === b); });
    all("#aclCard .subpage").forEach(function (p) { p.classList.toggle("active", p.id === "acl-" + ACL.tab); });
  });
  $("aclCard").addEventListener("click", function (e) {
    var b = e.target.closest("[data-acldel]");
    if (b) deleteAcl(b.getAttribute("data-acldel"), b.getAttribute("data-id"));
  });
  $("dmzHeadEnable").addEventListener("change", function () {
    if (DMZ_TAB === "super") {
      DMZ_STATE.super = this.checked;
      if (this.checked) DMZ_STATE.normal = false;
    } else {
      DMZ_STATE.normal = this.checked;
      if (this.checked) DMZ_STATE.super = false;
    }
    renderDmzState();
  });
  $("dmzPills").addEventListener("click", function (e) {
    var b = e.target.closest(".pill");
    if (b) setDmzTab(b.getAttribute("data-dmz"));
  });
  $("dmzSaveBtn").addEventListener("click", saveActiveDmz);
  $("upnpSaveBtn").addEventListener("click", saveUpnp);

  $("pwdSaveBtn").addEventListener("click", savePassword);
  $("timeSaveBtn").addEventListener("click", saveTime);
  $("wolBtn").addEventListener("click", sendWol);
  $("remoteSaveBtn").addEventListener("click", saveRemote);
  $("remoteEnable").addEventListener("change", function () { $("remotePort").disabled = !this.checked; });
  $("logPills").addEventListener("click", function (e) {
    var b = e.target.closest(".pill");
    if (!b) return;
    showMask(t("common.loading"));
    Promise.resolve(loadLog(b.getAttribute("data-log"))).catch(function () { }).then(function () { hideMask(150); });
  });
  $("logRefreshBtn").addEventListener("click", function () { loadLog(S.logMode); });
  $("logClearBtn").addEventListener("click", clearLog);
  $("fwPickBtn").addEventListener("click", function () { $("fwFile").click(); });
  $("fwFile").addEventListener("change", function () { firmwarePicked(this.files && this.files[0]); });
  $("fwUpgradeBtn").addEventListener("click", upgradeFirmware);
  $("rebootBtn").addEventListener("click", rebootRouter);
  $("resetBtn").addEventListener("click", factoryReset);
  $("clientsRefreshBtn").addEventListener("click", loadClients);

  $("monPills").addEventListener("click", function (e) {
    var b = e.target.closest(".pill");
    if (!b) return;
    MON.iface = b.getAttribute("data-iface");
    all("#monPills .pill").forEach(function (x) { x.classList.toggle("active", x === b); });
    drawMonitor();
  });

  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest(".devpick") : null;
    if (b) {
      e.preventDefault();
      openDevicePicker(b.getAttribute("data-target"), b.getAttribute("data-kind"), b);
      return;
    }
    if (!(e.target && e.target.closest && e.target.closest("#devpop"))) closeDevicePicker();
  });
  fillDeviceSlots(document);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (S.page === "monitor") stopMonitor();
      return;
    }
    if (S.page === "status") loadStatus();
    if (S.page === "monitor") startMonitor();
  });

  window.addEventListener("hashchange", function () {
    var h = (location.hash || "").replace("#", "");
    var pages = ["status", "monitor", "wireless", "wan", "lan", "client", "security", "system"];
    if (pages.indexOf(h) >= 0 && h !== S.page) switchPage(h);
  });

  window.addEventListener("resize", function () {
    if (S.page === "monitor") drawMonitor();
  });
}

function boot() {
  var saved = null;
  try { saved = localStorage.getItem("wf_lang"); } catch (e) { }
  S.lang = saved || ((navigator.language || "en").toLowerCase().indexOf("zh") === 0 ? "zh" : "en");
  applyI18n();
  bind();
  hardenInputs(document);

  var hash = (location.hash || "").replace("#", "");
  var pages = ["status", "monitor", "wireless", "wan", "lan", "client", "security", "system"];
  var initial = pages.indexOf(hash) >= 0 ? hash : "status";
  showMask(t("common.loading"));
  loadMode().catch(function () { }).then(function () { switchPage(initial); });
  // safety: never leave the boot mask up if a request hangs
  setTimeout(function () { hideMask(0); }, 9000);

  setInterval(function () {
    if (S.page === "status" && !document.hidden) loadStatus();
  }, 8000);

  setInterval(function () {
    if (S.page === "system" && S.data.time && !document.hidden) $("timeNow").textContent = S.data.time.sys_time_now;
  }, 1000);
}

document.addEventListener("DOMContentLoaded", boot);
