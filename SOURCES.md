# 数据源清单（实测）

探测环境：Cloudflare Workers 线上（`news.noah-hermes.workers.dev`），2026-10-30。
状态：`ok` = 实测返回真实条目；`degraded` = 上游偶发拒绝、用快照兜底；`blocked` = 持续被拒。

| # | id | 名称 | 类别 | 接口 | 方式 | TTL | 实测条目 | 状态 |
|---|---|---|---|---|---|---|---|---|
| 1 | `weibo` | 微博 | social | `weibo.com/ajax/side/hotSearch` | GET + Referer | 180s | 50 | ok |
| 2 | `zhihu` | 知乎 | social | `api.zhihu.com/topstory/hot-lists/total` | GET | 300s | 29 | ok |
| 3 | `baidu` | 百度 | social | `top.baidu.com/api/board` | GET | 180s | 50 | ok |
| 4 | `douyin` | 抖音 | social | `douyin.com/aweme/v1/web/hot/search/list` | GET | 240s | 48 | ok |
| 5 | `toutiao` | 今日头条 | social | `toutiao.com/hot-event/hot-board` | GET | 240s | 50 | ok |
| 6 | `tieba` | 百度贴吧 | social | `tieba.baidu.com/hottopic/browse/topicList` | GET | 300s | 30 | ok |
| 7 | `douban-movie` | 豆瓣电影 | ent | `movie.douban.com/j/search_subjects` | GET | 3600s | 30 | ok |
| 8 | `thepaper` | 澎湃新闻 | news | `cache.thepaper.cn/contentapi/wwwIndex/rightSidebar` | GET | 600s | 20 | ok |
| 9 | `wallstreetcn` | 华尔街见闻 | news | `api-one.wallstcn.com/apiv1/content/lives` | GET | 120s | 40 | ok |
| 10 | `36kr` | 36氪 | news | `gateway.36kr.com/api/mis/nav/home/nav/rank/hot` | POST | 600s | 50 | ok（线上正常；本地 workerd 会重置） |
| 11 | `ithome` | IT之家 | news | `api.ithome.com/json/newslist/news` | GET | 300s | 26 | ok |
| 12 | `tencent` | 腾讯新闻 | news | `r.inews.qq.com/gw/event/hot_ranking_list` | GET | 600s | 40 | ok |
| 13 | `netease` | 网易新闻 | news | `m.163.com/fe/api/hot/news/flow` | GET | 300s | 40 | ok |
| 14 | `sina` | 新浪热榜 | news | `newsapp.sina.cn/api/hotlist` | GET | 300s | 45 | ok |
| 15 | `zhihu-daily` | 知乎日报 | news | `daily.zhihu.com/api/4/news/latest` | GET | 1800s | 4 | ok（`news-at` 子域 CF→CF 下 530） |
| 16 | `hackernews` | Hacker News | tech | `hn.algolia.com/api/v1/search?tags=front_page` | GET | 300s | 30 | ok |
| 17 | `github` | GitHub Trending | tech | `github.com/trending?since=daily` | GET + HTML 解析 | 1800s | 15 | ok |
| 18 | `juejin` | 稀土掘金 | tech | `api.juejin.cn/content_api/v1/content/article_rank` | GET | 600s | 50 | ok |
| 19 | `sspai` | 少数派 | tech | `sspai.com/api/v1/article/index/page/get` | GET | 900s | 10 | ok |
| 20 | `bilibili` | 哔哩哔哩 | ent | `api.bilibili.com/x/web-interface/ranking/v2`（+app rank+popular 三级兜底） | GET | 600s | 20 | degraded（CF 出口常 412，快照兜底） |

## 已探测未接入

| 站点 | 接口 | 结果 | 处理 |
|---|---|---|---|
| 知乎网页版 | `www.zhihu.com/api/v3/...` | 401 身份未验证 | 改用 `api.zhihu.com` |
| 财联社 | `www.cls.cn/v1/roll/get_roll_list` | `errno 10012 签名错误` | 需算 sign，暂缓 |
| V2EX | `www.v2ex.com/api/topics/hot.json` | 403 Cloudflare 挑战 | 暂缓 |
| 雪球 | `xueqiu.com/statuses/hot/listV2.json` | WAF 注入 cookie 校验 | 需先取 cookie |
| 凤凰网 | `shankapi.ifeng.com/...` | `not found` | 接口下线 |
| 联合早报 | `zaobao.com.sg` | TLS EOF | 暂缓 |
| 虎扑 | `bbs.hupu.com/topic-hot` | 返回足球话题区，非热榜 | 待找热帖接口 |
| 快手 | `www.kuaishou.com/graphql` | 需 graphql + 签名 | 暂缓 |

## 增删源

1. 在 `src/sources/{social,news,tech}.ts` 新增对象（`id / name / category / kind / home / ttl / fetch`）。
2. 加入对应导出数组。
3. `curl 'http://127.0.0.1:8787/api/hot/<id>?limit=3'` 验证真实条目，登记本文件。
4. 补一份 fixture 到 `test/fixtures/` 并加进 `test/sources.test.ts` 映射表，保证回放测试覆盖。
