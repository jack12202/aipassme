# AIPass Blog 发布流程

## 最快发布方式

在仓库根目录运行：

```bash
npm run new:blog -- --title "ChatGPT Plus 支付失败怎么办" --slug chatgpt-plus-payment-failed --description "整理 ChatGPT Plus 支付失败的常见原因和处理方式。" --category "支付问题"
```

脚本会自动完成：

```text
1. 新建 blog/chatgpt-plus-payment-failed.html
2. 更新 blog/index.html 的文章列表
3. 更新 sitemap.xml
```

然后你只需要：

```text
1. 打开新文章 HTML，替换正文模板为正式文章
2. 提交 GitHub
3. 等 Vercel 自动部署
4. 访问新文章 URL 测试
5. 到 Google Search Console 请求编入索引
```

## 手动发布方式

如果不用脚本，则按这三个文件同步改：

```text
blog/新文章.html
blog/index.html
sitemap.xml
```

`blog/index.html` 里把新文章卡片加在：

```html
<!-- BLOG_POSTS_START -->
```

后面。

`sitemap.xml` 里把新文章 URL 加在：

```xml
</urlset>
```

前面。

## 不能自动化的步骤

Google Search Console 的“请求编入索引”需要账号登录和人工操作，通常不能在仓库里自动完成。
