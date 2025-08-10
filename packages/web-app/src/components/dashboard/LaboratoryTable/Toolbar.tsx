import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Table } from "@tanstack/react-table";
import { Laboratory } from "./type";
import { Button } from "@/components/ui/button";
import { ChevronDown, Plus, Trash } from "lucide-react";

interface ToolbarProps {
    table: Table<Laboratory>;
}

export default function Toolbar({ table }: ToolbarProps) {
    return (
        <div className="flex items-center py-4 gap-1">
            <Input
                placeholder="Search name..."
                value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
                onChange={(event) =>
                    table.getColumn("name")?.setFilterValue(event.target.value)
                }
                className="max-w-sm"
            />
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="ml-auto">
                        Columns <ChevronDown />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {table
                        .getAllColumns()
                        .filter((column) => column.getCanHide())
                        .map((column) => {
                            return (
                                <DropdownMenuCheckboxItem
                                    key={column.id}
                                    className="capitalize"
                                    checked={column.getIsVisible()}
                                    onCheckedChange={(value) =>
                                        column.toggleVisibility(!!value)
                                    }
                                >
                                    {column.id}
                                </DropdownMenuCheckboxItem>
                            )
                        })}
                </DropdownMenuContent>
            </DropdownMenu>
            <Button>
                <Plus />
                Add Clinic
            </Button>
            {
                table.getSelectedRowModel().rows.length > 0 && (
                    <Button variant="destructive" className="">
                        <Trash />
                        Delete {table.getSelectedRowModel().rows.length} Clinics
                    </Button>
                )
            }
        </div>
    )
}