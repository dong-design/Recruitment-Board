"""一键创建「投递记录」表模板（零依赖，仅用标准库）。

用途：在飞书新建一个空多维表格后，运行本脚本自动建出看板所需的
「投递记录」表与全部 13 个字段（含单选/多选选项、日期格式、关联本表）。

前置条件：
1. 在飞书开放平台创建一个企业自建应用，开通 bitable:app 权限（或最小化：
   查看、评论、编辑和管理多维表格），并发布版本使权限生效。
2. 在飞书里新建一个空多维表格，从链接里取出 app_token
   （形如 https://xxx.feishu.cn/base/<app_token>?table=...）。
3. 把该多维表格添加为本应用的可用数据表（开放平台 → 应用 → 多维表格）。

用法：
  python scripts/setup-feishu-template.py \
      --app-id cli_xxx --app-secret xxx --app-token bascnXXX \
      [--table-name 投递记录]

成功后打印 table_id，把它填进 dashboard/.feishu-app.json 的 table_id 即可。
"""
import argparse
import json
import sys
import urllib.request

OPEN_API = "https://open.feishu.cn/open-apis"

# Bitable 字段类型码：文本=1 单选=3 多选=4 日期=5 关联=18
TEXT, SELECT, MSELECT, DATETIME, LINK = 1, 3, 4, 5, 18

DATE_PROP = {"date_formatter": "yyyy/MM/dd", "auto_fill": False}

# 与看板语义一致的状态选项；颜色由飞书自动分配，可在界面里手动调整
STATUS_OPTIONS = [
    {"name": "待投递"},
    {"name": "已投递"},
    {"name": "已截止"},
    {"name": "挂了"},
    {"name": "Offer"},
    {"name": "实习offer"},
]
PROGRESS_OPTIONS = [
    {"name": "ai面"}, {"name": "测评"}, {"name": "笔试"},
    {"name": "一面"}, {"name": "二面"}, {"name": "三面"}, {"name": "体检"},
]
UNIT_OPTIONS = [
    {"name": "央企国企"}, {"name": "银行"}, {"name": "互联网大厂"},
    {"name": "事业单位"}, {"name": "外企"}, {"name": "其他"},
]
CITY_OPTIONS = [
    {"name": "北京"}, {"name": "上海"}, {"name": "杭州"},
    {"name": "苏州"}, {"name": "天津"},
]

# 先建 12 个基础字段；「父记录」自关联字段需表建成后再单独添加
BASE_FIELDS = [
    {"field_name": "公司名称", "type": TEXT},
    {"field_name": "单位类型", "type": SELECT, "property": {"options": UNIT_OPTIONS}},
    {"field_name": "城市", "type": MSELECT, "property": {"options": CITY_OPTIONS}},
    {"field_name": "岗位", "type": TEXT},
    {"field_name": "投递", "type": SELECT, "property": {"options": STATUS_OPTIONS}},
    {"field_name": "进展", "type": MSELECT, "property": {"options": PROGRESS_OPTIONS}},
    {"field_name": "投递日期", "type": DATETIME, "property": DATE_PROP},
    {"field_name": "报名截止日", "type": DATETIME, "property": DATE_PROP},
    {"field_name": "最新日期", "type": DATETIME, "property": DATE_PROP},
    {"field_name": "笔试时间", "type": TEXT},
    {"field_name": "备注", "type": TEXT},
    {"field_name": "链接", "type": TEXT},
]


def call(method, url, token=None, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"!! HTTP {e.code}: {e.read().decode()[:300]}", file=sys.stderr)
        raise SystemExit(1)
    if body.get("code") not in (0, None):
        print(f"!! 飞书返回错误 code={body.get('code')}: {body.get('msg')}", file=sys.stderr)
        raise SystemExit(1)
    return body.get("data", {})


def main():
    ap = argparse.ArgumentParser(description="创建投递记录表模板")
    ap.add_argument("--app-id", required=True)
    ap.add_argument("--app-secret", required=True)
    ap.add_argument("--app-token", required=True, help="空多维表格的 app_token")
    ap.add_argument("--table-name", default="投递记录")
    args = ap.parse_args()

    tok = call("POST", f"{OPEN_API}/auth/v3/tenant_access_token/internal",
               payload={"app_id": args.app_id, "app_secret": args.app_secret})
    token = tok["tenant_access_token"]
    print("✔ 获取 tenant_access_token 成功")

    table = call("POST", f"{OPEN_API}/bitable/v1/apps/{args.app_token}/tables", token,
                 {"table": {"name": args.table_name, "fields": BASE_FIELDS}})
    table_id = table["table_id"]
    print(f"✔ 建表成功：{args.table_name} (table_id={table_id})，含 {len(BASE_FIELDS)} 个基础字段")

    call("POST", f"{OPEN_API}/bitable/v1/apps/{args.app_token}/tables/{table_id}/fields",
         token, {"field_name": "父记录", "type": LINK,
                 "property": {"table_id": table_id, "multiple": False}})
    print("✔ 添加「父记录」自关联字段成功")

    print(f"""
完成！下一步：
1. 打开 https://你的域名.feishu.cn/base/{args.app_token}?table={table_id} 核对字段与选项。
2. 把以下内容填入 dashboard/.feishu-app.json：
   "app_token": "{args.app_token}",
   "table_id": "{table_id}"
3. 为保证子记录（分行/子岗位）能关联集团主记录，建议把同一集团的
   分行记录通过「父记录」关联到集团主记录上。
""")


if __name__ == "__main__":
    main()
