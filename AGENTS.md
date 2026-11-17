# Repository development rules

- Keep every code identifier, package/crate name, file name, directory name, database name, bundle identifier, URL scheme, and native target name brand-neutral. Name implementation elements by domain or responsibility instead of any current or former product name.
- Product or brand names may appear only in user-visible copy, installer metadata, release artifact names, and product documentation.
- Isolate compatibility with historical identifiers inside explicitly named migration helpers. Do not reuse historical naming in new business logic.
- Run the repository-wide naming scan and the full test/build checks before committing a refactor or feature.
- Before any feature or functional change is pushed or merged to `main`, update `docs/BluNote-v1.0-产品需求文档.md` in the same change. Record the requirement/iteration mapping, implementation status, document update date, document revision, and application version. A functional `main` update without this documentation is not permitted.
- Follow YAGNI (You Aren't Gonna Need It) during development: implement only requirements that are currently approved, in scope, and verifiable. Do not add speculative abstractions, extension points, configuration, dependencies, compatibility layers, data fields, or infrastructure for hypothetical future needs. Introduce them only when a concrete approved requirement makes them necessary, and prefer the smallest maintainable solution that satisfies the current acceptance criteria. This rule does not justify omitting required tests, security controls, migrations, error handling, accessibility, or documented cross-platform behavior.

## 迭代协作：Codex 与 DSH

- 用户交付具体迭代需求后，由 Codex 负责需求分析、范围划定、任务拆分、实施规划和验收标准，再把明确的目标、允许修改的文件范围、约束和验证命令交给 DSH。讨论协作方式、配置工具或尚未提出具体开发需求时，不启动 DSH 执行业务任务。
- DSH 负责按委派范围实现、补充必要测试并汇报修改与验证结果；仅在该任务已授权写入时使用写入权限。需要并行修改时使用独立工作树或互不重叠的文件范围。DSH 作为执行方直接完成所领任务，不再次派发给自身或其他代理。
- Codex 检查 DSH 的退出状态、最终结果和实际文件差异，独立复核关键测试、构建与验收结果；发现问题时交回 DSH 修正。DSH 无法启动或执行失败时，记录具体原因和未完成事项，不擅自更换执行方。
- 迭代以 `dev` 为开发分支。未获用户明确批准，不合并或推送到 `main`；获得批准后仍需满足本文件的测试、构建和需求文档门禁。功能需求完成后生成 macOS DMG，并报告实际验证范围；用户明确豁免时可跳过打包。
