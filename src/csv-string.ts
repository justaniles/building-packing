export type RowData<TColumnNames extends string> = {
    [K in TColumnNames]?: string | number | boolean
};

export interface CsvString<TColumnNames extends string> {
    addRow: (rowData: RowData<TColumnNames>) => CsvString<TColumnNames>;
    addComment: (comment: string) => CsvString<TColumnNames>;
    toString: () => string;
}

export function create<TColumnNames extends string>(
    columnNames: TColumnNames[]
): CsvString<TColumnNames> {
    const rows: string[] = [];
    const comments: string[] = [];

    const csvStringInstance: CsvString<TColumnNames> = {
        addRow: (rowData: RowData<TColumnNames>) => {
            const rowEntries: string[] = [];
            columnNames.forEach(name => {
                rowEntries.push("" + rowData[name] || "");
            });
            rows.push(rowEntries.join(","));
            return csvStringInstance;
        },
        addComment: (comment: string) => {
            comments.push("# " + comment);
            return csvStringInstance;
        },
        toString: () => {
            let csvString = "";

            csvString += comments.join("\n") + "\n";
            csvString += columnNames.join(",") + "\n";
            csvString += rows.join("\n");

            return csvString;
        }
    };

    return csvStringInstance;
}
