# 校招进度看板 · Recruit Board

把「飞书多维表格」变成随时能打开的进度看板：**打开就知道今天该干什么**，在网页上改完状态 **1~2 秒同步回飞书**。

适合秋招/春招同时推进几十家单位、被各种截止日和流程环节搞晕的人。

```
打开页面 → 顶部三件事：KPI / 倒计时 / 未来 7 天负载
        → 四列看板：待投递 / 等回音 / 笔试面试中 / 已结束
        → 点卡片改状态 → 秒级写回飞书
```

---

## 一、先跑起来看效果（不用任何配置）

```bash
git clone https://github.com/dong-design/Recruitment-Board.git
cd Recruitment-Board
python build_dashboard.py     # 用 sample/ 里的示例数据生成 dashboard/index.html
python -m http.server 8000 -d dashboard    # 然后打开 http://localhost:8000
```

或者直接双击 `dashboard/index.html`。

这一步不需要飞书、不需要云服务，纯静态只读。看完觉得有用再往下接自己的数据。

---

## 二、接你自己的飞书多维表格

### 1. 建表的字段

在你的飞书多维表格里准备这些字段（**名称要完全一致**）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `公司名称` | 文本 | 主记录的集团名；子岗位写分行/子公司名 |
| `单位类型` | 单选 | 央企国企 / 银行 / 互联网大厂 / 事业单位 / 外企 / 其他 |
| `城市` | 多选 | 北京 / 上海 / 杭州 … |
| `岗位` | 文本 | |
| `投递` | 单选 | `待投递` `已投递` `已截止` `挂了` `Offer` `实习offer` |
| `进展` | 多选 | `ai面` `测评` `笔试` `一面` `二面` `三面` `体检` |
| `投递日期` | 日期 | |
| `报名截止日` | 日期 | **倒计时和分组的核心字段**，建议填准 |
| `最新日期` | 日期 | 兜底用，没填截止日时显示这个 |
| `笔试时间` | 文本 | |
| `备注` | 文本 | 支持 `｜` 分段、`⚠️` `⭐` `①②③` 标记，会自动渲染成卡片 |
| `链接` | 文本 | 投递入口 |
| `父记录` | 关联（关联本表） | 子岗位挂到母公司下，不填就是主记录 |

> ⚠️ `报名截止日` 和 `最新日期` 是两回事。很多人用「最新日期」记的是**录入这条记录的日期**，拿它当截止日会误报"已过期"。建议单独建截止日字段。

### 2. 导出数据

