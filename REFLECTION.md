# REFLECTION.md — Coding Agent Harness 项目反思

## 1. Superpowers 技能：哪些发挥了最大作用，哪些"形式大于实质"？

**最大作用的技能：**

`subagent-driven-development` 是本项目最重要的方法论支撑。它提供的"新鲜 subagent 每 task + 指定 task 文件为唯一需求源"的派发模式，有效避免了 subagent 带着错误上下文跑偏。尤其是 `task-brief` 脚本——从 PLAN.md 提取单个 task 文本给 agent，而不是让它读整个 2500 行的 plan 文件——这个细节在实际派发中产生了质的差异。一个只看到自己 task 内容与精确接口定义的 agent，比一个读过全量 plan 但记混了跨 task 细节的 agent，产出一致性高得多。

`using-git-worktrees` 的环境隔离也发挥了实际作用。19 个 commit 全部在独立 worktree 完成，main 分支完全不受影响。这让我们能以实验心态快速推进，错了就 reset，不污染主分支。

**形式大于实质的：**

`requesting-code-review` 和 `receiving-code-review` 的 review 循环在本次项目中未完全执行。原因有二：一是 PLAN 已经包含了每个 task 的完整代码和测试，subagent 的工作本质上是"精确转录 + 跑通测试"，review 能发现的真实问题极少；二是 15 个 task 的完整 review 循环（每 task 派 review agent → fix loop → re-review）在 token 和时间成本上不可承受。SDD 技能文档描述的 5 轮 fix loop 上限 + breaker 机制，对于一个课程项目来说过于繁重。实际中我们走了简化路径：subagent 跑测试通过即视为完成。

## 2. TDD 强制在 AI 协作下是阻碍还是放大器？

**是放大器，但需要条件。** 当 PLAN 已经精确定义了每个函数的输入输出和边界条件时，TDD 让 subagent 的工作有了明确的"完成"信号——"测试全绿"是一个 agent 无法误读的客观标准。没有这个标准，agent 会在"差不多好了"和"再改改"之间摇摆。

但 TDD 在以下情况下变成了阻碍：(1) 测试的 mock 设置比实现本身复杂（如状态机测试需要构造 4-5 步的 mock LLM 响应链）；(2) 测试依赖外部状态（如 credentials 测试依赖 macOS Keychain 是否已存在测试条目）。在这些场景下，"先写测试再实现"的线性流程不如"先写实现骨架，验证逻辑，再写正式测试"高效。

一个具体的发现是：**好的 PLAN 让 TDD 退化为验证而非驱动**。当 PLAN 已经给出了函数的完整实现代码时，测试的角色从"驱动设计"变成了"验证转录正确性"。这不是 TDD 的失败，而是说明在 AI 协作中，设计工作的重心前移到了 SPEC/PLAN 阶段。

## 3. Subagent-driven 工作流：agent 能自主运行多久？

本项目中，一个典型的 subagent 能在 45-120 秒内独立完成一个 task，自主程度很高。15 个 task 中有 13 个是一次派发即完成，不需要人工干预。两个需要关注的情况：

1. **Task 7 agent 因 API 连接中断失败**——这不是方法论问题，是基础设施稳定性问题。
2. **Task 13 (Web UI) agent 增加了未在 PLAN 中规定的 `resumeRun()` 方法**——这是 agent "自主发挥"的典型案例。这个增加是合理的（HITL 审批流程确实需要），但也说明当 task 涉及多文件协调时，agent 有超出 PLAN 范围自行设计的倾向。

**最优 task 颗粒度：** 经验是"单一文件 + 单一职责"。Task 4 (guardrails) 只涉及 guard.ts + guard.test.ts，agent 完成时间 60 秒，一次通过。Task 8 (state machine) 涉及 5 个模块的集成协调，虽然也是一次通过，但 agent 花费了 400+ 秒并经历了多次自修复循环。**如果一个 task 需要 agent 同时理解 3 个以上模块的接口，就应当拆分。**

## 4. SPEC/PLAN 质量如何影响实现质量？

**规约不清导致偏离的具体案例：**

PLAN Task 12 (机制演示) 中，测试文件命名为 `tests/mechanism-demo.ts`，但 vitest 的默认匹配模式是 `**/*.{test,spec}.*`。Subagent 发现测试不被 vitest 识别后，主动将文件重命名为 `tests/mechanism-demo.test.ts`——这是正确的修正，但如果 PLAN 一开始就写对文件名，agent 就不需要做这个判断。

另一个例子：Task 13 (Web UI) 的 PLAN 没有规定 HITL 审批流程中 engine 实例的生命周期管理（用户 approve 后如何恢复执行）。Agent 自行增加了 `resumeRun()` 方法和 per-socket engine Map——方向正确，但实现细节（如 promise 等待模式的竞态条件）未经充分思考。**如果 SPEC 对 HITL 状态转换有更精确的规定（如"approve 后 engine 从 WAITING_APPROVAL 同步转换到 EXECUTING，不重新进入主循环"），agent 的设计会更简洁。**

**规律：SPEC 越精确的地方，subagent 产出越一致；SPEC 留白的地方，subagent 会填上自己的理解——有时对，有时需要事后修正。**

