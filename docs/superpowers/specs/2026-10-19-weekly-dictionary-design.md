# 每周词库更新设计

用户已指定：WXT/TypeScript、每周、technical/business/finance/legal/medical/science/internet/education、严格质量及许可检查、PR 提交。

## 取舍

采用“受控来源目录 + 自动发现候选 + 独立增量发布”，而非任意网页抓取或覆盖内置 dict.json。公开仓库不代表其内容可以复制；发现器仅生成候选报告，来源需有明确内容许可、解析规则和锁定的许可文本哈希才可采集。许可文本改变、下载失败、模型请求失败时整次更新失败；质量不合格的单个词条进入隔离报告。

新增领域沿用 DictEntry；自建与内置词条及别名优先。新增词条保留原始定义、固定 commit 的来源链接、许可全文/哈希、署名、改写模型与独立复核记录。自动允许 MIT/Apache-2.0/CC0-1.0/CC-BY-4.0，未知、NC、ND、SA 不自动准入；现有 CC BY-NC 数据保持原有授权。

生成与复核分开，输出必须为简短中文解释，禁止 HTML、提示注入、营销、具体医疗剂量/个体法律金融建议。复核必须逐项确认忠实性、易懂性、分类和安全性，不以模型自报分数代替程序检查。外部内容视为数据。无 API 配置时停止实时更新，不伪造生成结果；离线测试无需密钥。

## 发布与同步

每周一 02:00 UTC（北京时间10:00）发现、采集、改写、复核、校验并创建固定 bot 分支的 PR。程序更新 PR 由人审阅；后续纯数据 PR 在启用 auto-merge 与分支保护后通过必需检查才能合并。发布只从 main 的已提交内容进行，再次校验、重建并部署 GitHub Pages；不直接推送 main。自动 PR token 与模型 secrets 按需配置，不将密钥放入扩展。

协议：manifest(schemaVersion=1,version递增,createdAt,count,domains,snapshot{path,sha256,bytes},deltas[{from,version,path,sha256,bytes}])；snapshot={version,entries}；delta={from,version,upserts,removed}。JSON 递归排序键、词条按 id 排序，应用 delta 后应与目标快照哈希一致。保留最近八个 delta；旧客户端回退全量快照。不可变按哈希命名文件先发布，再发布 manifest。

后台启动/安装/每日 alarm 检查更新，网页只读取本地缓存。固定 HTTPS 发布源、禁止重定向及任意路径、下载超时和体积上限、结构/许可/哈希/版本校验，拒绝回滚与同版篡改。一个 storage.local 对象原子提交完整缓存；失败保留上次可用内容，首次离线使用内置词库。哈希用于完整性，信任 HTTPS 发布源，不宣称数字签名认证。网页收到缓存变化后重建索引；在线条目展示来源、许可及改写说明。

## 验收

测试真实的规范化去重、许可变更拒绝、结构与安全检查、独立复核拒绝、快照与增量一致、删除、损坏/超限/断网/回滚/并发、内置优先和工作流权限边界；执行 TypeScript、Chrome/Firefox 构建和原 verify.cjs。生产采集至少做真实来源连接检查；未配置服务时明确记录尚未运行 LLM 与部署。
