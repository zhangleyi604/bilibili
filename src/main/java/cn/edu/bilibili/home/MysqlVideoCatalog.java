package cn.edu.bilibili.home;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Repository;

@Repository
class MysqlVideoCatalog {
    private static final String PUBLIC_VIDEOS = """
            SELECT v.VideoID, v.VideoTitle, v.VideoDescription, u.UID, u.Name, v.CategoryID, c.CategoryName,
                   v.VideoDuration, COALESCE(p.PlayCount, 0) AS Plays, v.UploadTime,
                   v.CoverUrl, v.VideoContent, co.CompilationTitle,
                   (SELECT COUNT(*) FROM danmakutable d
                     WHERE d.VideoID = v.VideoID AND d.DanmakuStatus = 'active') AS Danmaku
            FROM videotable v
            JOIN usertable u ON u.UID = v.UID
            JOIN videocategorytable c ON c.CategoryID = v.CategoryID
            LEFT JOIN playcounttable p ON p.VideoID = v.VideoID
            LEFT JOIN compilationtable co ON co.CompilationID = v.CompilationID
            WHERE v.VideoStatus = 'published' AND v.VisibleStatus = 'public'
            """;
    private static final String VIDEO_TAGS = """
            FROM videotagtable vt JOIN tagtable t ON t.TagID = vt.TagID
            """;
    private final JdbcClient jdbc;

