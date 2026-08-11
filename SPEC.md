# SPEC: Coding Agent Harness

## 1. 问题陈述

### 要解决什么问题？

当前市面上的 coding agent（Claude Code、Codex、Cursor Agent 等）将"LLM 决策"与"harness 工程"耦合在封闭系统中。开发者无法观察、控制或验证 agent 内部的治理、反馈、记忆机制。本项目构建一个**透明、可审计、可 mock 测试**的 coding agent harness，将 Agent = LLM + Harness 这个等式中的 Harness 层完全显式化。

### 目标用户

- 学习 AI4SE 的学生，需要一个能看清楚 agent 内部每个环节如何工作的教学工具
- 对 agent 行为有审计需求的开发者，需要知道"agent 为什么做了这个决定"

### 为什么值得做？

当 LLM 能完成大部分编码工作时，工程师的真正价值落在 harness 这层工程上——治理、反馈、上下文、安全。本项目通过"用一个 harness（Superpowers）去造另一个 harness"，让构建者亲身体验这层价值。

---

## 2. 用户故事

| # | 故事 | INVEST 检查 |
|---|------|-------------|
| US1 | 作为一个开发者，我想给 agent 一个编码任务（比如"修复 multiply 函数的 bug"），让 agent 自动读文件、改代码、运行测试，并看到它每一步在做什么 | I ✓ N ✓ E ✓ V ✓ S ✓ T ✓ |
| US2 | 作为一个开发者，当 agent 要执行 `rm -rf` 这种危险命令时，我希望被拦截并要求我手动审批，而不是直接执行 | I ✓ N ✓ E ✓ V ✓ S ✓ T ✓ |
| US3 | 作为一个开发者，当 agent 修改代码后测试失败时，我希望它自动收到失败反馈，分析原因，并尝试修正，而不是不管结果 | I ✓ N ✓ E ✓ V ✓ S ✓ T ✓ |
| US4 | 作为一个开发者，我想在浏览器里实时看到 agent 的执行过程——它正在读哪个文件、执行什么命令、测试结果是什么 | I ✓ N ✓ E ✓ V ✓ S ✓ T ✓ |
| US5 | 作为一个开发者，我想配置哪些命令是危险的、测试命令是什么、最多重试几次，而不需要改代码 | I ✓ N ✓ E ✓ V ✓ S ✓ T ✓ |
| US6 | 作为一个安全敏感的用户，我的 API key 必须存在系统钥匙串里，不会出现在任何日志、配置文件或 git 历史中 | I ✓ N ✓ E ✓ V ✓ S ✓ T ✓ |
| US7 | 作为一个贡献者，我想用 mock LLM 运行确定性测试来验证 harness 的每个机制，而不需要真实 LLM 或网络 | I ✓ N ✓ E ✓ V ✓ S ✓ T ✓ |

---

## 3. 功能规约

### 3.1 Agent 主循环（状态机）

**状态枚举（8 个，含终态 DONE）：** `IDLE`, `THINKING`, `GUARDING`, `EXECUTING`, `WAITING_APPROVAL`, `OBSERVING`, `FEEDBACK`, `DONE`

**状态转换规则：**

| 从 | 到 | 触发条件 |
|----|-----|---------|
| IDLE | THINKING | 用户提交任务 |
| THINKING | GUARDING | LLM 返回一个动作 |
| GUARDING | EXECUTING | 护栏判定为安全 |
| GUARDING | WAITING_APPROVAL | 护栏判定为危险 |
| WAITING_APPROVAL | EXECUTING | 用户批准 |
| WAITING_APPROVAL | THINKING | 用户拒绝（告知 LLM 被拒） |
| EXECUTING | OBSERVING | 工具执行完毕（成功或失败） |
| OBSERVING | FEEDBACK | 存在可验证的反馈信号（测试/lint 输出） |
| OBSERVING | THINKING | 无可验证的反馈信号（如只读了文件） |
| FEEDBACK | THINKING | 反馈未通过（失败），且重试次数 < maxRetries |
| FEEDBACK | DONE | 反馈通过（成功），或重试次数已耗尽 |

**输入：** 用户任务描述（自然语言）
**输出：** DONE（成功/失败），附带完整的执行历史和最终结果
**边界条件：** 
- 最大重试次数（默认 5，可配置）
- 单次任务最大工具调用数（默认 50，防止无限循环）
- 超时时间（默认 300 秒）

