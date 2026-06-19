# AIPass 工作规则

## 充值系统安全规则

修改 `activate/index.html`、OpenResty 代理配置、或任何 `/api/recharge/` 相关内容前，先阅读 `RECHARGE-VPS-RUNBOOK.md`。

- AIPass 是 GPTC 充值后端的使用方，不要让 AIPass 依赖 GPTC 的全局默认源头。
- AIPass 当前正式流量固定走三哥源头。除非 AIPass 自己做独立通道开关，否则所有 AIPass 充值请求都必须显式传 `provider: "sange"`。
- 同一笔订单必须全程使用同一个 provider：验证卡密、提交充值、查询状态不能切换源头。
- 不要用真实生产卡密随便测试最终提交。卡密验证是安全的；提交开通可能会真实消耗或处理卡密。
- 如果直接在 VPS / 1Panel 上做了热修，必须马上把同样改动提交到 Git 并推送，否则下一次 GitHub Actions 可能覆盖热修。
- 每次改充值系统后，至少验证：
  - `POST /api/recharge/verify-card` 能命中预期 provider。
  - 线上 HTML 包含预期的 provider 常量或 provider 路由逻辑。
  - GitHub Actions 里的标题、canonical 等部署校验仍然匹配页面。

## 购买链接保护锁

购买卡密链接是受保护的，但不是永久绑定某一个发卡平台。当前允许的购买链接列表写在 `purchase-link-lock.json`。

- 购买按钮、购买卡密 CTA、购买相关常量必须使用已配置的 `purchaseUrls` 之一。
- 激活 / 充值入口可以独立变化，但不要把激活 / 充值链接用于购买 CTA。
- 除非用户在同一轮里明确确认并给出替换后的购买链接，否则不要修改购买按钮链接、`BUY_URL` / `PURCHASE_URL` 常量、`purchase-link-lock.json` 或购买链接保护脚本。
- 如果需求只是激活、充值系统、源头切换、VPS 或部署，不要推断为需要修改购买链接。
- 用户确认更换购买 / 发卡平台时，要同步更新 `purchase-link-lock.json` 和所有购买 CTA。
- 提交或推送前运行 `node scripts/check-purchase-link-lock.mjs`。
