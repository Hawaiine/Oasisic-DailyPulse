# Oasisic-DailyPulse 部署教程

本文档提供三种部署方式：**Docker 容器部署**、**直接部署**和**Cloudflare Workers 部署**。

---

## 方式一：Docker 容器部署（推荐）

### 前置要求
- Docker 20.10+
- Docker Compose 2.0+

### 快速开始

1. **克隆仓库**
```bash
git clone https://github.com/Hawaiine/Oasisic-DailyPulse.git
cd Oasisic-DailyPulse
```

2. **配置环境变量**
```bash
cp .env.example .env
# 编辑 .env，修改 PULSE_TOKEN（API 访问令牌）
```

3. **启动容器**
```bash
docker-compose up -d
```

4. **验证运行**
```bash
curl -H "x-pulse-token: your-token" http://localhost:8790/api/sources
```

### 配置说明

**docker-compose.yml** 关键配置：
- `ports`: `8790:8790` - 映射端口（可改为 `8080:8790`）
- `volumes`: `./data:/app/data` - 数据持久化
- `PULSE_TOKEN`: API 访问令牌（必须修改）

### 生产环境建议

1. **反向代理**（Nginx/Caddy）
```nginx
server {
    listen 80;
    server_name hot.example.com;
    
    location / {
        proxy_pass http://localhost:8790;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

2. **自动重启**
容器配置了 `restart: unless-stopped`，系统重启后自动恢复。

3. **健康检查**
内置健康检查，每 30 秒探测 `/api/sources`。

### 维护

**查看日志**
```bash
docker-compose logs -f
```

**重启服务**
```bash
docker-compose restart
```

**更新代码**
```bash
git pull
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## 方式二：直接部署

### 前置要求
- Bun 1.1+ (推荐) 或 Node.js 20+
- 2GB+ RAM

### 步骤

1. **安装依赖**
```bash
bun install
# 或使用 npm
npm install
```

2. **配置环境**
```bash
cp .env.example .env
# 编辑 .env
```

3. **启动服务**
```bash
bun src/server/index.ts
# 或
node src/server/index.ts
```

### 进程管理（PM2）

```bash
npm install -g pm2
pm2 start src/server/index.ts --name dailypulse --interpreter bun
pm2 save
pm2 startup
```

---

## 方式三：Cloudflare Workers 部署（边缘计算）

### 前置要求
- Cloudflare 账号
- Wrangler CLI

### 步骤

1. **安装 Wrangler**
```bash
npm install -g wrangler
wrangler login
```

2. **配置 Worker**
编辑 `worker/wrangler.jsonc`：
```jsonc
{
  "name": "your-worker-name",
  "compatibility_date": "2024-01-01"
}
```

3. **部署**
```bash
cd worker
wrangler deploy
```

4. **验证**
访问 `https://your-worker-name.your-subdomain.workers.dev`

### 自定义域名

在 Cloudflare Dashboard → Workers → 你的 Worker → Triggers → Custom Domains 添加域名。

---

## 环境变量说明

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PULSE_TOKEN` | API 访问令牌（强制） | - |
| `PORT` | 服务端口 | `8790` |
| `NODE_ENV` | 运行环境 | `production` |

---

## API 端点

| 端点 | 说明 |
|------|------|
| `GET /api/sources` | 获取所有数据源状态 |
| `GET /api/bootstrap` | 获取所有热搜数据 |
| `GET /api/hot/:source` | 获取指定源的热搜 |
| `GET /api/timeline` | 获取时间线快讯 |

所有 API 请求需携带 Header：
```
x-pulse-token: your-token
```

---

## 数据源列表

项目聚合 36 个平台：

**社交媒体**：微博、知乎、豆瓣电影、抖音、贴吧、什么值得买、微信读书、虎扑

**科技媒体**：IT之家、36氪、掘金、少数派、虎嗅、爱范儿、AcFun、V2EX、果壳、NGA

**新闻媒体**：澎湃新闻、百度、今日头条、网易新闻、新浪科技、腾讯新闻、知乎日报

**国际媒体**：Hacker News、Product Hunt、GitHub Trending、BBC中文、纽约时报中文、华尔街见闻、联合早报

---

## 常见问题

### Q: 端口 8790 被占用？
修改 `docker-compose.yml` 的 `ports` 为 `8080:8790`。

### Q: 数据多久更新一次？
每个源独立刷新，TTL 3-10 分钟不等。前端默认 3 分钟自动刷新。

### Q: 如何添加新数据源？
编辑 `src/sources/*.ts`，参考现有源结构添加。

### Q: Worker 部署后没数据？
Worker 依赖后端源站。需要同时部署 Docker/直接部署作为源站，Worker 仅作为边缘缓存。

---

## 技术栈

- **运行时**: Bun / Node.js
- **前端**: Vanilla JS + CSS (无框架)
- **部署**: Docker + Cloudflare Workers
- **数据**: 文件系统缓存 (data/)

---

## License

MIT

---

## 问题反馈

https://github.com/Hawaiine/Oasisic-DailyPulse/issues
