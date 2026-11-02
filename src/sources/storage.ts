// Cloud Storage buckets (JSON API) and daily-sampled sizes from Monitoring (research R7).
import type { Http } from '../http.js';
import type { BucketSizes, ResourceList } from '../model/types.js';

interface RawBucket {
  name: string;
  location?: string;
  storageClass?: string;
  timeCreated?: string;
}

export async function listBuckets(http: Http, projectId: string): Promise<ResourceList> {
  const items = await http.getAllPages<RawBucket>(`https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(projectId)}&maxResults=1000`, 'items');
  return {
    resources: items.map((b) => {
      const r = {
        type: 'storage' as const,
        id: `${projectId}/${(b.location ?? 'unknown').toLowerCase()}/${b.name}`,
        name: b.name,
        projectId,
        location: (b.location ?? 'unknown').toLowerCase(),
        reportedState: b.storageClass ?? 'bucket',
        // Buckets have no running state to report (Story 3 #8).
        mapped: { kind: 'unknown' as const, reason: 'no running state' },
        consoleUrl: `https://console.cloud.google.com/storage/browser/${b.name}?project=${encodeURIComponent(projectId)}`,
      };
      return b.timeCreated ? { ...r, createdAt: b.timeCreated } : r;
    }),
  };
}

interface RawSeries {
  resource?: { labels?: Record<string, string> };
  metric?: { labels?: Record<string, string> };
  points?: { interval?: { endTime?: string }; value?: { doubleValue?: number; int64Value?: string } }[];
}

export async function bucketSizes(http: Http, projectId: string, now: Date): Promise<BucketSizes> {
  const end = now.toISOString();
  const start = new Date(now.getTime() - 26 * 3600_000).toISOString();
  const q = new URLSearchParams({
    filter: 'metric.type="storage.googleapis.com/storage/total_bytes"',
    'interval.startTime': start,
    'interval.endTime': end,
    'aggregation.alignmentPeriod': '93600s',
    'aggregation.perSeriesAligner': 'ALIGN_MAX',
    'aggregation.crossSeriesReducer': 'REDUCE_SUM',
    'aggregation.groupByFields': 'resource.label.bucket_name',
  });
  const series = await http.getAllPages<RawSeries>(`https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries?${q}`, 'timeSeries');
  const sizes: Record<string, number> = {};
  let asOf: string | null = null;
  for (const s of series) {
    const bucket = s.resource?.labels?.bucket_name ?? s.metric?.labels?.bucket_name;
    const p = s.points?.[0];
    if (!bucket || !p) continue;
    sizes[bucket] = Math.round(Number(p.value?.doubleValue ?? p.value?.int64Value ?? 0));
    const t = p.interval?.endTime;
    if (t && (!asOf || t > asOf)) asOf = t;
  }
  return { sizes, asOf };
}
