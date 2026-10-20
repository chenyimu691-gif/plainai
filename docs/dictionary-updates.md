# 每周远程词库更新

PlainAI 保留 WXT/TypeScript 和随扩展安装的内置词库，另加可独立发布的远程数据层。每周更新进入 PR；只有通过检查并合并到 `main` 的数据才部署到 GitHub Pages。扩展下载 JSON 数据，不下载或执行远程代码。

## 更新链路与边界

1. 每周一 **02:00 UTC / 北京时间 10:00**，`Weekly dictionary update` 在默认分支运行；GitHub 可能延迟定时任务，也可以手动运行。
2. 发现器搜索 `technical`、`business`、`finance`、`legal`、`medical`、`science`、`internet`、`education` 八个领域，结果写入 `data/dictionary/discovered.json`。**发现候选不等于许可准入**；采集器只读取已批准的 `sources.json`。
3. 对已批准来源解析当前提交，并从同一提交下载数据和许可证；记录提交、原始定义、固定提交的来源链接、许可证全文哈希及署名。许可证字节改变、来源获取失败或配置缺失时停止本次更新。
4. 默认使用 `source-copy` 模式：仅收录来源已有的简短中文解释，保留原文，不调用模型，不要求逐条人工审核。程序检查中文占比、长度、原文一致性、占位符、危险内容、领域上下文与许可。英文定义、超长解释及不合格内容进入 `data/dictionary/quarantine.json`；没有中文内容时不新增词条，也不假造翻译。
5. 校验结构、许可和来源、别名冲突、危险内容、快照及增量一致性，再跑测试、类型检查、Chrome 构建与原验证脚本、Firefox 构建。
6. 只把 `entries.json`、发现报告、隔离报告和 `public/dictionary/` 的变化提交到固定分支 `dictionary/weekly-update`，创建或更新 PR。来源目录和许可证锁定文件不在 bot 的提交白名单内。
7. 配置好下述 GitHub 自动合并条件后，数据 PR 等待必需 CI 成功，再自动合并。`Publish dictionary` 对合并到 `main` 的数据重新验证，由单独的部署作业发布。失败保留上一次已部署版本。

默认每次最多发布 3,000 条远程词条，模型调用数为零。词条的 `quality.method` 为 `source-copy`，只记录程序检查及时间，不伪造人工或模型审核记录。程序检查不能证明语义准确或解释足够通俗。外部文本只作为数据；不执行第三方脚本，不跟随词条中的链接复制其他内容。

## 当前来源与领域覆盖

初始批准来源包括采购词汇（business）、TechTerms（technical）及 Agent Glossary（internet）。证据、固定的审阅提交和候选排除原因见 [`data/dictionary/source-review.md`](../data/dictionary/source-review.md)。

八个领域已有分类、发现与协议支持，**不代表八个领域已有词条**。目前这三个来源主要为英文；默认无模型模式会隔离英文定义，因此当前远程词库仍为空，不能把它们宣传成已上线的中文词库。新增明确授权的中文来源后，符合检查的解释才会进入自动更新。

新增来源必须通过单独 PR，确认：

- 数据路径本身有明确的复制、改写与再分发许可；GitHub 的公开状态、star 数量或许可证徽章都不够。
- `sources.json` 的解析规则、内容范围证据、署名与许可证全文/哈希准确，第三方引用和外部链接不在提取范围内。
- 自动路径仅接受 `MIT`、`Apache-2.0`、`CC0-1.0`、`CC-BY-4.0`。未知、NC、ND、SA 等许可不会自动纳入；现有 embodiedterms 的 CC BY-NC 4.0 边界保持有效。
- 法律词条必须有适用法域和截至日期，避免把一地或过时规则说成通用规则。医疗高风险内容默认排除，需先批准权威来源与提取范围；具体剂量、个体医疗、法律和金融建议不得自动发布。business 分类也不能规避这些检查。

