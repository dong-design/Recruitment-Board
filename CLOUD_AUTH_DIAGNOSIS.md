# WorkBuddy 云认证故障诊断

诊断时间：2026-10-30 06:58（北京时间）。状态：前端身份确认逻辑已修复；平台凭证校验故障尚未修复，未部署本轮前端改动。

## 真实请求证据

应用：`wbapp_IwA7fp2zTePL6RbJvZ5ODR`。
站点：`https://campus-recruit-board-76828.app.workbuddy.host`。
用户在独立 Chrome 窗口亲自登录两次；诊断不保存密码、验证码、完整访问令牌或刷新令牌。

第二轮绕过 SDK，直接使用登录接口新签发的凭证：

| 请求 | 结果 |
| --- | --- |
| POST `/.cloud/auth/v1/signin` | 200，签发 Bearer，expires_in=7199 |
| GET `/.cloud/auth/v1/user/me` | 401 invalid_grant |
| GET `/.cloud/database/rest/job_overrides?select=rid&limit=1` | 401 invalid_grant |
| 约 2 秒、10 秒后重试上述两个 GET | 均为 401 invalid_grant |
| 浏览器内再次发起身份查询 | 同样 401 invalid_grant |

错误原文：`the session is invalid, expired or issued for another client`。
新令牌无空白，长度 389；声明的 issuer 为 genie-baas，audience 包含当前应用 ID；签发时间与服务器 Date 相符，到期时间尚未到达。JWT 解码仅用于检查声明，**不是签名有效性证明**。

因此故障定位到平台的凭证签发／校验链路。已排除“仅前端缓存旧会话”“仅数据库表权限”“仅 SDK 请求格式”“约 10 秒内短暂延迟”等解释；尚不能区分平台签名密钥、应用绑定、会话登记或网关配置等具体原因，需要平台日志。

无 Bearer 时数据库曾返回 200 空数组，这是匿名结果，不是认证成功。不能通过删除 Authorization、放宽权限或改为匿名写入绕过故障。

## 已修复的客户端问题

- SDK getSession 和登录接口成功只表示拿到凭证；现在必须通过 getUser 身份校验才设置页面登录态。
- 刷新恢复同样验证身份，不再显示服务器不认可的“已登录”。
- 新登录凭证被拒绝时保留登录窗口并报告身份校验失败，不执行云覆盖数据读取。
- 数据库访问失败与身份校验失败分开处理，前者不会清除已独立验证的身份。
- 身份请求完成晚于退出登录时，阻止旧响应恢复会话。

## 验证范围

26 项 Node 自动化测试通过，包含 5 项新增认证测试。真实 Chrome + 实际 SDK、模拟云接口验证：有效身份刷新恢复、旧存储迁移、数据库 401 保留有效身份、认证 401 拒绝恢复，以及日期选择器交互通过。
本轮没有修改用户业务记录；飞书保存流程仅做自动化回归，未宣称生产写入已验证。生产云端仍有上述认证失败。

## 平台管理者下一步

1. 按 2026-10-29 22:58:04–22:58:15 UTC、应用 ID 查询 signin 与 user/me 的认证日志，查明 invalid_grant 的内部原因。
2. 核对签发与验证使用的应用/租户绑定、issuer/audience 校验规则、签名密钥版本与会话存储登记是否一致；这些是检查项，不是已证实的根因。
3. 平台修复后，用新会话确认 user/me 返回身份，再检查数据库权限，不以匿名数据库 200 作为验收。
4. 部署前端更新，验证刷新、退出重新登录、我的改动、授权读写与飞书同步。业务写入验收使用可恢复的测试记录。

本地脱敏原始证据：`../output/cloud-diagnosis/report.json`、`../output/cloud-diagnosis/token-check.json`。没有向平台或第三方发送报告。
