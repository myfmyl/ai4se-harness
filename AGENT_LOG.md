# AGENT_LOG.md — Coding Agent Harness 实现日志

## 2026-08-11 — 项目启动（Brainstorming 阶段）

**时间戳：** 19:00-19:45
**技能：** `superpowers:brainstorming` → `superpowers:writing-plans`
**产出：** SPEC.md, PLAN.md, SPEC_PROCESS.md

**关键决策：**
- 语言选 TypeScript（与 Superpowers 同生态）
- LLM 供应选 Anthropic Messages API（裸 API，不依赖框架）
- 重点维度选「反馈闭环」（coding 领域反馈天然客观确定可编码）
- 架构选显式 8 状态状态机（治理和反馈在状态机里最原生）
- Web UI 选 xterm.js 终端模拟器

**关键 prompt/context：** 使用 brainstorming 技能的追问节奏，每次一个问题 + 多选推荐，逐步收敛设计。

**教训：** Brainstorming 对记忆系统和跨平台凭据的讨论不够深入，是后期才补充的。

---

## 2026-08-11 23:15 — Task 1: 项目脚手架 + 类型定义

**Subagent:** a0f0b6d2da653703b (general-purpose)
**TDD 流程：** 先创建类型文件，tsc --noEmit 验证

**产出：**
- `src/types.ts` — 15 个类型/接口（State, Action, ToolResult, StateTransition, FeedbackItem, FeedbackResult, MemoryEntry, HarnessConfig, LLMMessage, LLMProvider, LLMResponse）
- `tsconfig.json` — ES2022 + NodeNext + strict
- `vitest.config.ts` — globals 模式
- `.gitignore` — 排除 node_modules, dist, .env, .harness
- `package.json` — build/test/dev 脚本

**Commit:** `5590669`
**验证：** tsc --noEmit 通过，vitest 可运行（无测试文件故 exit code 1）
**教训：** 任务简单清晰，agent 一次完成无偏差。

---

## 2026-08-11 23:20-23:36 — Tasks 2-7, 9-10: 并行基础模块

**策略：** 6 个独立 task 并行派发（各自创建独立文件，无冲突）

### Task 2: LLM Provider 抽象层
**Subagent:** a0f5d690a7699bce2
**Commit:** `f81855f`
**文件：** `src/core/llm-provider.ts`, `tests/llm-provider.test.ts`
**TDD：** 先写 3 个 mock provider 测试 → 红 → 实现 Anthropic + Mock → 绿
**测试：** 3/3 pass (mock provider 顺序返回、循环、调用记录)

### Task 3: Config Loader
**Subagent:** ad5de949db607e094
**Commit:** `a75950d`
**文件：** `src/config/loader.ts`, `tests/config.test.ts`
**TDD：** 先写 3 个测试（默认值、部分覆盖、字段完备）→ 红 → 实现 defaultConfig + deepMerge → 绿
**测试：** 3/3 pass

### Task 4: Guardrails Engine
**Subagent:** a48ef94523a60766a
**Commit:** `489e0f7`
**文件：** `src/guardrails/guard.ts`, `tests/guardrails.test.ts`
**TDD：** 先写 11 个测试（危险命令检测、路径穿越、安全命令放行）→ 红 → 实现 isDangerous/checkPath/checkCommand → 绿
**关键决策：** 增加 rm --recursive --force 变体检测（正则 `\brm\b.*(?:-r|--recursive)`）。使用 ESM import 替代 require。
**测试：** 11/11 pass

### Task 5: Feedback Parser
**Subagent:** a4cc3fa35f574813f
**Commit:** `2b43126`
**文件：** `src/feedback/parser.ts`, `tests/feedback-parser.test.ts`
**TDD：** 先写 5 个测试（vitest JSON、纯文本回退、eslint JSON）→ 红 → 实现 → 绿
**测试：** 5/5 pass

### Task 9: Memory Store
**Subagent:** a78242bee8fc1d4d0
**Commit:** `602b049`
**文件：** `src/memory/store.ts`, `tests/memory.test.ts`
**测试：** 3/3 pass (空加载、保存加载、搜索)

### Task 10: Credential Manager
**Subagent:** a22cd6fba7e9c3ff9
**Commit:** `4206224`
**文件：** `src/credentials/keychain.ts`, `tests/credentials.test.ts`
**关键决策：** macOS 用 security CLI，跨平台降级为 base64 文件。非 macOS 路径用动态 import() 保持 ESM 兼容。
**测试：** 4/4 pass

**教训：** 并行派发独立 task 大幅加速实现。唯一问题是 Task 7 agent (a4a39559f5c5020a8) 因 API 连接中断失败，但其文件已被 Task 6 agent 包含在同一 commit 中。

---

## 2026-08-11 23:36 — Task 6-7: 分类器 + 注入器 + 工具执行器

