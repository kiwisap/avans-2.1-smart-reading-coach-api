import ExcelJS from 'exceljs';

function cellText(cell: ExcelJS.Cell): string {
    const value: unknown = cell.value;
    if (value == null) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
        const object = value as Record<string, unknown>;
        if (Array.isArray(object.richText)) {
            return (object.richText as { text: string }[])
                .map((part) => part.text)
                .join('')
                .trim();
        }
        if (object.hyperlink) return String(object.hyperlink).trim();
        if (object.text != null) return String(object.text).trim();
        if (object.result != null) return String(object.result).trim();
        return '';
    }
    return String(value).trim();
}

export interface SheetRow {
    rowNumber: number;
    cells: string[];
}

// Reads the first sheet and returns the data rows (header skipped) as arrays of strings.
export async function readCatalogSheet(filePath: string): Promise<SheetRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error(`No worksheet found in ${filePath}`);

    const rows: SheetRow[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return;
        const cells: string[] = [];
        for (let column = 1; column <= 7; column += 1) {
            cells.push(cellText(row.getCell(column)));
        }
        rows.push({ rowNumber, cells });
    });
    return rows;
}
