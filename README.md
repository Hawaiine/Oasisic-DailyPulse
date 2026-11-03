# Oasisic-DailyPulse

**全平台热点聚合 · Daily Hot Topics Aggregator**

聚合 36 个平台的热搜/热榜，实时更新，一站式浏览。

## 特性

- 🔥 36 个热门平台（微博、知乎、百度、抖音、IT之家等）
- ⚡ 实时聚合，3 分钟自动刷新
- 📱 响应式设计，支持桌面/移动端
- 🌙 深色模式
- 📰 快讯时间线
- 🔍 全平台搜索



## 快速开始

### Docker 部署（推荐）

\`\`\`bash
git clone https://github.com/Hawaiine/Oasisic-DailyPulse.git
cd Oasisic-DailyPulse
cp .env.example .env
# 编辑 .env 修改 PULSE_TOKEN
docker-compose up -d
\`\`\`

访问 http://localhost:8790

详细部署教程见 [DEPLOYMENT.md](DEPLOYMENT.md)

## 技术栈

- **前端**: Vanilla JS + CSS
- **后端**: Node.js (Bun runtime)
- **部署**: Cloudflare Workers (边缘计算)
- **数据**: 多源聚合 + 去重排序

## 在线访问

https://news.noah-hermes.workers.dev

---

© 2026 Oasisic Project
