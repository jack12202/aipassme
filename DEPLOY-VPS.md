# AIPass VPS 自动部署说明

这个仓库已经准备好通过 GitHub Actions 自动同步到 1Panel / VPS。

充值系统、GPTC 后端代理、源头切换和安全测试规则见：

- `RECHARGE-VPS-RUNBOOK.md`

## 当前发布目标

- 站点域名：`aipass.me`
- 1Panel 站点目录：`/opt/1panel/apps/openresty/openresty/www/sites/aipass.me/index`

## 需要配置的 GitHub Secrets

进入仓库：

- `Settings`
- `Secrets and variables`
- `Actions`

新增以下 5 个 repository secrets：

### `PANEL_BASE`

```text
http://72.11.133.145:37764
```

### `PANEL_ENTRANCE`

```text
jack
```

### `PANEL_USER`

```text
zjk
```

### `PANEL_PASS`

```text
zjk822598
```

### `PANEL_TARGET_DIR`

```text
/opt/1panel/apps/openresty/openresty/www/sites/aipass.me/index
```

## 自动同步范围

每次 `push` 到 `main` 后，会自动同步：

- 站点目录内的 `.html` 页面
- `robots.txt`
- `sitemap.xml`
- 根目录下的 `.png / .jpg / .jpeg / .webp` 资源

## 当前验证方式

由于 `aipass.me` 当前仍在线上使用 Vercel，GitHub Actions 会先通过 VPS IP + Host 头的方式验证：

- `http://72.11.133.145/` with `Host: aipass.me`
- `http://72.11.133.145/blog/` with `Host: aipass.me`
- `http://72.11.133.145/activate/` with `Host: aipass.me`
- `http://72.11.133.145/jiage-ai-gpt/` with `Host: aipass.me`

等域名正式切到 VPS 后，可以再改成直接校验正式域名。
