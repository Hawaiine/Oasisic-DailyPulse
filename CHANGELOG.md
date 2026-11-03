# Changelog

本文档记录 Oasisic-DailyPulse 的版本历史和重要更新。

---

## [1.0.0] - 2026-11-03

### 🎉 首次发布

**核心功能**
- ✅ 36 个热搜平台聚合（微博、知乎、抖音、IT之家、虎扑、虎嗅等）
- ✅ 快讯时间线功能（聚合 5 源、15 条实时快讯）
- ✅ 响应式设计 + 深色模式
- ✅ 3 分钟自动刷新

**部署方式**
- ✅ Docker 容器部署（推荐）
- ✅ 直接部署（Bun/Node.js）
- ✅ Cloudflare Workers 边缘部署

**UI 优化（22 项）**
1. 横向/纵向滚动修复
2. 点击区域 ≥36px（移动端友好）
3. 平台导航渐隐遮罩
4. Logo 视觉统一（object-fit + 大 logo scale）
5. 热度格式化（36 源全覆盖）
6. 角标间距优化
7. 手机端布局修复（防止横向溢出）
8. 刷新按钮修复

**数据层**
- 修复知乎 URL（`/questions/` → `/question/`）
- 修复微信读书 URL（`/web/bookDetail/` → `/web/reader/`）
- 修复果壳解析错误
- 扩展角标白名单（+4 类型）
- 移除不稳定源（快手、小红书）

**资源**
- 修复 21 个 logo
- 新增 manifest.json（43 条目）
- Service Worker v4.2

**文档**
- README.md（项目介绍 + 快速开始）
- DEPLOYMENT.md（3 种部署方式完整教程）
- .env.example（环境变量模板）

### 技术栈

- **运行时**: Bun 1.1+ / Node.js 20+
- **前端**: Vanilla JS + CSS（无框架）
- **容器化**: Docker + Docker Compose
- **边缘部署**: Cloudflare Workers
- **数据缓存**: 文件系统（data/）

### 在线体验

- **Worker 部署**: https://news.noah-hermes.workers.dev
- **GitHub 仓库**: https://github.com/Hawaiine/Oasisic-DailyPulse

---

## 版本规范

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)：

- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能性新增
- **修订号**：向下兼容的问题修正