许可证变化需要重新核实内容范围并在 PR 中更新证据与锁定值。**不要为了让定时任务通过而自动替换许可证哈希。** 新来源及许可变更仍通过单独的维护 PR 准入；这是来源管理，不是每周新增词条的逐条人工审核。

### 许可证迁移

仅许可证、许可范围证据或署名改变且来源身份不变时，可在单独的人工审阅 PR 中迁移：

1. 保存旧许可证全文，逐字节保留原文件；将原 `license` 的完整元数据（`spdx`、可选 `path`、`textPath`、`sha256`、`attribution`、`scopeEvidence`）复制到 `licenseHistory` 的一项中。
2. 为该项补充人工核实的 `revisions` 数组，只列出确实使用这份旧许可的 **40 位提交 SHA**；从待保留词条及增量基线的来源证据逐个核对，不能用分支、标签、范围或通配符代替。示意：`{ ...previousLicense, revisions: ['fcfcadae0140ebe1b94b8cfc32ad6c6cee5d7d96'] }`，其中 `previousLicense` 必须是迁移前的完整批准记录。
3. 将重新审阅的新许可全文存为另一个文件，并更新当前 `license` 的路径、完整文件哈希、署名及内容范围证据。PR 应解释新旧许可与适用提交，不自动推导或扩大历史批准范围。
4. 运行 `npm test`、`npm run dictionary:verify`、`npm run dictionary:build` 和扩展构建。扩展的 `dictionary-NOTICES.txt` 与 Pages 的 `THIRD_PARTY_NOTICES.txt` 都包含当前及历史完整许可；Pages 的历史全文另存为 `licenses/<source-id>-<sha256>.txt`。

`licenseHistory` 只用于验证已批准旧提交的现有证据，采集器始终使用当前 `license` 校验新采集内容。旧哈希未登记、提交不在该历史项的明确批准列表内、完整许可缺失或哈希不符时，验证仍会失败。当前词条或保留的快照、增量基线仍引用历史许可时，必须保留相应历史项和全文。

仓库、数据路径、领域或法域/截至日期等 `context` 改变时，应分配新的来源 ID；`licenseHistory` 不会迁移来源身份。旧来源仍被现有词条或保留快照引用时，保留原记录并设置 `enabled: false`，同时保留其许可历史和全文，以便验证旧证据。

## 仓库维护者首次启用

此实现的 PR 合并前不会启动默认分支定时任务。实际采集和部署还需要以下仓库配置；仅提交代码不等于已经上线。

1. 在 **Settings → Actions → General** 启用 GitHub Actions，并允许 GitHub Actions 创建和批准 pull request。工作流自身只请求需要的权限；这里的开关不会代替分支保护。
2. 无需添加模型 Secrets。无人值守发布需要在 **Settings → Secrets and variables → Actions** 添加 `DICTIONARY_BOT_TOKEN`：使用只授权本仓库的 fine-grained PAT，授予 **Contents: read/write**、**Pull requests: read/write**、**Administration: read**。不需要修改分支保护的权限。令牌只用于数据 PR、读取保护设置和请求自动合并；不要写入仓库、扩展或 PR 内容。也可由单独的 GitHub App 令牌生成步骤提供短期安装令牌；把会过期的安装令牌直接长期放进 Secret 不适合每周运行。

3. 在 **Settings → Pages → Build and deployment** 将 Source 设为 **GitHub Actions**。若该仓库已有 Pages 站点，先确认此部署不会替换正在使用的站点；一个仓库仅有一个 Pages 部署目标，可将本词库发布目录并入现有站点后再启用发布工作流。
4. 检查扩展内固定的 HTTPS 发布地址与仓库 Pages 地址一致。本仓库默认目标是 `https://chenyimu691-gif.github.io/plainai/dictionary/manifest.json`。变更组织、仓库或自定义域名时，需要在代码与扩展主机权限中同步修改并重新构建，不能把任意用户输入地址当作受信任更新源。
5. 按下一节配置传统 branch protection 与仓库自动合并，必需检查为 **`Dictionary quality and extension build`**。定时任务不会修改分支保护，也不会自动批准新来源。
6. 合并实现 PR 后运行一次 `Publish dictionary`，确认成功的 Pages deployment，并访问 manifest 的 HTTPS 地址。再运行一次 `Weekly dictionary update`，确认数据 PR 的 CI、自动合并和发布链路。以后每周自动运行，不需要逐条人工审核。当前没有合格中文新增词条时，版本保持不变。