**错误处理：**
- LLM 返回无法解析的动作 → 回 THINKING，告知格式错误
- 工具执行抛出异常 → 进入 OBSERVING（异常作为结果记录）
- LLM API 调用失败 → 重试 3 次，仍失败 → DONE(失败)

**LLM 动作格式（JSON，在 system prompt 中规定）：**
```json
{
  "thinking": "我需要先读取 math.ts 看看当前的 multiply 实现",
  "tool": "read_file",
  "params": { "path": "src/math.ts" }
}
```
解析器从 LLM 响应文本中提取 JSON 块（` ```json ... ``` ` 或裸 JSON），校验 `tool` 字段是否在注册表中，校验 `params` 是否符合该工具的 schema。解析失败则回到 THINKING 并告知格式要求。

### 3.2 工具 / 动作系统

**支持的工具：**

| 工具 | 参数 | 行为 | 边界条件 |
|------|------|------|---------|
| `read_file` | `path: string` | 读取文件内容，返回给 LLM | 路径必须在工作区内；文件不存在 → 返回错误信息（不崩溃） |
| `write_file` | `path: string, content: string` | 写入文件 | 路径必须在工作区内 |
| `run_shell` | `command: string, cwd?: string` | 执行 shell 命令，返回 stdout + stderr + exitCode | 命令必须通过护栏检查 |
| `run_test` | — | 运行配置中指定的测试命令 | 取决于 `config.feedback.testCommand` |
| `run_lint` | — | 运行配置中指定的 lint 命令 | 取决于 `config.feedback.lintCommand` |
| `task_complete` | `summary: string` | Agent 声明任务完成 | 触发 FEEDBACK 判定 |

**错误处理：**
- 工具未注册 → 返回错误，agent 进入 OBSERVING
- 工具参数无效 → 同上

### 3.3 护栏 / 治理

**危险动作识别（确定性规则，非 LLM 判断）：**

```
blockedPatterns = [
  /rm\s+-rf/,           // 递归强制删除
  /sudo/,               // 提权
  /DROP\s+TABLE/,       // 数据库破坏
  /DELETE\s+FROM/,      // 数据库删除
  /curl.*\|\s*(ba)?sh/, // curl pipe shell
  />\s*\/dev\/sd[a-z]/, // 写入块设备
  /git\s+push\s+--force/, // 强制推送
  /chmod\s+777/,        // 危险权限
]
```

**拦截行为：**
1. 识别到危险命令 → 状态转为 WAITING_APPROVAL
2. 通过 Web UI 或 CLI 提示用户审批
3. 展示完整命令 + 为何被标记为危险 + 风险等级（high/medium）
4. 用户选择：批准执行 / 拒绝（agent 需重新考虑）

**工作区边界（范围围栏）：**
- 所有文件操作限制在用户指定的工作目录内
- 路径遍历攻击（`../../../etc/passwd`）在 `read_file`/`write_file` 中拦截

### 3.4 反馈闭环（重点深度维度）

**反馈引擎架构：**

```
原始输出 → Parser → FeedbackItem[] → Classifier → FeedbackResult → Injector → LLM 上下文
```

**Parser（解析器）：**
- 输入：工具执行结果（原始 stdout/stderr/exitCode）
- 输出：结构化 `FeedbackItem[]`
- 支持格式：Jest/Vitest JSON、Mocha TAP、通用 exitCode + stderr

**Classifier（分类器，确定性规则）：**

| 输入特征 | 分类结果 |
|---------|---------|
| exitCode = 0，无失败用例 | `PASS` |
| exitCode != 0，有测试断言失败 | `TEST_FAILURE` |
| stderr 含 TypeScript 类型错误 | `TYPE_ERROR` |
| stderr 含语法解析错误 | `SYNTAX_ERROR` |
| stderr 含 import/resolve 错误 | `MODULE_ERROR` |
| stderr 含编译失败 | `BUILD_ERROR` |
| exitCode != 0，无法匹配以上 | `UNKNOWN_FAILURE` |

**Injector（回灌器）：**
- 将 `FeedbackResult` 格式化为固定模板
- 追加到 LLM 对话上下文中
- 模板示例：
  ```
  [FEEDBACK] Cycle 2/5
  Status: TEST_FAILURE
  Test results: 3/5 passing
  Failing:
    • multiply(2, 3) → expected 6, got 5
  Action required: fix the implementation and re-run tests.
  ```

