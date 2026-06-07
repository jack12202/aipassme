# 充值系统 VPS 接入复盘与规则

这份文档记录 GPTC 充值后端接入 AIPass 时踩过的坑，以及以后修改充值系统前必须检查的规则。目标是避免下次又花很多时间在接口、源头、VPS 代理、部署覆盖这些地方来回排查。

## 我能看到的历史范围

目前能稳定看到的是两个 Git 仓库的提交记录、部署脚本、页面代码和本地文档。1Panel 里每一次手动点击、临时保存、重启操作，如果没有写进脚本或提交到 Git，就不一定能完整还原。

从 GPTC 历史看，充值系统大概经历了这些阶段：

- 增加站内充值中心。
- 把 `activate/` 页面纳入自动部署。
- 增加三哥 / 阿妍双源头切换。
- 在 VPS 上部署独立的 `recharge-center` 后端。
- 多次修 OpenResty / Nginx 代理，把 `/api/recharge/*`、`/admin/provider` 转发到充值后端。
- 清理旧的 recharge location 和备份配置，避免重复代理、旧规则残留。

从 AIPass 历史看：

- 激活页从 GPTC 流程复制/改造过来。
- UI 被压缩，让用户更早看到激活码输入框。
- 充值密钥复制文案被简化。
- 最后修复了 provider 路由问题：三哥卡在源头可用，但 AIPass 因为查到阿妍源头而显示不存在。

## 最近这次事故的根因

卡密 `PULUH3L9RFV05NNJ` 在源头可用，但在 AIPass 显示“卡密不存在”，原因不是卡密无效，也不是 UI 改坏。

真正原因是：AIPass 当时调用 GPTC 后端时没有传 `provider`。

GPTC 做双通道后，请求如果不传 provider，就会使用 GPTC 后台当前的全局默认源头。当时 GPTC 默认源头是 `ayan`，所以 AIPass 拿三哥卡密去阿妍卡池查询，结果自然是“卡密不存在”。

修复方式是：AIPass 在三个步骤里都显式传 `provider: "sange"`：

- `/api/recharge/verify-card`
- `/api/recharge/confirm`
- `/api/recharge/query-task-status`

这样 GPTC 后台以后切到阿妍做测试，也不会影响 AIPass 的正式流量。

## 架构规则

1. GPTC 负责共享充值后端。

   VPS 上的 `recharge-center` 后端支持：

   - `sange`
   - `ayan`
   - `/api/recharge/provider`
   - `/admin/provider`
   - `/api/recharge/verify-card`
   - `/api/recharge/confirm`
   - `/api/recharge/query-task-status`

2. AIPass 不要依赖 GPTC 的默认源头。

   GPTC 的默认源头是测试/后台状态，不应该影响 AIPass 正式站。AIPass 必须：

   - 显式固定传 `provider: "sange"`，或
   - 以后做自己的独立通道开关。

3. 同一笔订单必须锁定 provider。

   不能第一步用三哥验证，第三步跑到阿妍提交，或者轮询时又换源头。第一步验证成功后，本次订单的 provider 必须一直保持一致。

4. “卡密验证通过”不等于“通道已上线可用”。

   一个源头必须全部测通，才算可上线：

   - 卡密验证
   - 充值密钥 / token 解析
   - 提交充值
   - 状态轮询
   - 失败信息映射

5. 不要把源头细节暴露给普通用户。

   用户看到的应该是“光年升级 Plus 充值系统”“充值密钥代码”。普通页面尽量不要出现 `upstream`、`JSON`、`provider`、源头名称等实现词，除非是在后台或排查场景。

## 通道状态规则

以后如果要给 AIPass 做双通道，建议每个通道有状态：

- `disabled`：不可用。
- `verify_only`：只能验证卡密，提交和轮询还没测通。
- `recharge_ready`：验证、提交、轮询都已测通，可接正式用户。

AIPass 只能把真实用户流量导向 `recharge_ready` 的通道。

## 安全测试规则

可以安全运行的是卡密验证：

```bash
curl -sS -i -X POST 'https://aipass.me/api/recharge/verify-card' \
  -H 'Content-Type: application/json' \
  --data '{"cardInfo":"CARD_HERE","provider":"sange"}'
```

这个步骤只验证卡密和源头路由，一般不会消耗卡密。

不要随便运行最终提交：

```text
POST /api/recharge/confirm
```

这一步可能创建真实任务，也可能消耗或处理卡密。只有用户明确给了测试卡、测试账号，并允许完整测试时，才可以跑。

状态查询在 fake task 或已知 task 下通常安全：

```bash
curl -sS -i -X POST 'https://aipass.me/api/recharge/query-task-status' \
  -H 'Content-Type: application/json' \
  --data '{"taskId":"TEST","productId":3,"cardInfo":"CARD_HERE","provider":"sange"}'
```

## VPS / OpenResty 部署规则

1. 前端优先走同源代理。

   页面应该调用当前域名下的 `/api/recharge/*`，由 OpenResty 代理到 VPS 本机的充值后端。这样可以避免 CORS 问题，也不会把源头接口暴露到前端。

2. 改 OpenResty 前要备份。

   修改 VPS 代理配置前必须：

   - 备份 server 配置。
   - 检查是否已有重复的 `location ^~ /api/recharge/`。
   - reload / restart OpenResty。
   - 用 `curl` 验证线上接口。

3. VPS 热修必须同步回 Git。

   如果通过 1Panel 直接保存了线上文件，必须马上在本地仓库做同样改动、commit、push，并确认 GitHub Actions 成功。否则下一次自动部署会把热修覆盖掉。

4. 页面标题改了，部署校验也要改。

   如果 `activate/` 的 `<title>` 或 canonical 变了，要同步更新 `.github/workflows/deploy-vps.yml`，否则页面没问题但部署检查会失败。

## 排查清单

当“源头可用，AIPass 显示不存在”时：

1. 用同一卡密分别打源头接口和 AIPass 接口。
2. 看 AIPass 请求是否带了 `provider`。
3. 看返回里的 `provider`、`providerLabel`、`selectedProvider`、`defaultProvider`。
4. 如果源头成功、AIPass 失败，优先怀疑查错 provider，不要先怀疑 UI。
5. 检查线上 HTML 是否包含正确的 provider 常量或路由逻辑。
6. 检查 OpenResty 是否把 `/api/recharge/*` 转发到了充值后端。

当浏览器出现 `Failed to fetch` 时：

1. 检查 OpenResty 是否有 `/api/recharge/` 代理。
2. 检查 VPS 后端服务是否健康。
3. 检查前端是否改成了跨域请求源头，而不是同源请求。
4. 检查自动部署是否覆盖了手动热修。

当第一步验证通过，但提交失败时：

1. 不要中途切 provider。
2. 确认充值密钥能解析出邮箱和 access token。
3. 确认 `fullAuthData` 按后端期望传输。
4. 查 provider adapter 的提交逻辑。
5. 在完整测试通过前，把该通道视为 `verify_only`，不要接正式用户。

## 当前 AIPass 固定规则

AIPass 当前应保留这个常量，除非 AIPass 自己做独立通道开关：

```js
const RECHARGE_PROVIDER = "sange";
```

验证、提交、轮询三个请求都必须携带它。

