import { reportRepository } from "../sdk/lib/entity-repository-service.ts";
import type { StoriesManifestReport } from "../sdk/lib/types.ts";

export function getReportKeys(): Array<string> {
  return reportRepository.listKeys();
}

export function readReport(reportKey: string): StoriesManifestReport {
  const report = reportRepository.findByKey(reportKey);
  if (report === null) {
    throw new Error(`report ${reportKey} could not be read`);
  }
  return report;
}
