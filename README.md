<p align="center">
  <h1 align="center">opencode-foxcode-aws-cache</h1>
  <p align="center">
    让 OpenCode 在使用 Foxcode AWS 渠道时启用 Prompt 缓存
  </p>
</p>

<p align="center">
  <a href="#为什么需要">为什么需要</a> •
  <a href="#安装">安装</a> •
  <a href="#配置">配置</a> •
  <a href="#工作原理">工作原理</a>
</p>

---

## 为什么需要

[Foxcode](https://foxcode.rjj.cc/auth/register?aff=RH5X) 的 AWS 渠道要求请求中必须包含 `metadata.user_id` 字段才能启用 Prompt 缓存。

**没有此插件**：每次请求都按全价计费 💸

**使用此插件**：自动注入 `user_id`，启用缓存，节省费用 ✨

> 🎁 还没有 Foxcode 账号？[点击注册](https://foxcode.rjj.cc/auth/register?aff=RH5X)

---

## 安装

```bash
npm install -g opencode-foxcode-aws-cache
```

---

## 配置

### 1. 添加插件

在 `opencode.json` 中添加：

```json
{
  "plugin": ["opencode-foxcode-aws-cache"]
}
```

### 2. 配置 Provider

```json
{
  "provider": {
    "foxcode-aws": {
      "npm": "@ai-sdk/anthropic",
      "options": {
        "baseURL": "https://code.newcli.com/claude/droid/v1"
      },
      "models": {
        "claude-opus-4-5": {
            "name": "claude-opus-4-5",
            "thinking": true
        },
        "claude-sonnet-4-5": {
            "name": "claude-sonnet-4-5",
            "thinking": true
        },
        "claude-haiku-4-5-20251001": {
            "name": "claude-haiku-4-5-20251001"
        }
      }
    }
  }
}
```


---

## 工作原理

插件通过自定义 `fetch` 拦截 Anthropic API 请求，自动注入 `metadata.user_id`：

```json
{
  "model": "claude-...",
  "messages": [...],
  "metadata": {
    "user_id": "user_{projectId}_account__session_{sessionId}"
  }
}
```

---

## 注意事项

> ⚠️ 此插件使用了未在官方文档中记录的 `auth.loader` hook，未来版本可能不兼容。

---

## 致谢

本插件的实现思路参考了 [@GangWangAI](https://github.com/GangWangAI) 在 [PR #8138](https://github.com/anomalyco/opencode/pull/8138/) 中提出的方案。

---

## 许可证

MIT
