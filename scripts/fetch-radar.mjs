#!/usr/bin/env node
/* ============================================================
   GitHub 飙升雷达 · 采集器
   ------------------------------------------------------------
   作用：从 GitHub API 抓取真实数据，生成 radar-data.js
        以及 history/ 下的每日快照，用于计算日增 / 周增。

   用法：
     GITHUB_TOKEN=xxx node scripts/fetch-radar.mjs
   可选：
     --dry-run   只抓不打写文件，用于调试
     --limit=20  只处理前 N 个仓库（调试用）

   设计要点：
   1. GitHub 不提供"日增 star"，必须靠每日快照差分。所以本脚本
      每次运行都会写一份 history/YYYY-MM-DD.json；日增 = 今天 - 昨天。
   2. 首次运行没有历史，日增/周增/月增都是 0 —— 这是诚实的 0，
      不是假的。页面上会显示"数据积累中"。
   3. 所有请求都走同一个限速队列，避免触发 secondary rate limit。
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, "radar.config.json"), "utf8"));

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const API = "https://api.github.com";
const DRY = process.argv.includes("--dry-run");
const LIMIT = (() => {
  const a = process.argv.find((x) => x.startsWith("--limit="));
  return a ? Number(a.split("=")[1]) : 0;
})();

if (!TOKEN) {
  console.error("缺少 GITHUB_TOKEN 环境变量。");
  console.error("本地: set GITHUB_TOKEN=ghp_xxx   (PowerShell: $env:GITHUB_TOKEN=\"ghp_xxx\")");
  console.error("Actions: 在仓库 Settings → Secrets 里配置 GITHUB_TOKEN 会自动注入。");
  process.exit(1);
}

const HEADERS = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${TOKEN}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "github-radar-collector",
};

/* ---------- 基础工具 ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 带重试与限速的 fetch。返回 {data, headers}。 */
async function gh(url, { allow404 = false } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= CFG.fetch.retries; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), CFG.fetch.timeoutMs);
      const res = await fetch(url, { headers: HEADERS, signal: ctl.signal });
      clearTimeout(timer);

      // 限速：读 reset 时间后等待
      const remaining = Number(res.headers.get("x-ratelimit-remaining") ?? "1");
      if (res.status === 403 || res.status === 429) {
        const reset = Number(res.headers.get("x-ratelimit-reset") ?? "0");
        const waitMs = reset ? Math.max(1000, reset * 1000 - Date.now() + 1500) : 60000;
        console.warn(`  限速，等待 ${Math.round(waitMs / 1000)}s …`);
        await sleep(Math.min(waitMs, 15 * 60 * 1000));
        continue;
      }
      if (res.status === 404 && allow404) return { data: null, headers: res.headers };
      if (res.status === 422) {
        // 搜索查询非法（常见于 topic 拼错），直接返回空，不重试
        console.warn(`  422 查询无效，跳过: ${url}`);
        return { data: null, headers: res.headers };
      }
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} ${url}`);
        await sleep(1000 * attempt);
        continue;
      }
      const data = await res.json();
      if (remaining <= 1) await sleep(1200); // 主动减速
      return { data, headers: res.headers };
    } catch (e) {
      lastErr = e;
      await sleep(800 * attempt);
    }
  }
  throw lastErr ?? new Error(`请求失败: ${url}`);
}

/** 取 Link 头的 rel="next" */
function nextLink(headers) {
  const link = headers.get("link");
  if (!link) return null;
  const m = link.match(/<([^>]+)>;\s*rel="next"/);
  return m ? m[1] : null;
}

/* ---------- 1. 发现仓库清单 ---------- */

const since = () => {
  const d = new Date(Date.now() - CFG.discovery.pushedWithinDays * 86400000);
  return d.toISOString().slice(0, 10);
};

/** 按 topic 搜索 */
async function discoverByTopic(topic) {
  const collected = new Map();
  const q = [
    `topic:${topic}`,
    `stars:>=${CFG.discovery.minStars}`,
    `pushed:>=${since()}`,
    "is:public",
    "archived:false",
  ].join(" ");
  let url =
    `${API}/search/repositories?q=${encodeURIComponent(q)}` +
    `&sort=stars&order=desc&per_page=${Math.min(100, CFG.discovery.perQuery)}`;

  let page = 0;
  while (url && page < 2) {
    const { data, headers } = await gh(url);
    if (!data?.items?.length) break;
    for (const r of data.items) {
      if (!collected.has(r.full_name)) collected.set(r.full_name, r);
    }
    url = nextLink(headers);
    page++;
    await sleep(CFG.fetch.searchDelayMs);
  }
  console.log(`  topic:${topic} → ${collected.size} 个`);
  return [...collected.values()];
}

/** 按全局 star 排行（不限 topic），补充"大而慢"的长尾 */
async function discoverByStars() {
  const q = [
    `stars:>=${CFG.discovery.minStars}`,
    `pushed:>=${since()}`,
    "is:public",
    "archived:false",
  ].join(" ");
  const url =
    `${API}/search/repositories?q=${encodeURIComponent(q)}` +
    `&sort=stars&order=desc&per_page=${Math.min(100, CFG.discovery.perQuery)}`;
  const { data } = await gh(url);
  const list = data?.items ?? [];
  console.log(`  全局 star 排行 → ${list.length} 个`);
  return list;
}

async function discover() {
  const mode = CFG.discovery.mode;
  const map = new Map();
  const add = (arr) => arr.forEach((r) => { if (!map.has(r.full_name)) map.set(r.full_name, r); });

  if (mode === "topic" || mode === "both") {
    for (const t of CFG.discovery.topics) add(await discoverByTopic(t));
  }
  if (mode === "stars" || mode === "both") add(await discoverByStars());

  let all = [...map.values()];
  all.sort((a, b) => b.stargazers_count - a.stargazers_count);
  if (all.length > CFG.discovery.maxRepos) all = all.slice(0, CFG.discovery.maxRepos);
  return all;
}

/* ---------- 2. 补全单个仓库的字段 ---------- */

async function enrich(basic) {
  const full = basic.full_name;

  // 最新 release（可选，失败不影响主流程）
  let version = null;
  let releaseAt = null;
  if (CFG.fetch.releasePerRepo) {
    try {
      const { data } = await gh(`${API}/repos/${full}/releases/latest`, { allow404: true });
      if (data) {
        version = data.tag_name || null;
        releaseAt = data.published_at || null;
      }
    } catch {
      /* 忽略：没有 release 是正常状态 */
    }
  }

  return {
    full_name: full,
    lang: basic.language || null,
    license_spdx: basic.license?.spdx_id && basic.license.spdx_id !== "NOASSERTION"
      ? basic.license.spdx_id
      : null,
    stars: basic.stargazers_count ?? 0,
    forks: basic.forks_count ?? 0,
    summary: basic.description || "",
    latest_version: version,
    latest_release_at: releaseAt,
    repo_updated_at: basic.pushed_at || basic.updated_at || null,
    topics: basic.topics ?? [],
    homepage: basic.homepage || null,
    archived: !!basic.archived,
    is_new: false,
  };
}

/* ---------- 3. 历史快照与增量 ---------- */

const HIST_DIR = path.join(ROOT, "history");
const today = new Date().toISOString().slice(0, 10);

function loadHistory() {
  if (!fs.existsSync(HIST_DIR)) return [];
  return fs
    .readdirSync(HIST_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .map((f) => ({
      day: f.slice(0, 10),
      stars: JSON.parse(fs.readFileSync(path.join(HIST_DIR, f), "utf8")),
    }));
}

/** 找到"至少 N 天前"的最近一份快照，用于算周增/月增 */
function snapshotBefore(history, days) {
  const target = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const cands = history.filter((h) => h.day <= target);
  return cands.length ? cands[cands.length - 1] : null;
}

/** 把今天的 star 与某份历史对比，得到每个仓库的增量 */
function deltaAgainst(history, stars) {
  const out = new Map();
  if (!history) return out;
  for (const [name, cur] of Object.entries(stars)) {
    const prev = history.stars[name];
    if (typeof prev === "number") out.set(name, cur - prev);
  }
  return out;
}

/* ---------- 4. 生成 weekly 序列（最近 4 周） ---------- */

function weeklySeries(history, stars, weeks = 4) {
  /* 每周值 = 该周结束时 star − 该周开始时 star。
     没有足够历史时返回 0，并在 meta 里标注 coverage。 */
  const series = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const endSnap = snapshotBefore(history, w * 7);
    const startSnap = snapshotBefore(history, (w + 1) * 7);
    if (!endSnap || !startSnap) {
      series.push(0);
      continue;
    }
    let sum = 0;
    for (const [name, cur] of Object.entries(stars)) {
      const end = endSnap.stars[name];
      const start = startSnap.stars[name];
      if (typeof end === "number" && typeof start === "number") sum += end - start;
    }
    series.push(sum);
  }
  return series;
}

/* ---------- 主流程 ---------- */

(async () => {
  console.log(`[1/5] 发现仓库清单（mode=${CFG.discovery.mode}）…`);
  let basics = await discover();
  if (!basics.length) {
    console.error("没有发现任何仓库。检查 radar.config.json 的 topics 是否正确。");
    process.exit(1);
  }
  if (LIMIT) basics = basics.slice(0, LIMIT);
  console.log(`      共 ${basics.length} 个仓库`);

  console.log("[2/5] 补全字段…");
  const repos = [];
  for (let i = 0; i < basics.length; i++) {
    const r = await enrich(basics[i]);
    repos.push(r);
    if ((i + 1) % 10 === 0 || i === basics.length - 1) {
      console.log(`      ${i + 1}/${basics.length}`);
    }
    await sleep(120);
  }

  console.log("[3/5] 读取历史快照…");
  const history = loadHistory();
  console.log(`      已有 ${history.length} 份快照（${history[0]?.day ?? "无"} → ${history.at(-1)?.day ?? "无"}）`);

  const todayStars = Object.fromEntries(repos.map((r) => [r.full_name, r.stars]));

  console.log("[4/5] 计算增量…");
  const yesterday = snapshotBefore(history, 1);
  const dDaily = deltaAgainst(yesterday, todayStars);
  const d7 = deltaAgainst(snapshotBefore(history, 7), todayStars);
  const d30 = deltaAgainst(snapshotBefore(history, 30), todayStars);

  for (const r of repos) {
    r.gain = Math.max(0, dDaily.get(r.full_name) ?? 0);
    r.gain_7d = Math.max(0, d7.get(r.full_name) ?? 0);
    r.gain_30d = Math.max(0, d30.get(r.full_name) ?? 0);
  }
  /* 每个仓库自己的 4 周序列：每周 = 该周末 star − 该周初 star。
     历史不足时填 0（诚实反映"还没积累到"），不伪造。 */
  const weekEdges = [0, 1, 2, 3].map((w) => ({
    end: snapshotBefore(history, w * 7),
    start: snapshotBefore(history, (w + 1) * 7),
  })).reverse();
  for (const r of repos) {
    r.weekly = weekEdges.map(({ end, start }) => {
      const e = end?.stars?.[r.full_name];
      const s0 = start?.stars?.[r.full_name];
      return typeof e === "number" && typeof s0 === "number" ? Math.max(0, e - s0) : 0;
    });
  }
  const weeks = weekEdges.map(({ end, start }) => {
    if (!end || !start) return 0;
    let sum = 0;
    for (const [name, cur] of Object.entries(todayStars)) {
      const e = end.stars[name], s0 = start.stars[name];
      if (typeof e === "number" && typeof s0 === "number") sum += Math.max(0, e - s0);
    }
    return sum;
  });

  // 首次出现的仓库标记为 NEW
  const seen = new Set(history.flatMap((h) => Object.keys(h.stars)));
  for (const r of repos) r.is_new = !seen.has(r.full_name);

  const has7 = !!snapshotBefore(history, 7);
  const has30 = !!snapshotBefore(history, 30);
  const known = repos.filter((r) => r.stars >= CFG.knownThreshold).map((r) => r.full_name);

  /* facts_ready = 能算出真实 7 天增量的仓库（有前后两份快照） */
  const factsReady = repos.filter((r) => d7.has(r.full_name)).map((r) => r.full_name);

  /* 覆盖度：有多少仓库能算出真实增量 */
  const coverage = {
    history: repos.length ? repos.filter((r) => d7.has(r.full_name)).length / repos.length : 0,
    summary: repos.filter((r) => r.summary).length / (repos.length || 1),
    release: repos.filter((r) => r.latest_version).length / (repos.length || 1),
    license: repos.filter((r) => r.license_spdx).length / (repos.length || 1),
    lang: repos.filter((r) => r.lang).length / (repos.length || 1),
  };

  const payload = {
    meta: {
      snapshot_day: today,
      sync_at: new Date().toISOString(),
      source: "GitHub REST API v2022-11-28",
      discovery: { mode: CFG.discovery.mode, topics: CFG.discovery.topics ?? [], minStars: CFG.discovery.minStars },
      history_days: history.length,
      has_7d: has7,
      has_30d: has30,
      note: !has7
        ? "历史不足 7 天，近 7 天/30 天增量为 0（数据积累中）"
        : !has30
          ? "历史不足 30 天，30 天增量为 0（数据积累中）"
          : null,
    },
    scope: CFG.scope,
    weeks: weekEdges.map(({ end }) => {
      if (!end) return "—";
      const d = new Date(end.day + "T00:00:00Z");
      return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    }),
    known,
    facts_ready: factsReady,
    repos,
  };

  if (DRY) {
    console.log("[5/5] --dry-run，不写文件。样例：");
    console.log(JSON.stringify(repos.slice(0, 2), null, 2));
    console.log("weeks:", weeks, "coverage:", coverage);
    return;
  }

  console.log("[5/5] 写入文件…");
  fs.mkdirSync(HIST_DIR, { recursive: true });

  // 每日快照（供明天差分）
  fs.writeFileSync(
    path.join(HIST_DIR, `${today}.json`),
    JSON.stringify(todayStars, null, 0),
    "utf8"
  );

  // 清理过期快照
  const cutoff = new Date(Date.now() - CFG.history.keepDays * 86400000).toISOString().slice(0, 10);
  for (const f of fs.readdirSync(HIST_DIR)) {
    if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) < cutoff) {
      fs.unlinkSync(path.join(HIST_DIR, f));
    }
  }

  // 主数据文件
  const js =
    "/* ============================================================\n" +
    "   GitHub 飙升雷达 · 数据（由 scripts/fetch-radar.mjs 自动生成）\n" +
    `   生成时间：${payload.meta.sync_at}\n` +
    "   请勿手工编辑；改 radar.config.json 后重新运行采集器即可。\n" +
    "   ============================================================ */\n" +
    "window.RADAR_DATA = " +
    JSON.stringify(payload, null, 1) +
    ";\n";
  fs.writeFileSync(path.join(ROOT, "radar-data.js"), js, "utf8");

  console.log(`      写入 radar-data.js（${repos.length} 个仓库）`);
  console.log(`      写入 history/${today}.json`);
  if (payload.meta.note) console.log(`      注意：${payload.meta.note}`);
})().catch((e) => {
  console.error("采集失败：", e);
  process.exit(1);
});
