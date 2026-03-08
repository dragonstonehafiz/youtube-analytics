from __future__ import annotations

from src.database.db import get_connection


def upsert_channel_daily(rows: list[dict]) -> int:
    """Insert or update channel-level daily analytics rows."""
    if not rows:
        return 0
    values = []
    for row in rows:
        values.append(
            (
                row.get("day"),
                row.get("engagedViews"),
                row.get("views"),
                row.get("estimatedMinutesWatched"),
                row.get("estimatedRevenue"),
                row.get("estimatedAdRevenue"),
                row.get("grossRevenue"),
                row.get("estimatedRedPartnerRevenue"),
                row.get("averageViewDuration"),
                row.get("averageViewPercentage"),
                row.get("likes"),
                row.get("dislikes"),
                row.get("comments"),
                row.get("shares"),
                row.get("monetizedPlaybacks"),
                row.get("playbackBasedCpm"),
                row.get("adImpressions"),
                row.get("cpm"),
                row.get("subscribersGained"),
                row.get("subscribersLost"),
            )
        )
    sql = """
        INSERT INTO channel_analytics (
            date, engaged_views, views, watch_time_minutes, estimated_revenue,
            estimated_ad_revenue, gross_revenue, estimated_red_partner_revenue,
            average_view_duration_seconds, average_view_percentage,
            likes, dislikes, comments, shares, monetized_playbacks,
            playback_based_cpm, ad_impressions, cpm,
            subscribers_gained, subscribers_lost
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(date) DO UPDATE SET
            engaged_views=excluded.engaged_views,
            views=excluded.views,
            watch_time_minutes=excluded.watch_time_minutes,
            estimated_revenue=excluded.estimated_revenue,
            estimated_ad_revenue=excluded.estimated_ad_revenue,
            gross_revenue=excluded.gross_revenue,
            estimated_red_partner_revenue=excluded.estimated_red_partner_revenue,
            average_view_duration_seconds=excluded.average_view_duration_seconds,
            average_view_percentage=excluded.average_view_percentage,
            likes=excluded.likes,
            dislikes=excluded.dislikes,
            comments=excluded.comments,
            shares=excluded.shares,
            monetized_playbacks=excluded.monetized_playbacks,
            playback_based_cpm=excluded.playback_based_cpm,
            ad_impressions=excluded.ad_impressions,
            cpm=excluded.cpm,
            subscribers_gained=excluded.subscribers_gained,
            subscribers_lost=excluded.subscribers_lost
    """
    with get_connection() as conn:
        conn.executemany(sql, values)
        conn.commit()
    return len(values)
