type MileageExportEntry = {
  date: string
  startPoint: string
  startPostcode?: string
  stop1?: string
  stop1Postcode?: string
  stop2?: string
  stop2Postcode?: string
  stop3?: string
  stop3Postcode?: string
  stop4?: string
  stop4Postcode?: string
  finishPoint: string
  finishPostcode?: string
  clientsVisited?: string
  description?: string
  totalMiles: string
  claimRate: string
  chargeRate: string
  totalClaim: string
  totalCharge: string
  comments?: string
  status?: string
}

type MileageExportSheet = {
  name: string
  entries: MileageExportEntry[]
}

type MileageWorkbookOptions = {
  title: string
  claimPeriodLabel: string
  fileName: string
  sheets: MileageExportSheet[]
}

type ExcelCellValue = string | number | null

const EXPORT_HEADERS = [
  "Date",
  "Starting Point",
  "Starting Postcode",
  "1st Stop",
  "1st Stop Postcode",
  "2nd Stop",
  "2nd Stop Postcode",
  "3rd Stop",
  "3rd Stop Postcode",
  "4th Stop",
  "4th Stop Postcode",
  "Finish Point",
  "Finish Postcode",
  "Clients Visited",
  "Description",
  "Total Miles",
  "Claim Rate",
  "Claim Value",
  "Charge Rate",
  "Charge Value",
  "Status",
  "Comments",
]

const COLUMN_WIDTHS = [
  12, 24, 16, 25, 16, 25, 16, 25, 16, 25, 16, 24, 16, 26, 38, 12, 11, 13, 11, 13, 12, 34,
]

const encoder = new TextEncoder()

