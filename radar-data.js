/* ============================================================
   GitHub 飙升雷达 · 唯一数据源（Raw Source of Truth）
   ------------------------------------------------------------
   约定：
   1. 本文件是全站唯一原始数据，index.html（数据大屏）与
      rank.html（榜单与筛选）都只读取这里的数据，不再各自内嵌。
   2. 页面里展示的所有「总量 / 合计 / 百分比 / 排名 / 覆盖度」
      都由页面脚本从这里现算，不在任何地方手写第二份。
   3. 接入真实数据：用你后端返回的同名字段替换下面常量即可，
      字段名保持不变，两页无需改动。
   4. 本文件数据为演示用（非实时），请勿直接用于生产决策。
   ============================================================ */

window.RADAR_DATA = {
  /* 数据版本信息：快照日 = 本次采集对应的 GitHub 数据日 */
  meta: {
    snapshot_day: "2026-11-15",
    sync_at: "2026-11-16T06:20:00+08:00",
    source: "演示数据（结构对齐 GitHub REST API 字段）"
  },

  /* 采集口径：进入统计池的门槛，页面会原样展示，避免口径含糊 */
  scope: {
    min_stars: 50,
    active_within_years: 3
  },

  /* 每周维度标签：weekly 数组按此顺序对应 W44 → W47 */
  weeks: ["W44", "W45", "W46", "W47"],

  /* 知名项目：用于「含知名 / 只看知名」筛选与「知名」标签 */
  known: [
    "microsoft/vscode", "facebook/react", "torvalds/linux",
    "rust-lang/rust", "vuejs/vue", "sindresorhus/awesome", "puppeteer/puppeteer"
  ],

  /* 在库项目：一条 = 一个仓库。
     stars    当前 star 总量
     gain     快照日（当天）新增 star
     gain_7d  近 7 天新增 star
     gain_30d 近 30 天新增 star
     weekly   过去 4 周各自新增 star（顺序同 weeks）
  */
  repos: [
    { full_name:"microsoft/vscode", lang:"TypeScript", license_spdx:"MIT", stars:168000, forks:29400, gain:186, gain_7d:1240, gain_30d:5100, summary:"Visual Studio Code 源码仓库", latest_version:"1.95.0", latest_release_at:"2026-11-06T10:00:00Z", repo_updated_at:"2026-11-15T08:00:00Z", weekly:[120,180,210,186] },
    { full_name:"facebook/react", lang:"JavaScript", license_spdx:"MIT", stars:224000, forks:45600, gain:142, gain_7d:980, gain_30d:3900, summary:"用于构建用户界面的 JavaScript 库", latest_version:"19.0.0", latest_release_at:"2026-11-01T09:00:00Z", repo_updated_at:"2026-11-15T06:00:00Z", weekly:[90,150,160,142] },
    { full_name:"torvalds/linux", lang:"C", license_spdx:"GPL-2.0", stars:178000, forks:52800, gain:98, gain_7d:620, gain_30d:2400, summary:"Linux 内核源码树", latest_version:"6.12", latest_release_at:"2026-11-04T12:00:00Z", repo_updated_at:"2026-11-15T09:00:00Z", weekly:[110,88,120,98] },
    { full_name:"o3de/o3de", lang:"C++", license_spdx:"Apache-2.0", stars:8200, forks:2100, gain:210, gain_7d:890, gain_30d:3100, summary:"开放 3D 引擎，模块化实时 3D 开发平台", latest_version:"24.09", latest_release_at:"2026-10-30T08:00:00Z", repo_updated_at:"2026-11-14T20:00:00Z", weekly:[60,120,180,210] },
    { full_name:"shadcn-ui/ui", lang:"TypeScript", license_spdx:"MIT", stars:76000, forks:4900, gain:320, gain_7d:2100, gain_30d:7400, summary:"可复制粘贴的 React 组件集合", latest_version:"2.1.0", latest_release_at:"2026-11-10T14:00:00Z", repo_updated_at:"2026-11-15T07:00:00Z", weekly:[180,240,300,320] },
    { full_name:"ollama/ollama", lang:"Go", license_spdx:"MIT", stars:98000, forks:7600, gain:410, gain_7d:2600, gain_30d:9200, summary:"本地运行大语言模型，一键启动", latest_version:"0.5.1", latest_release_at:"2026-11-12T16:00:00Z", repo_updated_at:"2026-11-15T05:00:00Z", weekly:[260,310,380,410] },
    { full_name:"browser-use/browser-use", lang:"Python", license_spdx:"MIT", stars:52000, forks:3800, gain:540, gain_7d:3400, gain_30d:11800, summary:"让 AI 智能体操控真实浏览器", latest_version:"0.4.0", latest_release_at:"2026-11-13T11:00:00Z", repo_updated_at:"2026-11-15T04:00:00Z", weekly:[300,380,460,540], is_new:true },
    { full_name:"lobehub/lobe-chat", lang:"TypeScript", license_spdx:"Apache-2.0", stars:44000, forks:9800, gain:96, gain_7d:640, gain_30d:2200, summary:"开源现代化 AI 聊天框架", latest_version:"1.60.0", latest_release_at:"2026-11-11T10:00:00Z", repo_updated_at:"2026-11-15T03:00:00Z", weekly:[70,88,110,96] },
    { full_name:"rust-lang/rust", lang:"Rust", license_spdx:"Apache-2.0", stars:97000, forks:12400, gain:74, gain_7d:480, gain_30d:1800, summary:"Rust 语言主仓库", latest_version:"1.83.0", latest_release_at:"2026-11-08T09:00:00Z", repo_updated_at:"2026-11-15T10:00:00Z", weekly:[80,66,90,74] },
    { full_name:"vuejs/vue", lang:"TypeScript", license_spdx:"MIT", stars:208000, forks:33400, gain:52, gain_7d:340, gain_30d:1300, summary:"渐进式 JavaScript 框架", latest_version:"3.5.13", latest_release_at:"2026-11-02T08:00:00Z", repo_updated_at:"2026-11-14T18:00:00Z", weekly:[60,48,70,52] },
    { full_name:"ggerganov/llama.cpp", lang:"C++", license_spdx:"MIT", stars:76000, forks:11000, gain:280, gain_7d:1800, gain_30d:6400, summary:"LLM 本地推理，纯 C/C++ 实现", latest_version:"b4000", latest_release_at:"2026-11-09T12:00:00Z", repo_updated_at:"2026-11-15T02:00:00Z", weekly:[200,240,260,280] },
    { full_name:"sindresorhus/awesome", lang:"Shell", license_spdx:"CC0-1.0", stars:330000, forks:28600, gain:120, gain_7d:760, gain_30d:2900, summary:"Awesome 精选清单合集", latest_version:null, latest_release_at:null, repo_updated_at:"2026-11-14T22:00:00Z", weekly:[90,110,130,120] },
    { full_name:"ziglang/zig", lang:"Zig", license_spdx:"MIT", stars:34000, forks:2500, gain:88, gain_7d:560, gain_30d:2000, summary:"通用编程语言与工具链", latest_version:"0.13.0", latest_release_at:"2026-11-05T09:00:00Z", repo_updated_at:"2026-11-15T01:00:00Z", weekly:[70,92,80,88] },
    { full_name:"pola-rs/polars", lang:"Rust", license_spdx:"Apache-2.0", stars:29000, forks:1700, gain:130, gain_7d:820, gain_30d:2800, summary:"极快的多线程 DataFrame 库", latest_version:"1.15.0", latest_release_at:"2026-11-14T07:00:00Z", repo_updated_at:"2026-11-15T11:00:00Z", weekly:[100,118,126,130] },
    { full_name:"danielgatis/rembg", lang:"Python", license_spdx:"MIT", stars:18000, forks:2400, gain:64, gain_7d:420, gain_30d:1500, summary:"图像背景移除工具", latest_version:"2.0.60", latest_release_at:"2026-11-07T13:00:00Z", repo_updated_at:"2026-11-14T19:00:00Z", weekly:[50,58,70,64] },
    { full_name:"khoj-ai/khoj", lang:"Python", license_spdx:"AGPL-3.0", stars:26000, forks:1700, gain:160, gain_7d:1020, gain_30d:3600, summary:"AI 第二大脑，检索与对话", latest_version:"1.34.0", latest_release_at:"2026-11-12T09:00:00Z", repo_updated_at:"2026-11-15T00:00:00Z", weekly:[120,140,150,160] },
    { full_name:"honojs/hono", lang:"TypeScript", license_spdx:"MIT", stars:21000, forks:640, gain:110, gain_7d:700, gain_30d:2400, summary:"超快、轻量的 Web 框架", latest_version:"4.6.8", latest_release_at:"2026-11-13T15:00:00Z", repo_updated_at:"2026-11-14T23:00:00Z", weekly:[88,96,104,110] },
    { full_name:"puppeteer/puppeteer", lang:"TypeScript", license_spdx:"Apache-2.0", stars:89000, forks:9000, gain:58, gain_7d:380, gain_30d:1400, summary:"Node.js 无头浏览器自动化库", latest_version:"23.8.0", latest_release_at:"2026-11-10T12:00:00Z", repo_updated_at:"2026-11-14T21:00:00Z", weekly:[48,56,62,58] },
    { full_name:"biomejs/biome", lang:"Rust", license_spdx:"MIT", stars:16000, forks:520, gain:74, gain_7d:470, gain_30d:1600, summary:"Web 项目格式化与 Lint 工具链", latest_version:"1.9.4", latest_release_at:"2026-11-08T14:00:00Z", repo_updated_at:"2026-11-14T17:00:00Z", weekly:[56,64,70,74] },
    { full_name:"typst/typst", lang:"Rust", license_spdx:"Apache-2.0", stars:34000, forks:980, gain:66, gain_7d:430, gain_30d:1500, summary:"基于标记的新型排版系统", latest_version:"0.12.0", latest_release_at:"2026-11-03T10:00:00Z", repo_updated_at:"2026-11-14T16:00:00Z", weekly:[54,60,64,66] }
  ],

  /* 事实库采集状态：记录每个仓库「历史 star 曲线」是否已抓全。
     缺失的仓库会在大屏的「数据完备度」与「采集缺口」里如实体现。 */
  facts_ready: [
    "microsoft/vscode","facebook/react","torvalds/linux","shadcn-ui/ui",
    "ollama/ollama","browser-use/browser-use","lobehub/lobe-chat","rust-lang/rust",
    "vuejs/vue","ggerganov/llama.cpp","sindresorhus/awesome","ziglang/zig",
    "pola-rs/polars","danielgatis/rembg","khoj-ai/khoj","honojs/hono",
    "puppeteer/puppeteer","biomejs/biome"
  ]
};
