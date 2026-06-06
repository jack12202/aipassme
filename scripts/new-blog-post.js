const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const blogDir = path.join(root, 'blog');
const blogIndexPath = path.join(blogDir, 'index.html');
const sitemapPath = path.join(root, 'sitemap.xml');
const siteUrl = 'https://www.aipass.me';

function readArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function usage() {
  console.log([
    'Usage:',
    '  npm run new:blog -- --title "ChatGPT Plus 支付失败怎么办" --slug chatgpt-plus-payment-failed --description "整理常见支付失败原因和处理方式" --category "支付问题"',
    '',
    'Required:',
    '  --title        文章标题',
    '  --slug         文件名，不带 .html',
    '',
    'Optional:',
    '  --description  文章摘要',
    '  --category     分类，默认 ChatGPT Plus',
    '  --date         日期，默认今天',
  ].join('\n'));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeSlug(slug) {
  return String(slug || '')
    .trim()
    .replace(/\.html$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function articleTemplate({ title, description, date, category }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeDate = escapeHtml(date);
  const safeCategory = escapeHtml(category);

  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
  <meta name="description" content="${safeDescription}"/>
  <title>${safeTitle} - AIPass 博客</title>
  <script>
  var _hmt = _hmt || [];
  (function() {
    var hm = document.createElement("script");
    hm.src = "https://hm.baidu.com/hm.js?12e4de68b3ffda0f30868fae3b804a30";
    var s = document.getElementsByTagName("script")[0];
    s.parentNode.insertBefore(hm, s);
  })();
  </script>
  <style>
    :root {
      --primary: #14b8a6;
      --surface: rgba(15, 23, 42, 0.86);
      --line: rgba(255, 255, 255, 0.12);
      --text: #ffffff;
      --muted: rgba(255, 255, 255, 0.76);
      --radius: 18px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(135deg, #042f2e 0%, #0f172a 48%, #020617 100%);
      color: var(--muted);
      padding: 34px 14px 70px;
      line-height: 1.82;
    }
    article {
      width: min(820px, 100%);
      margin: 0 auto;
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: var(--radius);
      padding: 34px;
      box-shadow: 0 22px 60px rgba(0, 0, 0, 0.26);
    }
    a { color: var(--primary); text-decoration: none; }
    h1 {
      color: var(--text);
      margin: 0 0 12px;
      font-size: clamp(28px, 4vw, 40px);
      line-height: 1.25;
      letter-spacing: 0;
    }
    h2 {
      color: var(--primary);
      margin-top: 30px;
      font-size: 24px;
      line-height: 1.35;
    }
    p, li { font-size: 17px; }
    .meta { color: rgba(255,255,255,.58); margin-bottom: 24px; }
    .note {
      border: 1px dashed rgba(20,184,166,.5);
      background: rgba(20,184,166,.1);
      border-radius: 12px;
      padding: 16px;
      margin: 20px 0;
    }
    .footer {
      margin-top: 34px;
      padding-top: 18px;
      border-top: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    @media (max-width: 520px) {
      article { padding: 24px; }
    }
  </style>
</head>
<body>
  <article>
    <a href="./">← 返回博客</a>
    <h1>${safeTitle}</h1>
    <div class="meta">${safeDate} · ${safeCategory}</div>

    <p>${safeDescription}</p>

    <div class="note">
      这里是文章正文模板。发布前请把下面的示例小标题和段落替换成正式内容。
    </div>

    <h2>一、问题背景</h2>
    <p>在这里说明用户遇到的问题、常见表现和适用场景。</p>

    <h2>二、常见原因</h2>
    <ul>
      <li>原因一：补充具体说明。</li>
      <li>原因二：补充具体说明。</li>
      <li>原因三：补充具体说明。</li>
    </ul>

    <h2>三、处理建议</h2>
    <p>在这里给出清晰、可执行的处理步骤。涉及充值时，说明充值到用户自己的账号，且无需提供账号密码。</p>

    <h2>四、需要帮助时</h2>
    <p>如果自助处理失败，可以返回 <a href="../">AIPass 首页</a> 联系客服协助。</p>

    <div class="footer">
      <a href="./">返回博客</a>
      <a href="../">返回首页</a>
    </div>
  </article>
</body>
</html>
`;
}

function postCard({ title, slug, description, date, category }) {
  return `      <a class="post-card" href="${slug}.html">
        <h2 class="post-title">${escapeHtml(title)}</h2>
        <p class="post-desc">${escapeHtml(description)}</p>
        <div class="post-meta">${escapeHtml(date)} · ${escapeHtml(category)}</div>
      </a>`;
}

function updateBlogIndex(post) {
  const html = fs.readFileSync(blogIndexPath, 'utf8');
  const marker = '<!-- BLOG_POSTS_START -->';
  const insertAt = html.indexOf(marker);
  if (insertAt === -1) {
    throw new Error('blog/index.html missing BLOG_POSTS_START marker.');
  }

  const href = `${post.slug}.html`;
  if (html.includes(`href="${href}"`)) {
    return;
  }

  const next = html.replace(marker, `${marker}\n${postCard(post)}`);
  fs.writeFileSync(blogIndexPath, next);
}

function updateSitemap(post) {
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const loc = `${siteUrl}/blog/${post.slug}.html`;
  if (sitemap.includes(`<loc>${loc}</loc>`)) {
    return;
  }

  const entry = `  <url>
    <loc>${loc}</loc>
    <lastmod>${post.date}</lastmod>
    <priority>0.9</priority>
  </url>
`;
  const next = sitemap.replace('</urlset>', `${entry}</urlset>`);
  fs.writeFileSync(sitemapPath, next);
}

function main() {
  const args = readArgs(process.argv);
  if (args.help || !args.title || !args.slug) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const slug = normalizeSlug(args.slug);
  if (!slug) {
    throw new Error('Invalid --slug value.');
  }

  const post = {
    title: args.title,
    slug,
    description: args.description || `${args.title}：常见问题、处理方式和注意事项。`,
    category: args.category || 'ChatGPT Plus',
    date: args.date || today(),
  };

  const articlePath = path.join(blogDir, `${slug}.html`);
  if (fs.existsSync(articlePath)) {
    throw new Error(`Article already exists: blog/${slug}.html`);
  }

  fs.writeFileSync(articlePath, articleTemplate(post));
  updateBlogIndex(post);
  updateSitemap(post);

  console.log(`Created blog/${slug}.html`);
  console.log('Updated blog/index.html');
  console.log('Updated sitemap.xml');
}

main();