**重试控制：**
- 每轮 FEEDBACK 递增计数器
- 计数器 >= maxRetries → DONE（失败），不再回 THINKING
- 相同错误连续出现 3 次 → DONE（失败），防止死循环

### 3.5 记忆系统

**两层架构：**

1. **会话记忆（内存）：**
   - 对话历史：LLM 上下文消息数组
   - 执行日志：每步的状态转换 + 动作 + 结果
   - 生命周期：单次 run，进程退出即清空

2. **项目记忆（文件）：**
   - 存储位置：`.harness/memory/` 目录下的 JSON 文件
   - 条目类型：项目约定（`.harness/memory/conventions.json`）、历史决策（`.harness/memory/decisions.json`）
   - 加载时机：任务开始时，检索相关条目注入 system prompt
   - 写入时机：用户通过 `harness remember "..."` 命令手动写入

### 3.6 配置系统

**配置文件：** `.harness/config.json`（项目级）或 `~/.harness/config.json`（全局级）

```json
{
  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-5-20251001",
    "maxTokens": 4096
  },
  "tools": {
    "workspaceRoot": ".",
    "allowedCommands": ["npm", "npx", "node", "ls", "cat", "grep", "find", "git", "tsc", "vitest", "eslint"]
  },
  "guardrails": {
    "blockedPatterns": ["rm -rf", "sudo", "DROP TABLE", "DELETE FROM", "> /dev/"],
    "requireApprovalFor": ["git push", "npm publish", "docker"]
  },
  "feedback": {
    "maxRetries": 5,
    "testCommand": "npm test",
    "lintCommand": "npm run lint",
    "maxIdenticalFailures": 3
  },
  "execution": {
    "maxToolCalls": 50,
    "timeoutSeconds": 300
  }
}
```

### 3.7 CLI 接口

```
harness run "implement a multiply function"     # 启动 agent 执行任务
harness setup                                    # 配置凭据
harness config                                   # 查看/编辑配置
harness remember "use tabs not spaces"            # 添加项目记忆
harness serve                                    # 启动 Web UI 服务器
```

### 3.8 Web UI

- **终端模拟器：** xterm.js，实时展示 agent 执行过程
- **状态栏：** 当前状态 + 回合数 + 重试计数
- **审批弹窗：** 危险动作时弹出，显示命令 + 风险原因 + 批准/拒绝按钮
- **连接方式：** Socket.IO 双向通信

---

## 4. 非功能性需求

### 4.1 安全（含凭据威胁模型）

**凭据威胁模型：**
- 威胁：API key 泄露（日志、git、shell history、进程列表、配置文件）
- 对手能力：能读取文件系统和 git 历史的攻击者（如恶意依赖、内部威胁）
- 对策：
  - macOS Keychain 存储（`security` CLI），跨平台备选：AES-256 加密文件 + 主密码
  - 环境变量仅作为一次性输入管道（从 stdin 读入后立即清除）
  - 日志和错误消息中过滤 API key 模式（`sk-ant-*` / `sk-*`）
  - `.env` 文件和 `.harness/credentials/` 加入 `.gitignore`
  - 进程启动参数中不传 key（通过 stdin 或 Keychain 读取）

**护栏威胁模型：**
- 威胁：agent 执行危险 shell 命令、读取敏感文件、外传代码
- 对策：
  - 命令白名单 + 黑名单双重过滤
  - 工作区边界限制（解析路径，拒绝 `..` 逃逸）
  - 网络外发检测（`curl` / `wget` 命令默认需审批）

### 4.2 性能

- 状态转换延迟 < 10ms（不含 LLM 调用和工具执行）
- Web UI 终端输出延迟 < 200ms（通过 Socket.IO 推送）
- LLM 调用超时 120 秒

### 4.3 可用性

- 首次运行 `harness setup` 引导式配置，3 步内完成
- 错误消息包含上下文（哪个状态、什么动作、为什么失败）
- Web UI 在无 JS 的终端可降级为纯 CLI 模式

### 4.4 可观测性

- 每个状态转换记录：时间戳、状态、输入、输出
- 执行日志写入 `.harness/logs/` 目录（JSON 格式）
- Web UI 实时展示当前回合的完整上下文

---

## 5. 系统架构

### 组件图

