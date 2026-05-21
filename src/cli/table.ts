export interface TableColumn<T> {
  readonly header: string
  readonly value: (item: T) => string
}

export function formatTable<T>(items: readonly T[], columns: readonly TableColumn<T>[]): string {
  const rows = items.map((item) => columns.map((column) => column.value(item)))
  const widths = columns.map((column, columnIndex) =>
    Math.max(column.header.length, ...rows.map((row) => row[columnIndex]?.length ?? 0)),
  )
  const header = columns
    .map((column, columnIndex) => column.header.padEnd(widths[columnIndex] ?? column.header.length))
    .join("  ")
  const divider = widths.map((width) => "-".repeat(width)).join("  ")
  const body = rows.map((row) =>
    row.map((value, columnIndex) => value.padEnd(widths[columnIndex] ?? value.length)).join("  "),
  )

  return [header, divider, ...body].join("\n")
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  if (maxLength <= 1) {
    return value.slice(0, maxLength)
  }

  return `${value.slice(0, maxLength - 1)}…`
}