### Task 6: Feedback Classifier + Injector
**Subagent:** a4c2e7dbe19b54c64
**Commit:** `6f351f7`（也包含了 Task 7 文件）
**文件：** `src/feedback/classifier.ts`, `src/feedback/injector.ts`, 对应测试
**关键调整：** 注入器测试的 expected/got 引号格式需匹配实际输出。
**测试：** 9/9 pass (6 classifier + 3 injector)

### Task 7: Tool Executor
**Subagent:** a4a39559f5c5020a8 (API error, 但文件已在 Task 6 commit 中)
**Commit:** `6f351f7`
**文件：** `src/tools/executor.ts`, `tests/tools.test.ts`
**测试：** 6/6 pass (读文件、写文件、路径穿越拒绝、shell 执行、未知工具)

**教训：** 两个 agent 同时涉及同一批文件时可能互相覆盖。Task 7 agent 发现文件已存在后直接验证。

---

## 2026-08-11 23:36 — Task 8: 状态机核心

**Subagent:** a978a93fd688d4955 (sonnet — 核心集成任务用更可靠模型)
**Commit:** `64bad99`
**文件：** `src/core/state-machine.ts`, `src/core/context.ts`, `tests/state-machine.test.ts`

**关键实现细节：**
- HarnessEngine 类实现完整 8 状态循环
- doThink → doGuard → doExecute → doObserve → doFeedback
- 危险命令在 doGuard 拦截 → WAITING_APPROVAL
- approve()/reject() 方法处理 HITL
- Context builder 组装 system prompt + 记忆 + 反馈 + 历史
- 测试中 run_test 用 `node -e "process.exit(1)"` 避免递归 vitest

**测试：** 4/4 pass (简单周期、护栏拦截、反馈循环、重试耗尽)
**全量测试：** 48 pass (10 test files)
**教训：** 状态机是 harness 的集成点，实现时一处 import 错误导致级联失败。Agent 自行排查修复。

---

## 2026-08-11 23:37-23:56 — Tasks 11-13: CLI + 机制演示 + Web UI

### Task 11: CLI Interface
**Subagent:** a4e4606962ddaa213
**Commit:** `71f1299`
**文件：** `src/cli/index.ts`, `tests/cli.test.ts`
**关键决策：** parseArgs 作为纯函数单独测试。添加 tsconfig types: ["node"] 修复 Node.js 类型问题。
**测试：** 5/5 pass

### Task 12: Mechanism Demo (§A.6)
**Subagent:** a972d4e5e3bb24950
**Commit:** `44080ef`
**文件：** `tests/mechanism-demo.test.ts`（从 .ts 改名 .test.ts 匹配 vitest 模式）
**关键调整：** testCommand 设为 `node -e "process.exit(1)"` 避免真正运行 npm test
**测试：** 7/7 pass (3 集成 + 4 确定性组件)

### Task 13: Web UI Server
**Subagent:** a8e5a8ecacc4030dd
**Commit:** 包含在 `44080ef` + `d984ba6`
**文件：** `src/server/index.ts`, `public/index.html`, `public/client.js`
**关键决策：** 添加 resumeRun() 方法支持 HITL 审批流程；每 socket 存储独立 engine 实例
**测试：** 60 pass (12 test files)

---

## 2026-08-12 00:00 — Tasks 14-15: Docker + CI + 集成测试

### Task 14: Dockerfile + CI + README
**Subagent:** aab835aeb3f7ac202
**Commit:** `4fffb80`
**文件：** `Dockerfile`, `.github/workflows/ci.yml`, `README.md`
**README 重写：** 架构、快速开始、安全/凭据、Docker 分发、项目结构、测试哲学、CI/CD

### Task 15: 集成测试
**人工实现：** Agent (ab370d5ebac4aeb9f) 确认文件已存在并验证
**Commit:** `f426895`
**文件：** `tests/integration.test.ts`
**测试：** 2/2 pass (端到端修复流程、护栏拒绝后重新思考)

---

## 最终验证

| 指标 | 结果 |
|------|------|
| TypeScript 编译 | ✓ 零错误 |
| 测试文件数 | 13 |
| 测试用例数 | **62 全部通过** |
| 源文件数 | 14 .ts + Web UI |
| Git commits | 17 (+ 3 个 planning commits) |

## 学到的教训

1. **并行派发独立 task 是关键效率手段** — 6 个基础模块一起派发节省大量时间
2. **Agent 模型选择有实际影响** — 机械转录用 haiku/sonnet，核心集成用 sonnet
3. **反馈闭环的"测试避免真实 npm test 运行"** — 多处在 mock 测试中将 testCommand 设为 `node -e "process.exit(1)"`
4. **ESM vs CommonJS 在 NodeNext 下持续造成小问题** — 需要用 import 而非 require
5. **agent 间的文件重叠** — Task 7 文件被 Task 6 agent 一起提交，导致 Task 7 agent 发现文件已存在
6. **TDD 强制有意义** — 每个 task 先写测试确实能发现接口设计问题
