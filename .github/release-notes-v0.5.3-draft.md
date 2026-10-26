## 如何升级

> 发布说明修订（不更换 v0.5.3 附件）：现有二进制和 keepalive 附件仍可能内置上游地址；下面的显式发布源可确保本次更新从 Fork 获取。默认源的代码修复须随后续新版本发布，本说明修订本身不会改变已有附件。

配置、登录状态、收件箱都兼容，**不需要重新扫码**；正在运行的 wx-bot 服务会自动重启。

安装和更新统一使用 [hongpeiqin/wx-bot](https://github.com/hongpeiqin/wx-bot)。旧二进制（包括已发布的 v0.5.3）可能仍默认查询上游，所以升级命令显式指定 Fork 发布源。

| 你现在的版本 | 升级命令 |
| --- | --- |
| v0.4.0 及以后 | `WXBOT_RELEASE_BASE=https://github.com/hongpeiqin/wx-bot/releases wx-bot update` |
| 任何版本（包括 Go 版 v0.3.x） | `curl -fsSL https://raw.githubusercontent.com/hongpeiqin/wx-bot/main/install.sh \| bash` |
| Docker（如 Pi Durable） | 从本 Fork 的 `v0.5.3` 标签构建本地镜像，再重建容器，见 [镜像说明](https://github.com/hongpeiqin/wx-bot/blob/main/docs/integrations/pi-durable.md#1-镜像)；Fork GHCR 镜像未核实，不使用上游镜像替代 |

让 Agent 升级：对 Grok Bot / Muse 说「帮我把 wx-bot 从 hongpeiqin/wx-bot 升级到最新版」，它会按 [升级说明](https://github.com/hongpeiqin/wx-bot/blob/main/docs/agents/upgrade.md) 执行。首次迁移建议用上表的 Fork 安装脚本刷新旧保活脚本的自动重装地址。

升级后用 `wx-bot version` 确认版本为 `v0.5.3`。Fork 最新版不高于当前版本时不会自动降级；指定安装本版可在上述 update 命令后加 `--version v0.5.3`。需要回滚：`WXBOT_RELEASE_BASE=https://github.com/hongpeiqin/wx-bot/releases wx-bot update --version <本 Fork 的旧版本>`。

---

## What's Changed

* docs: publish Muse optimized prompt to main by @hongpeiqin in https://github.com/hongpeiqin/wx-bot/pull/1

## New Contributors

* @hongpeiqin made their first contribution in https://github.com/hongpeiqin/wx-bot/pull/1

**Full Changelog**: https://github.com/hongpeiqin/wx-bot/commits/v0.5.3
