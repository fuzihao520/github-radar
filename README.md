# 让数据变成真的：接入与自动更新

## 先说结论：GitHub Actions 要不要钱

**用公开仓库 + 标准 GitHub 托管 runner（ubuntu-latest），完全免费，没有分钟上限。**

本项目的采集任务：每天跑 1 次，单次约 2–4 分钟。这个量级下：

| 你的仓库类型 | 费用 |
|---|---|
| **公开仓库**（推荐） | **0 元**，标准 runner 免费且不限分钟 |
| 私有仓库 | 每月含 $12 额度（GitHub Free ≈ 2,000 Linux 分钟），本项目每月约 60–120 分钟，远在额度内，也是 **0 元** |
| 私有仓库超额度后 | Linux $0.006/分钟；本项目即使超了，一个月也就几毛钱 |

三条容易踩的例外：

1. **larger runners（4 核以上）不免费**，公开仓库也照样收费。本项目用默认 `ubuntu-latest`，不涉及。
2. **私有仓库的制品存储**超出额度要钱（Free 版 500 MB）。本项目不传 artifact，只提交文本文件（`radar-data.js` 约 100–300 KB），不会占用。
3. **公开仓库 60 天没有任何活动，定时任务会被自动禁用**。每天提交数据本身就是活动，所以不会触发；但如果你手动停掉，需要记得回来重新启用。

结论：**选公开仓库，这事就是零成本、零维护。**

---

## 怎么接上真实数据

### 方式 A：GitHub Actions 自动跑（推荐，配一次就不用管）

**第 1 步：建仓库并上传**

把 `github-radar/` 整个目录推到一个 GitHub 仓库。目录结构要保持：

```
你的仓库/
├── .github/workflows/update-radar.yml   ← 定时任务
├── scripts/fetch-radar.mjs              ← 采集脚本
├── radar.config.json                    ← 抓哪些仓库的配置
├── radar-data.js                        ← 数据（脚本会覆盖它）
├── history/                             ← 每日快照（脚本自动创建）
├── index.html
└── rank.html
```

**第 2 步：开启 Actions 写权限**

仓库 → Settings → Actions → General → Workflow permissions
选 **Read and write permissions** → Save。

不开这一步，最后提交数据会失败（403）。

**第 3 步：手动跑一次**

Actions 标签页 → 左侧「更新 GitHub 飙升雷达」→ Run workflow。

- 第一次跑会生成 `radar-data.js` 和 `history/今天.json`
- 第一次的增量全是 0，因为还没有前一天的数据可对比
- 之后每天 08:10（北京时间）自动跑

**第 4 步：看结果**

刷新 `index.html`，顶部会出现绿色提示条：
> ✓ 真实数据：来自 GitHub API，抓取于 X 小时前；已积累 N 天历史快照…

前 7 天是黄色提示（增量还在积累），满 7 天后自动变绿。

---

### 方式 B：本机跑（不想用 GitHub Actions）

```powershell
# PowerShell
$env:GITHUB_TOKEN="ghp_你的令牌"
cd C:\Users\Administrator\RaccoonWork\github-radar
node scripts/fetch-radar.mjs
```

先加 `--dry-run` 试跑，只打印结果不写文件：
```powershell
node scripts/fetch-radar.mjs --dry-run --limit=5
```

再挂到 Windows 任务计划程序，每天定时执行同一条命令。
缺点：**电脑关机就不跑**，历史快照会断档，断档期间的增量会失真（脚本取"最近一次可用快照"做差分，间隔会大于 7 天，数值偏大）。

---

## 仓库清单怎么自动获取

改 `radar.config.json` 的 `discovery` 段，不用动代码。

### 按 topic 抓（当前默认）

```json
{
  "discovery": {
    "mode": "topic",
    "topics": ["ai", "llm", "agent", "mcp", "rag", "llmops", "ai-agents"],
    "minStars": 500,
    "pushedWithinDays": 90,
    "perQuery": 40,
    "maxRepos": 120
  }
}
```

实际发出的查询是：
```
topic:ai stars:>=500 pushed:>=2026-08-18 is:public archived:false
```
然后按 star 倒序取前 40 个。多个 topic 合并去重，最后按 `maxRepos` 截断。

