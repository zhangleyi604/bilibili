package cn.edu.bilibili.home;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@RestController
@RequestMapping("/api")
class VideoController {
    private static final int WEEKLY_RANK_LIMIT = 10;
    private final MysqlVideoCatalog catalog;
    private final Path mediaRoot;
    private final OssMedia oss;
    private final ViewerRegistry viewers = new ViewerRegistry();

    VideoController(MysqlVideoCatalog catalog, @Value("${app.media-root}") String mediaRoot, OssMedia oss) {
        this.catalog = catalog;
        this.oss = oss;
        this.mediaRoot = Path.of(mediaRoot).toAbsolutePath().normalize();
    }

    @GetMapping("/categories")
    List<MysqlVideoCatalog.Category> categories() {
        return catalog.categories();
    }

    @GetMapping("/videos")
    VideoPage videos(@RequestParam(required = false) String categoryId,
                     @RequestParam(required = false) String authorId,
                     @RequestParam(required = false) String compilationId,
                     @RequestParam(defaultValue = "") String q,
                     @RequestParam(defaultValue = "") String tag,
                     @RequestParam(defaultValue = "recommend") MysqlVideoCatalog.Sort sort,
                     @RequestParam(defaultValue = "0") int page,
                     @RequestParam(defaultValue = "20") int size) {
        if (page < 0 || page > 10000 || size < 1 || size > 40 || q.length() > 80 || tag.length() > 80) {
            throw new ResponseStatusException(BAD_REQUEST, "分页或检索参数超出范围");
        }
        var query = new MysqlVideoCatalog.Query(validId(categoryId), validId(authorId), validId(compilationId), q.strip(), tag.strip(), sort, page * size, size + 1);
        var results = catalog.findVideos(query);
        var items = results.stream().limit(size).map(this::card).toList();
        return new VideoPage(items, results.size() > size);
    }

    @GetMapping("/search")
    MysqlVideoCatalog.SearchResult search(@RequestParam(defaultValue = "") String q,
                                         @RequestParam(defaultValue = "") String tag,
                                         @RequestParam(defaultValue = "defaultOrder") MysqlVideoCatalog.UserSort userSort,
                                         @RequestParam(defaultValue = "0") int page,
                                         @RequestParam(defaultValue = "20") int size) {
        if (q.length() > 80 || tag.length() > 80 || page < 0 || page > 10000 || size < 1 || size > 20) {
            throw new ResponseStatusException(BAD_REQUEST, "分页或检索参数超出范围");
        }
        return catalog.search(q.strip(), tag.strip(), userSort, page * size, size);
    }

