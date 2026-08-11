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
