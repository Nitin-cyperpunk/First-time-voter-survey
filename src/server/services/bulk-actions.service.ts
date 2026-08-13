const DEFAULT_CONCURRENCY = 5;

export type BulkActionResult = {
  succeeded: string[];
  failed: Array<{ leadId: string; error: string }>;
};

export async function runBulkLeadAction(
  leadIds: string[],
  action: (leadId: string) => Promise<void>,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<BulkActionResult> {
  const succeeded: string[] = [];
  const failed: Array<{ leadId: string; error: string }> = [];
  let index = 0;

  async function worker() {
    while (index < leadIds.length) {
      const currentIndex = index;
      index += 1;
      const leadId = leadIds[currentIndex]!;

      try {
        await action(leadId);
        succeeded.push(leadId);
      } catch (error) {
        failed.push({
          leadId,
          error:
            error instanceof Error ? error.message : "Action failed for this row.",
        });
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, leadIds.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return { succeeded, failed };
}
