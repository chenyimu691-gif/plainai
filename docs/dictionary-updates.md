# 每周远程词库更新

PlainAI 保留 WXT/TypeScript 和随扩展安装的内置词库，另加可独立发布的远程数据层。每周更新进入 PR；只有通过检查并合并到 `main` 的数据才部署到 GitHub Pages。扩展下载 JSON 数据，不下载或执行远程代码。

## 更新链路与边界

1. 每周一 **02:00 UTC / 北京时间 10:00**，`Weekly dictionary update` 在默认分支运行；GitHub 可能延迟定时任务，也可以手动运行。
2. 发现器搜索 `technical`、`business`、`finance`、`legal`、`medical`、`science`、`internet`、`education` 八个领域，结果写入 `data/dictionary/discovered.json`。**发现候选不等于许可准入**；采集器只读取已批准的 `sources.json`。
3. 对已批准来源解析当前提交，并从同一提交下载数据和许可证；记录提交、原始定义、固定提交的来源链接、许可证全文哈希及署名。许可证字节改变、来源获取失败或配置缺失时停止本次更新。
4. 规范化和去重后，用生成模型写简短中文解释，再用**另一个配置的模型**复核忠实性、易懂性、领域和安全性。逐条不合格内容进入 `data/dictionary/quarantine.json`；不会作为合格词条发布。接口失败不生成假数据。
5. 校验结构、许可和来源、别名冲突、危险内容、快照及增量一致性，再跑测试、类型检查、Chrome 构建与原验证脚本、Firefox 构建。
6. 只把 `entries.json`、发现报告、隔离报告和 `public/dictionary/` 的变化提交到固定分支 `dictionary/weekly-update`，创建或更新 PR。来源目录和许可证锁定文件不在 bot 的提交白名单内。
7. 合并到 `main` 后，`Publish dictionary` 对已提交数据重新运行验证，再由单独的部署作业发布。失败保留上一次已部署版本。

每次运行最多安排 **100 对生成/复核调用，每个来源最多 25 对**。超过预算的候选保存在隔离报告中，并记录首次延期的 `deferredSince`；后续运行优先处理等待最久的候选，避免前面的候选持续被拒绝而让后面的候选长期得不到处理。

生成、复核分离和程序校验可以减少错误，**不能证明所有解释都正确或构成法律合规意见**。外部文本只作为待处理数据；不执行第三方脚本，不跟随词条中的链接复制其他内容。

## 当前来源与领域覆盖

初始批准来源包括采购词汇（business）、TechTerms（technical）及 Agent Glossary（internet）。证据、固定的审阅提交和候选排除原因见 [`data/dictionary/source-review.md`](../data/dictionary/source-review.md)。

八个领域已有分类、发现与协议支持，**不代表八个领域已有足量、通过审核的词条**。首次远程词库可以为空；配置模型并运行更新后，才会有真实生成并通过复核的新增内容。

新增来源必须通过单独 PR，确认：

- 数据路径本身有明确的复制、改写与再分发许可；GitHub 的公开状态、star 数量或许可证徽章都不够。
- `sources.json` 的解析规则、内容范围证据、署名与许可证全文/哈希准确，第三方引用和外部链接不在提取范围内。
- 自动路径仅接受 `MIT`、`Apache-2.0`、`CC0-1.0`、`CC-BY-4.0`。未知、NC、ND、SA 等许可不会自动纳入；现有 embodiedterms 的 CC BY-NC 4.0 边界保持有效。
- 法律词条必须有适用法域和截至日期，避免把一地或过时规则说成通用规则。医疗高风险内容默认排除，需先批准权威来源与提取范围；具体剂量、个体医疗、法律和金融建议不得自动发布。business 分类也不能规避这些检查。