    MysqlVideoCatalog(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    List<Category> categories() {
        return jdbc.sql("SELECT CategoryID, CategoryName FROM videocategorytable ORDER BY CategoryID")
                .query((rs, row) -> new Category(rs.getString(1), rs.getString(2))).list();
    }

    List<Video> findVideos(Query query) {
        StringBuilder sql = new StringBuilder(PUBLIC_VIDEOS);
        if (query.authorId() != null) {
            sql.append(" AND v.UID = CAST(:author AS UNSIGNED)");
        }
        if (query.compilationId() != null) sql.append(" AND v.CompilationID = CAST(:compilation AS UNSIGNED)");
        if (query.categoryId() != null) {
            sql.append(" AND v.CategoryID = CAST(:category AS UNSIGNED)");
        }
        sql.append(searchWhere(query.keyword(), query.tag()));
        sql.append(switch (query.sort()) {
            case latest -> " ORDER BY v.UploadTime DESC, v.VideoID DESC";
            case popular -> " ORDER BY Plays DESC, v.VideoID ASC";
            case danmaku -> " ORDER BY Danmaku DESC, v.VideoID ASC";
            case favorites -> " ORDER BY (SELECT COUNT(*) FROM collectvideotable cv WHERE cv.VideoID = v.VideoID) DESC, v.VideoID ASC";
            case sequence -> " ORDER BY v.VideoID ASC";
            case reverse -> " ORDER BY v.VideoID DESC";
            case recommend -> query.keyword().isEmpty()
                    ? " ORDER BY CRC32(CONCAT(v.VideoID, ':', :day)), v.VideoID ASC"
                    : " ORDER BY (v.VideoTitle = :q) DESC, (LOCATE(:q, v.VideoTitle) > 0) DESC, Plays DESC, v.VideoID ASC";
        }).append(" LIMIT :limit OFFSET :offset");
        var statement = jdbc.sql(sql.toString()).param("limit", query.limit()).param("offset", query.offset());
        if (query.authorId() != null) {
            statement.param("author", query.authorId());
        }
        if (query.compilationId() != null) statement.param("compilation", query.compilationId());
        if (query.categoryId() != null) {
            statement.param("category", query.categoryId());
        }
        if (!query.keyword().isEmpty()) {
            statement.param("q", query.keyword());
        }
        if (!query.tag().isEmpty()) {
            statement.param("tag", query.tag());
        }
        if (query.sort() == Sort.recommend && query.keyword().isEmpty()) {
            statement.param("day", today().toString());
        }
        return statement.query(MysqlVideoCatalog::readVideo).list();
    }

    private static String searchWhere(String keyword, String tag) {
        return (keyword.isEmpty() ? "" : " AND (LOCATE(:q, v.VideoTitle) > 0 OR LOCATE(:q, v.VideoDescription) > 0"
                + " OR LOCATE(:q, u.Name) > 0 OR EXISTS (SELECT 1 " + VIDEO_TAGS
                + " WHERE vt.VideoID = v.VideoID AND LOCATE(:q, t.TagName) > 0))")
                + (tag.isEmpty() ? "" : " AND EXISTS (SELECT 1 " + VIDEO_TAGS
                + " WHERE vt.VideoID = v.VideoID AND t.TagName = :tag)");
    }

    SearchResult search(String keyword, String tag, UserSort userSort, int offset, int size) {
        var count = jdbc.sql("SELECT COUNT(*) FROM (" + PUBLIC_VIDEOS + searchWhere(keyword, tag) + ") results");
        if (!keyword.isEmpty()) count.param("q", keyword);
        if (!tag.isEmpty()) count.param("tag", tag);
        long totalVideos = count.query(Long.class).single();
        String match = " FROM usertable u LEFT JOIN userleveltable l ON l.LevelID = u.LevelID WHERE LOCATE(:q, u.Name) > 0";
        String userKeyword = keyword.isEmpty() ? tag : keyword;
        long totalUsers = jdbc.sql("SELECT COUNT(*)" + match).param("q", userKeyword).query(Long.class).single();
        var users = jdbc.sql("""
                SELECT u.UID, u.Name, u.Signature, l.LevelName,
                  (SELECT COUNT(*) FROM relationtable r WHERE r.TargetUID = u.UID AND r.RelationType = 0) AS Followers,
                  (SELECT COUNT(*) FROM videotable v WHERE v.UID = u.UID
                    AND v.VideoStatus = 'published' AND v.VisibleStatus = 'public') AS Videos
                """ + match + switch (userSort) {
                    case defaultOrder -> " ORDER BY (u.Name = :q) DESC, Followers DESC";
                    case followersDesc -> " ORDER BY Followers DESC";
                    case followersAsc -> " ORDER BY Followers ASC";
                    case levelDesc -> " ORDER BY CAST(SUBSTRING(l.LevelName, 3) AS UNSIGNED) DESC";
                    case levelAsc -> " ORDER BY CAST(SUBSTRING(l.LevelName, 3) AS UNSIGNED) ASC";
                } + ", u.UID ASC LIMIT :size OFFSET :offset")
                .param("q", userKeyword).param("size", size).param("offset", offset)
                .query((rs, row) -> new SearchUser(rs.getString("UID"), rs.getString("Name"),
                        rs.getString("Signature"), rs.getString("LevelName"), rs.getLong("Followers"), rs.getLong("Videos"))).list();
        return new SearchResult(totalVideos, totalUsers, users, offset + users.size() < totalUsers);
    }

    Optional<Video> findVideo(String id) {
        return jdbc.sql(PUBLIC_VIDEOS + " AND v.VideoID = CAST(:id AS UNSIGNED)").param("id", id)
                .query(MysqlVideoCatalog::readVideo).optional();
    }

    Optional<Author> findAuthor(String id) {
        return jdbc.sql("""
                SELECT u.UID, u.Name, u.Signature, u.HeadUrl, DATE_FORMAT(u.Birthday, '%m-%d') AS Birthday, l.LevelName,
                  (SELECT COUNT(*) FROM relationtable r WHERE r.UID = u.UID AND r.RelationType = 0) AS Following,
                  (SELECT COUNT(*) FROM relationtable r WHERE r.TargetUID = u.UID AND r.RelationType = 0) AS Followers,
                  (SELECT COUNT(*) FROM videotable v WHERE v.UID = u.UID
                    AND v.VideoStatus = 'published' AND v.VisibleStatus = 'public') AS Videos
                FROM usertable u JOIN userleveltable l ON l.LevelID = u.LevelID WHERE u.UID = CAST(:id AS UNSIGNED)
                """).param("id", id).query((rs, row) -> new Author(rs.getString("UID"), rs.getString("Name"),
                        rs.getString("Signature"), rs.getString("HeadUrl"), rs.getString("Birthday"),
                        rs.getString("LevelName"), rs.getLong("Following"), rs.getLong("Followers"), rs.getLong("Videos"))).optional();
    }

    List<Compilation> compilations(String authorId) {
        return jdbc.sql("""
                SELECT c.CompilationID, c.CompilationTitle, COUNT(v.VideoID) AS Videos
                FROM compilationtable c LEFT JOIN videotable v ON v.CompilationID = c.CompilationID
                  AND v.UID = c.UID AND v.VideoStatus = 'published' AND v.VisibleStatus = 'public'
                WHERE c.UID = CAST(:id AS UNSIGNED)
                GROUP BY c.CompilationID, c.CompilationTitle ORDER BY c.CompilationID
                """).param("id", authorId).query((rs, row) -> new Compilation(rs.getString("CompilationID"),
                        rs.getString("CompilationTitle"), rs.getLong("Videos"))).list();
    }

    List<String> tags(String id) {
        return jdbc.sql("SELECT t.TagName " + VIDEO_TAGS
                        + " WHERE vt.VideoID = CAST(:id AS UNSIGNED) ORDER BY t.TagID")
                .param("id", id).query(String.class).list();
    }

    List<CollectionEntry> collectionDirectory() {
        return jdbc.sql("""
                SELECT c.CompilationID, c.CompilationTitle, u.UID, u.Name,
                       COUNT(*) AS Videos, MIN(v.VideoID) AS CoverVideo
                FROM compilationtable c JOIN usertable u ON u.UID = c.UID
                JOIN videotable v ON v.CompilationID = c.CompilationID AND v.UID = c.UID
                WHERE v.VideoStatus = 'published' AND v.VisibleStatus = 'public'
                GROUP BY c.CompilationID, c.CompilationTitle, u.UID, u.Name
                ORDER BY MAX(v.UploadTime) DESC, c.CompilationID DESC
                """).query((rs, row) -> new CollectionEntry(rs.getString("CompilationID"),
                        rs.getString("CompilationTitle"), rs.getString("UID"), rs.getString("Name"),
                        rs.getLong("Videos"), rs.getString("CoverVideo"))).list();
    }

    List<CreatorEntry> recommendedCreators() {
        return jdbc.sql("""
                WITH category_posts AS (
                    SELECT v.UID, v.CategoryID, COUNT(*) AS Posts, MAX(v.UploadTime) AS Latest,
                           SUM(COUNT(*)) OVER (PARTITION BY v.UID) AS TotalPosts,
                           ROW_NUMBER() OVER (PARTITION BY v.UID
                               ORDER BY COUNT(*) DESC, MAX(v.UploadTime) DESC, v.CategoryID) AS MainCategory
                    FROM videotable v
                    WHERE v.VideoStatus = 'published' AND v.VisibleStatus = 'public'
                    GROUP BY v.UID, v.CategoryID
                ), picks AS (
                    SELECT p.*, ROW_NUMBER() OVER (PARTITION BY p.CategoryID
                        ORDER BY p.Latest DESC, p.Posts DESC, p.UID) AS CategoryPosition
                    FROM category_posts p WHERE p.MainCategory = 1
                )
                SELECT u.UID, u.Name, u.Signature, c.CategoryName, p.TotalPosts,
                       sample.VideoID AS SampleVideo, sample.VideoTitle AS SampleTitle
                FROM picks p JOIN usertable u ON u.UID = p.UID
                JOIN videocategorytable c ON c.CategoryID = p.CategoryID
                JOIN videotable sample ON sample.VideoID = (
                     SELECT v.VideoID FROM videotable v
                     WHERE v.UID = p.UID AND v.CategoryID = p.CategoryID
                       AND v.VideoStatus = 'published' AND v.VisibleStatus = 'public'
                     ORDER BY v.UploadTime DESC, v.VideoID DESC LIMIT 1)
                ORDER BY p.CategoryPosition, p.Latest DESC, p.UID
                """).query((rs, row) -> new CreatorEntry(rs.getString("UID"), rs.getString("Name"),
                        rs.getString("Signature"), rs.getString("CategoryName"), rs.getLong("TotalPosts"),
                        rs.getString("SampleVideo"), rs.getString("SampleTitle"))).list();
    }

    record CollectionEntry(String id, String title, String authorId, String author, long videos, String coverVideoId) {}
    record CreatorEntry(String id, String name, String signature, String category, long videos,
                        String sampleVideoId, String sampleVideoTitle) {}

    Optional<LocalDateTime> latestPopularIssue(String kind) {
        return jdbc.sql("""
                SELECT SettlementTime FROM videorankissuetable
                WHERE RankType=:kind ORDER BY SettlementTime DESC LIMIT 1
                """).param("kind", kind).query((rs, row) -> rs.getObject("SettlementTime", LocalDateTime.class)).optional();
    }

    List<PopularEntry> popularScores(String kind, LocalDateTime cutoff, String categoryId, int limit) {
        String categoryFilter = categoryId == null ? "" : " AND CategoryID = CAST(:category AS UNSIGNED)";
        var query = jdbc.sql("""
                WITH ranked AS (
                  SELECT VideoID, RankScore, ROW_NUMBER() OVER (ORDER BY RankScore DESC, VideoID) AS Position
                  FROM videorankscoretable WHERE RankType=:kind AND SettlementTime=:cutoff
                """ + categoryFilter + """
                )
                SELECT catalog.*, ranked.RankScore, ranked.Position FROM ranked
                JOIN (
                """ + PUBLIC_VIDEOS + """
                ) catalog USING (VideoID)
                WHERE ranked.Position <= :limit ORDER BY ranked.Position
                """).param("kind", kind).param("cutoff", cutoff).param("limit", limit);
        if (categoryId != null) query.param("category", categoryId);
        return query.query((rs, row) -> new PopularEntry(readVideo(rs, row), rs.getBigDecimal("RankScore"),
                rs.getLong("Position"), null)).list();
    }

    List<PopularEntry> mustWatch() {
        var items = new java.util.ArrayList<PopularEntry>();
        for (int i = 0; i < MUST_WATCH.size(); i++) {
            var pick = MUST_WATCH.get(i);
            long position = i + 1;
            findVideo(pick.videoId()).ifPresent(video -> items.add(new PopularEntry(video, null, position, pick.reason())));
        }
        return items;
    }

    boolean isMustWatch(String videoId) {
        return MUST_WATCH.stream().anyMatch(pick -> pick.videoId().equals(videoId));
    }

    Long bestSiteRank(String videoId, int limit) {
        // Use the same score and video ID tie-breaker as the public weekly chart.
        long position = jdbc.sql("""
                WITH positions AS (
                    SELECT 1 + (
                        SELECT COUNT(*) FROM videorankscoretable better
                        WHERE better.RankType = entry.RankType AND better.SettlementTime = entry.SettlementTime
                          AND (better.RankScore > entry.RankScore
                            OR (better.RankScore = entry.RankScore AND better.VideoID < entry.VideoID))
                    ) AS Position
                    FROM videorankscoretable entry
                    JOIN videorankissuetable issue
                      ON issue.RankType = entry.RankType AND issue.SettlementTime = entry.SettlementTime
                    WHERE entry.RankType = 'week' AND entry.VideoID = CAST(:id AS UNSIGNED)
                )
                SELECT COALESCE(MIN(Position), 0) FROM positions WHERE Position <= :limit
                """).param("id", videoId).param("limit", limit).query(Long.class).single();
        return position == 0 ? null : position;
    }

    private record MustWatchPick(String videoId, String reason) {}

    private static final List<MustWatchPick> MUST_WATCH = loadMustWatch();

    private static List<MustWatchPick> loadMustWatch() {
        try (var input = new ClassPathResource("must-watch.txt").getInputStream();
             var reader = new java.io.BufferedReader(new java.io.InputStreamReader(input, java.nio.charset.StandardCharsets.UTF_8))) {
            return reader.lines().filter(line -> !line.isBlank() && !line.startsWith("#"))
                    .map(line -> line.split("\\|", 2))
                    .map(parts -> new MustWatchPick(parts[0], parts[1]))
                    .toList();
        } catch (java.io.IOException error) {
            throw new java.io.UncheckedIOException("Could not load the fixed must-watch list", error);
        }
    }

    record PopularEntry(Video video, java.math.BigDecimal score, long position, String reason) {}

    List<Video> collectionVideos(String videoId) {
        return jdbc.sql(PUBLIC_VIDEOS + """
                 AND v.CompilationID = (SELECT CompilationID FROM videotable WHERE VideoID = CAST(:id AS UNSIGNED))
                 ORDER BY v.UploadTime, v.VideoID
                """).param("id", videoId).query(MysqlVideoCatalog::readVideo).list();
    }

    CommentPage comments(String videoId) {
        long total = jdbc.sql("SELECT COUNT(*) FROM commenttable WHERE VideoID=CAST(:id AS UNSIGNED) AND CommentStatus='active'")
                .param("id", videoId).query(Long.class).single();
        var comments = jdbc.sql("""
                SELECT c.CommentID, c.UID, u.Name, l.LevelName, c.Content, c.CommentTime,
                  (SELECT COUNT(*) FROM liketable k WHERE k.LikeTargetType=2 AND k.LikeTargetID=c.CommentID) AS Likes
                FROM commenttable c JOIN usertable u ON u.UID=c.UID
                LEFT JOIN userleveltable l ON l.LevelID=u.LevelID
                WHERE c.VideoID=CAST(:id AS UNSIGNED) AND c.CommentStatus='active'
                ORDER BY Likes DESC, c.CommentTime DESC, c.CommentID DESC LIMIT 2
                """).param("id", videoId).query((rs, row) -> {
                    var replies = previewReplies(rs.getString("CommentID"));
                    return new CommentPreview(rs.getString("CommentID"), rs.getString("UID"), rs.getString("Name"),
                        rs.getString("LevelName"), rs.getString("Content"), rs.getObject("CommentTime", LocalDateTime.class),
                        rs.getLong("Likes"), replies.isEmpty() ? 0 : replies.get(0).total(), replies);
                }).list();
        return new CommentPage(total, comments);
    }

    private List<ReplyPreview> previewReplies(String commentId) {
        return jdbc.sql("""
                WITH RECURSIVE thread AS (
                  SELECT r.*, 1 AS depth FROM replytable r
                  WHERE r.ReplyTargetType=1 AND r.ReplyTargetID=CAST(:id AS UNSIGNED) AND r.ReplyStatus='active'
                  UNION ALL
                  SELECT r.*, t.depth+1 FROM replytable r JOIN thread t
                    ON r.ReplyTargetType=0 AND r.ReplyTargetID=t.ReplyID
                  WHERE r.ReplyStatus='active' AND t.depth<30
                )
                SELECT t.ReplyID, t.UID, u.Name, l.LevelName, t.Content, t.ReplyTime,
                  (SELECT COUNT(*) FROM liketable k WHERE k.LikeTargetType=3 AND k.LikeTargetID=t.ReplyID) AS Likes,
                  COUNT(*) OVER() AS Total FROM thread t JOIN usertable u ON u.UID=t.UID
                LEFT JOIN userleveltable l ON l.LevelID=u.LevelID
                ORDER BY t.ReplyTime, t.ReplyID LIMIT 2
                """).param("id", commentId).query((rs, row) -> new ReplyPreview(rs.getString("ReplyID"),
                    rs.getString("UID"), rs.getString("Name"), rs.getString("LevelName"), rs.getString("Content"),
                    rs.getObject("ReplyTime", LocalDateTime.class), rs.getLong("Likes"), rs.getLong("Total"))).list();
    }

    record CommentPage(long total, List<CommentPreview> items) {}
    record CommentPreview(String id, String userId, String author, String level, String content,
                          LocalDateTime sentAt, long likes, long replyCount, List<ReplyPreview> replies) {}
    record ReplyPreview(String id, String userId, String author, String level, String content,
                        LocalDateTime sentAt, long likes, long total) {}

    Engagement engagement(String id) {
        return jdbc.sql("""
                SELECT
                  (SELECT COUNT(*) FROM liketable WHERE LikeTargetID = CAST(:id AS UNSIGNED) AND LikeTargetType = 0) AS Likes,
                  (SELECT COALESCE(-SUM(CoinChange), 0) FROM coinrecordtable WHERE VideoID = CAST(:id AS UNSIGNED) AND CoinChange < 0) AS Coins,
                  (SELECT COUNT(*) FROM collectvideotable WHERE VideoID = CAST(:id AS UNSIGNED)) AS Favorites,
                  (SELECT COUNT(*) FROM forwardtable WHERE VideoID = CAST(:id AS UNSIGNED)) AS Shares
                """).param("id", id).query((rs, row) -> new Engagement(rs.getLong("Likes"), rs.getLong("Coins"),
                        rs.getLong("Favorites"), rs.getLong("Shares"))).single();
    }

    List<Danmaku> danmaku(String id) {
        return jdbc.sql("""
                SELECT DanmakuID, UID, Content, VideoTimestamp, SendTime FROM danmakutable
                WHERE VideoID = CAST(:id AS UNSIGNED) AND DanmakuStatus = 'active'
                ORDER BY SendTime, DanmakuID
                """).param("id", id).query((rs, row) -> new Danmaku(rs.getString("DanmakuID"), rs.getString("UID"),
                        rs.getString("Content"), rs.getInt("VideoTimestamp"), rs.getObject("SendTime", LocalDateTime.class))).list();
    }

    record Engagement(long like, long coin, long favorite, long share) {}
    record Danmaku(String id, String userId, String content, int timestamp, LocalDateTime sentAt) {}

    private static Video readVideo(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        return new Video(rs.getString("VideoID"), rs.getString("VideoTitle"), rs.getString("VideoDescription"),
                rs.getString("Name"), rs.getString("UID"), rs.getString("CategoryID"), rs.getString("CategoryName"),
                rs.getInt("VideoDuration"), rs.getLong("Plays"), rs.getLong("Danmaku"),
                rs.getObject("UploadTime", LocalDateTime.class), rs.getString("CoverUrl"),
                rs.getString("VideoContent"), rs.getString("CompilationTitle"));
    }

    private static LocalDate today() {
        return LocalDate.now(ZoneId.of("Asia/Shanghai"));
    }

    enum Sort { recommend, latest, popular, danmaku, favorites, sequence, reverse }
    enum UserSort { defaultOrder, followersDesc, followersAsc, levelDesc, levelAsc }
    record SearchUser(String id, String name, String signature, String level, long followers, long videos) {}
    record SearchResult(long totalVideos, long totalUsers, List<SearchUser> users, boolean hasMore) {}
    record Category(String id, String name) {}
    record Author(String id, String name, String signature, String headUrl, String birthday,
                  String level, long following, long followers, long videos) {}
    record Compilation(String id, String title, long videos) {}
    record Video(String id, String title, String description, String author, String authorId, String categoryId,
                 String category, int duration, long plays, long danmaku, LocalDateTime publishedAt,
                 String coverPath, String videoPath, String compilation) {}
    record Query(String categoryId, String authorId, String compilationId, String keyword, String tag, Sort sort, int offset, int limit) {}
}
