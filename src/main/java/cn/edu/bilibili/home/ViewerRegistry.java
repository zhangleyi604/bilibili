package cn.edu.bilibili.home;

import java.time.Clock;
import java.util.HashMap;
import java.util.Map;

/** Anonymous visible video pages, expired when their heartbeat stops. */
final class ViewerRegistry {
    private static final long TIMEOUT_MS = 45_000;
    private final Clock clock;
    private final Map<Visit, Long> visits = new HashMap<>();

    ViewerRegistry() { this(Clock.systemUTC()); }
    ViewerRegistry(Clock clock) { this.clock = clock; }

    synchronized int heartbeat(String videoId, String sessionId, boolean active) {
        long now = clock.millis();
        visits.entrySet().removeIf(entry -> now - entry.getValue() >= TIMEOUT_MS);
        Visit visit = new Visit(videoId, sessionId);
        if (active) visits.put(visit, now);
        else visits.remove(visit);
        return (int) visits.keySet().stream().filter(key -> key.videoId().equals(videoId)).count();
    }

    private record Visit(String videoId, String sessionId) {}
}