许可证变化需要重新核实内容范围并在 PR 中更新证据与锁定值。**不要为了让定时任务通过而自动替换许可证哈希。** AI 改写不会消除来源署名或许可义务。

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
2. 在 **Settings → Secrets and variables → Actions** 添加以下 secrets，不要写入仓库、扩展设置或 PR 内容：

   | Secret | 用途 |
   | --- | --- |
   | `DICTIONARY_API_KEY` | 后台生成/复核模型服务密钥 |
   | `DICTIONARY_GENERATOR_MODEL` | 服务真实支持的生成模型名称 |
   | `DICTIONARY_REVIEWER_MODEL` | 独立复核模型名称，必须不同于生成模型 |
   | `DICTIONARY_BOT_TOKEN`（可选） | 受限的 GitHub App 安装令牌或 fine-grained PAT，用于创建能触发 PR CI 的数据 PR；授权本仓库 Contents 和 Pull requests 读写，启用自动合并时另需 Administration 只读以核实分支保护 |

   可选 repository variables：`DICTIONARY_API_BASE`（默认 `https://api.openai.com/v1`）、`DICTIONARY_WIRE_API`（默认 Responses；兼容服务可设为 `chat`）。模型名必须与选定服务匹配。缺少必要密钥或任一模型配置，更新会失败关闭；不会跳过复核。使用 Responses 时请求 `store: false`，不将密钥打包给扩展。

3. 在 **Settings → Pages → Build and deployment** 将 Source 设为 **GitHub Actions**。若该仓库已有 Pages 站点，先确认此部署不会替换正在使用的站点；一个仓库仅有一个 Pages 部署目标，可将本词库发布目录并入现有站点后再启用发布工作流。
4. 检查扩展内固定的 HTTPS 发布地址与仓库 Pages 地址一致。本仓库默认目标是 `https://chenyimu691-gif.github.io/plainai/dictionary/manifest.json`。变更组织、仓库或自定义域名时，需要在代码与扩展主机权限中同步修改并重新构建，不能把任意用户输入地址当作受信任更新源。
5. 设置保护 `main` 的 ruleset/branch protection，要求 PR、禁止强推，并要求 **`Dictionary quality and extension build`** 检查成功。保护来源目录与锁定许可文件的审阅流程；定时任务不会自动批准新来源。
6. 合并实现 PR 后先手动运行 `Publish dictionary`，确认成功的 Pages deployment，并访问 manifest 的 HTTPS 地址。再手动运行 `Weekly dictionary update`，审阅首个数据 PR 的来源、复核记录和隔离报告；合并后确认新的版本号与部署成功。

未配置 Pages、Pages 权限受组织策略限制、部署环境需要人工审批，都会使发布停在相应步骤。扩展此时仍使用内置词库或上次可用缓存。

### 自动合并的明确条件

默认只创建数据 PR。若希望检查通过后自动合并，需要同时配置：

- 上述 App/PAT secret `DICTIONARY_BOT_TOKEN`，使 bot 创建的 PR 正常触发 PR 检查；
- 仓库 **Allow auto-merge**、squash merge；
- 为默认分支配置传统 **branch protection**：要求通过 PR 合并，必需检查含 **`Dictionary quality and extension build`**，启用 **Require branches to be up to date before merging**，保护也适用于管理员，且没有用户、团队或 App 的审批绕过名单。希望自动检查通过后自动发布时，可将必需人工审批数设为 **0**；若配置为大于 0，还须启用代码变化后撤销旧审批，并等待对应人工审批；
- bot 令牌具备本仓库 **Administration: read** 权限，用于读取保护设置，不授予修改分支保护的权限；
- repository variable **`DICTIONARY_AUTO_MERGE=true`**。

请求合并前，`merge-guard.ts` 从 GitHub API 核实以上保护条件。保护缺失、权限不足、网络/解析失败或绕过设置不明确时，跳过自动合并，保留数据 PR 供人工处理。仅用 ruleset 配置保护的仓库也保守地走人工合并；当前 guard 只验证传统 branch protection。

只有 guard 通过后，工作流才对它自己创建的数据 PR 请求 `gh pr merge --auto --squash`，并等待必需检查及仓库配置的审批条件。不使用管理员绕过参数，不合并本次实现 PR。`--auto` 本身不能防止未保护分支立即合并，因此不能省略这一步保护验证。

只用默认 `GITHUB_TOKEN` 创建 PR 时，GitHub 通常会抑制由该令牌引发的新工作流运行，**PR CI 不会自动启动**。虽然定时作业在创建 PR 前已运行同样的验证，受保护分支所需的 PR 检查仍可能等待；不要因此关闭分支保护。使用正确授权的 App/PAT，或由维护者在可信上下文处理后续验证。

