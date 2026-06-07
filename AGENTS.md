# AIPass 工作规则

## 充值系统安全规则

修改 `activate/index.html`、OpenResty 代理配置、或任何 `/api/recharge/` 相关内容前，先阅读 `RECHARGE-VPS-RUNBOOK.md`。

- AIPass 是 GPTC 充值后端的使用方，不要让 AIPass 依赖 GPTC 的全局默认源头。
- AIPass 当前正式流量固定走三哥源头。除非 AIPass 自己做独立通道开关，否则所有 AIPass 充值请求都必须显式传 `provider: "sange"`。
- 同一笔订单必须全程使用同一个 provider：验证卡密、提交充值、查询状态不能切换源头。
- 不要用真实生产卡密随便测试最终提交。卡密验证是安全的；提交/确认充值可能会真实消耗或处理卡密。
- 如果直接在 VPS / 1Panel 上做了热修，必须马上把同样改动提交到 Git 并推送，否则下一次 GitHub Actions 可能覆盖热修。
- 每次改充值系统后，至少验证：
  - `POST /api/recharge/verify-card` 能命中预期 provider。
  - 线上 HTML 包含预期的 provider 常量或 provider 路由逻辑。
  - GitHub Actions 里的标题、canonical 等部署校验仍然匹配页面。

