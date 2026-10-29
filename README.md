# dsh-response-annotations — DSH 回复批注（Codex 同款）

在 DSH Web GUI 里复刻 Codex / ChatGPT 桌面版的 **response annotations**：

1. 在已完成的助手回复中选中文字（拖选或双击选词均可）→ 浮动工具条「添加到对话」。
2. 可选填写评论；保存后回复正文的**选区末尾**出现编号气泡，点击气泡高亮原文。
3. 输入框**上方**出现「N 条批注」胶囊，可展开编辑 / 删除 / 清空。
4. 发送时自动在文本前附加 Codex 同款 `<response-annotations>` 结构化块；
   也支持**只发批注**（空输入框按宿主发送快捷键 / 点胶囊纸飞机 / 点盖住宿主主按钮的批注按钮；
   运行中会盖住 Stop，删光批注后 Stop 自动恢复）。
5. 已发送消息折叠为只读的「N 条回复批注」卡片，原回复上保留灰色评论气泡，点气泡可看原文+评论、可定位。

纯浏览器端 Client 插件：Host 半边为空 `apply()`，不注册工具、不改 Host 行为、不发任何网络请求。

## AI 创作声明 / AI Disclosure

- 本项目的初版代码、测试与文档由 **DeepSeek Harness**（模型 `deepseek-flash`，agent 会话）生成，由 **Ava** 维护与发布（2026-10）。
- 设计参考 OpenAI Codex 的 response annotations 行为与公开资料；**未复制其代码**。
- 相关提交会在 commit message 里带 `Assisted-by: DeepSeek Harness (deepseek-flash)` 说明。

## 安装

从 GitHub 安装即可，无需 npm：

### 方式 A：DSH 客户端 Plugins 页

1. 打开 DSH 客户端 → 左侧边栏 **Plugins**
2. **Add plugin** 右侧箭头 → **Install a third-party plugin**
3. 填 GitHub 地址：`https://github.com/bovvl/dsh-response-annotations`
4. **Install** → **Enable now** → 刷新页面

### 方式 B：CLI（CLI 管理的 profile）

```bash
dsh plugin --profile <profile> add github:bovvl/dsh-response-annotations
```

安装后刷新页面（或依赖 HMR）即可。

### 本地开发

```bash
dsh plugin --profile <profile> add /abs/path/to/dsh-response-annotations
```

成功标志：打开任意会话，选中一段**已完成**（非流式中）的助手回复文字，
出现「添加到对话」浮动按钮。插件清单：

- Client 入口：`client.js`（由 `build.mjs` 从 `src/*.js` 生成，勿手改）
- 槽位：`shell.overlay`（浮动工具条 / 评论卡 / 定位时的临时高亮）、
  `conversation.input.overlay`（输入框上方的「N 条批注」胶囊）、
  `conversation.user.text.node`（已发送只读卡片）
- 注册的 user-text 规则：`dsh-response-annotations`（order `-100`）
- 包装 `conversation.sendSession` 以附加载荷（发送成功才消费）
- 定位：胶囊行 / 已发送卡片条目上的「定位」按钮会滚动到原回复并临时高亮选中段落

## 兼容性与 dshbase 验证

- **适配版本**：DSH `0.2.1-rc.3`（在此版本上完成开发与实机验证；更早/更新的版本未验证）
- **插件类型**：web-only（仅 Web 前端；Host 半边为空，无工具/无 session 行为/无网络请求）
- **dshbase 验证级别**：
  - L1 安装：可过（`dsh plugin add github:bovvl/dsh-response-annotations` 实测成功）
  - L2 加载：可过（profile 启动后 `/plugins/events` 出现本插件 entry，bundle 正常下发）
  - L3 Headless：不适用（web-only 不经停）
  - L4 Web CDP：需由 dshbase 的 Web profile + 浏览器 CDP 实测；本仓库未包含该自动化
- **升级风险**：插件依赖 `shell.overlay` / `conversation.input.overlay` / `conversation.user.text.node`
  等槽位、`conversation.sendSession` 内部方法与 ui-chat 的 DOM 锚点
  （`data-chat-flow-kind="assistant-step"`、`data-chat-node-key`、`data-conversation-session`
  以及发送按钮的 `_primary` 类名）。DSH 升级若调整这些实现，可能出现气泡缺失/定位失败/发送不再附加批注；
  代码已对这些读取做 try/catch 与降级，但无法承诺跨版本 100% 兼容。

### L1/L2 自测命令

