import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTable } from "./DataTable";

type Row = { id: number; name: string; status: string };

describe("DataTable", () => {
  const columns = [
    { key: "id" as const, header: "#" },
    { key: "name" as const, header: "Name" },
    { key: "status" as const, header: "Status" },
  ];
  const rows: Row[] = [
    { id: 1, name: "alice", status: "running" },
    { id: 2, name: "bob", status: "paused" },
  ];

  it("renders header cells", () => {
    render(<DataTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByText("#")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("renders body rows", () => {
    render(<DataTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("brutalist mode applies outer 2px border", () => {
    render(<DataTable<Row> mode="brutalist" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const table = screen.getByRole("table");
    expect(table.className).toContain("border-2");
  });

  it("operator mode applies no outer border", () => {
    render(<DataTable<Row> mode="operator" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const table = screen.getByRole("table");
    expect(table.className).not.toContain("border-2");
  });
});
