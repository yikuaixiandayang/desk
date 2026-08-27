# GLM-5.2 接口连通性报告（Task 0）

- 测试日期：2026-08-16
- 测试环境：Windows 10 (19045) / Git Bash / curl 8.x，Node v22.23.1
- 端点：`http://172.22.40.153:8642`（内网直连，无代理）

## 结论

**可达，接口调通。** 可进入正常对接（无需 mock 降级）。

## 明细

| 项目 | 结果 |
| --- | --- |
| GET `/v1/models` | HTTP 200，69ms |
| POST `/v1/chat/completions`（model=GLM-5.2） | HTTP 200，1.68s |
| 鉴权 | `Authorization: Bearer hermes_sk_…` 有效 |

### 响应样例（chat completions）

```json
{
  "id": "chatcmpl-7a40966e5bf040c5b20f76f4c6b72",
  "object": "chat.completion",
  "created": 1786889483,
  "model": "GLM-5.2",
  "choices": [
    {
      "index": 0,
      "message": {"role": "assistant", "content": "连通性测试通过，我在。"},
      "finish_reason": "stop"
    }
  ],
  "usage": {"prompt_tokens": 18001, "completion_tokens": 9, "total_tokens": 18010}
}
```

## 发现与注意事项

1. **模型列表与实际可用模型不一致**：`/v1/models` 仅返回 `hermes-agent`，但请求 `model: "GLM-5.2"` 可正常返回（响应中 `model` 字段回显 `GLM-5.2`）。按规格继续使用 `GLM-5.2`。
2. **服务端疑似注入了约 18000 token 的系统提示**（单条短消息 `prompt_tokens=18001`）。网关具备 agent 语义，会话历史截断策略（默认 20 轮）保持不变即可，但避免注入超长上下文。
3. **错误码记录**：body 非法 JSON 时返回 HTTP 400 `invalid_request_error`。应用内使用 Node fetch + `JSON.stringify` 不会出现该问题（测试中 400 为 Git Bash 内联引号转义所致）。
4. **超时建议**：本地内网往返 < 2s；按规格保留 30s 超时与本地预设回复降级。

## 对 Task 7 的影响

- 直接采用真实接口对接，无需 mock；降级逻辑仍按规格实现（超时/异常时本地预设回复）。
- API Key 按规格存放于本地配置文件 / 环境变量，不硬编码入库。