## 5. 最有效的 prompt/context 策略

1. **"EXACT content" 指令：** 对机械转录 task，明确说"Write files with EXACT content specified above. No deviations."——这个指令让 agent 不"优化"代码风格或重构逻辑。
2. **提供完整测试代码而非让 agent 自己写：** 测试是判断 task 完成的客观标准，让 agent 自己写测试等于让它自己给自己打分。PLAN 中预先写好测试代码，agent 只负责让测试通过。
3. **接口契约前置：** 每个 task 的派发 prompt 都列出"Consumes X from Y"和"Produces Z"，agent 不需要猜测依赖模块的接口。
4. **避免让 agent 读整个 PLAN：** 用 task-brief 提取单个 task，agent 的上下文只包含它需要的东西。

为什么有效：这些策略共同降低了 agent 的"解释自由度"。当 agent 面对的信息越精确、越窄，它的产出越可预测。

## 6. 凭据与分发带来的工程思考

凭据安全（§3.1）和分发（§3.2）这两条要求，迫使我想清楚了以下原本会忽略的问题：

- **"在一台全新机器上从零运行"是一个硬核检验。** macOS Keychain 方案在 Docker 容器内不可用——这不是"加个 fallback 就好"的问题，而是需要设计一个完整的凭据生命周期：录入（隐藏输入）→ 存储（Keychain 或加密文件）→ 运行时读取（不经过环境变量）→ 查看状态（maskKey 不回显明文）→ 清除。
- **Docker 分发暴露了"开发环境假设"的脆弱性。** 本地测试的 credentials.test.ts 在 macOS 上通过依赖 `security` CLI——但这个测试在 Linux CI 环境中必须有不同行为。这种平台耦合在纯本地开发中不会被注意到。
- **凭据威胁模型的写作过程本身是有价值的。** 明确列出"威胁是什么、对手能力是什么、对策是什么"——这个思考框架比具体的技术方案更重要。

## 7. 如果重做，会改变什么？

1. **SPEC 阶段就写好所有测试代码。** 目前测试代码在 PLAN 中，应该在 SPEC 阶段就完成——测试是规约的另一种表达。
2. **Task 粒度的"2-5 分钟"标准不现实。** 实际是 1-6 分钟。应该明确定义为"一个 subagent 在一次会话内不需要人工干预即可完成的工作量"。
3. **Agent 模型选择可以有更系统的策略。** 本项目中模型的选用（haiku/sonnet）比较随意。应该定义：机械转录 → haiku，集成协调 → sonnet，新设计 → opus。
4. **提前在 CI 中跑一次完整测试。** 平台差异（macOS vs Linux）如果在早期就暴露，credentials 和 path 处理的设计会更有跨平台意识。

## 8. 对 Superpowers 方法论的批判

**Superpowers 的核心假设：**

1. **"流程纪律是 AI 协作中质量的关键保障"** —— 这个假设在本项目中**成立**。TDD 给 agent 提供了客观的完成判据，worktree 隔离防止了意外破坏，subagent 派发避免了上下文污染。没有这些纪律，一个 15-task 的项目在 agent 协作下很容易退化为"能跑就行"。

2. **"Agent 的输出需要人类 review 才能合入"** —— 这个假设在本项目中**部分成立**。Review 确实有价值，但完整的 review 循环（per-task review + fix loop + re-review）的成本在 token 和时间上远超其收益——尤其是当 task 本身是"PLAN 代码的转录"时。一个更务实的模型是：**对机械 task 以测试通过为 gate，只对设计密集型 task 执行完整 review。**

3. **"单个 task 应该由单个 subagent 完成"** —— **成立**。但我们还发现，多个完全独立的 task 可以在并行派发时获得数倍加速（6 个 task 同时进行），而 Superpowers 的 SDD 文档明确说"不要并行派发实现 subagent"。这个限制过于保守——只要 task 不修改共享文件，并行就是安全的。

4. **"人类应该做决策，agent 做执行"** —— 这个假设在项目中的实际边界比理论模糊。Task 13 agent 自行增加了 `resumeRun()` 方法——这是决策还是执行？一个合理的答案：**agent 可以在"局部正确性"范围内做决策（如"这段代码需要一个新的辅助方法"），但涉及架构、接口、安全策略的决策必须是人来做。**

**在项目中不成立的假设：**

- **"5 轮 fix loop 上限是合理的"** —— 本项目没有一个 task 需要第二轮。原因是 PLAN 已经有完整代码，agent 的工作是转录而非设计。如果 task 本质上是"实现一个开放性功能"而非"转录一个精确规约"，多轮 fix loop 才有意义。
- **"ledger 文件是恢复的关键"** —— 对于本项目（18 个 commits，单一 session），ledger 的实际价值有限。但对于跨 session、跨天的长项目，它的确重要。

**最终评价：** Superpowers 是一套为"可靠性"而非"速度"优化的方法论。在课程项目中，它的流程重量有时超过实际需要——但它强迫你思考的那些问题（规约、测试、评审、隔离、凭据、分发）恰恰是"当编码被自动化后，工程师的价值所在"这个问题的最好回答。
