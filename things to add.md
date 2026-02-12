# Things to Add

## Backend: Video Analytics DB Additions

Add the following YouTube Analytics metrics to the backend video analytics pipeline and persist them in the video analytics database table (`daily_analytics`):

- `engagedViews`
- `averageViewPercentage`
- `estimatedAdRevenue`
- `grossRevenue`
- `estimatedRedPartnerRevenue`
- `monetizedPlaybacks`
- `playbackBasedCpm`
- `adImpressions`
- `cpm`

Notes:
- `averageViewPercentage` was requested twice; included once here.
- This requires updating:
  - YouTube Analytics fetch metrics list in backend
  - DB schema (`daily_analytics`) with new columns
  - Upsert mapping for new fields
  - Any API responses/types that should expose these fields

## Backend: Channel Analytics DB Additions

Add the following YouTube Analytics metrics to the backend channel analytics pipeline and persist them in the channel analytics database table (`channel_daily_analytics`):

- `engagedViews`
- `averageViewPercentage`
- `likes`
- `dislikes`
- `comments`
- `shares`
- `estimatedAdRevenue`
- `grossRevenue`
- `estimatedRedPartnerRevenue`
- `monetizedPlaybacks`
- `playbackBasedCpm`
- `adImpressions`
- `cpm`

Notes:
- This requires updating:
  - YouTube Analytics channel fetch metrics list in backend
  - DB schema (`channel_daily_analytics`) with new columns
  - Channel daily upsert mapping for new fields
  - Any API responses/types that should expose these fields