```
┌──────────────────────────────────────────────────────────────┐
│                        Web UI (Browser)                       │
│  ┌─────────────┐  ┌──────────┐  ┌─────────────────────────┐  │
│  │  Status Bar  │  │ xterm.js │  │  Approval Dialog        │  │
│  │  (state+cyc) │  │ Terminal │  │  (dangerous commands)    │  │
│  └─────────────┘  └──────────┘  └─────────────────────────┘  │
└──────────────────────┬───────────────────────────────────────┘
                       │ Socket.IO (WebSocket)
┌──────────────────────┴───────────────────────────────────────┐
│                    Express Server                              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                     Harness Core                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │  │
│  │  │  State   │  │  LLM     │  │  Context Builder      │   │  │
│  │  │ Machine  │──│ Provider │──│  (system + history +  │   │  │
│  │  │ (8状态) │  │ (层)    │  │   memory + feedback)  │   │  │
│  │  └──────────┘  └──────────┘  └──────────────────────┘   │  │
│  │       │              │                                    │  │
│  │       ▼              ▼                                    │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │  │
│  │  │ Guardrail│  │  Tool    │  │ Feedback │              │  │
│  │  │ Engine   │  │ Executor │  │ Engine   │              │  │
│  │  │ (护栏)  │  │ (工具分发)│  │ (重点)  │              │  │
│  │  └──────────┘  └──────────┘  └──────────┘              │  │
│  │                                          │                │  │
│  │  ┌──────────┐  ┌──────────┐             │                │  │
│  │  │ Memory   │  │ Config   │             │                │  │
│  │  │ Store    │  │ Loader   │             │                │  │
│  │  └──────────┘  └──────────┘             │                │  │
│  └─────────────────────────────────────────┘                │  │
│                       │                                       │  │
│  ┌────────────────────┴────────────────────────────────────┐  │
│  │              Credential Manager (Keychain)               │  │
│  └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                       │
┌──────────────────────┴───────────────────────────────────────┐
│                  Anthropic Messages API                        │
│                 (或 Mock LLM 用于测试)                         │
└──────────────────────────────────────────────────────────────┘
```

### 数据流

1. 用户提交任务 → State Machine: IDLE → THINKING
2. Context Builder 组装上下文（system prompt + 记忆 + 历史 + 任务）→ 发送给 LLM
3. LLM 返回动作 → State Machine: THINKING → GUARDING
4. Guardrail Engine 检查动作 → 安全 → EXECUTING；危险 → WAITING_APPROVAL
5. Tool Executor 执行动作 → OBSERVING
6. Feedback Engine 判定是否需要反馈 → 需要 → FEEDBACK → Parser → Classifier → Injector → THINKING（或 DONE）
7. 全程通过 Socket.IO 推送状态转换到 Web UI

### 外部依赖

- **LLM 供应商：** Anthropic（Messages API）
- **运行时：** Node.js 20+
- **Web UI 前端：** xterm.js, Socket.IO client
- **分发：** Docker
- **测试：** vitest（含 mock 模块）
- **凭据存储：** macOS Keychain (`security` CLI) / node-keytar

---

## 6. 数据模型

### StateMachine

```
state: IDLE | THINKING | GUARDING | EXECUTING | WAITING_APPROVAL | OBSERVING | FEEDBACK | DONE
history: StateTransition[]      // 完整的状态转换历史
retryCount: number              // 当前反馈重试计数
maxRetries: number              // 从配置加载
turnCount: number               // 总工具调用计数
```

### Action

```
type: "read_file" | "write_file" | "run_shell" | "run_test" | "run_lint" | "task_complete"
params: Record<string, any>     // 各工具的参数
rawText: string                 // LLM 原始响应文本（用于错误诊断）
```

### StateTransition

```
from: State
to: State
timestamp: ISO8601
action?: Action
result?: ToolResult
metadata?: { reason?: string, feedbackResult?: FeedbackResult }
```

### ToolResult

```
toolType: string
success: boolean
stdout: string
stderr: string
exitCode: number
duration: number               // 毫秒
```

### FeedbackItem

```
type: "test_case" | "lint_error" | "build_error" | "type_error"
severity: "error" | "warning"
file?: string
line?: number
message: string
expected?: string
actual?: string
```

### FeedbackResult