const clean = (value: string | undefined) => (value || "").trim()
const asNumber = (value: string | number | undefined) => {
  const parsed = Number.parseFloat(String(value ?? ""))
  return Number.isFinite(parsed) ? parsed : 0
}
const roundTo = (value: number, places: number) => {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")

const columnName = (zeroBasedIndex: number) => {
  let index = zeroBasedIndex + 1
  let name = ""
  while (index > 0) {
    const remainder = (index - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    index = Math.floor((index - 1) / 26)
  }
  return name
}

const exportRowForEntry = (entry: MileageExportEntry): ExcelCellValue[] => [
  clean(entry.date),
  clean(entry.startPoint),
  clean(entry.startPostcode),
  clean(entry.stop1),
  clean(entry.stop1Postcode),
  clean(entry.stop2),
  clean(entry.stop2Postcode),
  clean(entry.stop3),
  clean(entry.stop3Postcode),
  clean(entry.stop4),
  clean(entry.stop4Postcode),
  clean(entry.finishPoint),
  clean(entry.finishPostcode),
  clean(entry.clientsVisited),
  clean(entry.description),
  asNumber(entry.totalMiles),
  asNumber(entry.claimRate),
  asNumber(entry.totalClaim),
  asNumber(entry.chargeRate),
  asNumber(entry.totalCharge),
  clean(entry.status) || "draft",
  clean(entry.comments),
]

const sheetRows = (title: string, claimPeriodLabel: string, sheet: MileageExportSheet): ExcelCellValue[][] => {
  const totals = sheet.entries.reduce(
    (acc, entry) => {
      acc.miles += asNumber(entry.totalMiles)
      acc.claim += asNumber(entry.totalClaim)
      acc.charge += asNumber(entry.totalCharge)
      return acc
    },
    { miles: 0, claim: 0, charge: 0 },
  )

  const dataRows =
    sheet.entries.length > 0
      ? sheet.entries.map(exportRowForEntry)
      : [["No entries match this visit filter for this claim period.", ...Array(EXPORT_HEADERS.length - 1).fill("")]]

  return [
    [`${title} - ${sheet.name}`],
    [`Claim period: ${claimPeriodLabel}`],
    [
      "Trips",
      sheet.entries.length,
      "",
      "Miles",
      roundTo(totals.miles, 1),
      "",
      "Claim",
      roundTo(totals.claim, 2),
      "",
      "Charge",
      roundTo(totals.charge, 2),
    ],
    [],
    EXPORT_HEADERS,
    ...dataRows,
  ]
}

const safeSheetName = (name: string, usedNames: Set<string>) => {
  const base = (name || "Sheet").replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Sheet"
  let candidate = base
  let counter = 2
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = ` ${counter}`
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`
    counter += 1
  }
  usedNames.add(candidate.toLowerCase())
  return candidate
}

const styleForCell = (rowIndex: number, colIndex: number) => {
  if (rowIndex === 1) return 1
  if (rowIndex === 2) return 2
  if (rowIndex === 3) {
    if (colIndex === 4) return 5
    if (colIndex === 7 || colIndex === 10) return 6
    return 3
  }
  if (rowIndex === 5) return 4
  if (rowIndex >= 6) {
    if (colIndex === 15) return 5
    if (colIndex === 16 || colIndex === 18) return 7
    if (colIndex === 17 || colIndex === 19) return 6
  }
  return 0
}

const cellXml = (value: ExcelCellValue | undefined, rowIndex: number, colIndex: number) => {
  if (value === null || value === undefined || value === "") return ""

  const reference = `${columnName(colIndex)}${rowIndex}`
  const style = styleForCell(rowIndex, colIndex)
  const styleAttribute = style > 0 ? ` s="${style}"` : ""

  if (typeof value === "number") {
    return `<c r="${reference}"${styleAttribute}><v>${value}</v></c>`
  }

  return `<c r="${reference}" t="inlineStr"${styleAttribute}><is><t>${escapeXml(value)}</t></is></c>`
}

const worksheetXml = (rows: ExcelCellValue[][]) => {
  const lastRow = Math.max(rows.length, 1)
  const lastCol = EXPORT_HEADERS.length
  const cols = COLUMN_WIDTHS.map(
    (width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
  ).join("")

  const rowXml = rows
    .map((row, index) => {
      const rowIndex = index + 1
      const cells = row.map((cell, colIndex) => cellXml(cell, rowIndex, colIndex)).join("")
      const height = rowIndex === 1 ? ' ht="24" customHeight="1"' : rowIndex === 5 ? ' ht="30" customHeight="1"' : ""
      return `<row r="${rowIndex}"${height}>${cells}</row>`
    })
    .join("")

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${columnName(lastCol - 1)}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${cols}</cols>
  <sheetData>${rowXml}</sheetData>
</worksheet>`
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="0.0"/>
    <numFmt numFmtId="165" formatCode="£#,##0.00"/>
    <numFmt numFmtId="166" formatCode="0.00"/>
  </numFmts>
  <fonts count="5">
    <font><sz val="11"/><color rgb="FF0F172A"/><name val="Arial"/></font>
    <font><b/><sz val="16"/><color rgb="FF0F172A"/><name val="Arial"/></font>
    <font><i/><sz val="11"/><color rgb="FF334155"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F6B85"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

const contentTypesXml = (sheetCount: number) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${Array.from({ length: sheetCount }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`

const workbookXml = (sheetNames: string[]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheetNames.map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}
  </sheets>
</workbook>`

const workbookRelsXml = (sheetCount: number) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${Array.from({ length: sheetCount }, (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let crc = index
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
    table[index] = crc >>> 0
  }
  return table
})()

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const u16 = (value: number) => {
  const bytes = new Uint8Array(2)
  new DataView(bytes.buffer).setUint16(0, value, true)
  return bytes
}

const u32 = (value: number) => {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, true)
  return bytes
}

const concat = (parts: Uint8Array[]) => {
  const totalLength = parts.reduce((total, part) => total + part.length, 0)
  const output = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

const createZip = (files: Array<{ name: string; content: string }>) => {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  files.forEach((file) => {
    const name = encoder.encode(file.name)
    const content = encoder.encode(file.content)
    const crc = crc32(content)

    const localHeader = concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(content.length),
      u32(content.length),
      u16(name.length),
      u16(0),
      name,
    ])
    localParts.push(localHeader, content)

    const centralHeader = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(content.length),
      u32(content.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ])
    centralParts.push(centralHeader)
    offset += localHeader.length + content.length
  })

  const localData = concat(localParts)
  const centralDirectory = concat(centralParts)
  const endRecord = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(localData.length),
    u16(0),
  ])

  return concat([localData, centralDirectory, endRecord])
}

export const createMileageExcelWorkbookBlob = ({ title, claimPeriodLabel, sheets }: Omit<MileageWorkbookOptions, "fileName">) => {
  const usedSheetNames = new Set<string>()
  const normalizedSheets = sheets.map((sheet) => ({
    ...sheet,
    name: safeSheetName(sheet.name, usedSheetNames),
  }))

  const files = [
    { name: "[Content_Types].xml", content: contentTypesXml(normalizedSheets.length) },
    { name: "_rels/.rels", content: rootRelsXml },
    { name: "xl/workbook.xml", content: workbookXml(normalizedSheets.map((sheet) => sheet.name)) },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml(normalizedSheets.length) },
    { name: "xl/styles.xml", content: stylesXml },
    ...normalizedSheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: worksheetXml(sheetRows(title, claimPeriodLabel, sheet)),
    })),
  ]

  return new Blob([createZip(files)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

export const downloadMileageExcelWorkbook = (options: MileageWorkbookOptions) => {
  const blob = createMileageExcelWorkbookBlob(options)
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = options.fileName.endsWith(".xlsx") ? options.fileName : `${options.fileName}.xlsx`
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
