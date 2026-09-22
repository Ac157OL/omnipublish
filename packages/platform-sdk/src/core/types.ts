import { z } from "zod";

export const PublishContextSchema = z.object({
  title: z.string(),
  markdown: z.string(),
  html: z.string().optional(),
  tags: z.array(z.string()).default([]),
  coverImageUrl: z.string().optional(),
  publishAction: z.enum(['draft', 'direct']).optional().default('draft'),
  // Extendable for platform specific overrides
  platformConfig: z.record(z.string(), z.any()).default({}),
});

export type PublishContext = z.infer<typeof PublishContextSchema>;

export interface PublishResult {
  success: boolean;
  platform: string;
  remoteId?: string;
  remoteUrl?: string;
  errorMessage?: string;
  errorCode?: string;
  isAwaitingUser?: boolean;
  browserAssistData?: any;
}

export interface MetricFetchInput {
  remoteId?: string | null;
  remoteUrl?: string | null;
  platformConfig?: Record<string, unknown>;
}

export interface MetricFetchResult {
  success: boolean;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  errorMessage?: string;
  errorCode?: string;
}

export interface PlatformAdapter {
  platformCode: string;
  name: string;

  // Auth and capability checks
  isReady(): Promise<boolean>;

  // Format the content specifically for this platform
  adaptContent(context: PublishContext): Promise<PublishContext>;

  // Execute the publish action
  publish(context: PublishContext): Promise<PublishResult>;

  // Optional: fetch latest metrics for a previously published job.
  // Adapters that don't support metric retrieval should leave this undefined
  // (the worker will skip them and the job will have no new snapshots).
  fetchMetrics?(input: MetricFetchInput): Promise<MetricFetchResult>;
}
