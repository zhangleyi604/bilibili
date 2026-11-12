package cn.edu.bilibili.home;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
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
                    ? " ORDER BY COALESCE(v.VideoContent = :featured, 0) DESC, CRC32(CONCAT(v.VideoID, ':', :day)), v.VideoID ASC"
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
            statement.param("day", today().toString()).param("featured", "media/videos/20260619_035713.mp4");
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

    List<Rank> weeklyRank(String categoryId, int limit) {
        if (categoryId == null) {
            return jdbc.sql("CALL sp_get_weekly_play_rank(:limit)").param("limit", limit)
                    .query(MysqlVideoCatalog::readRank).list();
        }
        var monday = today().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        return jdbc.sql("""
                SELECT v.VideoID, v.VideoTitle, COUNT(*) AS WeeklyPlayCount,
                       DENSE_RANK() OVER (ORDER BY COUNT(*) DESC) AS RankNo
                FROM videoplaysessiontable s JOIN videotable v ON v.VideoID = s.VideoID
                WHERE s.CountTime >= :start AND s.CountTime < :end
                  AND v.VideoStatus = 'published' AND v.VisibleStatus = 'public'
                  AND v.CategoryID = CAST(:category AS UNSIGNED)
                GROUP BY v.VideoID, v.VideoTitle
                ORDER BY WeeklyPlayCount DESC, v.VideoID ASC LIMIT :limit
                """).param("start", monday.atStartOfDay()).param("end", monday.plusWeeks(1).atStartOfDay())
                .param("category", categoryId).param("limit", limit).query(MysqlVideoCatalog::readRank).list();
    }

    List<Video> collectionVideos(String videoId) {
        return jdbc.sql(PUBLIC_VIDEOS + """
                 AND v.CompilationID = (SELECT CompilationID FROM videotable WHERE VideoID = CAST(:id AS UNSIGNED))
                 ORDER BY v.UploadTime, v.VideoID
                """).param("id", videoId).query(MysqlVideoCatalog::readVideo).list();
    }

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

    private static Rank readRank(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        return new Rank(rs.getString("VideoID"), rs.getString("VideoTitle"),
                rs.getLong("WeeklyPlayCount"), rs.getLong("RankNo"));
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
    record Rank(String id, String title, long plays, long rank) {}
}