```
status: "PASS" | "TEST_FAILURE" | "TYPE_ERROR" | "SYNTAX_ERROR" | "MODULE_ERROR" | "BUILD_ERROR" | "UNKNOWN_FAILURE"
items: FeedbackItem[]
summary: string                 // 人类可读的摘要
rawOutput: string               // 原始输出（用于诊断）
```

### MemoryEntry

```
id: string
type: "convention" | "decision" | "fact"
content: string
tags: string[]
createdAt: ISO8601
```

---

## 7. 凭据与分发设计

### 7.1 Key 存储方案

**主方案（macOS）：**
- 使用 `security add-generic-password` 存入 macOS Keychain
- Keychain service name: `ai4se-harness`
- Keychain account: `anthropic-api-key`

**备选方案（跨平台）：**
- 使用 `node-keytar` 库（对 macOS Keychain / Windows Credential Manager / Linux Secret Service 的统一封装）
- 如果 keytar 不可用，降级为 AES-256-GCM 加密文件（`~/.harness/credentials.enc`），使用用户设置的主密码

### 7.2 录入 / 查看 / 更新 / 清除流程

**录入：** `harness setup`
1. 提示 "Enter your Anthropic API key:"
2. 使用隐藏输入（`readline` 或 stdin raw mode，不回显字符）
3. 验证 key 格式（以 `sk-ant-` 开头）
4. 存入 Keychain
5. 输出 "API key saved to macOS Keychain ✓"

**查看：** `harness config --show-key-status`
- 输出 "API key: sk-ant...xxxx (stored in macOS Keychain)"
- 绝不回显完整明文

**更新：** `harness setup --force`
- 覆盖旧 key

**清除：** `harness config --clear-key`
- 从 Keychain 删除
- 输出 "API key removed from Keychain ✓"

### 7.3 分发形态

**Docker 容器：**
- `Dockerfile`：多阶段构建（build → production）
- 基础镜像：`node:20-alpine`
- 暴露端口：3000
- 运行命令：
  ```bash
  docker build -t ai4se-harness .
  docker run -p 3000:3000 -v $(pwd):/workspace ai4se-harness serve
  ```
- Key 配置：容器内执行 `harness setup` 或挂载主机 Keychain（macOS 上有限制，建议容器内独立配置）

**已知限制：**
- Docker 内无法直接使用 macOS Keychain → 容器内降级为加密文件方案
- 仅支持 macOS 开发环境；Linux 需 node-keytar 或加密文件

---

## 8. 技术选型与理由

| 选择 | 理由 |
|------|------|
| **TypeScript** | 类型安全、CLI + Web 同一语言、Superpowers 同生态 |
| **Node.js** | 成熟异步模型、xterm.js 原生支持、Docker 基础镜像小 |
| **Anthropic Messages API** | 裸 API 调用，不依赖框架循环；Superpowers 本身就用 Anthropic |
| **xterm.js + Socket.IO** | 终端模拟器是 coding agent 最自然的 UI；Socket.IO 实时推送状态 |
| **vitest** | 快速、TS 原生、mock 机制简单，适合确定性单元测试 |
| **Docker** | 统一运行环境，消除"我机器上跑不起来" |
| **macOS Keychain** | 课程作业在 macOS 上评审，原生方案最安全 |
| **Open Design** | 豁免——本项目为 CLI + 终端 UI，不涉及传统前端界面开发 |

---

## 9. 领域与机制设计

### 9.1 领域分析

**Coding 领域的反馈信号（客观、确定、可回灌）：**

| 信号 | 来源 | 解析方式 | 回灌方式 |
|------|------|---------|---------|
| 测试失败 | `vitest --reporter=json` | 解析 JSON → 提取失败用例 | 格式化失败列表注入上下文 |
| 类型错误 | `tsc --noEmit` | 解析 stderr | 同上 |
| Lint 错误 | `eslint --format=json` | 解析 JSON | 同上 |
| 编译失败 | `node` / `tsx` stdout | 解析 stderr 关键词 | 同上 |

**Coding 领域的危险动作：**

| 危险类型 | 识别方式 | 处理 |
|---------|---------|------|
| 破坏性删除 | 正则匹配 `rm -rf` | 拦截 + HITL |
| 提权操作 | 正则匹配 `sudo` | 拦截 + HITL |
| 数据库破坏 | 正则匹配 `DROP TABLE` / `DELETE FROM` | 拦截 + HITL |
| 外发代码 | 正则匹配 `curl ... \| sh` | 拦截 + HITL |
| 路径逃逸 | 解析路径中的 `../` | 自动拒绝（不需审批） |

