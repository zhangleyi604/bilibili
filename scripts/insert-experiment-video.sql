-- 在已确认的 bilibili_v6 库内执行。可重复执行，避免重复插入同一媒体路径。
-- 10001 是附件中的样例 UP 主，10003 是生活分区。
SET NAMES utf8mb4;
START TRANSACTION;

INSERT INTO videotable
    (UID, VideoTitle, VideoDescription, CoverUrl, VideoContent, Statement,
     CategoryID, VideoDuration, VideoStatus, VisibleStatus, UploadTime)
VALUES
    (10001, '实验视频1', '第二组作业的本地视频，用于验证首页到视频播放的链路。',
     'media/covers/experiment-1.jpg', 'media/videos/20260619_035713.mp4', 1,
     10003, 19, 'published', 'public', NOW())
ON DUPLICATE KEY UPDATE VideoID = VideoID;

SELECT v.VideoID, v.VideoTitle, v.VideoDuration, v.VideoStatus, v.VisibleStatus,
       v.VideoContent, p.PlayCount
FROM videotable v LEFT JOIN playcounttable p ON p.VideoID = v.VideoID
WHERE v.VideoContent = 'media/videos/20260619_035713.mp4';

COMMIT;
