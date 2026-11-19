# dilidili 课程项目

Spring Boot、MySQL 和原生 HTML/CSS/JavaScript 实现首页、分区、搜索、周榜、作者空间和视频播放。数据库中的互动记录是课堂演示样本，搜索和排序均由数据库查询产生。

## 运行

保留本机已配置的 MySQL 数据库，以及 `.local/application.properties`。上传前自行隐去配置中的密码和密钥，下载项目后填写本机实际配置。在项目目录运行：

```powershell
.\start.ps1
```

默认地址为 http://127.0.0.1:8080/，按 Ctrl+C 停止。修改源码后可运行 `.\start.ps1 -Rebuild`。切换端口使用 `-Port 8081`。启动脚本优先使用 `.build-tools` 中的 JDK、Maven 和依赖缓存；缺少这些工具时需要本机安装 JDK 17 或更新版本、Maven。

## 文件用途

- `src/main/java/`：页面路由、数据库查询、媒体接口、在线观看人数。
- `src/main/resources/static/`：页面、样式、脚本和内置图片。
- `src/main/resources/application.properties`：通用配置。
- `.local/application.properties`：本机数据库和 OSS 配置，上传前需要隐去密码和密钥。
- `.build-tools/`：本机启动及构建工具。
- `target/bilibili-home-1.0.0.jar`：构建后的可执行网站。
- `scripts/`：维护检查与 OSS 只读权限示例。

仓库不包含数据库备份和 SQL 安装脚本。组员使用单独发放的数据库文件，导入时需包含表结构、数据和存储过程，然后配置本机的数据库连接与 OSS 参数。

## 数据与媒体

默认数据库为 `bilibili`。连接可通过 `BILI_DB_URL`、`BILI_DB_USER`、`BILI_DB_PASSWORD` 环境变量或本地配置调整。

OSS 媒体路径使用 `oss://bilibili-media/media/videos/分区名视频/文件.mp4`、对应的 `media/covers/分区名视频封面/` 和 `media/avatars/`。后端生成一小时有效的 V4 签名链接，响应不缓存，Bucket 保持私有。`scripts/oss-read-policy.json` 中的 `media/*` 自动覆盖后续新增子目录。

媒体接口也支持 `media/videos/...` 本地相对路径；`app.media-root` 默认指向项目上一层，可用 `BILI_MEDIA_ROOT` 调整。当前公开视频使用 OSS，不再包含本地实验视频或其专用封面。

首页分区直接读取分区表；尚无视频的分区保留入口。用户搜索支持昵称关键词、粉丝与等级排序、分页；可用“小满”“星河”“晚风”展示多条匹配，用“的”展示分页。公开视频按数据库中的标签、合集、上传者与互动记录展示。

登录、关注、投稿及互动提交目前展示登录提示；游客播放限制、弹幕偏好、屏蔽、全屏和小窗由前端控制，偏好保存在浏览器中。在线观看人数通过匿名心跳维护。

## 检查

```powershell
node scripts/verify-watch.cjs
node scripts/verify-comments.cjs
node scripts/verify-presence.cjs
python scripts/verify-site.py
```

最后一项需要网站已启动；其他端口可传入 `--base-url http://127.0.0.1:8082`。检查工具不依赖旧迁移报告，也不会修改数据库。`ViewerRegistryCheck.java` 用于检查观看人数的去重、离开与过期逻辑。

用户等级权限可通过 `python scripts/check-level-permissions.py` 检查，需要本机数据库配置。检查依据课程权限表：Lv0 可浏览、搜索、关注等；Lv1 可点赞、投币、收藏、转发、订阅、拉黑、举报和私信；Lv2 才可评论、回复、发弹幕、投稿、建合集和充电。系统自动创建的默认收藏夹和系统奖励收入不算用户主动行为。发现越权记录时检查命令返回非零状态。

该工具的 `--repair` 参数用于修复演示数据：先在被 Git 忽略的 `target/permission-repair/` 备份，将支持修复的越权行为重新分配给有权限的活跃演示账号，并验证等级、视频信息和互动记录总数。修复同时检查投币数量上限；不支持自动修复的越权类型会在写入前终止。普通检查不会修改数据。