**Coding 领域需要的工具：** read_file, write_file, run_shell, run_test, run_lint

**Coding 领域的记忆需求：** 项目编码规范、历史 bug 修复模式、常用文件路径

### 9.2 重点维度选择

**选「反馈闭环」作为主要贡献维度。** 理由：

1. Coding 领域的反馈信号天然是客观、确定、可编码的（测试结果、lint 输出、类型检查），最适合落实 §A.4-C 的"移除 LLM 后仍可单测验证"
2. 反馈闭环是 agent 自主性的关键——没有客观反馈，agent 无法知道"自己做对了没有"
3. 实现需要 Parser + Classifier + Injector 三个组件协作，工程深度足够
4. 每个组件都是纯函数（输入 → 输出），mock 测试最直接

### 9.3 机制编码实现方式

**反馈引擎的三个组件都是确定性 TypeScript 函数：**

```
// Parser: string → FeedbackItem[]
parseTestOutput(raw: string): FeedbackItem[]

// Classifier: FeedbackItem[] → FeedbackResult  
classify(items: FeedbackItem[], exitCode: number): FeedbackResult

// Injector: FeedbackResult → string (formatted LLM context)
inject(result: FeedbackResult, cycle: number, maxRetries: number): string
```

**Mock 测试验证（不依赖真实 LLM）：**
- 注入伪造的 vitest JSON 输出 → 断言 Parser 提取了正确的失败用例
- 注入 stderr 含有 `TS2345` 的输出 → 断言 Classifier 返回 `TYPE_ERROR`
- 注入 `FeedbackResult` → 断言 Injector 输出包含正确的重试提示

**护栏的编码实现：**
- `isDangerous(command: string): { dangerous: boolean; reason?: string }` —— 纯函数，正则匹配
- `isWithinWorkspace(path: string, workspaceRoot: string): boolean` —— 路径解析，拒绝逃逸

---

## 10. 验收标准

每个功能的客观判定标准：

| 功能 | 验收标准 |
|------|---------|
| 主循环 | mock LLM 下完整跑通 IDLE → THINKING → GUARDING → EXECUTING → OBSERVING → FEEDBACK → DONE |
| 护栏拦截 | 注入 `rm -rf /`，断言状态停在 WAITING_APPROVAL，不执行 |
| 反馈闭环 | 注入失败的测试输出，断言 agent 收到回灌消息，状态重回 THINKING |
| 重试上限 | 连续 5 次 FEEDBACK 失败后断言 DONE（失败） |
| 凭据存储 | `harness setup` 后 key 不在任何文件/git 中出现 |
| Web UI | 浏览器访问 localhost:3000，看到 xterm.js 终端 + agent 实时输出 |
| Mock 测试 | `npm test` 在无网络环境下全部通过 |
| 机制演示 | 运行 demo 脚本，确定性地展示护栏拦截 + 反馈修正 + 重试终止 |
| Docker 分发 | `docker build && docker run` 后 Web UI 可访问 |

---

## 11. 风险与未决问题

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| LLM 响应格式不稳定 | 中 | agent 无法解析动作 | 在 THINKING → GUARDING 间加格式校验，失败时告知 LLM 重试 |
| xterm.js 与 Socket.IO 集成复杂 | 中 | Web UI 延迟或卡顿 | 先做 CLI 模式验证核心逻辑，Web UI 并行开发 |
| macOS Keychain 在 Docker 内不可用 | 高 | 容器内凭据方案需降级 | 容器内自动检测，降级为加密文件方案 |
| 危险命令正则被绕过（如 `rm --recursive --force`） | 中 | 护栏漏拦 | 用命令抽象语法树而非纯正则；至少覆盖常见变体 |
| node-keytar 跨平台兼容性 | 中 | 非 macOS 平台凭据存储失败 | 添加编译依赖说明；降级方案为加密文件 |
| vitest JSON reporter 格式变化 | 低 | Parser 失效 | 支持多格式 fallback（JSON → TAP → 纯文本） |

**未决问题：**
1. 是否需要支持流式 LLM 响应（SSE）？——初版不做，用非流式简化状态机
2. LLM 的系统提示词如何管理？——存为 `.harness/system-prompt.md`，config 可覆盖路径
