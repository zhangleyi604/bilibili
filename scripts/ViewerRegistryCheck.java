package cn.edu.bilibili.home;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

public final class ViewerRegistryCheck {
    static class TestClock extends Clock {
        long now;
        public ZoneId getZone() { return ZoneId.of("UTC"); }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return Instant.ofEpochMilli(now); }
        public long millis() { return now; }
    }
    static void check(boolean result, String message) { if (!result) throw new AssertionError(message); }
    public static void main(String[] args) {
        TestClock clock = new TestClock(); ViewerRegistry registry = new ViewerRegistry(clock);
        check(registry.heartbeat("1", "a", true) == 1, "first viewer");
        check(registry.heartbeat("1", "a", true) == 1, "heartbeat must not duplicate");
        check(registry.heartbeat("1", "b", true) == 2, "second viewer");
        check(registry.heartbeat("2", "a", true) == 1, "separate video");
        check(registry.heartbeat("1", "b", false) == 1, "leaving viewer");
        clock.now = 30_000; registry.heartbeat("1", "a", true);
        clock.now = 45_000;
        check(registry.heartbeat("2", "b", false) == 0, "expired disconnected viewer");
        check(registry.heartbeat("1", "x", false) == 1, "renewed viewer remains");
        clock.now = 75_000;
        check(registry.heartbeat("1", "x", false) == 0, "expiry boundary");
        System.out.println("PASS: deduplication, per-video isolation, leave, renewal, timeout boundary");
    }
}
