import writeExcelFile from 'write-excel-file/universal'

type Cell = string | number | boolean | null
export interface SheetDef {
  name: string
  headers: string[]
  rows: Cell[][]
  widths?: number[]
}

/** Genera y descarga un archivo .xlsx con una o varias hojas. */
export async function downloadXlsx(fileName: string, sheets: SheetDef[]) {
  const payload = sheets.map((s) => ({
    sheet: s.name.slice(0, 31),
    data: [
      s.headers.map((h) => ({ value: h, fontWeight: 'bold' as const, backgroundColor: '#950101', textColor: '#FFFFFF' })),
      ...s.rows.map((r) => r.map((c) => (c === null || c === undefined ? null : typeof c === 'number' ? { value: c, type: Number } : { value: String(c) }))),
    ],
    columns: (s.widths ?? s.headers.map((h) => Math.max(12, h.length + 2))).map((width) => ({ width })),
    stickyRowsCount: 1,
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob: Blob = await (writeExcelFile as any)(payload).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.endsWith('.xlsx') ? fileName : fileName + '.xlsx'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
