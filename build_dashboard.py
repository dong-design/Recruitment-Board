# -*- coding: utf-8 -*-
"""从飞书多维表格导出数据 + 定时任务节点，生成秋招进度看板 index.html"""
import json, os, re, datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE_DIR, "feishu_records.ndjson")
OUT_DIR = os.path.join(BASE_DIR, "dashboard")
OUT = os.path.join(OUT_DIR, "index.html")
FEISHU_URL = "https://ocn31xyh2it7.feishu.cn/base/JTtqb02cFa36nyseT4ucHKBXn0c?table=tblb1z7ZnPNJTFVj&view=vewSk6uK2I"

# 云服务 publicConfig —— 由 workbuddy_cloud_service activate 返回，可直接下发到前端
CLOUD_CONFIG = {
    "endpoint": "https://campus-recruit-board-76828.app.workbuddy.host",
    "oauthRelayBaseUrl": "https://www.workbuddy.cn/v2/as/genie-baas/oauth",
    "publishableKey": "wbpk_IwA7fp2zTePL6RbJvZ5ODR_D1Mi4qWLBNzWPWxJSEoaV1tMpQ8vT2BS",
}

# 定时任务中的未来动作节点（由 automation 列表同步）
ACTIONS = [
    ("中信银行总行 AI 面试", "2026-10-30T19:00", "登录时段 19:00-19:30，20:30 前作答完成；登录后勿离开界面"),
    ("建行笔试考点预约截止", "2026-10-30T12:00", "10-28 已开放，逾期系统默认分配考点"),
    ("国家烟草网申收口", "2026-10-30T20:00", "10-30 截止·限报 1 岗且不可改，先定岗再提交"),
    ("中国融通集团网申收口", "2026-10-30T20:00", "10-30 截止·机会型，2027 届入口待核实"),
    ("贵州烟草报名收口", "2026-10-30T20:00", "10-30 截止"),
    ("瑞众人寿保险网申收口", "2026-10-30T20:00", "10-31 截止·限投 2 岗，总部北京·信息科技类"),
    ("进出口银行网申收口", "2026-10-30T20:00", "10-31 截止"),
    ("民生银行统一笔试", "2026-10-30T19:00", "19:00-21:30，提前做设备/环境测试（与中信 AI 面试撞车，见备注）"),
    ("建行笔试前一天准备", "2026-10-30T20:00", "10-31 14:30 笔试，考点预约 12:00 截止 + 打印准考证"),
    ("五矿 + 五矿资本 + 国网信通网申收口", "2026-10-30T20:00", "10-31 截止"),
    ("微软 + 美团网申", "2026-10-30T20:00", "10-31 截止"),
    ("华能 + 邮政 + 银河证券网申收口", "2026-10-30T20:00", "10-31 截止"),
    ("华泰证券网申收口", "2026-10-31T20:00", "11-01 24:00 截止，北京科技岗需核实"),
    ("工行笔试当天", "2026-10-31T09:30", "线下统一考试"),
    ("建行笔试当天", "2026-10-31T14:30", "信息技术类·北京，4 单元单独计时不可返回"),
    ("北京航天万源网申", "2026-10-31T20:00", "10-31 截止·航天科技一院子公司，北京可落户"),
    ("国家管网统一在线笔试", "2026-11-01T14:00", "闭卷 14:00-16:00，行测 + AI/大数据；等正式链接"),
    ("中海油网申截止", "2026-11-01T20:00", "11-07 在线笔试"),
    ("中国铁塔统一笔试", "2026-11-01T10:00", "线上统一笔试（面试 11-02~11-30）"),
    ("快手视频面试", "2026-11-02T15:00", "AI 全栈开发·北京，15:00-16:00"),
    ("中国南方电网网申截止", "2026-11-02T20:00", "11-02 截止，统一笔试约 11 月下旬"),
    ("京能数字产业网申", "2026-11-02T20:00", "11-05 截止"),
    ("中国船舶集团网申收口", "2026-11-06T20:00", "11-07 截止·正式批，军工央企"),
    ("中海油在线笔试", "2026-11-07T10:00", "在线笔试；网申 11-01 截止"),
    ("进出口银行网申截止", "2026-11-10T20:00", "约 11-12 止"),
    ("国家电网一批网申开启", "2026-11-12T10:00", "主战场"),
    ("中储粮网申截止", "2026-11-14T20:00", "约 11-20 止"),
]


