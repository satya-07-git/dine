import {
  BackgroundJobType,
  BackgroundJobStatus,
  WorkerStatus,
  MetricType,
} from '@dine/contracts';

export interface BackgroundJobRecord {
  id: string;
  job_type: string;
  status: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  claimed_at: string | null;
  claimed_by: string | null;
  claim_expires_at: string | null;
  next_retry_at: string | null;
  last_error: string | null;
  dead_letter_reason: string | null;
  execution_duration_ms: number | null;
  result_summary: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

export interface WorkerHeartbeatRecord {
  worker_id: string;
  worker_name: string;
  hostname: string;
  status: string;
  current_job_id: string | null;
  last_heartbeat_at: string;
  started_at: string;
  metrics: {
    processed_count: number;
    error_count: number;
    uptime_seconds: number;
  };
}

export interface SystemMetricRecord {
  id: string;
  metric_name: string;
  metric_value: number;
  labels: Record<string, unknown>;
  recorded_at: string;
}
