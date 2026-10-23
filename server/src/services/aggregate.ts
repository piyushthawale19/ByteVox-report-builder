import { getDb } from '../db/database.js';
import { AppError } from './auth.js';
import { getDatasetDataById } from './csv.js';

interface ExplanationDetail {
  plainEnglish: string;
  queryText: string;
  rowsIncluded: number;
  rowsExcluded: number;
  exclusionReasons: Array<{ reason: string; count: number }>;
}

interface AggregationResult {
  value: number | null;
  explanation: ExplanationDetail;
}

interface ReportFilter {
  dateColumn?: string;
  dateFrom?: string;
  dateTo?: string;
  categoryColumn?: string;
  categoryValue?: string;
}

interface BlockConfig {
  column?: string;
  operation?: 'sum' | 'average' | 'count' | 'min' | 'max';
  groupBy?: string;
  chartType?: 'bar' | 'line';
  topN?: number;
  sortColumn?: string;
  text?: string;
}

// Core aggregation — every metric computation passes through here so numbers are consistent
export function computeMetric(
  datasetId: number,
  config: BlockConfig,
  filter: ReportFilter
): AggregationResult | AggregationResult[] {
  const data = getDatasetDataById(datasetId);
  const db = getDb();
  const columns = db.prepare('SELECT * FROM dataset_columns WHERE dataset_id = ?').all(datasetId) as any[];

  const targetCol = columns.find(c => c.safe_name === config.column || c.original_name === config.column);
  if (!targetCol && config.operation !== 'count') {
    throw new AppError(400, `Column "${config.column}" not found.`);
  }

  if (config.operation && ['sum', 'average', 'min', 'max'].includes(config.operation) && targetCol?.detected_type !== 'number') {
    throw new AppError(400, `Cannot compute ${config.operation} on non-number column "${targetCol?.original_name}".`);
  }

  const safeName = targetCol?.safe_name || '';
  const colName = targetCol?.original_name || '';

  // Apply filter
  const { included, excluded, exclusionReasons } = applyFilter(data, columns, filter);

  if (config.groupBy) {
    const groupCol = columns.find(c => c.safe_name === config.groupBy || c.original_name === config.groupBy);
    if (!groupCol) throw new AppError(400, `Group-by column "${config.groupBy}" not found.`);

    const groups = new Map<string, any[]>();
    for (const row of included) {
      const key = String(row[groupCol.safe_name] ?? 'Unknown');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const results: AggregationResult[] = [];
    for (const [groupKey, groupRows] of groups) {
      const result = runAggregation(config.operation!, groupRows, safeName, colName, filter, excluded.length, exclusionReasons, groupCol.original_name, groupKey);
      results.push(result);
    }
    return results;
  }

  return runAggregation(config.operation!, included, safeName, colName, filter, excluded.length, exclusionReasons);
}

function runAggregation(
  op: string,
  rows: any[],
  safeName: string,
  colName: string,
  filter: ReportFilter,
  excludedCount: number,
  exclusionReasons: Array<{ reason: string; count: number }>,
  groupByName?: string,
  groupByValue?: string
): AggregationResult {
  const validRows = rows.filter(r => r[safeName] !== null && r[safeName] !== undefined);
  const nullRows = rows.filter(r => r[safeName] === null || r[safeName] === undefined);

  const allExclusionReasons = [...exclusionReasons];
  if (nullRows.length > 0) {
    allExclusionReasons.push({ reason: `Blank or invalid values in '${colName}'`, count: nullRows.length });
  }

  const totalExcluded = excludedCount + nullRows.length;
  const filterDesc = buildFilterDescription(filter);
  const groupDesc = groupByName ? ` where '${groupByName}' is '${groupByValue}'` : '';

  if (op === 'count') {
    return {
      value: rows.length,
      explanation: {
        plainEnglish: `Count of rows${groupDesc}${filterDesc}. ${rows.length} rows included, ${totalExcluded} excluded.`,
        queryText: `COUNT(*) from dataset${groupDesc}${filterDesc}`,
        rowsIncluded: rows.length,
        rowsExcluded: totalExcluded,
        exclusionReasons: allExclusionReasons,
      },
    };
  }

  if (validRows.length === 0) {
    const opName = op.charAt(0).toUpperCase() + op.slice(1);
    return {
      value: null,
      explanation: {
        plainEnglish: `No rows to ${op === 'average' ? 'average' : `compute ${op} for`}${groupDesc}${filterDesc}.`,
        queryText: `${op.toUpperCase()}(${colName}) — 0 valid rows`,
        rowsIncluded: 0,
        rowsExcluded: totalExcluded,
        exclusionReasons: allExclusionReasons,
      },
    };
  }

  const values = validRows.map(r => Number(r[safeName]));
  let value: number;

  switch (op) {
    case 'sum':
      value = values.reduce((a, b) => a + b, 0);
      break;
    case 'average':
      value = values.reduce((a, b) => a + b, 0) / values.length;
      break;
    case 'min':
      value = Math.min(...values);
      break;
    case 'max':
      value = Math.max(...values);
      break;
    default:
      throw new AppError(400, `Unknown operation: ${op}`);
  }

  value = Math.round(value * 100) / 100;

  return {
    value,
    explanation: {
      plainEnglish: `${op.charAt(0).toUpperCase() + op.slice(1)} of '${colName}'${groupDesc}${filterDesc}. ${validRows.length} rows included, ${totalExcluded} excluded${allExclusionReasons.length > 0 ? ` (${allExclusionReasons.map(r => `${r.count} ${r.reason}`).join(', ')})` : ''}.`,
      queryText: `${op.toUpperCase()}(${colName})${groupDesc}${filterDesc}`,
      rowsIncluded: validRows.length,
      rowsExcluded: totalExcluded,
      exclusionReasons: allExclusionReasons,
    },
  };
}

// Computes chart data (bar or line)
export function computeChart(
  datasetId: number,
  config: BlockConfig,
  filter: ReportFilter
): { data: any[]; explanation: ExplanationDetail } {
  const data = getDatasetDataById(datasetId);
  const db = getDb();
  const columns = db.prepare('SELECT * FROM dataset_columns WHERE dataset_id = ?').all(datasetId) as any[];

  const targetCol = columns.find(c => c.safe_name === config.column || c.original_name === config.column);
  const groupCol = columns.find(c => c.safe_name === config.groupBy || c.original_name === config.groupBy);

  if (!targetCol) throw new AppError(400, `Column "${config.column}" not found.`);
  if (!groupCol) throw new AppError(400, `Group-by column "${config.groupBy}" not found for chart.`);

  const { included, excluded, exclusionReasons } = applyFilter(data, columns, filter);
  const filterDesc = buildFilterDescription(filter);

  const groups = new Map<string, number[]>();
  for (const row of included) {
    const key = String(row[groupCol.safe_name] ?? 'Unknown');
    if (!groups.has(key)) groups.set(key, []);
    const val = row[targetCol.safe_name];
    if (val !== null && val !== undefined && !isNaN(Number(val))) {
      groups.get(key)!.push(Number(val));
    }
  }

  const chartData = Array.from(groups.entries()).map(([name, values]) => ({
    name,
    value: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
    count: values.length,
  }));

  return {
    data: chartData,
    explanation: {
      plainEnglish: `${config.chartType === 'line' ? 'Line' : 'Bar'} chart of average '${targetCol.original_name}' grouped by '${groupCol.original_name}'${filterDesc}. ${included.length} rows included, ${excluded.length} excluded.`,
      queryText: `AVG(${targetCol.original_name}) GROUP BY ${groupCol.original_name}${filterDesc}`,
      rowsIncluded: included.length,
      rowsExcluded: excluded.length,
      exclusionReasons,
    },
  };
}

// Computes top N rows by a column
export function computeTable(
  datasetId: number,
  config: BlockConfig,
  filter: ReportFilter
): { data: any[]; columns: string[]; explanation: ExplanationDetail } {
  const data = getDatasetDataById(datasetId);
  const db = getDb();
  const dbColumns = db.prepare('SELECT * FROM dataset_columns WHERE dataset_id = ?').all(datasetId) as any[];

  const sortCol = dbColumns.find(c => c.safe_name === config.sortColumn || c.original_name === config.sortColumn);
  if (!sortCol) throw new AppError(400, `Sort column "${config.sortColumn}" not found.`);

  const { included, excluded, exclusionReasons } = applyFilter(data, dbColumns, filter);
  const filterDesc = buildFilterDescription(filter);
  const topN = config.topN || 10;

  const sorted = [...included]
    .filter(r => r[sortCol.safe_name] !== null)
    .sort((a, b) => {
      const aVal = Number(a[sortCol.safe_name]) || 0;
      const bVal = Number(b[sortCol.safe_name]) || 0;
      return bVal - aVal;
    })
    .slice(0, topN);

  const columnNames = dbColumns.map((c: any) => c.original_name);
  const tableData = sorted.map(row => {
    const obj: Record<string, any> = {};
    dbColumns.forEach((col: any) => {
      obj[col.original_name] = row[col.safe_name];
    });
    return obj;
  });

  return {
    data: tableData,
    columns: columnNames,
    explanation: {
      plainEnglish: `Top ${topN} rows sorted by '${sortCol.original_name}' (descending)${filterDesc}. ${included.length} total rows considered, ${excluded.length} excluded.`,
      queryText: `SELECT * ORDER BY ${sortCol.original_name} DESC LIMIT ${topN}${filterDesc}`,
      rowsIncluded: included.length,
      rowsExcluded: excluded.length,
      exclusionReasons,
    },
  };
}

// Applies report-level filters (date range and/or category)
function applyFilter(
  data: any[],
  columns: any[],
  filter: ReportFilter
): { included: any[]; excluded: any[]; exclusionReasons: Array<{ reason: string; count: number }> } {
  const included: any[] = [];
  const excluded: any[] = [];
  const reasons = new Map<string, number>();

  for (const row of data) {
    let isExcluded = false;
    let reason = '';

    if (filter.dateColumn && (filter.dateFrom || filter.dateTo)) {
      const dateCol = columns.find((c: any) => c.safe_name === filter.dateColumn || c.original_name === filter.dateColumn);
      if (dateCol) {
        const val = row[dateCol.safe_name];
        if (!val) {
          isExcluded = true;
          reason = `Blank date in '${dateCol.original_name}'`;
        } else {
          const d = new Date(val);
          if (filter.dateFrom && d < new Date(filter.dateFrom)) {
            isExcluded = true;
            reason = `Date before ${filter.dateFrom}`;
          }
          if (filter.dateTo && d > new Date(filter.dateTo)) {
            isExcluded = true;
            reason = `Date after ${filter.dateTo}`;
          }
        }
      }
    }

    if (!isExcluded && filter.categoryColumn && filter.categoryValue) {
      const catCol = columns.find((c: any) => c.safe_name === filter.categoryColumn || c.original_name === filter.categoryColumn);
      if (catCol) {
        const val = String(row[catCol.safe_name] ?? '');
        if (val !== filter.categoryValue) {
          isExcluded = true;
          reason = `'${catCol.original_name}' is not '${filter.categoryValue}'`;
        }
      }
    }

    if (isExcluded) {
      excluded.push(row);
      reasons.set(reason, (reasons.get(reason) || 0) + 1);
    } else {
      included.push(row);
    }
  }

  return {
    included,
    excluded,
    exclusionReasons: Array.from(reasons.entries()).map(([reason, count]) => ({ reason, count })),
  };
}

function buildFilterDescription(filter: ReportFilter): string {
  const parts: string[] = [];
  if (filter.dateFrom || filter.dateTo) {
    if (filter.dateFrom && filter.dateTo) {
      parts.push(`between ${filter.dateFrom} and ${filter.dateTo}`);
    } else if (filter.dateFrom) {
      parts.push(`from ${filter.dateFrom}`);
    } else {
      parts.push(`until ${filter.dateTo}`);
    }
  }
  if (filter.categoryColumn && filter.categoryValue) {
    parts.push(`where '${filter.categoryColumn}' is '${filter.categoryValue}'`);
  }
  return parts.length > 0 ? ', ' + parts.join(', ') : '';
}

// Gets distinct values for a category column (for filter dropdowns)
export function getDistinctValues(datasetId: number, columnName: string): string[] {
  const data = getDatasetDataById(datasetId);
  const db = getDb();
  const columns = db.prepare('SELECT * FROM dataset_columns WHERE dataset_id = ?').all(datasetId) as any[];
  const col = columns.find(c => c.safe_name === columnName || c.original_name === columnName);
  if (!col) return [];

  const values = new Set<string>();
  for (const row of data) {
    const val = row[col.safe_name];
    if (val !== null && val !== undefined) {
      values.add(String(val));
    }
  }
  return Array.from(values).sort();
}