    @GetMapping("/authors/{id}")
    MysqlVideoCatalog.Author author(@PathVariable String id) {
        return catalog.findAuthor(validId(id))
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "作者不存在"));
    }

    @GetMapping("/collections")
    List<MysqlVideoCatalog.CollectionEntry> collectionDirectory() {
        return catalog.collectionDirectory();
    }

    @GetMapping("/creators/recommended")
    List<MysqlVideoCatalog.CreatorEntry> recommendedCreators() {
        return catalog.recommendedCreators();
    }

    @GetMapping("/authors/{id}/collections")
    List<MysqlVideoCatalog.Compilation> collections(@PathVariable String id) {
        author(id);
        return catalog.compilations(id);
    }

    @GetMapping("/authors/{id}/avatar")
    ResponseEntity<Resource> avatar(@PathVariable String id) {
        String path = author(id).headUrl();
        if (path == null || path.isBlank() || path.equals("media/avatars/default.png")) {
            return defaultAvatar();
        }
        return image(path, "avatars/");
    }

    @GetMapping("/avatar/default")
    ResponseEntity<Resource> defaultAvatar() {
        return image("oss://" + oss.bucketName() + "/media/avatars/guest-avatar.gif", "avatars/");
    }

    @GetMapping("/popular/heat")
    PopularIssue popularHeat() {
        return popularIssue("heat", null, Integer.MAX_VALUE);
    }

    @GetMapping("/popular/week")
    PopularIssue popularWeek(@RequestParam(required = false) String categoryId) {
        return popularIssue("week", validId(categoryId), WEEKLY_RANK_LIMIT);
    }

    @GetMapping("/popular/must-watch")
    PopularIssue popularMustWatch() {
        return new PopularIssue(null, catalog.mustWatch().stream().map(this::popularCard).toList());
    }

    private PopularIssue popularIssue(String kind, String categoryId, int limit) {
        return catalog.latestPopularIssue(kind)
                .map(cutoff -> new PopularIssue(cutoff, catalog.popularScores(kind, cutoff, categoryId, limit)
                        .stream().map(this::popularCard).toList()))
                .orElseGet(() -> new PopularIssue(null, List.of()));
    }

    private PopularCard popularCard(MysqlVideoCatalog.PopularEntry entry) {
        return new PopularCard(card(entry.video()), entry.score(), entry.position(), entry.reason());
    }

    record PopularIssue(LocalDateTime cutoff, List<PopularCard> items) {}
    record PopularCard(VideoCard video, java.math.BigDecimal score, long position, String reason) {}

    @GetMapping("/videos/{id}")
    VideoDetail detail(@PathVariable String id) {
        var video = find(id);
        return new VideoDetail(card(video), video.description(), video.compilation(), catalog.tags(id),
                catalog.isMustWatch(video.id()), catalog.bestSiteRank(video.id(), WEEKLY_RANK_LIMIT));
    }

    @GetMapping("/videos/{id}/comments")
    MysqlVideoCatalog.CommentPage comments(@PathVariable String id, @RequestParam(defaultValue="hot") String sort) {
        find(id);
        if (!sort.equals("hot") && !sort.equals("latest")) throw new ResponseStatusException(BAD_REQUEST, "无效的评论排序");
        if (sort.equals("latest")) throw new ResponseStatusException(UNAUTHORIZED, "登录后查看最新评论");
        return catalog.comments(id);
    }

    @PostMapping("/videos/{id}/viewers")
    ViewerCount viewers(@PathVariable String id, @RequestBody ViewerHeartbeat heartbeat) {
        if (heartbeat.sessionId() == null || !heartbeat.sessionId().matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")) {
            throw new ResponseStatusException(BAD_REQUEST, "无效的观看会话");
        }
        find(id);
        return new ViewerCount(viewers.heartbeat(id, heartbeat.sessionId(), heartbeat.active()));
    }

    record ViewerHeartbeat(String sessionId, boolean active) {}
    record ViewerCount(int count) {}

    @GetMapping("/videos/{id}/collection")
    VideoCollection collection(@PathVariable String id) {
        var video = find(id);
        if (video.compilation() == null) return new VideoCollection(null, List.of(), 0);
        var videos = catalog.collectionVideos(id);
        return new VideoCollection(video.compilation(), videos.stream().map(this::card).toList(),
                videos.stream().mapToLong(MysqlVideoCatalog.Video::plays).sum());
    }

    record VideoCollection(String title, List<VideoCard> items, long plays) {}

    @GetMapping("/videos/{id}/engagement")
    MysqlVideoCatalog.Engagement engagement(@PathVariable String id) {
        find(id);
        return catalog.engagement(id);
    }

    @GetMapping("/videos/{id}/danmaku")
    List<MysqlVideoCatalog.Danmaku> danmaku(@PathVariable String id) {
        find(id);
        return catalog.danmaku(id);
    }

    @GetMapping("/videos/{id}/cover")
    ResponseEntity<Resource> cover(@PathVariable String id) {
        var path = find(id).coverPath();
        return image(path, "covers/");
    }

    private ResponseEntity<Resource> image(String path, String directory) {
        URI remote = oss.location(path, directory);
        if (remote != null) return redirect(remote);
        Path file = underMediaRoot(path, "media/" + directory);
        return fileResponse(file, MediaTypeFactory.getMediaType(file.getFileName().toString())
                .filter(type -> type.getType().equals("image")).orElseThrow(() -> missingMedia()));
    }

    @GetMapping("/videos/{id}/stream")
    ResponseEntity<Resource> stream(@PathVariable String id) {
        var path = find(id).videoPath();
        URI remote = oss.location(path, "videos/");
        if (remote != null) return redirect(remote);
        Path file = underMediaRoot(path, "media/videos/");
        if (!file.getFileName().toString().endsWith(".mp4")) {
            throw missingMedia();
        }
        return fileResponse(file, MediaType.valueOf("video/mp4"));
    }

    private static ResponseEntity<Resource> fileResponse(Path file, MediaType type) {
        return ResponseEntity.ok().contentType(type).body(new FileSystemResource(file));
    }

    private static ResponseEntity<Resource> redirect(URI location) {
        return ResponseEntity.status(302).header("Cache-Control", "no-store").location(location).build();
    }

    private Path underMediaRoot(String path, String directory) {
        if (path == null || !path.startsWith(directory)) {
            throw missingMedia();
        }
        try {
            Path allowed = mediaRoot.resolve(directory).toRealPath();
            Path file = mediaRoot.resolve(path).toRealPath();
            if (file.startsWith(allowed) && Files.isRegularFile(file)) {
                return file;
            }
        } catch (IOException | IllegalArgumentException ignored) {
            throw missingMedia();
        }
        throw missingMedia();
    }

    private static ResponseStatusException missingMedia() {
        return new ResponseStatusException(NOT_FOUND, "本地媒体文件不存在");
    }

    private MysqlVideoCatalog.Video find(String id) {
        return catalog.findVideo(validId(id)).orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "视频不存在"));
    }

    private static String validId(String id) {
        if (id != null) {
            try {
                if (!id.matches("[1-9][0-9]{0,19}")) {
                    throw new NumberFormatException();
                }
                Long.parseUnsignedLong(id);
            } catch (NumberFormatException ex) {
                throw new ResponseStatusException(BAD_REQUEST, "无效的编号");
            }
        }
        return id;
    }

    private VideoCard card(MysqlVideoCatalog.Video video) {
        String base = "/api/videos/" + video.id();
        return new VideoCard(video.id(), video.title(), video.author(), video.authorId(), video.categoryId(), video.category(),
                video.duration(), video.plays(), video.danmaku(), video.publishedAt(), base + "/cover",
                video.videoPath() == null ? null : base + "/stream", video.description());
    }

    record VideoPage(List<VideoCard> items, boolean hasMore) {}
    record VideoDetail(VideoCard video, String description, String compilation, List<String> tags,
                       boolean mustWatch, Long bestSiteRank) {}
    record VideoCard(String id, String title, String author, String authorId, String categoryId, String category,
                     int duration, long plays, long danmaku, LocalDateTime publishedAt,
                     String coverUrl, String streamUrl, String description) {}
}
