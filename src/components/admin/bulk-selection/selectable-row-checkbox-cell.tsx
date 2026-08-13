"use client";

import { memo } from "react";

import { TableCheckbox } from "@/components/admin/bulk-selection/table-checkbox";
import { TableCell } from "@/components/ui/table";

type SelectableRowCheckboxCellProps = {
  leadId: string;
  checked: boolean;
  onToggle: (leadId: string) => void;
  nameLabel?: string;
};

export const SelectableRowCheckboxCell = memo(function SelectableRowCheckboxCell({
  leadId,
  checked,
  onToggle,
  nameLabel,
}: SelectableRowCheckboxCellProps) {
  return (
    <TableCell
      className="w-10 pr-0"
      onClick={(event) => event.stopPropagation()}
    >
      <TableCheckbox
        checked={checked}
        ariaLabel={
          nameLabel
            ? `Select ${nameLabel}`
            : `Select row ${leadId}`
        }
        onChange={() => onToggle(leadId)}
      />
    </TableCell>
  );
});
