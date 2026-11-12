# 哔哩哔哩课程项目

Spring Boot、MySQL 和原生 HTML/CSS/JavaScript 实现首页、搜索、分区、排行榜与视频播放。

## 目录

```text
b站网页代码/
├─ bilibili-home/
│  ├─ src/main/java/                  页面路由、视频接口、数据库查询
│  ├─ src/main/resources/static/      HTML、CSS、JavaScript 和图片
│  ├─ src/main/resources/application.properties
│  ├─ scripts/insert-experiment-video.sql
│  ├─ pom.xml
│  └─ start.ps1
└─ media/
   └─ videos/20260619_035713.mp4
```

`home.css` 控制页面样式，`home.js` 负责视频列表与播放，`login.js` 负责登录提示和弹窗。

## 运行

需要 JDK 17 或更新版本、Maven 和 MySQL 8。启动脚本优先使用 `.build-tools` 内的 JDK、Maven；首次构建需要下载依赖。

1. 在 MySQL 中导入课程提供的 `bilibili_v6.sql`。已有数据库无需重复导入。实验视频可通过 `scripts/insert-experiment-video.sql` 登记，该脚本可重复执行。
2. 在 VS Code 中打开 `bilibili-home`，在 PowerShell 终端运行：

   ```powershell
   .\start.ps1
   ```

3. 按提示输入 MySQL 密码，打开 http://127.0.0.1:8080/。按 Ctrl+C 停止。

修改源码后运行 `.\start.ps1 -Rebuild`。其他数据库账号和端口使用 `-DbUser 用户名`、`-Port 8081`。

## 配置

默认连接本机 `bilibili_v6` 数据库，用户名为 `root`。可用 `BILI_DB_URL`、`BILI_DB_USER`、`BILI_DB_PASSWORD` 环境变量覆盖配置。

数据库保存 `media/videos/...` 和 `media/covers/...` 相对路径。`app.media-root` 默认是项目上一层，因此移动时保留上面的目录结构即可。更换媒体位置可设置 `BILI_MEDIA_ROOT` 为包含 `media` 的目录。

实验视频封面使用项目内置图片。其他缺失封面显示分区占位图，缺失视频会提示不可用。视频页尝试自动播放，浏览器限制有声播放时改为静音播放。

从首页进入其他页面时新开标签页；其他页面内的跳转和返回首页使用当前标签页。登录、消息、收藏、历史提供悬浮登录提示，投稿提供三个投稿入口，创作中心点击打开登录弹窗。账号验证等模块待接入。

## 接口

- `/api/categories`：分区。
- `/api/authors/{id}`：作者资料与关注、粉丝、公开视频数；头像和合集分别通过 `/avatar`、`/collections` 子路径读取。
- `/api/videos`：视频列表，支持 `q`、`tag`、`categoryId`、`authorId`、`compilationId`、`sort`、`page`、`size`。
- `/api/ranks/weekly`：周榜，可按 `categoryId` 筛选。
- `/api/videos/{id}`：视频详情。
- `/api/videos/{id}/cover`：封面。
- `/api/videos/{id}/stream`：视频，支持拖动进度。

仅展示公开且已发布的视频。首页推荐置顶实验视频，其余按日期稳定排序；热门按播放量排序。

首页分区直接读取 `videocategorytable`，包括新增的“娱乐”分区，无需在前端维护分区名称或 ID。尚未添加视频的分区仍显示入口，进入后提示“本分区暂无视频，敬请期待后续更新”。后续视频关联该分区的 `CategoryID`，并设为公开且已发布后，会自动出现在分区列表中。

作者空间 `/space/{UID}` 参照 B 站个人空间布局，提供主页、投稿、合集和系列、作者视频搜索，不包含动态。资料、关注数、粉丝数和合集读取数据库；代表作暂取该作者播放量最高的公开视频。关注、发消息仍使用现有登录弹窗。未设置空间背景时使用网站横幅，头像文件缺失时显示昵称首字。

## 视频详情页（未登录）

视频页包含自定义播放控制、UP 主资料、互动统计、弹幕列表与推荐视频，不包含评论、回复。

- `/api/videos/{id}/engagement`：视频点赞数、投币数、收藏数及转发数。投币数按 `coinrecordtable` 中该视频负向 `CoinChange` 的绝对值求和。
- `/api/videos/{id}/danmaku`：返回该视频 `active` 弹幕及发送者编号，按发送时间排序。
- 未登录的点赞、投币、收藏、转发、关注和发送弹幕复用现有登录弹窗，没有数据库写入。
- 每个视频累计实际播放 30 秒后暂停，打开登录弹窗。暂停、缓冲与拖动距离不计时；倍速按实际经过的播放时间计时。试看时长保存在当前浏览器 `localStorage`，刷新后保留。此限制用于当前未登录页面体验。
- 弹幕列表可展开、收起、滚动；屏蔽以发送者为单位，在当前浏览器保存，支持取消屏蔽。
- 清晰度仅使用原始视频文件；倍速、字幕播放为登录可享，未登录可调整和保存字幕偏好。音量采用竖向悬浮滑杆；播放器支持镜像、循环、自动开播偏好及图标悬停提示。画中画、全屏取决于浏览器支持。

修改后先在原终端按 Ctrl+C 停止旧服务，再运行 `./start.ps1 -Rebuild`，打开视频页并按 Ctrl+F5 刷新。
行为验证：`node scripts/verify-watch.cjs`。

详情页补充：`/api/videos/{id}/collection` 根据 `videotable.CompilationID` 和 `compilationtable` 返回当前合集及公开视频列表；无关联时返回空合集，前端不显示合集框。列表按上传时间、视频编号排序，高亮当前集，自动切集优先播放合集下一集。

弹幕设置支持本地保存显示区域、透明度、字号、速度、密度与屏蔽词；当前数据库弹幕为普通滚动弹幕。更多播放设置支持自动切集／播完暂停、画面比例、浏览器音量均衡、隐藏黑边、关灯模式和原生／页面小窗。编码切换需要额外视频源，热度曲线需要真实统计，目前对应选项禁用。互动图标悬停时轻微摆动，并遵循系统减少动态效果的偏好。

在线观看人数：`POST /api/videos/{id}/viewers` 接收每个标签页的匿名会话心跳，15 秒更新一次，45 秒无心跳过期；进入后台、离开页面时主动移除。按可见视频标签页统计，不区分自然人；暂停或试看结束后仍停留在前台的页面也计入。数据保存在当前后端进程内存，重启后重新统计，适用于单实例部署，无需新增数据库表。前端验证：`node scripts/verify-presence.cjs`。
