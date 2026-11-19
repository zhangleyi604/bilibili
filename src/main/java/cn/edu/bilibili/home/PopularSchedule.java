package cn.edu.bilibili.home;

import java.time.*;
import java.time.temporal.TemporalAdjusters;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
class PopularSchedule {
    private static final Logger LOG = LoggerFactory.getLogger(PopularSchedule.class);
    static final String TIME_ZONE = "Asia/Shanghai";
    private final JdbcClient jdbc;

    PopularSchedule(JdbcClient jdbc) { this.jdbc = jdbc; }

    @EventListener(ApplicationReadyEvent.class)
    @Scheduled(cron = "0 0 12 * * *", zone = TIME_ZONE)
    @Scheduled(cron = "0 0 18 * * FRI", zone = TIME_ZONE)
    public void publishDueIssues() {
        var now = LocalDateTime.now(ZoneId.of(TIME_ZONE));
        var noon = now.toLocalDate().atTime(12, 0);
        var friday = now.toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.FRIDAY)).atTime(18, 0);
        publish("sp_publish_popular_heat", now.isBefore(noon) ? noon.minusDays(1) : noon);
        publish("sp_publish_popular_week", now.isBefore(friday) ? friday.minusWeeks(1) : friday);
    }

    private void publish(String procedure, LocalDateTime cutoff) {
        try {
            jdbc.sql("CALL " + procedure + "(:cutoff)").param("cutoff", cutoff).update();
        } catch (DataAccessException error) {
            LOG.warn("Could not publish {} for {}: {}", procedure, cutoff, error.getMostSpecificCause().getMessage());
        }
    }
}
