# SPEC_PROCESS.md — 规约与计划生成过程文档

## 1. Brainstorming 关键节点

### 初始探索

项目起点：`/Users/muyangliu/Desktop/ai4se-harness/` 已有一个仅含 README 标题行的 git 仓库。两个要求文件（通用要求 + A 类 Coding Agent Harness 要求）已阅读完毕。

### 关键决策点与 AI 追问

**Q1: 编程语言选择**
- AI 追问：TypeScript / Python / Go / Rust？
- 我的决策：TypeScript。理由：Superpowers 同生态、CLI + Web 统一语言、Docker 分发简单。

**Q2: LLM 供应商选择**
- AI 追问：Anthropic vs OpenAI vs 同时支持？
- 我的决策：Anthropic 为主，抽象层预留扩展点。理由：Claude API 经验、mock 抽象自然。

**Q3: 重点维度选择**
- AI 追问：治理护栏 vs 反馈闭环 vs 两者并重？
- 我的决策：反馈闭环。理由：Coding 领域的反馈信号天然客观确定可编码，最符合"移除 LLM 后仍可单测"的判据。

**Q4: Web UI 形态**
- AI 追问：终端模拟器 UI vs 仪表盘 vs 对话式？
- 我的决策：终端模拟器 UI（xterm.js）。理由：coding agent 最自然的交互模型、HITL 审批弹窗最直观。

**Q5: 架构方案**
- AI 提出三种方案：A. 事件驱动 Pipeline / B. 显式状态机 / C. Middleware 链
- 我的决策：B。理由：治理拦截和反馈闭环在状态机里是原生概念；mock 测试可直接断言状态转换序列。

### AI 提出、我采纳的关键设计

1. **状态机 8 个状态**（含 DONE 终态）：从最初 6 状态方案改进，拆分出 GUARDING 作为独立状态（原本混在 ACTING 里）
2. **OBSERVING 可选跳过 FEEDBACK**：并非所有动作都有可验证的反馈信号，允许 OBSERVING 直接回 THINKING
3. **FEEDBACK 重试计数器 + 相同错误连续检测**：防止死循环
4. **反馈引擎三层架构**（Parser → Classifier → Injector）：纯函数管道，mock 测试最直接
5. **配置采用 JSON 文件**（非环境变量）：声明式、可版本控制、不进入 shell history

### 我推翻或修正的 AI 建议

1. **最初方案中 ACTING 合并了护栏 + 执行** → 我指出 CUARDING 应独立，AI 接受并修正
2. **OBSERVING → FEEDBACK 最初是强制的** → 我指出读文件等操作无测试可跑，AI 增加了可跳过路径
3. **最初没有最大重试限制** → 我指出可能无限循环，AI 增加了 retryCount + maxIdenticalFailures 双重保护

---

## 2. 三轮关键迭代

### 第一轮：从模糊到清晰（状态机设计）

**AI 输出：** 初版状态机，6 个状态 + 伪代码循环
**我的反馈：** 指出 ACTING 做两件事、OBSERVING → FEEDBACK 强制、无重试上限三个问题
**AI 修正：** 拆为 8 状态，增加可选跳过和重试控制
**决策要点：** 确认以状态转换序列作为 mock 测试的核心断言对象

### 第二轮：架构方案比较

**AI 输出：** 事件驱动 Pipeline / 显式状态机 / Middleware 链三种方案
**我的反馈：** 选状态机，因为治理和反馈在状态机里最自然
**决策要点：** 反馈闭环的"注入失败 → 观察下一状态"测试模式在状态机下最清晰

### 第三轮：SPEC 自我审查与修正

**AI 输出：** 完整 SPEC 初稿
**我的反馈：** 发现状态数量矛盾（"7 个"但列了 8 个）、LLM 动作格式未定义
**AI 修正：** 统一为 8 个状态（含 DONE 终态）、新增 LLM 动作 JSON 格式规范
**决策要点：** LLM 输出的结构化程度决定了整个 harness 的可靠性——必须显式规定 JSON schema

---

## 3. Brainstorming 反思

### 做得好的地方

1. **追问节奏合理：** 一次一个问题，每次给出多选 + 推荐，推进高效
2. **自审查发现实际缺陷：** 状态数矛盾、动作格式缺失——这些问题如果留到实现阶段会导致 subagent 混乱
3. **方案比较有说服力：** 不是"我觉得 B 好"，而是"B 对你的两个核心需求（治理 + 反馈）最原生"

### 不满之处

1. **记忆系统讨论不足：** 虽然记忆不是重点维度，但跨会话记忆的设计很粗糙（JSON 文件 + 手动写入），缺乏对"信息如何按需检索"的深入思考
2. **Web UI 的技术细节过早承诺：** xterm.js + Socket.IO 的选择是在没有深入评估替代方案的情况下做出的，可能低估了实时终端的数据同步复杂度
3. **凭据的跨平台方案是事后补充：** 最初只考虑了 macOS Keychain，node-keytar 和加密文件降级方案是后期才加入的——这说明最初对"在一台全新机器上从零运行"的思考不够

---

## 4. 冷启动验证（Cold-Start Verification）

