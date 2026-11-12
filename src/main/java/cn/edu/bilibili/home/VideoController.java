package cn.edu.bilibili.home;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
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

@RestController
@RequestMapping("/api")
class VideoController {
    private static final String EXPERIMENT_COVER = "media/covers/experiment-1.jpg";

    private final MysqlVideoCatalog catalog;
    private final Path mediaRoot;
    private final ViewerRegistry viewers = new ViewerRegistry();

    VideoController(MysqlVideoCatalog catalog, @Value("${app.media-root}") String mediaRoot) {
        this.catalog = catalog;
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

    @GetMapping("/authors/{id}/collections")
    List<MysqlVideoCatalog.Compilation> collections(@PathVariable String id) {
        author(id);
        return catalog.compilations(id);
    }

    @GetMapping("/authors/{id}/avatar")
    ResponseEntity<Resource> avatar(@PathVariable String id) {
        Path file = underMediaRoot(author(id).headUrl(), "media/avatars/");
        return fileResponse(file, MediaTypeFactory.getMediaType(file.getFileName().toString())
                .filter(type -> type.getType().equals("image")).orElseThrow(() -> missingMedia()));
    }

    @GetMapping("/ranks/weekly")
    List<MysqlVideoCatalog.Rank> rank(@RequestParam(required = false) String categoryId) {
        return catalog.weeklyRank(validId(categoryId), 10);
    }

    @GetMapping("/videos/{id}")
    VideoDetail detail(@PathVariable String id) {
        var video = find(id);
        return new VideoDetail(card(video), video.description(), video.compilation(), catalog.tags(id));
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
        if (EXPERIMENT_COVER.equals(path)) {
            return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG)
                    .body(new ClassPathResource("static/assets/local-cover.jpg"));
        }
        Path file = underMediaRoot(path, "media/covers/");
        return fileResponse(file, MediaTypeFactory.getMediaType(file.getFileName().toString())
                .filter(type -> type.getType().equals("image")).orElseThrow(() -> missingMedia()));
    }

    @GetMapping("/videos/{id}/stream")
    ResponseEntity<Resource> stream(@PathVariable String id) {
        var path = find(id).videoPath();
        Path file = underMediaRoot(path, "media/videos/");
        if (!file.getFileName().toString().endsWith(".mp4")) {
            throw missingMedia();
        }
        return fileResponse(file, MediaType.valueOf("video/mp4"));
    }

    private static ResponseEntity<Resource> fileResponse(Path file, MediaType type) {
        return ResponseEntity.ok().contentType(type).body(new FileSystemResource(file));
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
    record VideoDetail(VideoCard video, String description, String compilation, List<String> tags) {}
    record VideoCard(String id, String title, String author, String authorId, String categoryId, String category,
                     int duration, long plays, long danmaku, LocalDateTime publishedAt,
                     String coverUrl, String streamUrl, String description) {}
}
