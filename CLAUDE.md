# CLAUDE.md

Personal blog of Nawinder Pawar, published at https://pawar.me.

## Stack and deploy

- Static site built with **Hugo (extended) 0.164.0**. No external theme, no Node, no modules; all templates live in `layouts/`.
- **Pushing to `master` publishes the site.** `.github/workflows/hugo.yml` builds with `hugo --gc --minify` and deploys to GitHub Pages. Custom domain comes from `static/CNAME`.
- So a push to `master` is a public release. Don't push without the user's go-ahead, and build locally first (below).
- `public/` and `resources/_gen/` are build output and are gitignored. Never edit them by hand.

## Commands

```sh
hugo server -D          # local preview with drafts, http://localhost:1313
hugo server             # preview as production would render it (no drafts)
hugo --gc --minify      # production build into public/, catches template errors
hugo new content posts/<slug>/index.md   # new post bundle from archetypes/default.md
```

## Content

- Posts are **page bundles**: `content/posts/<slug>/index.md`, with images beside them in `content/posts/<slug>/images/` (diagrams are SVG).
- Front matter (YAML):
  ```yaml
  title: "..."
  slug: "..."
  date: 2026-09-26
  draft: false        # archetype starts as true; drafts don't publish
  tags: ["llm-inference", "kubernetes"]
  description: "..."  # used for <meta description> and og:description
  ```
- Permalinks are dated: `/:year/:month/:slug/` (set in `hugo.toml`).
- Reference images with relative Markdown paths, e.g. `![alt](images/request-flow.svg)`. The render hook `layouts/_default/_markup/render-image.html` resolves them to the bundle's permalink. That matters because **the homepage renders full post content** (not summaries), so plain relative paths would 404 there.
- Raw HTML in Markdown is allowed (`markup.goldmark.renderer.unsafe = true`).
- **Interactive posts** (e.g. `content/posts/mcp-authorization/`): prose stays in Markdown; the interactive part is a shortcode (`layouts/shortcodes/mcp-trace.html`) that reads JSON/JS from the bundle. Front matter keys:
  - `css: ["trace.css"]`: bundle stylesheets that `head.html` loads (minified and fingerprinted) on that page only.
  - `interactive: true`: the homepage shows the summary (text before `<!--more-->`) plus a link, instead of the full content.
  - `build: publishResources: false`: only the fingerprinted copies get published.
  - Scope component CSS under its own class, build it on the `main.css` variables, and use container queries rather than viewport media queries. Components stay within the 46rem text column like the rest of the post.
- Writing style: first-person, technical, explanatory. Long posts are split into `## Part N — ...` sections divided by `---`.

## Layouts and styling

- `layouts/baseof.html` plus partials in `layouts/_partials/` (head, header, footer, post-meta, paginator).
- `home.html` shows a paginated stream of full posts (10 per page); `page.html` is a single post; `list.html` and `taxonomy.html` cover sections and tags.
- CSS is plain static files: `static/css/main.css` (single-column, dark palette driven by CSS variables on `:root`, Verdana body font, `--measure` width) and `static/css/syntax.css`.
- Colors in `main.css` are checked against WCAG AA (4.5:1). Keep that when changing the palette.
- Code highlighting uses Chroma classes. Regenerate `syntax.css` with `hugo gen chromastyles --style=github-dark` if the style changes.

## Conventions

- Work happens directly on `master`.
- Commit messages: short imperative subject (e.g. "Fix bundle image paths breaking outside their own post"), with a body explaining *why* when it isn't obvious.