用 [lark-cli](https://open.feishu.cn)（飞书官方 CLI）导出：

```bash
lark-cli base +record-list \
  --base-token  你的base_token \
  --table-id    你的table_id \
  --as user --format ndjson \
  --output ./feishu_records.ndjson --overwrite
```

> `--overwrite` 必须带，否则文件已存在时会**静默失败**拿到旧数据。

Windows 用户可以用 `scripts/export_feishu.sh` 改下参数，或照着命令手敲。

### 3. 生成页面

```bash
cp config.example.json config.json     # 然后填 feishuUrl
python build_dashboard.py
```

---

## 三、可选：开启登录与保存

默认页面是**只读**的。想在网页上改状态，需要 WorkBuddy 云服务（提供登录 + 数据库）：

在 `config.json` 里填 `cloud` 三项（endpoint / oauthRelayBaseUrl / publishableKey），重新生成即可。

```json
{
  "feishuUrl": "https://xxx.feishu.cn/base/xxx?table=yyy",
  "source": "feishu_records.ndjson",
  "cloud": {
    "endpoint": "https://xxx.app.workbuddy.host",
    "oauthRelayBaseUrl": "https://www.workbuddy.cn/v2/as/genie-baas/oauth",
    "publishableKey": "wbpk_xxx"
  }
}
```

登录支持邮箱/手机验证码 + 密码登录 + 忘记密码。

---

## 四、可选：保存即同步（去掉定时轮询）

静态页面**没法直接写飞书**：飞书 API 要凭证，凭证不能放前端。所以默认方案是「改完存云端队列 → 定时任务回写」。

想做到点保存就秒同步，需要把页面升级成带后端的服务（`dashboard/server.js` 已经写好了）：

1. 去 https://open.feishu.cn/app 创建**企业自建应用**
2. 权限管理里开通 `bitable:app`（编辑和管理多维表格）—— 只开这一个，遵循最小权限
3. 打开你的多维表格 →「···」→ 添加文档协作者 → 搜应用名 → 给**可编辑**
4. **创建版本并申请发布**（不发布的应用加不了协作者，这是最常见的坑）
5. 把 App ID / App Secret 写进 `.env` 或 `dashboard/.feishu-app.json`（服务端读取，不进前端）
6. 启动服务：

```bash
cd dashboard && npm start      # 或 node server.js
```

接口：

| 接口 | 作用 |
|---|---|
| `POST /api/sync` | 用应用身份写飞书，1~2 秒落表 |
| `GET /api/pull` | 直连飞书读最新数据，页面打开即最新 |
| `GET /api/health` | 检查凭证是否配置成功 |

后端挂了会自动降级回静态快照，页面不会白屏。

---

## 五、部署

- **静态方式**：把 `dashboard/index.html` 传到任意静态托管（GitHub Pages / Vercel / Netlify）即可，只读。
- **带后端方式**：部署 `dashboard/` 目录（Node 18+，`node server.js`，监听 `$PORT`）。

---

## 六、隐私与安全（重要）

本项目会接触你的真实招聘数据，请务必注意：

| 不要上传 | 原因 |
|---|---|
| `config.json` | 含你的飞书表格地址、云服务 key |
| `dashboard/.feishu-app.json`、`.env` | 含 **App Secret**，泄露等于别人能改你的表 |
| `feishu_records.ndjson` | 你的全部公司、岗位、备注 |
| `dashboard/index.html` | 生成产物，里面**内嵌了全部数据** |

这些都已经在 `.gitignore` 里。推送前建议自己再确认一遍：

```bash
git status --short        # 确认上面这些文件没在里面
git check-ignore -v config.json dashboard/.feishu-app.json
```

另外提醒：很多人在备注里会记**准考证号、身份证号、考试账号密码**。这些一旦导出就会进 ndjson 和 index.html，**千万不要推到公开仓库**。

---

## 七、目录结构

```
recruit-board/
├── build_dashboard.py        # 生成器：读 ndjson + actions.json → index.html
├── config.example.json       # 配置模板（复制成 config.json）
├── actions.example.json      # 动作节点模板（可选）
├── sample/                   # 脱敏示例数据，clone 下来就能看效果
│   └── feishu_records.ndjson
├── dashboard/
│   ├── server.js             # 可选后端：/api/sync + /api/pull + /api/health
│   ├── package.json
│   └── index.html            # 生成产物（已 gitignore）
├── scripts/
│   └── export_feishu.sh      # 飞书导出命令参考
└── .gitignore
```

---

## 八、常见问题

**Q：页面右上角显示「快照 XX:XX」而不是「实时同步」？**
说明实时拉取没成功，页面在显示打包时的旧数据。通常是后端没起来，或请求没带完整的分享参数。点右上角「刷新」可强制重试。

**Q：加了应用但在飞书里搜不到？**
多半是应用还停在「待上线」。必须走完：开通权限 → 创建版本 → 申请发布 → 状态变「已启用」。只开通不发版不生效。

**Q：为什么「已过截止日」里有些其实还能投？**
因为你用的不是真正的截止日字段。把 `报名截止日` 填准，看板只认这个字段。

**Q：进展标签颜色在哪改？**
`build_dashboard.py` 里的 `PROG_BG` / `PROG_FG` 两个数组，顺序对应 `PROG_OPTS`。

---

## License

MIT
