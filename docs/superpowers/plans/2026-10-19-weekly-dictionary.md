# 每周词库更新实施计划

**目标：** 在现有 WXT/TypeScript 下完成可审查的自动更新、发布和增量同步，并提交 PR。

**设计：** ../specs/2026-10-19-weekly-dictionary-design.md。Node 24 原生 TypeScript 脚本，无 Python 服务；离线测试不调用模型。独立副本及 feat/weekly-dictionary-updates 分支，保留其他本地未提交工作。

- [x] 公共协议与质量规则：先写失败测试，再实现 lib/dictionary/remote-schema.ts；扩展 DictEntry 分类及来源字段，内容大小、版本、规范化与合并测试。
- [x] 来源与采集：验证真实授权和固定 commit 访问；实现 sources.json/许可证据、受控 JSON/TypeScript/HTML 适配器、自动候选发现和报告。未知许可不准入，改变哈希必须失败。
- [x] 生成与发布产物：独立模型复核，程序质量门禁、来源台账、跨来源/内置别名去重、隔离失败条目、历史快照与增量、离线重建及一致性测试。
- [x] 扩展同步：后台 alarm/启动检查、限量限时下载、哈希/版本检查、单对象原子缓存、失败回退、设置页同步状态、网页缓存更新和署名。先测试协议失败场景再接入浏览器。
- [x] GitHub Actions：PR CI、每周更新 PR、main 发布 Pages；最小权限、固定 Action SHA、保护模型 secrets，不运行不受信任 PR 的特权代码。
- [x] 本地验收：63 项测试、npm run compile、Chrome/Firefox build、node scripts/verify.cjs 的 13 项检查、dictionary:verify/build 均通过；真实源探测得到 314/65/64 条定义，候选发现得到 40 个未批准项目；原有 NC 数据未修改。

交付方式：推送当前功能分支并创建 GitHub PR，不直接合并 main。初始远程词库为空；仓库模型 Secrets 和 Pages 尚未配置，未运行真实模型生成或在线部署。配置步骤见 ../../dictionary-updates.md。
