import { TerminationTable } from "@/components/admin/termination-table";
import {
  listFormTerminations,
  listTerminationFilterOptions,
} from "@/server/repositories/form-terminations.repository";

export const dynamic = "force-dynamic";

export default async function TerminationsPage() {
  const [rows, filterOptions] = await Promise.all([
    listFormTerminations(),
    listTerminationFilterOptions(),
  ]);

  return <TerminationTable initialRows={rows} filterOptions={filterOptions} />;
}