def load():
    rows = []
    with open(SRC, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def norm_date(v):
    if not v:
        return None
    m = re.match(r"(\d{4}-\d{2}-\d{2})", str(v))
    return m.group(1) if m else None


def extract_links(v):
    if isinstance(v, list):
        return list(dict.fromkeys(url for item in v for url in extract_links(item)))
    if isinstance(v, dict):
        return extract_links([v.get(key) for key in ("link", "url", "href", "text", "value")])
    if not isinstance(v, str):
        return []
    return list(dict.fromkeys(url.rstrip("，。；、！？,;.!?") for url in re.findall(r"https?://[^\s<>\"'\[\]（）()【】]+", v, re.I)))


def pick_link(v):
    return next(iter(extract_links(v)), "")


def build():
    rows = load()
    by_id = {r["record_id"]: r for r in rows}
    children = {}
    subs = []
    for r in rows:
        par = r.get("父记录") or []
        if not par:
            continue
        pid = par[0].get("id")
        parent = by_id.get(pid, {})
        children.setdefault(pid, []).append({
            "name": r.get("公司名称") or "",
            "post": r.get("岗位") or "",
            "status": (r.get("投递") or [""])[0],
            "note": r.get("备注") or "",
        })
        subs.append({
            "id": r["record_id"], "parentId": pid, "kids": [],
            "hasDl": bool(norm_date(r.get("报名截止日"))), "apply": norm_date(r.get("投递日期")),
            "name": r.get("公司名称") or "",
            "parent": parent.get("公司名称") or "",
            "type": (r.get("单位类型") or [""])[0],
            "city": r.get("城市") or [],
            "post": r.get("岗位") or "",
            "status": (r.get("投递") or [""])[0],
            "progress": r.get("进展") or [],
            "key": norm_date(r.get("报名截止日")) or norm_date(r.get("最新日期")),
            "exam": r.get("笔试时间") or "",
            "note": r.get("备注") or "",
            "link": pick_link(r.get("链接")),
            "urls": extract_links([r.get("链接"), r.get("笔试时间"), r.get("备注")]),
        })

    recs = []
    for r in rows:
        if r.get("父记录"):
            continue
        note = r.get("备注") or ""
        status = (r.get("投递") or [""])[0] or "未标注"
        progress = r.get("进展") or []
        key = norm_date(r.get("报名截止日")) or norm_date(r.get("最新日期"))
        recs.append({
            "id": r["record_id"],
            "name": r.get("公司名称") or "(未命名)",
            "type": (r.get("单位类型") or [""])[0],
            "city": r.get("城市") or [],
            "post": r.get("岗位") or "",
            "status": status,
            "progress": progress,
            "key": key,
            "hasDl": bool(norm_date(r.get("报名截止日"))),
            "apply": norm_date(r.get("投递日期")),
            "exam": r.get("笔试时间") or "",
            "note": note,
            "link": pick_link(r.get("链接")),
            "urls": extract_links([r.get("链接"), r.get("笔试时间"), r.get("备注")]),
            "kids": children.get(r["record_id"], []),
        })

    recs.sort(key=lambda x: (x["key"] or "9999-99-99", x["name"]))
    subs.sort(key=lambda x: (x["parent"], x["name"]))
    actions = [{"name": n, "date": d[:10], "time": d[11:16], "tip": t} for n, d, t in ACTIONS]
    actions.sort(key=lambda a: (a["date"], a["time"]))

    return {
        "generated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "source": FEISHU_URL,
        "records": recs,
        "subs": subs,
        "actions": actions,
    }


TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>秋招进度看板</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#F5F6F8;color:#1C1E21;font-size:14px;line-height:1.6;padding:20px}
.wrap{max-width:1240px;margin:0 auto}
h1{font-size:20px;font-weight:600}
h2{font-size:15px;font-weight:600;margin-bottom:12px}
h3{font-size:13px;font-weight:600;margin-bottom:10px;display:flex;justify-content:space-between}
.sub{font-size:12px;color:#6B7280;font-weight:400}
a{color:#2563EB;text-decoration:none}
a:hover{text-decoration:underline}
.card{background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:16px 18px;margin-bottom:16px}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px}
.kpi{background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:14px 16px}
.kpi .l{font-size:12px;color:#6B7280}
.kpi .n{font-size:26px;font-weight:600;line-height:1.2}
.kpi.r .n{color:#DC2626}.kpi.g .n{color:#059669}.kpi.b .n{color:#2563EB}
.dl,.act{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #F1F2F4;font-size:13px}
.dl:last-child,.act:last-child{border-bottom:none}
.badge{font-size:12px;padding:2px 9px;border-radius:6px;min-width:86px;text-align:center;flex-shrink:0}
.b-red{background:#FEE2E2;color:#B91C1C}.b-org{background:#FEF3C7;color:#B45309}
.b-blu{background:#DBEAFE;color:#1D4ED8}.b-gry{background:#F1F2F4;color:#4B5563}
.dl .nm{font-weight:500}
.dl .dt{margin-left:auto;color:#6B7280;font-size:12px;white-space:nowrap}
.dl.jump{cursor:pointer;border-radius:6px;padding-left:6px;padding-right:6px}
.dl.jump:hover{background:#F3F4F6}
.it.flash{background:#EFF6FF;border-color:#2563EB;transition:background .3s,border-color .3s}
.tl{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
.tl .d{text-align:center;font-size:12px}
.tl button.d{font:inherit;font-size:12px;color:inherit;border:0;background:transparent;padding:5px 0;border-radius:8px;cursor:pointer;min-width:0}
.tl button.d:hover{background:#EFF6FF}
.tl button.d:focus-visible{outline:2px solid #2563EB;outline-offset:2px}
.day-item{display:block;width:100%;text-align:left;border:1px solid #E5E7EB;border-radius:8px;padding:12px;margin-top:10px;background:#fff;color:inherit;font:inherit}
button.day-item{cursor:pointer}
button.day-item:hover{border-color:#93C5FD;background:#EFF6FF}
.day-item .sub{display:block;margin-top:5px;white-space:pre-wrap;overflow-wrap:anywhere}
.tl .bar{height:24px;border-radius:6px;background:#EEF0F3;margin:5px 0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:600}
.tabs{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;position:sticky;top:0;z-index:20;background:#F5F6F8;padding:8px 0}
.tab{padding:7px 16px;border:1px solid #E5E7EB;background:#fff;border-radius:8px;cursor:pointer;font-size:13px}
.tab.on{background:#1C1E21;color:#fff;border-color:#1C1E21}
.cols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:start}
.filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.filters select{padding:6px 10px;border:1px solid #E5E7EB;border-radius:8px;font-size:12px;font-family:inherit;background:#fff}
.col{background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:12px;display:flex;flex-direction:column;max-height:70vh}
.col h3{position:sticky;top:0;background:#fff;z-index:2;padding-bottom:8px}
.col .list{overflow-y:auto;flex:1;padding-right:4px;overscroll-behavior:contain}
.grp{font-size:11px;color:#6B7280;margin:12px 0 6px}
.grp:first-child{margin-top:0}
.it{background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:7px 10px;margin-bottom:6px;cursor:pointer;font-size:13px}
.it:hover{border-color:#9CA3AF;background:#fff}
.it .t{font-weight:500;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.it .m{font-size:11px;color:#4B5563;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.col .list::-webkit-scrollbar{width:6px}
.col .list::-webkit-scrollbar-thumb{background:#D1D5DB;border-radius:3px}
.col .list::-webkit-scrollbar-track{background:transparent}
.pill{display:inline-block;font-size:11px;padding:1px 7px;border-radius:5px;background:#EEF0F3;color:#4B5563;margin-right:4px;margin-top:4px}
.pill.e{background:#DCFCE7;color:#166534}.pill.w{background:#FEF3C7;color:#B45309}
.pill.i{background:#DBEAFE;color:#1D4ED8}.pill.c{background:#FCE7F3;color:#9D174D}
.search{width:100%;padding:9px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:9px 10px;text-align:left;border-bottom:1px solid #F1F2F4;vertical-align:top}
th{color:#6B7280;font-weight:500;font-size:12px;background:#FAFBFC;position:sticky;top:0}
tr:hover td{background:#FAFBFC}
.mask{position:fixed;inset:0;background:rgba(17,19,23,.45);display:none;z-index:50;padding:20px;overflow-y:auto}
.mask.on{display:flex;align-items:center;justify-content:center}
.modal{background:#fff;border-radius:12px;width:100%;max-width:720px;padding:22px 24px;max-height:86vh;overflow:auto}
body.modal-open{overflow:hidden}
.modal h3{font-size:16px;font-weight:600;margin-bottom:6px;display:block}
.note{white-space:pre-wrap;font-size:13px;color:#374151;margin-top:12px;background:#F9FAFB;border-radius:8px;padding:12px;line-height:1.75}
.note a{color:#2563EB}
/* 结构化备注卡片 */
.notesec{margin-top:12px}
.nh{font-size:11px;color:#6B7280;letter-spacing:.04em;margin-bottom:6px}
.nb{background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:10px 12px;margin-bottom:8px;font-size:12.5px;line-height:1.78;color:#374151}
.nb.warn{background:#FEF6E6;border-color:#F5D9A3;border-left:3px solid #E8A33D;color:#7A4A05}
.nb.star{background:#EAF2FE;border-color:#BBD5F5;border-left:3px solid #3B82F6;color:#12365F}
.nb a{color:#1D4ED8;text-decoration:underline;word-break:break-all}
.nb ul.nl{margin:0;padding-left:16px}
.nb ul.nl li{margin:4px 0}
.dtx{color:#B91C1C;font-weight:600}
.nb.warn .dtx,.nb.star .dtx{color:#B91C1C}
.nmore summary{cursor:pointer;font-size:12px;color:#2563EB;padding:4px 0;user-select:none}
.nmore[open] summary{margin-bottom:6px}
.kid{font-size:12px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:7px 10px;margin-top:6px}
.close{float:right;cursor:pointer;color:#6B7280;font-size:20px;line-height:1}
.hide{display:none}
.abar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.btn{padding:7px 14px;border:1px solid #D1D5DB;background:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-family:inherit}
.btn:hover{border-color:#6B7280}
.btn.pri{background:#1C1E21;color:#fff;border-color:#1C1E21}
.btn:disabled{opacity:.5;cursor:not-allowed}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}
.dot.ok{background:#059669}.dot.off{background:#9CA3AF}.dot.warn{background:#D97706}
.msg{font-size:13px;padding:9px 12px;border-radius:8px;margin-bottom:12px}
.msg.err{background:#FEE2E2;color:#B91C1C}.msg.ok{background:#DCFCE7;color:#166534}.msg.warn{background:#FEF3C7;color:#B45309}
.fld{margin-bottom:12px}
.fld label{display:block;font-size:12px;color:#6B7280;margin-bottom:4px}
.fld input,.fld select{width:100%;padding:8px 10px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;font-family:inherit}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:2px}
.chip input{position:absolute;opacity:0;width:0;height:0}
.chip label{display:inline-block;padding:6px 13px;border:1px solid #D1D5DB;border-radius:999px;font-size:12.5px;color:#374151;background:#fff;cursor:pointer;user-select:none;transition:background .15s,border-color .15s,color .15s}
.chip label:hover{border-color:#6B7280}
.chip input:checked + label{background:#059669;border-color:#059669;color:#fff}
/* 选中后按阶段显示各自的颜色 */
.chip.c0 input:checked + label{background:#E0E7FF;border-color:#C7D2FE;color:#4338CA}
.chip.c1 input:checked + label{background:#FFEDD5;border-color:#FED7AA;color:#C2410C}
.chip.c2 input:checked + label{background:#CCFBF1;border-color:#99F6E4;color:#0F766E}
.chip.c3 input:checked + label{background:#DBEAFE;border-color:#BFDBFE;color:#1D4ED8}
.chip.c4 input:checked + label{background:#FEF9C3;border-color:#FDE68A;color:#A16207}
.chip.c5 input:checked + label{background:#FEE2E2;border-color:#FECACA;color:#B91C1C}
.chip.c6 input:checked + label{background:#F3E8FF;border-color:#E9D5FF;color:#7E22CE}
.chip input:focus-visible + label{outline:2px solid #2563EB;outline-offset:2px}
.sec{border-top:1px solid #F1F2F4;margin-top:14px;padding-top:14px}
@media(max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.cols{grid-template-columns:1fr}.tl{grid-template-columns:repeat(4,1fr)}body{padding:12px}}
</style>
</head>
<body>
<div class="wrap">
  <div class="card" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
    <div>
      <div class="planner-eyebrow">RECRUITMENT WORKSPACE</div><h1>把握每一次机会</h1>
      <div class="sub" id="meta"></div>
    </div>
    <div class="abar">
      <span class="sub"><span class="dot off" id="cdot"></span><span id="ctext">云服务连接中…</span></span>
      <span id="synctext"></span>
      <span class="sub" id="synctime"></span>
      <button class="btn" id="btn-refresh">刷新</button>
      <button class="btn pri" id="btn-login">登录云日志</button>
      <button class="btn hide" id="btn-out">退出</button>
      <a class="sub" id="src" href="#" target="_blank">飞书数据源 ↗</a>
    </div>
  </div>

  <div id="cmsg"></div>

  <div class="kpis" id="kpis"></div>

  <div class="card"><h2>即将到期</h2><div id="dl"></div></div>

  <div class="card"><h2>未来 7 天</h2><div class="tl" id="tl"></div></div>

  <div class="tabs">
    <div class="tab on" data-v="board">投递看板</div>
    <div class="tab" data-v="table">明细表格</div>
    <div class="tab" data-v="sub">集团 / 岗位</div>
    <div class="tab" data-v="act">近期动作</div>
    <div class="tab" data-v="log">我的改动</div>
  </div>

  <div id="v-board">
    <div class="filters">
      <select id="f-type"><option value="">全部类型</option></select>
      <select id="f-city"><option value="">全部城市</option></select>
      <select id="f-status"><option value="">全部状态</option><option>待投递</option><option>已投递</option><option>挂了</option><option>Offer</option><option>实习offer</option></select>
      <button class="btn" id="f-clear">清除筛选</button>
      <span class="sub" id="f-count"></span>
    </div>
    <div class="cols" id="cols"></div>
  </div>
  <div id="v-table" class="hide card">
    <input class="search" id="q" placeholder="搜索公司 / 岗位 / 类型 / 备注…">
    <div style="overflow:auto;max-height:70vh"><table id="tb"></table></div>
  </div>
  <div id="v-sub" class="hide card">
    <input class="search" id="qs" placeholder="搜索子岗位 / 母公司 / 岗位…">
    <div style="overflow:auto;max-height:70vh"><table id="tsub"></table></div>
  </div>
  <div id="v-act" class="hide card"><div id="acts"></div></div>
  <div id="v-log" class="hide card"><div id="logs"></div></div>
</div>

<div class="mask" id="mask"><div class="modal" id="modal"></div></div>
<div class="mask" id="lmask"><div class="modal" id="lmodal" style="max-width:420px"></div></div>

<script src="https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js"></script>
<script>
const CLOUD = __CLOUD__;
const DATA = __DATA__;
const TODAY = new Date(); TODAY.setHours(0,0,0,0);
const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const linkify = s => esc(s).replace(/(https?:\/\/[^\s<）)】"']+)/g, '<a href="$1" target="_blank">$1</a>');
const hlDate = s => s.replace(/(20\d{2}-\d{2}-\d{2})/g, '<b class="dtx">$1</b>');

// 把一大段备注按「｜」切成语义块，再按符号分类成卡片
function renderNote(note){
  const segs = String(note || '').split(/[｜|]/).map(s => s.trim()).filter(Boolean);
  if (!segs.length) return '';
  const blocks = segs.map(seg => {
    const isWarn = /⚠️|⚠/.test(seg);
    const isStar = /⭐|★/.test(seg);
    const items = seg.split(/(?=[①②③④⑤⑥⑦⑧⑨⑩])/).map(s => s.trim()).filter(Boolean);
    const body = items.length > 1
      ? '<ul class="nl">' + items.map(it => `<li>${hlDate(linkify(it))}</li>`).join('') + '</ul>'
      : '<div class="nt">' + hlDate(linkify(seg)) + '</div>';
    const cls = isWarn ? 'nb warn' : isStar ? 'nb star' : 'nb';
    return { kind: isWarn ? 'warn' : isStar ? 'star' : 'plain', html: `<div class="${cls}">${body}</div>` };
  });
  // 警示和重点块永远置顶显示，普通段落才折叠，避免重要信息被藏起来
  const key = blocks.filter(b => b.kind !== 'plain');
  const plain = blocks.filter(b => b.kind === 'plain');
  const SHOW = 1;
  const head = key.concat(plain.slice(0, SHOW)).map(b => b.html).join('');
  const tail = plain.slice(SHOW);
  const more = tail.length
    ? `<details class="nmore"><summary>展开剩余 ${tail.length} 段</summary>${tail.map(b => b.html).join('')}</details>`
    : '';
  return `<div class="notesec"><div class="nh">备注</div>${head}${more}</div>`;
}
const dayDiff = d => { if(!d) return null; const t=new Date(d+'T00:00:00'); return Math.round((t-TODAY)/86400000); };
const $ = id => document.getElementById(id);
const et = e => (e && (e.message || e.error_description)) || '未知错误';

let authRevision = 0;
let cloud = null, session = null, OVERRIDES = {}, LOGS = [], PENDING = 0, DL_ALL = false;
let R = DATA.records;
let SUBS = DATA.subs || [];
let LIVE = false, LAST_PULL = null;
const pad = n => String(n).padStart(2, '0');
const isoLocal = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

function cmsg(text, kind){
  $('cmsg').innerHTML = text ? `<div class="msg ${kind||'err'}">${esc(text)}</div>` : '';
}
function setCloud(text, kind){
  $('cdot').className = 'dot ' + (kind || 'off');
  $('ctext').textContent = text;
}

// The SDK owns tokens and refresh; namespace its persistence by application endpoint.
function cloudStorage(){
  const prefix = 'recruit.auth:' + new URL(CLOUD.endpoint || location.origin).origin + ':';
  try {
    localStorage.setItem(prefix + 'probe', '1'); localStorage.removeItem(prefix + 'probe');
    return {
      getItem: key => {
        const saved = localStorage.getItem(prefix + key);
        if (saved) return saved;
        // Migrate this application's pre-upgrade SDK session without forcing a new login.
        const legacy = key === 'workbuddy-cloud.session.' + CLOUD.publishableKey ? localStorage.getItem(key) : null;
        if (legacy) localStorage.setItem(prefix + key, legacy);
        return legacy;
      },
      setItem: (key,value) => localStorage.setItem(prefix + key,value),
      removeItem: key => { localStorage.removeItem(prefix + key); if (key === 'workbuddy-cloud.session.' + CLOUD.publishableKey) localStorage.removeItem(key); }
    };
  } catch (_) {
    cmsg('浏览器禁止了本地存储，本次登录无法跨刷新保留。请允许此站点存储后重新登录。', 'warn');
    return undefined;
  }
}
function refreshEditAccess(){
  if (!currentRid || !$('mask').classList.contains('on') || !$('editzone')) return;
  const record = V().find(r => r.id === currentRid);
  if (record) renderEditAccess(record);
}
function renderEditAccess(r){
  if (LIVE && typeof openPlannerJob === 'function') {
    $('editzone').innerHTML = `<div class="form-footnote">已连接看板服务，可直接编辑并保存到飞书。</div><button class="btn pri" style="margin-top:12px" onclick="openPlannerJob('${r.id}')">编辑岗位状态与时间</button>`;
  } else if (session) $('editzone').innerHTML = editForm(r);
  else $('editzone').innerHTML = `<div class="msg warn">当前未连接实时服务，暂时不能直接保存到飞书。${cloud ? '也可登录云日志使用云端队列。' : '请启动看板服务后刷新。'}</div>${cloud ? '<button class="btn" onclick="openLogin()">登录云日志</button>' : ''}`;
}
function initCloud(){
  if (typeof WorkBuddyCloud === 'undefined' || typeof WorkBuddyCloud.createWorkBuddyCloud !== 'function') {
    setCloud('云日志暂未加载', 'warn');
    cmsg('云日志组件暂未加载，不影响已连接的看板服务保存岗位。', 'warn');
    return;
  }
  try {
    cloud = WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: CLOUD.endpoint,
      oauthRelayBaseUrl: CLOUD.oauthRelayBaseUrl,
      publishableKey: CLOUD.publishableKey,
      storage: cloudStorage()
    });
    cloud.auth.onAuthStateChange((event, value) => {
      if (event === 'SIGNED_OUT') { authRevision++; session = null; OVERRIDES = {}; PENDING = 0; }
      // SDK events only indicate stored credentials, not server-verified identity.
      // Defer initial SDK callback until the page's state declarations have run.
      queueMicrotask(() => { renderAuth(); refreshEditAccess(); });
    });
  } catch (e) {
    setCloud('云服务初始化失败', 'warn');
    cmsg('云服务初始化失败：' + et(e), 'warn');
  }
}

async function verifyCloudSession(candidate){
  const revision = ++authRevision;
  session = null;
  renderAuth();
  if (!candidate) return null;
  const identity = await cloud.auth.getUser();
  if (identity.error) throw identity.error;
  if (!identity.data) throw new Error('session invalid: missing user');
  if (revision !== authRevision) throw new Error('session changed during verification');
  session = Object.assign({}, candidate, { user: identity.data });
  return session;
}

async function restore(){
  if (!cloud) return;
  try {
    const { data, error } = await cloud.auth.getSession();
    if (error) throw error;
    await verifyCloudSession(data);
    if (session) {
      try { await loadOverrides(); }
      catch (_) { cmsg('身份校验已通过，云端改动暂时无法读取，请稍后重试。', 'warn'); }
    }
  } catch (error) {
    session = null;
    cmsg(cloudSessionError(error) ? '云端身份校验未通过，未恢复登录。若刚登录仍出现此错误，需要修复平台认证服务；本地看板与飞书同步仍可使用。' : '云日志暂时无法连接，可稍后重试。', 'warn');
  }
  renderAuth();
  if (booted) renderAll();
}

function renderAuth(){
  if (session) {
    const u = session.user || {};
    setCloud('已登录 · ' + (u.name || '我的账号'), 'ok');
    $('btn-login').classList.add('hide');
    $('btn-out').classList.remove('hide');
  } else {
    setCloud('云日志未登录', 'off');
    $('btn-login').classList.remove('hide');
    $('btn-out').classList.add('hide');
  }
  renderSync();
  refreshEditAccess();
}

async function loadOverrides(){
  const { data, error } = await cloud.database.from('job_overrides').select('*');
  if (error) { cmsg(cloudSessionError(error) ? '身份校验已通过，但云数据库拒绝访问，需要检查数据库授权。可继续通过看板编辑岗位。' : '云端改动暂时无法读取，请稍后重试。', 'warn'); return; }
  OVERRIDES = {};
  (data || []).forEach(o => { OVERRIDES[o.rid] = o; });
  const p = await cloud.database.from('job_log').select('*', { count: 'exact', head: true }).eq('synced', false);
  PENDING = (p.error ? null : p.count) || 0;
  renderSync();
}

function renderSync(){
  const el = $('synctext');
  if (!el) return;
  if (!session) { el.textContent = ''; return; }
  if (PENDING > 0) {
    el.innerHTML = `<span class="pill w">${PENDING} 条待回写飞书</span>`;
  } else if (Object.keys(OVERRIDES).length) {
    el.innerHTML = `<span class="pill e">已同步飞书</span>`;
  } else {
    el.innerHTML = `<span class="pill">无改动</span>`;
  }
}

function cloudSessionError(error){
  return /session.*(invalid|expired|another client)|invalid.*session|unauthorized|invalid_grant|jwt.*expired|401/i.test(et(error));
}
function changeValue(field, value){
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return '未填写';
  if (typeof value === 'number' && /日期|截止日/.test(field)) return new Date(value).toLocaleDateString('sv-SE', {timeZone:'Asia/Shanghai'});
  return Array.isArray(value) ? value.join('、') : typeof value === 'object' ? JSON.stringify(value) : String(value);
}
function logRows(rows, local = false){
  return rows.map(l => {
    let details;
    if (local && Array.isArray(l.changes)) {
      details = l.changes.length ? l.changes.map(c => `<div class="field-change"><b>${esc(c.field)}</b><span class="old-value">${esc(c.beforeKnown ? changeValue(c.field,c.before) : '旧值未记录')}</span><span aria-hidden="true">→</span><strong>${esc(changeValue(c.field,c.after))}</strong></div>`).join('') : '<div class="sub">本次提交的字段与保存前一致，无字段变化。</div>';
    } else if (local) {
      details = '<div class="sub">历史记录未保存旧值，以下为当次提交内容：</div>' + Object.entries(l.fields || {}).map(([key,value]) => `<div class="field-change"><b>${esc(key)}</b><strong>${esc(changeValue(key,value))}</strong></div>`).join('');
    } else details = `<p>${esc(l.old_value || '旧值未记录')} → ${esc(l.new_value || '未填写')}</p>`;
    const parsed = new Date(l.created_at || '');
    const time = Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString('zh-CN', {timeZone:'Asia/Shanghai',hour12:false});
    return `<article class="change-entry"><div class="change-top"><strong>${esc(l.name || l.rid || '岗位改动')}</strong><span class="pill ${l.synced ? 'e' : 'w'}">${l.synced ? '已同步飞书' : '待回写'}</span><time>${esc(time)}</time></div>${details}</article>`;
  }).join('');
}
async function loadLogs(){
  $('logs').innerHTML = '<div class="sub">正在读取改动记录…</div>';
  let localRows = [], localWarning = '', cloudRows = [], cloudWarning = '';
  try {
    const response = await fetch('/api/logs' + APIQ(), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error('unavailable');
    localRows = result.logs || [];
  } catch (_) { localWarning = '本地改动记录暂时无法加载，请确认看板服务已更新并运行。'; }
  if (cloud && session) {
    let authChecked = false;
    try {
      const restored = await cloud.auth.getSession();
      if (restored.error) throw restored.error;
      if (!restored.data) throw new Error('session expired');
      await verifyCloudSession(restored.data);
      authChecked = true;
      const result = await cloud.database.from('job_log').select('*').order('created_at', { ascending: false }).limit(50);
      if (result.error) throw result.error;
      cloudRows = result.data || [];
    } catch (error) {
      if (cloudSessionError(error) && !authChecked) { session = null; renderAuth(); cloudWarning = '云日志登录已失效或与当前客户端不匹配，请重新登录查看历史云日志。本地记录和飞书数据不受影响。'; }
      else cloudWarning = '登录会话已保留，但历史云日志暂不可用。可能是云数据库权限或会话归属不匹配，本地记录和岗位编辑不受影响。';
    }
  }
  $('logs').innerHTML = `<div class="change-heading"><div><h2>我的改动</h2><div class="sub">本地保存记录 · 最近 ${localRows.length} 条</div></div><button class="btn" onclick="loadLogs()">刷新记录</button></div>
    ${localWarning ? `<div class="msg warn">${esc(localWarning)}</div>` : ''}
    ${localRows.length ? logRows(localRows, true) : '<div class="planner-empty">暂无本地改动记录。此版本起成功保存到飞书的操作会自动记录在这里。</div>'}
    <div class="sec"><h3>历史云日志</h3>${cloudWarning ? `<div class="msg warn">${esc(cloudWarning)}</div>` : ''}
    ${cloudRows.length ? logRows(cloudRows) : '<div class="sub">尚无可显示的历史云日志。</div>'}
    ${cloud && (!session || cloudWarning) ? '<button class="btn" onclick="openLogin()">重新登录云日志</button>' : ''}</div>`;
}

const view = r => {
  const o = OVERRIDES[r.id];
  if (!o) return r;
  return Object.assign({}, r, {
    status: o.status !== undefined ? o.status : r.status,
    progress: o.progress !== undefined ? (o.progress || []) : r.progress,
    key: o.key_date !== undefined ? o.key_date : r.key,
    hasDl: o.key_date !== undefined ? !!o.key_date : r.hasDl,
    comment: o.comment || '',
    edited: true
  });
};

const V = () => R.map(view);
const st = s => V().filter(r => r.status === s).length;
const flowing = () => V().filter(r => r.status === '已投递' && r.progress.length).length;

const F = () => ({
  type: ($('f-type') || {}).value || '',
  city: ($('f-city') || {}).value || '',
  status: ($('f-status') || {}).value || '',
});
const isFiltered = () => { const f = F(); return !!(f.type || f.city || f.status || (typeof workspaceActive === 'function' && workspaceActive())); };
const filteredV = () => {
  const f = F();
  return V().filter(r => (!f.type || r.type === f.type)
    && (!f.city || (r.city || []).includes(f.city))
    && (!f.status || r.status === f.status) && (typeof workspaceMatch !== 'function' || workspaceMatch(r)));
};

function initFilters(){
  const types = [...new Set(R.map(r => r.type).filter(Boolean))].sort();
  const cities = [...new Set(R.flatMap(r => r.city || []))].sort();
  $('f-type').innerHTML = '<option value="">全部类型</option>' + types.map(t => `<option>${esc(t)}</option>`).join('');
  $('f-city').innerHTML = '<option value="">全部城市</option>' + cities.map(c => `<option>${esc(c)}</option>`).join('');
  const rerender = () => { renderAll(); };
  $('f-type').onchange = rerender;
  $('f-city').onchange = rerender;
  $('f-status').onchange = rerender;
  $('f-clear').onclick = () => { $('f-type').value = ''; $('f-city').value = ''; $('f-status').value = ''; renderAll(); };
}

function renderSyncTime(){
  const el = $('synctime');
  if (!el) return;
  if (LIVE && LAST_PULL) {
    const mins = Math.round((Date.now() - LAST_PULL.getTime()) / 60000);
    const ago = mins < 1 ? '刚刚' : `${mins} 分钟前`;
    el.innerHTML = `<span class="dot ok" style="margin-right:4px"></span>实时同步 · ${ago}（直连飞书）`;
    el.title = '数据直接来自飞书，每 2 分钟自动刷新';
    return;
  }
  const t = new Date((DATA.generated || '').replace(' ', 'T'));
  if (isNaN(t)) { el.textContent = ''; return; }
  const mins = Math.round((Date.now() - t.getTime()) / 60000);
  const ago = mins < 1 ? '刚刚' : mins < 60 ? `${mins} 分钟前` : `${Math.round(mins / 60)} 小时前`;
  const stale = mins > 90;
  el.innerHTML = `<span class="dot ${stale ? 'warn' : 'ok'}" style="margin-right:4px"></span>快照 ${DATA.generated.slice(11, 16)} · ${ago}`;
  if (stale) el.title = '超过 90 分钟没刷新，实时通道可能未开启';
}

const APIQ = () => location.search || '';   // 必须带 sharecode，否则会被分享网关拦下

let saveInFlight = false, saveRevision = 0;
async function pullLive(){
  if (saveInFlight) return false;
  const revision = saveRevision;
  try {
    const resp = await fetch('/api/pull' + APIQ(), { cache: 'no-store', signal: AbortSignal.timeout(25000) });
    const txt = await resp.text();
    let j = null;
    try { j = JSON.parse(txt); } catch (e) { j = null; }
    if (!j || !j.ok || !j.records) return false;
    if (saveInFlight || revision !== saveRevision) return false;
    R = j.records;
    SUBS = j.subs || [];
    LAST_PULL = new Date();
    LIVE = true;
    refreshEditAccess();
    renderAll();
    return true;
  } catch (e) { return false; }
}

let retryTimer = null;
async function pullWithRetry(){
  const ok = await pullLive(true);
  if (ok) { if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; } return true; }
  // 拉取失败（多半是分享网关/网络抖动）：20 秒后重试，直到成功
  if (!retryTimer) retryTimer = setTimeout(() => { retryTimer = null; pullWithRetry(); }, 20000);
  return false;
}

function renderAll(){
  const v = V();
  const fv = filteredV();
  const shown = isFiltered() ? fv : v;
  $('f-count').textContent = isFiltered() ? `筛选出 ${shown.length} / ${v.length} 家` : '';
  $('meta').textContent = `主记录 ${R.length} 家 · 子岗位 ${(DATA.subs||[]).length} 条 · 动作节点 ${DATA.actions.length} 个`;
  renderSyncTime();
  $('src').href = DATA.source;
  $('kpis').innerHTML = [
    ['在跟企业', v.length, ''],
    ['已投递', st('已投递'), 'b'],
    ['待投递', v.filter(r => r.status === '待投递' && !/已截止/.test(r.note)).length, 'r'],
    ['流程中', flowing(), 'g'],
    ['已结束', st('挂了') + st('已截止') + v.filter(r => r.status==='待投递' && /已截止/.test(r.note)).length, '']
  ].map(([l,n,c]) => `<div class="kpi ${c}"><div class="l">${l}</div><div class="n">${n}</div></div>`).join('');

  const dated = shown.filter(r => r.key && r.hasDl && r.status !== '挂了' && r.status !== '已截止')
    .map(r => ({name:r.name, date:r.key, tip:r.post, rid:r.id}))
    .concat(DATA.actions.map(a => ({name:a.name, date:a.date, tip:a.tip + (a.time?' · '+a.time:'')})))
    .filter(x => dayDiff(x.date) !== null)
    .sort((a,b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const future = dated.filter(x => dayDiff(x.date) >= -1);

  const limit = DL_ALL ? 999 : 7;
  const rowsHtml = future.slice(0, limit).map(x => {
    const d = dayDiff(x.date), cls = d <= 0 ? 'b-red' : d <= 2 ? 'b-org' : d <= 6 ? 'b-blu' : 'b-gry';
    const label = d < 0 ? '已过期' : d === 0 ? '就是今天' : d + ' 天后';
    const hasCard = !!x.rid;
    return `<div class="dl${hasCard?' jump':''}"${hasCard?` data-rid="${x.rid}"`:''} title="${hasCard?'点击跳到看板上的这家':''}"><span class="badge ${cls}">${label}</span><span class="nm">${esc(x.name)}</span>${x.tip?`<span class="sub">${esc(x.tip.slice(0,34))}</span>`:''}<span class="dt">${x.date}${hasCard?' ›':''}</span></div>`;
  }).join('');
  $('dl').innerHTML = (rowsHtml || '<div class="sub">暂无</div>')
    + (future.length > limit ? `<div id="dl-more" class="sub" style="cursor:pointer;color:#2563EB;padding-top:10px">展开其余 ${future.length - limit} 条</div>` : '')
    + (DL_ALL && future.length > 7 ? `<div id="dl-less" class="sub" style="cursor:pointer;color:#2563EB;padding-top:10px">收起</div>` : '');

  timelineItems = dated;
  let tlHtml = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(TODAY); d.setDate(d.getDate() + i);
    const key = isoLocal(d);
    const n = dated.filter(x => x.date === key).length;
    const col = n === 0 ? '#EEF0F3' : n >= 4 ? '#DC2626' : n >= 2 ? '#F59E0B' : '#2563EB';
    tlHtml += `<button type="button" class="d" data-day="${key}" aria-label="${key}，${n} 件事项，点击查看" aria-haspopup="dialog"><div>${key.slice(5)}</div><div class="bar" style="background:${col}">${n||''}</div><div class="sub">${['日','一','二','三','四','五','六'][d.getDay()]}</div></button>`;
  }
  $('tl').innerHTML = tlHtml + `<div style="grid-column:1/-1;display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:11px;color:#6B7280;margin-top:6px">
      <span>点击日期查看当天事项 · 数字 = 企业截止事项 + 提醒节点</span>
      <span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#DC2626;margin-right:4px"></i>≥4 件 · 爆满</span>
      <span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#F59E0B;margin-right:4px"></i>2–3 件</span>
      <span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#2563EB;margin-right:4px"></i>1 件</span>
      <span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#EEF0F3;margin-right:4px"></i>无事项</span>
    </div>`;

  const bucket = r => {
    if (r.status === '挂了' || r.status === '已截止') return 3;
    if (r.status === '待投递') return /已截止/.test(r.note) ? 3 : 0;
    if (r.progress.length) return 2;
    return 1;
  };
  const NAMES = ['待投递', '已投 · 等回音', '笔试面试中', '已结束'];
  const sortFn = (a,b) => (a.key||'9999').localeCompare(b.key||'9999') || a.name.localeCompare(b.name);
  $('cols').innerHTML = [0,1,2,3].map(i => {
    const list = shown.filter(r => bucket(r) === i).sort(sortFn);
    const body = i === 0 ? grouped(list) : list.map(card).join('');
    return `<div class="col stage-${i}"><h3 class="board-heading"><span class="board-label"><i class="board-dot"></i>${NAMES[i]}</span><span class="board-count">${list.length}</span></h3><div class="list">${body || '<div class="sub">暂无</div>'}</div></div>`;
  }).join('');

  $('acts').innerHTML = '<h2>近期动作节点</h2>' + DATA.actions.map(a => {
    const d = dayDiff(a.date), cls = d <= 0 ? 'b-red' : d <= 2 ? 'b-org' : d <= 6 ? 'b-blu' : 'b-gry';
    const label = d < 0 ? '已过期' : d === 0 ? '今天' : d + ' 天后';
    return `<div class="act"><span class="badge ${cls}">${label}</span><span class="nm">${esc(a.name)}</span>${a.tip?`<span class="sub">${esc(a.tip)}</span>`:''}<span class="dt">${a.date} ${a.time}</span></div>`;
  }).join('');
  drawTable($('q').value);
  drawSubs($('qs').value);
  if (typeof renderPlanner === 'function') renderPlanner();
}

// Use the exact same list as the seven-day counts, including active filters.
let timelineItems = [];
function openDay(day){
  const items = timelineItems.filter(item => item.date === day);
  currentRid = null;
  $('modal').innerHTML = `<button type="button" class="close" aria-label="关闭当天事项" onclick="closeM()">×</button>
    <h3 id="day-title">${esc(day)} 的事项</h3>
    <div class="sub">共 ${items.length} 件 · 与未来 7 天的统计一致${isFiltered() ? '（已应用当前企业筛选）' : ''}</div>
    ${items.length ? items.map(item => {
      const tag = item.rid ? 'button' : 'div';
      return `<${tag} class="day-item"${item.rid ? ` type="button" data-day-rid="${esc(item.rid)}"` : ''}>
        <span class="badge ${item.rid ? 'b-blu' : 'b-org'}">${item.rid ? '报名截止' : '提醒节点'}</span>
        <strong>${esc(item.name)}</strong>
        ${item.tip ? `<span class="sub">${esc(item.tip)}</span>` : ''}
        ${item.rid ? '<span class="sub">查看企业详情 ›</span>' : ''}
      </${tag}>`;
    }).join('') : '<div class="day-item sub">当天暂无事项。</div>'}`;
  $('modal').setAttribute('role', 'dialog');
  $('modal').setAttribute('aria-label', day + ' 的事项');
  $('mask').classList.add('on');
  document.body.classList.add('modal-open');
  $('modal').scrollTop = 0;
  $('modal').querySelector('.close').focus();
}
$('tl').addEventListener('click', event => {
  const day = event.target.closest('[data-day]');
  if (day) openDay(day.dataset.day);
});
$('modal').addEventListener('click', event => {
  const item = event.target.closest('[data-day-rid]');
  if (!item) return;
  const record = V().find(r => r.id === item.dataset.dayRid);
  if (record) {
    currentRid = record.id;
    $('modal').setAttribute('aria-label', record.name + ' 的详情');
    openModal(record);
  }
});

function grouped(list){
  const todayKey = isoLocal(TODAY);
  const plus7 = isoLocal((d => { d.setDate(d.getDate() + 7); return d; })(new Date(TODAY)));
  const real = list.filter(r => r.hasDl);
  const past  = real.filter(r => r.key <  todayKey);
  const soon  = real.filter(r => r.key >= todayKey && r.key <= plus7);
  const later = real.filter(r => r.key >  plus7);
  const none  = list.filter(r => !r.hasDl);
  const sec = (t, arr, hot) => arr.length
    ? `<div class="grp"${hot ? ' style="color:#B91C1C"' : ''}>${t} · ${arr.length}</div>` + arr.map(card).join('')
    : '';
  return sec('已过截止日', past, true)
       + sec('今天起 7 天内', soon)
       + sec('更晚截止', later)
       + sec('未标截止日', none);
}

function card(r){
  const dd = dayDiff(r.key);
  const urgent = r.status === '待投递' && dd !== null && dd >= 0 && dd <= 3;
  const em = (r.exam || '').match(/(\d{2}-\d{2})/);
  const prog = (r.progress || []).slice(0, 3);
  const extra = (r.progress || []).length - prog.length;
  return `<div class="it" data-id="${r.id}">
    <div class="t">${esc(r.name)}${r.edited?' <span class="pill c">已改</span>':''}</div>
    <div class="m">${esc(r.type||'')}${r.city.length?' · '+esc(r.city.join('/')):''}${r.key?' · '+(r.hasDl?'截止 '+r.key:'更新 '+r.key):''}</div>
    ${prog.length || em || urgent || r.kids.length ? `<div>${prog.map(p=>`<span class="pill"${progStyle(p)}>${esc(p)}</span>`).join('')}${extra>0?`<span class="pill">+${extra}</span>`:''}${em?`<span class="pill w">笔试 ${em[1]}</span>`:''}${urgent?`<span class="pill i">${dd===0?'今天':dd+'天后'}</span>`:''}${r.kids.length?`<span class="pill">${r.kids.length} 子岗</span>`:''}</div>` : ''}
  </div>`;
}

function openModal(r0){
  const r = r0;
  const canEdit = !!session;
  $('modal').innerHTML = `
    <span class="close" onclick="closeM()">×</span>
    <h3>${esc(r.name)}</h3>
    <div class="sub">${esc(r.type||'')}${r.city.length?' · '+esc(r.city.join(' / ')):''} · 状态 ${esc(r.status)} · 投递 ${esc(r.apply||'—')} · 关键日期 ${esc(r.key||'—')}</div>
    ${r.post?`<div style="margin-top:8px;font-size:13px"><b>岗位</b> ${esc(r.post)}</div>`:''}
    ${r.exam?`<div style="margin-top:4px;font-size:13px"><b>笔试</b> ${esc(r.exam)}</div>`:''}
    ${(r.progress||[]).length?`<div style="margin-top:6px">${r.progress.map(p=>`<span class="pill"${progStyle(p)}>${esc(p)}</span>`).join('')}</div>`:''}
    ${r.comment?`<div style="margin-top:6px"><span class="pill c">我的备注</span> ${esc(r.comment)}</div>`:''}
    ${r.link?`<div style="margin-top:8px;font-size:13px"><a href="${esc(r.link)}" target="_blank">${esc(r.link)} ↗</a></div>`:''}
    ${r.note?renderNote(r.note):''}
    ${r.kids.length?`<div class="sec"><h2>子记录 ${r.kids.length}</h2>`+r.kids.map(k=>`<div class="kid"><b>${esc(k.name)}</b> <span class="sub">${esc(k.status)}</span>${k.post?'<br>'+esc(k.post):''}</div>`).join('')+`</div>`:''}
    <div class="sec" id="editzone"></div>
  `;
  renderEditAccess(r);
  $('mask').classList.add('on');
  document.body.classList.add('modal-open');
  $('modal').scrollTop = 0;
}

const STATUS_OPTS = ['待投递','已投递','已截止','挂了','Offer','实习offer'];
const PROG_OPTS = ['ai面','测评','笔试','一面','二面','三面','体检'];
// 每个进展阶段一种颜色（浅底深字），顺序与 PROG_OPTS 一致
const PROG_BG = ['#E0E7FF','#FFEDD5','#CCFBF1','#DBEAFE','#FEF9C3','#FEE2E2','#F3E8FF'];
const PROG_FG = ['#4338CA','#C2410C','#0F766E','#1D4ED8','#A16207','#B91C1C','#7E22CE'];
const progIdx = p => PROG_OPTS.indexOf(p);
const progStyle = p => { const i = progIdx(p); return i < 0 ? '' : ` style="background:${PROG_BG[i]};color:${PROG_FG[i]}"`; };

function editForm(r){
  return `<h2>修改状态（保存到云端）</h2>
    <div class="fld"><label>投递状态</label><select id="ed-status">${STATUS_OPTS.map(s=>`<option value="${s}"${r.status===s?' selected':''}>${s}</option>`).join('')}</select></div>
    <div class="fld"><label>进展（可多选，点一下选中/取消）</label>
      <div class="chips">${PROG_OPTS.map((p,i)=>`<span class="chip c${i}"><input type="checkbox" class="ed-prog" value="${p}" id="pg-${p}"${(r.progress||[]).includes(p)?' checked':''}><label for="pg-${p}">${p}</label></span>`).join('')}</div>
    </div>
    <div class="fld"><label>报名截止日</label><input type="date" id="ed-key" value="${esc(r.hasDl ? r.key : '')}"></div>
    <div class="fld"><label>我的备注（可选）</label><input type="text" id="ed-comment" value="${esc(r.comment||'')}" placeholder="例如：已约 10-31 上午场"></div>
    <div id="ed-msg"></div>
    <button class="btn pri" id="ed-save">保存</button>
    <button class="btn" style="margin-left:8px" onclick="resetOverride('${r.id}')">恢复为飞书原值</button>`;
}

// 本地就地更新一条记录（乐观更新用），返回旧值以便回滚
function applyLocal(id, patch){
  const rec = R.find(x => x.id === id);
  if (!rec) return null;
  const prev = { status: rec.status, progress: (rec.progress || []).slice(), key: rec.key, hasDl: rec.hasDl };
  rec.status = patch.status;
  rec.progress = patch.progress;
  rec.key = patch.key_date;
  rec.hasDl = !!patch.key_date;
  return prev;
}

function rollbackLocal(id, prev){
  const rec = R.find(x => x.id === id);
  if (!rec || !prev) return;
  rec.status = prev.status;
  rec.progress = prev.progress;
  rec.key = prev.key;
  rec.hasDl = prev.hasDl;
}

$('modal').addEventListener('click', async e => {
  if (e.target.id !== 'ed-save') return;
  if (saveInFlight) { cmsg('上一笔修改仍在保存，请稍后重试。', 'warn'); return; }
  const id = currentRid; if (!id) return;
  const r = view(R.find(x => x.id === id));
  const btn = $('ed-save'); btn.disabled = true; btn.textContent = '保存中…';
  const status = $('ed-status').value;
  const progress = [...document.querySelectorAll('.ed-prog:checked')].map(x => x.value);
  const key_date = $('ed-key').value || null;
  const comment = $('ed-comment').value || null;
  const patch = { status, progress, key_date, comment };
  const oldStr = `${r.status} / ${(r.progress||[]).join('+') || '—'} / ${r.key||'—'}`;
  const newStr = `${status} / ${progress.join('+') || '—'} / ${key_date||'—'}`;

  // 乐观更新：先在本地生效并关掉弹窗，写飞书放到后台，避免等 3~4 秒
  const previousOverride = OVERRIDES[id];
  delete OVERRIDES[id];
  saveInFlight = true; saveRevision++;
  try {
  const prev = applyLocal(id, patch);
  renderAll();
  closeM();
  btn.disabled = false; btn.textContent = '保存';
  cmsg('已保存：' + r.name + ' → ' + newStr + '，正在同步到飞书…', 'ok');

  if (session) {
    let apiErr = '';
    try {
      const resp = await fetch('/api/sync' + APIQ(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ rid: id }, patch)),
      });
      const txt = await resp.text();
      let j = null; try { j = JSON.parse(txt); } catch (e) { j = null; }
      if (j && j.ok) {
        // 成功：后台补记一条已同步日志 + 清掉可能残留的覆盖层，不阻塞界面
        // Insert only this operation as synced; never acknowledge earlier pending edits.
        let auditError = false;
        try {
          const logResult = await cloud.database.from('job_log').insert({ rid: id, name: r.name, field: '状态/进展/日期', old_value: oldStr, new_value: newStr, synced: true });
          const clearResult = await cloud.database.from('job_overrides').delete().eq('rid', id);
          auditError = !!(logResult.error || clearResult.error);
        } catch (_) { auditError = true; }
        cmsg('已同步到飞书：' + r.name + ' → ' + newStr + (auditError ? '；云端日志或覆盖层清理失败，请刷新核对。' : ''), auditError ? 'warn' : 'ok');
        return;
      }
      apiErr = (j && j.error) || '后端未返回成功';
    } catch (e) { apiErr = String(e.message || e); }

    if (apiErr) {
      // 实时通道失败 → 回滚本地显示，退回云端队列
      rollbackLocal(id, prev);
      if (previousOverride) OVERRIDES[id] = previousOverride;
      renderAll();
      const upd = await cloud.database.from('job_overrides').update(patch).eq('rid', id).select();
      let ok = (upd.data || []).length > 0;
      if (!ok && !upd.error) {
        const ins = await cloud.database.from('job_overrides')
          .insert(Object.assign({ rid: id, name: r.name, owner_name: (session.user && session.user.name) || null }, patch))
          .select();
        ok = (ins.data || []).length > 0;
      }
      await cloud.database.from('job_log').insert({ rid: id, name: r.name, field: '状态/进展/日期', old_value: oldStr, new_value: newStr });
      if (ok) {
        await loadOverrides(); renderAll();
        cmsg('实时通道不可用（' + apiErr + '），已存入队列：' + r.name + ' → ' + newStr + '，稍后自动补写飞书。', 'warn');
      } else {
        cmsg('保存失败，云端队列也写不进去：' + apiErr, 'err');
      }
      return;
    }
    return;   // 成功分支已在上面对话中返回
  }
  // 未登录：改动只留在本地预览，提示登录
  rollbackLocal(id, prev);
  renderAll();
  cmsg('未登录，改动未保存。登录后才能写入飞书。', 'warn');
  } catch (error) {
    if (previousOverride) OVERRIDES[id] = previousOverride;
    cmsg('保存流程失败，请刷新核对：' + et(error), 'err');
  } finally { saveInFlight = false; saveRevision++; }
});

async function resetOverride(id){
  if (saveInFlight) { cmsg('正在保存，请稍后重试。', 'warn'); return; }
  if (!confirm('恢复为飞书多维表格里的原始值？你在这条记录上的云端改动会被删除。')) return;
  const { data, error } = await cloud.database.from('job_overrides').delete().eq('rid', id).select();
  if (error) { cmsg('恢复失败：' + et(error), 'err'); return; }
  if (!(data || []).length) { cmsg('这条记录没有云端改动，无需恢复。', 'warn'); return; }
  await loadOverrides(); renderAll(); closeM();
  cmsg('已恢复为飞书原值。', 'ok');
}

let currentRid = null;
$('cols').onclick = e => { const el = e.target.closest('.it'); if (!el) return; currentRid = el.dataset.id; const r = view(R.find(x => x.id === currentRid)); if (r) openModal(r); };
function closeM(){ if (window.closeDatePicker) window.closeDatePicker(); $('mask').classList.remove('on'); document.body.classList.remove('modal-open'); }
$('mask').onclick = e => { if (e.target.id === 'mask') closeM(); };

const tb = $('tb');
function drawTable(kw){
  const k = (kw||'').trim().toLowerCase();
  const list = V().filter(r => typeof workspaceMatch !== 'function' || workspaceMatch(r)).filter(r => !k || (r.name+r.post+r.type+r.status+(r.note||'')+r.progress.join('')).toLowerCase().includes(k));
  tb.innerHTML = `<thead><tr><th>公司</th><th>类型</th><th>岗位</th><th>状态</th><th>进展</th><th>关键日期</th><th>链接</th></tr></thead><tbody>` +
    list.map(r => `<tr data-id="${r.id}" style="cursor:pointer"><td><b>${esc(r.name)}</b>${r.edited?' <span class="pill c">已改</span>':''}${r.kids.length?` <span class="sub">+${r.kids.length}</span>`:''}</td><td>${esc(r.type||'')}</td><td style="max-width:220px">${esc((r.post||'').slice(0,60))}</td><td>${esc(r.status)}</td><td>${(r.progress||[]).join(' ')||'—'}</td><td>${esc(r.key||'—')}</td><td>${r.link?`<a href="${esc(r.link)}" target="_blank">打开</a>`:'—'}</td></tr>`).join('') +
    `</tbody>`;
}
$('q').oninput = e => drawTable(e.target.value);
tb.onclick = e => { const tr = e.target.closest('tr'); if (!tr || !tr.dataset.id) return; currentRid = tr.dataset.id; const r = view(R.find(x => x.id === currentRid)); if (r) openModal(r); };

const tsub = $('tsub');
function drawSubs(kw){
  const k = (kw || '').trim().toLowerCase();
  const list = SUBS.map(view).filter(s => typeof workspaceMatch !== 'function' || workspaceMatch(s)).filter(s => !k
    || (s.name + s.parent + s.post + s.type + (s.note || '')).toLowerCase().includes(k));
  tsub.innerHTML = `<thead><tr><th>子岗位单位</th><th>所属集团</th><th>类型</th><th>城市</th><th>岗位</th><th>状态</th><th>进展</th><th>截止日</th></tr></thead><tbody>`
    + list.map(s => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.parent)}</td><td>${esc(s.type || '')}</td><td>${esc((s.city || []).join('/') || '—')}</td><td style="max-width:200px">${esc((s.post || '').slice(0, 50)) || '—'}</td><td>${esc(s.status || '—')}</td><td>${(s.progress || []).join(' ') || '—'}</td><td>${esc(s.key || '—')}</td></tr>`).join('')
    + `</tbody><caption class="sub" style="caption-side:bottom;text-align:left;padding-top:10px">共 ${list.length} 条子记录（飞书表里挂在母公司下的子公司/子岗位）</caption>`;
}
$('qs').oninput = e => drawSubs(e.target.value);

document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  if (t.dataset.v === undefined) return;
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
  t.classList.add('on');
  ['board','table','sub','act','log'].forEach(v => $('v-'+v).classList.toggle('hide', v !== t.dataset.v));
  if (t.dataset.v === 'log') loadLogs();
});

/* ---------- 登录 ---------- */
let pending = null, tab = 'otp', otpKind = 'phone', resetPending = null;

function openLogin(msg){
  const isPwd = tab === 'pwd';
  $('lmodal').innerHTML = `
    <span class="close" onclick="closeLogin()">×</span>
    <h3>${isPwd ? '密码登录' : '验证码登录'}</h3>
    <div class="sub">登录后在手机/电脑上都可直接改投递状态，改动存云端并同步回飞书。</div>
    <div class="tabs" style="margin:14px 0">
      <div class="tab ${isPwd?'on':''}" id="t-pwd">密码登录</div>
      <div class="tab ${!isPwd?'on':''}" id="t-otp">验证码登录</div>
    </div>
    ${isPwd ? pwdForm() : otpForm()}
    <div id="li-msg"></div>
  `;
  $('t-pwd').onclick = () => { tab='pwd'; pending=null; resetPending=null; openLogin(); };
  $('t-otp').onclick = () => { tab='otp'; openLogin(); };
  if (isPwd) {
    $('li-go').onclick = signInPwd;
    $('li-reset').onclick = startReset;
  } else {
    $('t-phone').onclick = () => { otpKind='phone'; pending=null; openLogin(); };
    $('t-email').onclick = () => { otpKind='email'; pending=null; openLogin(); };
    $('li-send').onclick = sendCode;
    $('li-go').onclick = submitCode;
  }
  if (msg) lmsg(msg);
  $('lmask').classList.add('on');
  document.body.classList.add('modal-open');
}

function pwdForm(){
  return `
    <div class="fld"><label>邮箱或手机号</label><input type="text" id="li-acc" placeholder="you@example.com 或 11 位手机号" oninput="lmsg('')"></div>
    <div class="fld"><label>密码</label><input type="password" id="li-pwd" placeholder="登录密码" oninput="lmsg('')"></div>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="btn pri" id="li-go">登录</button>
      <button class="btn" id="li-reset" type="button">忘记密码</button>
    </div>
    <div class="sub" style="margin-top:10px">还没有账号？切到「验证码登录」，验证后设置密码即可。</div>`;
}

function otpForm(){
  const ph = otpKind === 'phone';
  return `
    <div class="tabs" style="margin:0 0 12px">
      <div class="tab ${ph?'on':''}" id="t-phone">手机号</div>
      <div class="tab ${!ph?'on':''}" id="t-email">邮箱</div>
    </div>
    <div class="fld"><label>${ph ? '手机号' : '邮箱'}</label><input type="${ph?'tel':'email'}" id="li-acc" placeholder="${ph?'11 位手机号':'you@example.com'}" oninput="lmsg('')"></div>
    <div class="fld"><label>验证码</label><div style="display:flex;gap:8px"><input type="text" id="li-code" placeholder="收到的验证码"><button class="btn" id="li-send" type="button">获取验证码</button></div></div>
    <div class="fld"><label>设置密码（新账号必填，老账号留空）</label><input type="password" id="li-pwd" placeholder="至少 6 位" oninput="lmsg('')"></div>
    <button class="btn pri" id="li-go">登录 / 注册</button>`;
}

async function signInPwd(){
  const acc = ($('li-acc').value || '').trim();
  const pwd = $('li-pwd').value || '';
  if (!acc) { lmsg('请输入邮箱或手机号'); return; }
  if (!pwd) { lmsg('请输入密码'); return; }
  const isPhone = /^1\d{10}$/.test(acc);
  const isEmail = /^\S+@\S+\.\S+$/.test(acc);
  if (!isPhone && !isEmail) { lmsg('请输入正确的邮箱或 11 位手机号'); return; }
  const btn = $('li-go'); btn.disabled = true; btn.textContent = '登录中…';
  const { data, error } = await cloud.auth.signInWithPassword(isPhone ? { phone: acc, password: pwd } : { email: acc, password: pwd });
  btn.disabled = false; btn.textContent = '登录';
  if (error) { lmsg('账号或密码不正确'); return; }
  await afterLogin(data);
}

async function startReset(){
  const acc = ($('li-acc').value || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(acc)) { lmsg('重置密码需要用邮箱，请先填写邮箱'); return; }
  const btn = $('li-reset'); btn.disabled = true; btn.textContent = '发送中…';
  const started = await cloud.auth.resetPasswordForEmail(acc);
  btn.disabled = false; btn.textContent = '忘记密码';
  if (started.error) { lmsg(et(started.error)); return; }
  resetPending = { email: acc, started: started.data };
  $('lmodal').insertAdjacentHTML('beforeend', `
    <div class="fld" style="margin-top:12px"><label>邮箱验证码</label><input type="text" id="li-nonce" placeholder="邮件里的验证码"></div>
    <div class="fld"><label>新密码</label><input type="password" id="li-npwd" placeholder="至少 6 位"></div>
    <button class="btn pri" id="li-resetgo">确认重置</button>`);
  $('li-resetgo').onclick = finishReset;
  lmsg('重置邮件已发送，填入验证码和新密码后点确认重置', true);
}

async function finishReset(){
  const nonce = ($('li-nonce').value || '').trim();
  const np = $('li-npwd').value || '';
  if (!nonce) { lmsg('请输入邮箱里的验证码'); return; }
  if (np.length < 6) { lmsg('新密码至少 6 位'); return; }
  const btn = $('li-resetgo'); btn.disabled = true; btn.textContent = '提交中…';
  const done = await resetPending.started.updateUser({ nonce, password: np });
  btn.disabled = false; btn.textContent = '确认重置';
  if (done.error) { lmsg(et(done.error)); return; }
  resetPending = null;
  lmsg('密码已重置，请用新密码登录', true);
}

function lmsg(t, ok){ const el = $('li-msg'); if (el) el.innerHTML = t ? `<div class="msg ${ok?'ok':'err'}" style="margin-top:8px">${esc(t)}</div>` : ''; }
function closeLogin(){ $('lmask').classList.remove('on'); document.body.classList.remove('modal-open'); }

async function afterLogin(data){
  try {
    lmsg('正在向服务器校验登录身份…', true);
    await verifyCloudSession(data);
    if (!session) throw new Error('session invalid: missing credentials');
  } catch (error) {
    session = null; OVERRIDES = {}; PENDING = 0;
    renderAuth(); renderAll();
    lmsg(cloudSessionError(error)
      ? '登录凭证未通过云端身份校验。登录接口签发了凭证，但认证服务拒绝使用，请联系平台检查认证配置。'
      : '暂时无法完成身份校验，请检查网络后重试。');
    return;
  }
  pending = null; closeLogin();
  renderAuth(); refreshEditAccess();
  cmsg('云日志身份校验成功。刷新页面时会自动恢复并校验会话。', 'ok');
  try { await loadOverrides(); }
  catch (_) { cmsg('身份校验已通过，云端改动暂时无法读取，请稍后重试。', 'warn'); }
  renderAuth(); renderAll();
}

async function sendCode(){
  const val = ($('li-acc').value || '').trim();
  if (otpKind === 'phone' && !/^1\d{10}$/.test(val)) { lmsg('请输入正确的 11 位手机号'); return; }
  if (otpKind === 'email' && !/^\S+@\S+\.\S+$/.test(val)) { lmsg('请输入正确的邮箱地址'); return; }
  const btn = $('li-send'); btn.disabled = true; btn.textContent = '发送中…';
  const { data, error } = await cloud.auth.sendOtp(otpKind === 'phone' ? { phone: val } : { email: val });
  btn.disabled = false; btn.textContent = '获取验证码';
  if (error) { lmsg(et(error)); return; }
  pending = { kind: otpKind, value: val, verificationId: data.verificationId, isExistingUser: data.isExistingUser };
  lmsg(data.isExistingUser ? '验证码已发送，请查收后填入下方' : '新账号：填验证码并设置一个密码即可完成注册', true);
}

async function submitCode(){
  const code = ($('li-code').value || '').trim();
  if (!pending) { lmsg('请先点击「获取验证码」'); return; }
  const cur = ($('li-acc').value || '').trim();
  if (cur !== pending.value) { lmsg('账号已变更，请重新获取验证码'); return; }
  if (!code) { lmsg('请输入验证码'); return; }
  const pwdEl = $('li-pwd');
  const pwd = pwdEl ? (pwdEl.value || '') : '';
  if (!pending.isExistingUser && pwd.length < 6) { lmsg('新账号需要设置一个至少 6 位的密码'); return; }
  const base = { verificationId: pending.verificationId, isExistingUser: pending.isExistingUser, token: code };
  if (pwd && !pending.isExistingUser) base.password = pwd;
  const payload = pending.kind === 'phone' ? Object.assign({ phone: pending.value }, base) : Object.assign({ email: pending.value }, base);
  const btn = $('li-go'); btn.disabled = true; btn.textContent = '验证中…';
  const { data, error } = await cloud.auth.verifyOtp(payload);
  btn.disabled = false; btn.textContent = '登录 / 注册';
  if (error) { lmsg(et(error)); return; }
  await afterLogin(data);
}

$('btn-login').onclick = () => { if (!cloud) { cmsg('云服务未就绪，请刷新页面重试。', 'warn'); return; } openLogin(); };
$('btn-out').onclick = async () => {
  await cloud.auth.signOut();
  session = null; OVERRIDES = {}; renderAuth(); renderAll();
  cmsg('已退出，页面回到只读快照。', 'ok');
};

// 首屏：先显示加载态，拿到飞书实时数据才渲染，避免闪一下旧快照
function renderLoading(){
  $('meta').textContent = '正在从飞书加载最新数据…';
  $('synctime').innerHTML = '<span class="dot warn" style="margin-right:4px"></span>加载中…';
  $('kpis').innerHTML = ['在跟企业','已投递','待投递','流程中','已结束']
    .map(l => `<div class="kpi"><div class="l">${l}</div><div class="n">…</div></div>`).join('');
  $('dl').innerHTML = '<div class="sub">正在从飞书加载…</div>';
  $('tl').innerHTML = '<div class="sub">…</div>';
  $('cols').innerHTML = ['待投递','已投 · 等回音','笔试面试中','已结束']
    .map(n => `<div class="col"><h3><span>${n}</span></h3><div class="sub">加载中…</div></div>`).join('');
  $('acts').innerHTML = '';
  $('tb').innerHTML = '';
  $('tsub').innerHTML = '';
  $('f-count').textContent = '';
}

let booted = false;
async function boot(){
  renderLoading();
  // 3 秒还没拿到实时数据就先用快照顶上（并明确标注是快照），后台继续重试
  const fallback = setTimeout(() => { if (!booted) { LIVE = false; renderAll(); } }, 3000);
  const ok = await pullWithRetry();
  clearTimeout(fallback);
  booted = true;
  if (!ok) { LIVE = false; renderAll(); }
}

initCloud();
initFilters();
renderAuth();
boot();
restore();

// 实时通道：后端可用时直接读飞书，页面不再依赖打包快照
pullWithRetry();
setInterval(() => pullWithRetry(), 120000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pullWithRetry(); });
$('btn-refresh').onclick = async () => {
  const b = $('btn-refresh'); b.disabled = true; b.textContent = '刷新中…';
  const ok = await pullWithRetry();
  b.disabled = false; b.textContent = '刷新';
  cmsg(ok ? '已从飞书拉取最新数据。' : '实时拉取失败，当前显示的是页面快照。请确认是用完整分享链接打开的。', ok ? 'ok' : 'warn');
};

$('dl').onclick = e => {
  if (e.target.id === 'dl-more' || e.target.id === 'dl-less') { DL_ALL = (e.target.id === 'dl-more'); renderAll(); return; }
  const row = e.target.closest('.dl');
  if (row && row.dataset.rid) jumpTo(row.dataset.rid);
};

function jumpTo(rid){
  document.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.v === 'board';
    t.classList.toggle('on', on);
  });
  ['board','table','sub','act','log'].forEach(v => $('v-'+v).classList.toggle('hide', v !== 'board'));
  const tabs = document.querySelector('.tabs');
  if (tabs) tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const el = document.querySelector('#cols .it[data-id="' + rid + '"]');
  if (!el) { cmsg('这家不在看板四列里（可能在明细表格中）。', 'warn'); return; }
  const list = el.closest('.list');
  if (list) {
    const lr = list.getBoundingClientRect(), er = el.getBoundingClientRect();
    list.scrollTop += (er.top - lr.top) - 48;
  }
  document.querySelectorAll('#cols .it.flash').forEach(x => x.classList.remove('flash'));
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1800);
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (window.closeDatePicker && window.closeDatePicker(true)) return; closeM(); closeLogin(); }
});
</script>
</body>
</html>
"""


def script_json(value):
    # Escape HTML parser delimiters, even inside JSON string literals.
    return (json.dumps(value, ensure_ascii=False).replace("&", "\\u0026")
            .replace("<", "\\u003c").replace(">", "\\u003e")
            .replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))


def main():
    data = build()
    cfg = dict(CLOUD_CONFIG)
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, ".planner-actions.json"), "w", encoding="utf-8") as f:
        json.dump(data["actions"], f, ensure_ascii=False)
    os.makedirs(OUT_DIR, exist_ok=True)
    html = TEMPLATE.replace("__DATA__", script_json(data))
    html = html.replace("__CLOUD__", script_json(cfg))
    with open(os.path.join(OUT_DIR, "planner.css"), encoding="utf-8") as f:
        html = html.replace("</style>", f.read() + "</style>", 1)
    with open(os.path.join(OUT_DIR, "workspace.css"), encoding="utf-8") as f:
        html = html.replace("</style>", f.read() + "</style>", 1)
    extra = ""
    for name in ["planner-engine.js", "planner.js", "date-picker.js", "link-utils.js", "workspace-engine.js", "workspace.js"]:
        with open(os.path.join(OUT_DIR, name), encoding="utf-8") as f:
            extra += "<script>" + f.read() + "</script>"
    html = html.replace("</body>", extra + "</body>", 1)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"written {OUT} ({len(html)/1024:.1f} KB), records={len(data['records'])}, actions={len(data['actions'])}")


if __name__ == "__main__":
    main()