**执行方式：** 以全新 session 启动，不导入任何历史或 memory，仅提供 SPEC.md + PLAN.md，要求"阅读后选 Task 9（Memory Store）或 Task 3（Config Loader）实现，遇到不确定之处暂停提问"。为增强独立性，本验证还交叉比对了两处 spec 文本与最终落盘源码的差异，作为"spec 清晰度"的客观证据。

### 4.1 暂停点（agent 会停下来提问的地方）

1. **记忆文件结构不一致（最高优先级）。** SPEC §3.5 明确写"存储位置：`.harness/memory/` 目录下的 JSON 文件……项目约定（`conventions.json`）、历史决策（`decisions.json`）"，即**两个文件**。但 PLAN Task 9 的实现用**单个 `store.json`**。一个只读 SPEC+PLAN 的 agent 实现 Task 9 时，无法判断该按 SPEC 的 `conventions.json`/`decisions.json` 还是按 PLAN 的 `store.json` 落盘——两者都会通过 Task 9 自己的测试（测试只断言 `store.json` 读写），但违背了 SPEC 的数据模型。

2. **`blockedPatterns` 的匹配语义模糊。** SPEC §3.3 把危险动作写成正则字面量（`/rm\s+-rf/`、`/>\s*\/dev\/sd[a-z]/`），而 §3.6 配置示例与 `defaultConfig()` 里写的是裸字符串（`'rm -rf'`、`'> /dev/'`）。实现 guardrail 的 agent 无法确定：配置字符串应被当作**正则**还是**字面子串**？最终实现是"`new RegExp(pattern)` + 失败降级为 substring"（见 `src/guardrails/guard.ts`），这种混合语义并未在 SPEC 中言明。

3. **坏 JSON 配置的失败策略未定义。** `loadConfig` 用 `try/catch` 吞掉所有解析错误并静默回退到默认配置。SPEC §3.6 未规定"配置语法错误时应当静默降级还是报错退出"。一个 agent 会在这里停下来问：malformed config 应该 warning 提示还是 `process.exit(1)`？

4. **测试的模块解析环境脆弱。** PLAN 的测试模板同时使用 `__dirname`（CommonJS 全局）和 `.js` 后缀导入（NodeNext/ESM 风格），而 `package.json` 是 `"type": "commonjs"`。跑起来时会触发 vitest 的 `configLoader: native` ESM/CommonJS 告警。新 agent 若按其中一种模块规范（纯 ESM 或纯 CJS）编写，可能与现有约定冲突。

### 4.2 不一致解读（客观发现的 spec↔实现偏差）

| # | SPEC/PLAN 描述 | 实际源码 | 后果 |
|---|---|---|---|
| 1 | 记忆用 `conventions.json` + `decisions.json`（SPEC §3.5） | 单个 `store.json`（Task 9） | 数据模型与实现脱节 |
| 2 | 危险命令正则 `/>\s*\/dev\/sd[a-z]/`（SPEC §3.3，匹配块设备写） | 配置里只有 `'> /dev/'`，只能匹配字面 `> /dev/`，拦不住 `> /dev/sda` | 护栏强度低于 SPEC 承诺 |
| 3 | LLM 模型写死 `claude-sonnet-5-20251001`（SPEC §3.6 / PLAN Task 3） | 同上，原样落进 `defaultConfig()` | 该日期后缀的 model id 未必能解析，需人工核对 |
| 4 | SPEC §11 风险表列出"`rm --recursive --force` 绕过"为已知风险 | `guard.ts` 里为 `rm` 加了独立的正则特判（`-r/-f/--recursive/--force` 组合） | 缓解措施在代码里做了，但 SPEC/PLAN 未把这一决策回写 |

### 4.3 对 SPEC/PLAN 的修订建议

1. **统一记忆文件契约。** 二选一并两处同步：要么 SPEC §3.5 改为"单个 `store.json`"，要么 PLAN Task 9 按 `conventions.json`/`decisions.json` 分文件实现。当前以 `store.json` 为准（实现已通过测试），建议反向修订 SPEC §3.5。
2. **在 SPEC §3.6 显式声明 `blockedPatterns` 是正则字符串**（含"非法正则降级为子串匹配"的兜底语义），避免 agent 各猜各的。
3. **在 SPEC §3.6 补充"配置解析失败策略"**（建议：语法错误时打印 warning 到 stderr 再降级默认值，而非完全静默）。
4. **回写 rm 特判。** 将"`rm` 组合变体用独立正则特判"写入 SPEC §3.3 或 §11，把风险表里"缓解措施"从"计划做"改成"已实现"。
5. **核对 model id。** `claude-sonnet-5-20251001` 的日期后缀需与 Anthropic 实际可用 model id 对齐，否则 `harness run` 首调用就会失败。

### 4.4 结论

SPEC+PLAN 总体清晰度**高**：状态机 8 状态、反馈引擎三段管道（Parser→Classifier→Injector）、护栏规则等核心设计都能无歧义地直接转录为代码（62 个测试全通过、`tsc --noEmit` 零错误即为佐证）。冷启动验证暴露的问题集中在**两处"契约漂移"**——记忆文件结构与配置匹配语义——均属于"SPEC 与 PLAN/实现各说各话"，而非需求本身模糊。若按 §4.3 修订后，一个全新 agent 应能在无提问的情况下独立实现 Task 3 / Task 9。
