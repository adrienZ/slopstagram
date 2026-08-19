import { reportRepository } from "../sdk/lib/entity-repository-service.ts";
import type { StoriesManifestReport } from "../sdk/lib/types.ts";

export function getReportKeys(): Promise<string[]> {
  return reportRepository.listKeys();
}

export async function readReport(reportKey: string): Promise<StoriesManifestReport> {
  const report = await reportRepository.findByKey(reportKey);
  if (report === null) throw new Error(`report ${reportKey} could not be read`);
  return report;
}