```bash
# L1 安装
dsh plugin --profile <profile> add github:bovvl/dsh-response-annotations

# L2 加载：启动 Web profile 后检查插件图
dsh web --host 127.0.0.1 --port <port> --no-open
curl -s http://127.0.0.1:<port>/plugins/events | grep dsh-response-annotations
```

## 本地校验

仓库已提交构建产物 `client.js`，安装时不需要构建；改 `src/` 后重新生成：

```bash
node build.mjs
node --check client.js
node --test test/core.test.mjs
node --test test/smoke.test.mjs   # 额外的加载/包装冒烟测试
```

## 载荷（与 Codex 对齐，产品名改成 assistant response）

```text
\n# Response annotations:\n<PREAMBLE>\n<response-annotations>\n[JSON]\n</response-annotations>\n\n## My request:\n<用户原文>
```

`JSON` 每项形如 `{"text":"所选文本","annotation":"可选评论","source":{"messageId":"..."}}`；
空评论丢弃 `annotation` 键；`messageId` 缺失时回退为 `nodeKey`。
解析失败时原样显示消息，不隐藏任何内容。

## 数据与持久化

- 每个会话独立：`localStorage['dsh-annotation.v1.<sessionId>']`（历史 key，保留以兼容已有批注与气泡存档）。
- 记录 `{id, nodeKey, messageId, start, end, quote, prefix, suffix, comment, createdAt}`；
  `start/end` 是该行渲染文本的 offset，用 `quote` + 前后 40 字上下文重锚定。
- 发送成功后清空该会话 pending 集合；发送失败保留。

## 与原版 Codex 的差异 / 已知限制

- **只有“添加到对话”**：v1 未实现 More details / Ask in side chat / 内联 `:codex-annotation` 指令渲染。
- **仅助手回复**：文件 / Diff / 终端选区、跨消息选区、流式中的回复都不提供添加按钮。
- **气泡**：待发送批注显示编号气泡（贴在选区末尾），已发送批注显示灰色评论气泡（按会话持久化，
  刷新后仍在；旧消息在渲染已发送卡片时会自动回填）。点击气泡会高亮被批注的原文，最长 6 秒；
  期间若在插件外点击/按键或产生新选区会提前取消，滚动不会取消。
  已发送气泡存档每会话保留最近 1000 条（超出只隐藏最老的灰色气泡，不影响消息里的批注卡片与「定位」）。
- **双击选词**：选区捕获对锚点偏移计算做了容错（探针异常/顺序不一致时按原文匹配）；
  仍失败时会在屏幕底部显示带数字细节的诊断提示。
- **支持“只发批注”**：三种入口——胶囊里的纸飞机按钮、盖在宿主发送按钮上的批注发送按钮、
  空输入框按宿主发送快捷键（从 `fixed.send` / `fixed.complementary` 目录读取，Enter 与 Cmd/Ctrl+Enter
  都跟随 DSH 绑定）。仍不支持把批注连同 `/` 命令一起发（命令消息会跳过批注附加）。
- **发送钩子是非官方能力**：通过包装 `conversation.sendSession` 实现；DSH 升级若改动该方法签名需要适配。
  包装带 `__dshAnnotationWrapped` 幂等标记，卸载/热更新时恢复原方法。
- **文本里真实存在载荷块**：模型可见；显示层由 user-text 规则折叠为卡片，但复制消息文本时仍包含原始块。
  若引用的原文里出现换行形式 `</response-annotations>` 之类极端内容，显示解析会安全降级为原文。
- **定位依赖 DOM 锚点**：`[data-chat-flow-kind="assistant-step"]`、`[data-chat-node-key]`、
  `[data-conversation-session]` 是 ui-chat / ui-conversation 的内部实现；升级可能变化，
  定位失败时只提示找不到，数据不丢。
- **messageId 可能为空**：Chat target 未激活或节点未加载时解析失败，载荷 `source.messageId` 回退为 `nodeKey`。
- **仅本 origin**：不同端口/域名访问时的 localStorage 不互通（例如本机地址与隧道域名），无跨端 / 跨标签实时同步。
- **验证范围**：已在 DSH `0.2.1-rc.3` 的 desktop / web profile 实机验证（选中、评论、只发批注、气泡、定位、高亮）；未覆盖所有操作系统与 DSH 未来版本。

## 文件

```text
package.json  cordis.patch.yml  index.js  client.js  build.mjs
locale/{en,zh}.json  icon.svg  README.md  LICENSE  .gitignore
src/{core,store,selection,ui,capsule,usertext,apply}.js
test/{core,smoke}.test.mjs
```