未配置 Pages、Pages 权限受组织策略限制、部署环境需要人工审批，都会使发布停在相应步骤。扩展此时仍使用内置词库或上次可用缓存。

### 自动合并的明确条件

每周工作流默认请求受保护的自动合并，需要先完成一次性配置：

- 上述 App/PAT secret `DICTIONARY_BOT_TOKEN`，使 bot 创建的 PR 正常触发 PR 检查；
- 仓库 **Allow auto-merge**、squash merge；
- 为默认分支配置传统 **branch protection**：要求通过 PR 合并，必需检查含 **`Dictionary quality and extension build`**，启用 **Require branches to be up to date before merging**，保护也适用于管理员，且没有用户、团队或 App 的审批绕过名单。必需人工审批数设为 **0**；
- bot 令牌具备本仓库 **Administration: read** 权限，用于读取保护设置，不授予修改分支保护的权限；
- `DICTIONARY_AUTO_MERGE` 无需配置；如需暂停自动合并，设为 **`false`**。

请求合并前，`merge-guard.ts` 从 GitHub API 核实以上保护条件。保护缺失、人工审批数大于 0、权限不足、网络/解析失败或绕过设置不明确时，跳过自动合并，数据 PR 保持未发布。修复配置后重新运行工作流；不会把逐条人工审核作为默认补救流程。当前 guard 只验证传统 branch protection，仅有 ruleset 不足以启用此路径。

只有 guard 通过后，工作流才对它自己创建的数据 PR 请求 `gh pr merge --auto --squash`，等待必需检查。不使用管理员绕过参数，不合并本次实现 PR。`--auto` 本身不能防止未保护分支立即合并，因此不能省略保护验证。

只用默认 `GITHUB_TOKEN` 创建 PR 时，GitHub 通常会抑制由该令牌引发的新工作流运行，**PR CI 不会自动启动**，因此本工作流在没有 bot 令牌时不请求自动合并。不要为消除等待而关闭分支保护；应完成上面的令牌配置。

## 本地操作与排错

运行环境为 **Node.js 24**，继续使用项目的 npm/WXT 工具链。无需为更新功能部署新的常驻服务器。

```bash
npm ci
npm test                       # 离线测试，无需模型密钥
npm run dictionary:probe        # 联网验证批准来源与许可，不调用模型
npm run dictionary:discover     # 联网发现候选，不会批准新来源
npm run dictionary:update       # 联网采集原有中文 + 程序检查，无需模型
npm run dictionary:verify       # 校验已提交来源、词条、快照与增量
npm run dictionary:build        # 校验后暂存发布内容到 .dictionary-site/dictionary/
npm run compile
npm run build
node scripts/verify.cjs
npm run build:firefox
```

GitHub 搜索可用 `GITHUB_TOKEN` 读取 API；默认更新不读取模型密钥。

### 可选模型模式

保留原有双模型路径供以后使用：仅在本地显式设置 `DICTIONARY_MODE=ai` 才启用。还需从环境提供 `DICTIONARY_API_KEY`、`DICTIONARY_GENERATOR_MODEL`、`DICTIONARY_REVIEWER_MODEL`，两个模型名必须不同。可选 `DICTIONARY_API_BASE` 和 `DICTIONARY_WIRE_API`（默认 Responses，也支持 `chat`）；Responses 请求使用 `store: false`。每次最多 100 对生成/复核调用、每来源最多 25 对，超额候选记录等待时间，下次优先处理。不配置模型不影响默认更新。不要把密钥写进命令历史、截图或日志；每周工作流固定使用 `source-copy`，不会意外启用收费调用。

