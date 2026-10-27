#!/usr/bin/env bash
# 从飞书多维表格导出记录到 feishu_records.ndjson
# 用法：填好下面三个变量后 ./scripts/export_feishu.sh
# 注意：--overwrite 必须带，否则文件已存在时会静默失败、拿到旧数据
set -euo pipefail

BASE_TOKEN="${BASE_TOKEN:-你的base_token}"
TABLE_ID="${TABLE_ID:-你的table_id}"
OUT="${OUT:-feishu_records.ndjson}"

lark-cli base +record-list \
  --base-token "$BASE_TOKEN" \
  --table-id  "$TABLE_ID" \
  --as user --format ndjson \
  --output "$OUT" --overwrite

echo "已导出到 $OUT"
