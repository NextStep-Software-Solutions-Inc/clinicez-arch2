"use client";

import DataTable from "@/components/DataTable";
import { columns } from "./column";
import { data } from "./data";
import Toolbar from "./Toolbar";

export default function Table() {
    return (
        <DataTable
            columns={columns}
            data={data}
            toolbar={(table) => <Toolbar table={table} />}
        />
    )
}