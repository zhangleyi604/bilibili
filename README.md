# 哔哩哔哩首页复刻

第二组数据库课程项目的第一阶段。Spring Boot 提供网页和 JSON 接口，HTML、CSS 和原生 JavaScript 在浏览器里运行。服务默认仅监听本机。

## 在 VS Code 运行

1. 用 VS Code 打开 `bilibili-home` 文件夹。准备 JDK 17 或更新版本、MySQL 8 和 Maven 3.6.3 或更新版本。项目优先使用 `.build-tools` 里已有的 JDK 和 Maven。换到别的电脑时，也可以通过 `JAVA_HOME` 和 `PATH` 指定本机工具。首次 Maven 构建需要联网。
2. 本机 `bilibili_v6` 已登记「实验视频1」，ID 为 `10102`，可直接启动项目。如果换到另一套数据库，在该库下运行 [新增视频 SQL](scripts/insert-experiment-video.sql)。它按唯一媒体路径去重，并返回视频 ID、时长、状态和播放量。全新空库需先导入你提供的完整 `bilibili_v6.sql`。完整文件包含删表语句。
3. 在 VS Code 的 PowerShell 终端中运行下方命令，按提示输入 MySQL 密码。命令使用 PowerShell 和脚本的完整路径，可以从任意目录运行。换到别的电脑时，把 `-File` 后面的路径改为实际的 `start.ps1` 路径。默认用户名为 `root`。使用其他账号时，加上 `-DbUser 你的用户名`。

   ```powershell
   & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File 'D:\codex哔哩哔哩后端技术\bilibili-home\start.ps1'
   ```

4. 打开 [本地首页](http://127.0.0.1:8080/)。点击首页首批推荐中的「实验视频1」，或在搜索框输入完整标题。进入独立视频页后点击播放。终端按 Ctrl+C 停止服务。

修改源码后，在启动命令末尾加 `-Rebuild` 重新构建并启动。

## 媒体和数据库

- 「实验视频1」使用你提供的原始 MP4，应用从 `D:/OneDrive/桌面/bilibilivideos/20260619_035713.mp4` 读取。MP4 实测 18.80 秒，表里的整数时长取 19 秒。封面为项目中已有的视频截图。
- 演示记录使用附件中的样例上传者 `UID=10001`，分区为「生活」`CategoryID=10003`，直接登记为公开发布。附件的 `trg_video_play_ai` 会为该记录创建初始播放量。这是课程演示数据的导入步骤，正式投稿审核属于后续模块。
- 其他记录保留原有的 `media/covers/...` 和 `media/videos/...`。启动脚本会尝试使用工作区中的 `MySQL严格Word版_v5` 样例媒体。如果记录所指文件缺失，首页显示分区占位封面，播放器给出文件提示。
- 更换数据库地址时，在启动前设置 `$env:BILI_DB_URL = 'jdbc:mysql://127.0.0.1:3306/bilibili_v6?connectionTimeZone=Asia/Shanghai&characterEncoding=UTF-8'`。
- 更换视频或媒体目录时，设置 `$env:BILI_LOCAL_VIDEO = 'D:/你的目录/20260619_035713.mp4'` 或 `$env:BILI_MEDIA_ROOT = 'D:/包含 media 文件夹的目录'`。端口被占用时，可以在启动命令后加 `-Port 8081`。

## 首页接口

| 方法和路径 | 用途 |
| --- | --- |
| `GET /api/categories` | 获取数据库分区 |
| `GET /api/videos` | 推荐、热门、最新、分区与搜索，支持 `q`、`tag`、`categoryId`、`sort`、`page` 和 `size` |
| `GET /api/ranks/weekly` | 每周有效播放榜，支持 `categoryId` |
| `GET /api/videos/{id}` | 获取公开视频详情、标签和合集 |
| `GET /api/videos/{id}/cover` | 获取视频封面 |
| `GET /api/videos/{id}/stream` | 获取 MP4，支持 Range 请求与进度拖动 |

视频展示限定为已发布且公开。推荐首页置顶实验视频，其余推荐按日期稳定排序；热门按播放量排序；周榜使用附件中的有效播放定义。当前视频页以访客身份打开，已有播放会话、历史记录、经验、互动和审核接口留到各模块接入。头部保留了登录、投稿、消息等界面入口。

横幅与首张轮播参考 [B 站桌面官网](https://www.bilibili.com/) 的公开首页素材。

## 页面跳转

首页只展示推荐内容。搜索表单通过 GET 跳转 `/search?keyword=关键词`，视频进入 `/video/{id}`，分区进入 `/channel/{id}`；热门、最新、推荐和周榜分别位于 `/popular`、`/latest`、`/recommend` 和 `/popular/rank`。排序、标签和分页使用 URL 参数，支持直接访问、刷新和浏览器返回。轮播切换、换一换和返回顶部在当前页操作。

从首页进入其他页面（包括搜索提交）时，每次新开标签页，保留首页；其他页面内的搜索、分区切换、排序、分页和返回首页均在当前标签页跳转。返回首页后，再进入其他页面仍新开标签页，不复用已有标签页。页面共用 HTML、CSS 和原生 JavaScript，无新增前端依赖。

登录、消息、收藏、历史悬停显示登录提示；投稿悬停显示专栏投稿、视频投稿、投稿管理，三个入口点击后均打开账号密码登录弹窗。创作中心不悬浮，点击后打开登录弹窗。其他未接入入口进入 `/service/{名称}`。账号验证接口尚未接入。

后端只有启动类、页面路由、视频接口、MySQL 查询四个 Java 文件，数据库配置统一在 `application.properties`。