**换赛道就改 topics。** 比如关注前端：`["react","vue","svelte","nextjs","typescript"]`；
关注基础设施：`["kubernetes","docker","devops","observability"]`。

topic 名写错不会报错，只是抓不到东西 —— GitHub 对不存在的 topic 返回空结果。先跑 `--dry-run` 看数量最稳。

### 按 star 排行抓

```json
"mode": "stars"
```
不加 topic 限制，直接抓全局 star 最高的活跃项目。适合做"整个开源大盘"的视角。

### 两者合并

```json
"mode": "both"
```
topic 命中的 + 全局 star 最高的，合并去重。
这样既有"小而快涨的新苗"，也有"大而稳的头部"，四象限图才有意义。

### 知名项目怎么标

不写死名单，按 star 自动判定：
```json
"knownThreshold": 50000
```
star ≥ 5 万的自动进 `known` 数组，页面上的"知名"标签和「含知名 / 只看知名」筛选都基于它。

---

## 为什么第一次跑增量全是 0

GitHub 的 API **只给当前 star 总数，不提供历史增长**。所以日增必须这样做：

```
今天的 star 数 − 昨天存下的 star 数 = 今天的增量
```

- 第 1 天：只有 1 份快照，没有"昨天"，增量 = 0
- 第 2 天：有 2 份，日增有真实值；7 天/30 天仍为 0
- 第 8 天：近 7 天增量变成真实值
- 第 31 天：30 天增量变成真实值

脚本不做任何"补数"或"猜数"。历史不够就是 0，页面上会明确写"数据积累中"，不会让你误以为项目没涨。

`history/` 下的每日文件就是这些快照，**必须一起提交到仓库**，否则 Actions 每次都是全新环境，永远凑不出第二天。

---

## API 配额够不够

- 带 token：**5,000 次/小时**
- 不带 token：60 次/小时（不够用，所以必须配 token）

本项目的消耗（`maxRepos: 120` 时）：

| 操作 | 次数 |
|---|---|
| topic 搜索（7 个 topic × 最多 2 页） | ≤ 14 |
| 全局 star 搜索（mode=both 时） | 1 |
| 每个仓库取最新 release | 120 |
| **合计** | **≈ 135 次** |

远低于 5,000。搜索接口另有 **30 次/分钟** 的独立限制，脚本里每次搜索间隔 2.2 秒，不会触发。

Actions 里的 `GITHUB_TOKEN` 是自动注入的，**不需要你手动配置 secret**。方式 B 才需要自己生成 PAT（Settings → Developer settings → Personal access tokens，勾 `public_repo` 即可，只读公开数据）。

---

## 验证数据是真的

任选一个仓库，对照 GitHub 页面：

1. 打开 `radar-data.js`，找 `"full_name": "xxx/yyy"` 的 `stars` 值
2. 打开 `https://github.com/xxx/yyy`，看右上角 star 数
3. 两者应该一致（允许几小时的抓取延迟）

增量类数据要等第二天才能核对：今天的 `stars` 减去 `history/昨天.json` 里同一仓库的值，应等于页面上显示的日增。

---

## 常见问题

**Q：Actions 跑成功了，但页面数据没变？**
浏览器缓存。强制刷新（Ctrl+F5）。

**Q：提示 403 提交失败？**
没开 Read and write permissions，见方式 A 第 2 步。

**Q：抓到的仓库数量比预期少很多？**
`minStars` 太高或 `pushedWithinDays` 太短。先跑 `--dry-run` 看实际命中数，再调。

**Q：想加中文概要怎么办？**
GitHub 的 `description` 多为英文。脚本目前直接用原文。要中文需要额外接翻译，我建议另做一步，不要塞进采集脚本里（会拖慢、也会让数据来源变复杂）。

**Q：能抓到 star 历史曲线吗？**
可以，用 `/repos/{owner}/{repo}/stargazers` 带 `Accept: application/vnd.github.star+json` 翻页拿每个 star 的时间戳。但一个 10 万 star 的仓库要翻 1000 页，配额瞬间耗尽。**不推荐**，每日快照差分是唯一现实做法。