| 现象 | 检查位置与处理 |
| --- | --- |
| 定时任务没有出现 | 工作流是否已经在默认分支；仓库 Actions 是否启用；GitHub 可能延迟任务或停用长期无活动公共仓库的 schedule，可手动运行 |
| 自动合并跳过 | 检查 bot 令牌、传统分支保护、必需 CI、零人工审批数以及 auto-merge 开关 |
| 许可哈希变化 | 对照上游同提交许可证与范围证据，单独提交人工审阅 PR；不自动更新许可锁 |
| 找到候选却没有新增词条 | `discovered.json` 仅是发现结果；默认只接受原有中文解释，检查来源、去重、长度/安全检查与 `quarantine.json` |
| 数据 PR 的 CI 没运行 | 是否使用默认 GITHUB_TOKEN；参见上面的自动合并条件 |
| 合并后远程未更新 | `Publish dictionary` 的验证、Pages source、部署权限与环境审批；失败不会发布新版本 |
| 浏览器仍显示旧词库 | 后台每日检查，或扩展重启后检查；核对固定发布地址、网络可达性与版本号，失败保留旧缓存 |

## 扩展端同步与用户隐私

后台在安装、启动及每日 alarm 检查固定 HTTPS manifest；网页查词只读取本地缓存。优先下载与本地版本匹配的增量；没有可用增量时下载完整快照。服务保留最近八个 delta，旧客户端可以回退快照。

下载受超时、体积、路径、重定向、结构、许可、版本和 SHA-256 校验约束。拒绝版本回滚和同版内容替换；整份可用缓存作为一个 `storage.local` 对象提交，下载中断或校验失败保留旧缓存，首次离线仍用内置词库。内置词条及别名优先，不被远程数据覆盖。新增的在线词条显示来源、许可，并区分原文采集或模型改写。

SHA-256 检查防止内容损坏并验证增量结果，不构成数字签名；发布源的可信性依赖固定 HTTPS 地址和仓库访问保护。每次更新会让托管方看到普通下载请求和 IP，但不发送浏览页面、页面文本、查词历史或用户的模型密钥。

### 行业 / 方向多选

设置页最上方的“我需要解释的行业 / 方向”支持多选，自动保存到本机 `plainai_dictionary_categories`。默认保持原有四类（具身智能、机器人、AI/机器学习、通用/职场）；八个新增行业由用户按需勾选，不会自动扩大启用范围。每类显示合并去重后本机可用的词条数，没有数据的显示“暂无词条”。

选项同时作用于内置和远程词库。后台仅向网页提供已选分类；后台不可用时，内置词库回退也遵守相同选择。分类变化或远程同步后，已打开网页会移除旧标记、重建索引并扫描，无需刷新。全部取消后不再标注，也不自动标注库外英文缩写。全部数据仍缓存供离线使用；这是查词范围选择，不是分行业下载。

## 文件分工

| 路径 | 用途 |
| --- | --- |
| `data/dictionary/sources.json`、`licenses/`、`source-review.md` | 人工批准的来源、许可全文/锁与范围证据 |
| `data/dictionary/discovered.json` | 八领域的候选发现报告，不参与自动批准 |
| `data/dictionary/entries.json` | 已通过检查的远程词条与来源、采集方式及程序检查记录 |
| `data/dictionary/quarantine.json` | 未通过逐条质量检查的候选与原因 |
| `public/dictionary/` | 版本化 manifest、快照和增量；由脚本生成，勿手改 |
| `.dictionary-site/dictionary/` | 校验后的 Pages 暂存目录，不提交构建缓存 |
| `.github/workflows/dictionary-*.yml` | 不带密钥的 PR 检查、可信定时更新、主分支发布 |

GitHub Actions 的第三方 action 固定到完整提交 SHA；本实现使用的 SHA 在实现时通过 GitHub 的 commits API 核实。更新这些依赖时仍须通过普通代码 PR 和测试，不在定时数据任务中自动升级。