## 本地操作与排错

运行环境为 **Node.js 24**，继续使用项目的 npm/WXT 工具链。无需为更新功能部署新的常驻服务器。

```bash
npm ci
npm test                       # 离线测试，无需模型密钥
npm run dictionary:probe        # 联网验证批准来源与许可，不调用模型
npm run dictionary:discover     # 联网发现候选，不会批准新来源
npm run dictionary:update       # 联网采集 + 生成 + 独立复核 + 数据产物
npm run dictionary:verify       # 校验已提交来源、词条、快照与增量
npm run dictionary:build        # 校验后暂存发布内容到 .dictionary-site/dictionary/
npm run compile
npm run build
node scripts/verify.cjs
npm run build:firefox
```

本地更新命令从进程环境读取同名配置。不要把密钥写进命令历史、演示截图或调试日志；线上建议用 Actions Secrets。GitHub 搜索可用 `GITHUB_TOKEN` 读取 API，模型密钥与 GitHub 令牌用途不同。

| 现象 | 检查位置与处理 |
| --- | --- |
| 定时任务没有出现 | 工作流是否已经在默认分支；仓库 Actions 是否启用；GitHub 可能延迟任务或停用长期无活动公共仓库的 schedule，可手动运行 |
| 配置/模型请求失败 | Actions 失败步骤；核对 secret 是否存在、模型是否真实可用、接口和配额；不要输出完整请求头 |
| 许可哈希变化 | 对照上游同提交许可证与范围证据，单独提交人工审阅 PR；不自动更新许可锁 |
| 找到候选却没有新增词条 | `discovered.json` 仅是发现结果；检查批准来源、去重、模型复核与 `quarantine.json` |
| 数据 PR 的 CI 没运行 | 是否使用默认 GITHUB_TOKEN；参见上面的自动合并条件 |
| 合并后远程未更新 | `Publish dictionary` 的验证、Pages source、部署权限与环境审批；失败不会发布新版本 |
| 浏览器仍显示旧词库 | 后台每日检查，或扩展重启后检查；核对固定发布地址、网络可达性与版本号，失败保留旧缓存 |

## 扩展端同步与用户隐私

后台在安装、启动及每日 alarm 检查固定 HTTPS manifest；网页查词只读取本地缓存。优先下载与本地版本匹配的增量；没有可用增量时下载完整快照。服务保留最近八个 delta，旧客户端可以回退快照。

下载受超时、体积、路径、重定向、结构、许可、版本和 SHA-256 校验约束。拒绝版本回滚和同版内容替换；整份可用缓存作为一个 `storage.local` 对象提交，下载中断或校验失败保留旧缓存，首次离线仍用内置词库。内置词条及别名优先，不被远程数据覆盖。新增的在线词条显示来源、许可和改写记录。

SHA-256 检查防止内容损坏并验证增量结果，不构成数字签名；发布源的可信性依赖固定 HTTPS 地址和仓库访问保护。每次更新会让托管方看到普通下载请求和 IP，但不发送浏览页面、页面文本、查词历史或用户的模型密钥。每周数据生成在维护者的 Actions 中完成，与用户可选的网页 AI 兜底分开。

## 文件分工

| 路径 | 用途 |
| --- | --- |
| `data/dictionary/sources.json`、`licenses/`、`source-review.md` | 人工批准的来源、许可全文/锁与范围证据 |
| `data/dictionary/discovered.json` | 八领域的候选发现报告，不参与自动批准 |
| `data/dictionary/entries.json` | 已通过检查的远程词条与逐条来源、模型复核记录 |
| `data/dictionary/quarantine.json` | 未通过逐条质量检查的候选与原因 |
| `public/dictionary/` | 版本化 manifest、快照和增量；由脚本生成，勿手改 |
| `.dictionary-site/dictionary/` | 校验后的 Pages 暂存目录，不提交构建缓存 |
| `.github/workflows/dictionary-*.yml` | 不带密钥的 PR 检查、可信定时更新、主分支发布 |

GitHub Actions 的第三方 action 固定到完整提交 SHA；本实现使用的 SHA 在实现时通过 GitHub 的 commits API 核实。更新这些依赖时仍须通过普通代码 PR 和测试，不在定时数据任务中自动升级。
