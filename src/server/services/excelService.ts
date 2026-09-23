import ExcelJS from 'exceljs';

export class ExcelService {
  static async createStudentReport(
    records: Array<Record<string, any>>,
    schoolName: string,
    titleMeta: { filter_desc?: string }
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Student Attendance');

    // Title Block
    ws.mergeCells('A1:I1');
    const titleCell = ws.getCell('A1');
    titleCell.value = schoolName.toUpperCase();
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    ws.mergeCells('A2:I2');
    const subCell = ws.getCell('A2');
    const genDate = new Date().toISOString().replace('T', ' ').slice(0, 16);
    subCell.value = `STUDENT ATTENDANCE REPORT  |  ${titleMeta.filter_desc || ''}  |  Generated on: ${genDate}`;
    subCell.font = { name: 'Calibri', size: 10, color: { argb: 'FFE0F2FE' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF115E59' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 22;

    if (!records || records.length === 0) {
      ws.mergeCells('A4:I5');
      const emptyCell = ws.getCell('A4');
      emptyCell.value = 'No attendance records found.';
      emptyCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF64748B' } };
      emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
      const buffer = await wb.xlsx.writeBuffer();
      return Buffer.from(buffer);
    }

    const headers = [
      'Roll Number', 'Student Name', 'Class', 'Subject',
      'Date', 'Day', 'Period', 'Status', 'Teacher'
    ];

    const startRow = 4;
    const headerRow = ws.getRow(startRow);
    headerRow.height = 24;

    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF134E4A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });

    const summaryData: Record<string, { roll: string; total: number; present: number; absent: number }> = {};

    records.forEach((rec, idx) => {
      const rowNum = startRow + 1 + idx;
      const row = ws.getRow(rowNum);
      const studentName = rec.studentName || 'Unknown';
      const rollNo = String(rec.rollNumber || '-');
      const status = String(rec.status || 'Absent');

      let dayName = '-';
      try {
        if (rec.date) {
          const d = new Date(rec.date);
          dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        }
      } catch {
        // Ignore date parse error
      }

      const rowValues = [
        rollNo,
        studentName,
        rec.className || rec.classId || '-',
        rec.subjectName || rec.subjectId || '-',
        rec.date || '-',
        dayName,
        rec.period || '-',
        status,
        rec.teacherName || 'Teacher'
      ];

      const isZebra = idx % 2 === 1;
      const bgFillColor = isZebra ? 'FFF8FAFC' : 'FFFFFFFF';

      rowValues.forEach((val, colIdx) => {
        const cell = row.getCell(colIdx + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', size: 10 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        if (colIdx === 7) {
          // Status column
          if (status.toLowerCase() === 'present') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF166534' } };
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF991B1B' } };
          }
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgFillColor } };
          cell.alignment = colIdx === 0 || colIdx === 4 || colIdx === 6 ? { horizontal: 'center', vertical: 'middle' } : { horizontal: 'left', vertical: 'middle' };
        }
      });

      // Update summary
      if (!summaryData[studentName]) {
        summaryData[studentName] = { roll: rollNo, total: 0, present: 0, absent: 0 };
      }
      summaryData[studentName].total += 1;
      if (status.toLowerCase() === 'present') {
        summaryData[studentName].present += 1;
      } else {
        summaryData[studentName].absent += 1;
      }
    });

    // Summary Section
    const sumStartRow = startRow + records.length + 3;
    ws.mergeCells(`A${sumStartRow}:F${sumStartRow}`);
    const sumTitle = ws.getCell(`A${sumStartRow}`);
    sumTitle.value = 'STUDENT-WISE ATTENDANCE SUMMARY';
    sumTitle.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    sumTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    sumTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(sumStartRow).height = 24;

    const sumHeaders = ['Roll No', 'Student Name', 'Total Periods', 'Present', 'Absent', 'Attendance %'];
    const sumHdrRow = ws.getRow(sumStartRow + 1);
    sumHeaders.forEach((sh, sIdx) => {
      const cell = sumHdrRow.getCell(sIdx + 1);
      cell.value = sh;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    let sRowIdx = sumStartRow + 2;
    for (const [name, stats] of Object.entries(summaryData)) {
      const row = ws.getRow(sRowIdx);
      const pct = stats.total > 0 ? ((stats.present / stats.total) * 100).toFixed(1) + '%' : '0.0%';
      const rowVals = [stats.roll, name, stats.total, stats.present, stats.absent, pct];

      rowVals.forEach((val, vIdx) => {
        const cell = row.getCell(vIdx + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', size: 10 };
        cell.alignment = vIdx === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      });
      sRowIdx++;
    }

    // Auto-fit column widths
    ws.columns.forEach((column) => {
      let maxLen = 12;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const cellVal = cell.value ? String(cell.value) : '';
        if (cellVal.length > maxLen && cellVal.length < 50) {
          maxLen = cellVal.length;
        }
      });
      column.width = maxLen + 3;
    });

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  static async createTeacherReport(
    records: Array<Record<string, any>>,
    schoolName: string,
    titleMeta: { filter_desc?: string }
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Teacher Attendance');

    // Title Block
    ws.mergeCells('A1:F1');
    const titleCell = ws.getCell('A1');
    titleCell.value = schoolName.toUpperCase();
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    ws.mergeCells('A2:F2');
    const subCell = ws.getCell('A2');
    const genDate = new Date().toISOString().replace('T', ' ').slice(0, 16);
    subCell.value = `TEACHER ATTENDANCE REPORT  |  ${titleMeta.filter_desc || ''}  |  Generated on: ${genDate}`;
    subCell.font = { name: 'Calibri', size: 10, color: { argb: 'FFE0F2FE' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF115E59' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 22;

    if (!records || records.length === 0) {
      ws.mergeCells('A4:F5');
      const emptyCell = ws.getCell('A4');
      emptyCell.value = 'No attendance records found.';
      emptyCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF64748B' } };
      emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
      const buffer = await wb.xlsx.writeBuffer();
      return Buffer.from(buffer);
    }

    const headers = ['Teacher UID', 'Teacher Name', 'Date', 'Day', 'Status', 'Marked By'];
    const startRow = 4;
    const headerRow = ws.getRow(startRow);
    headerRow.height = 24;

    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF134E4A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });

    const summaryData: Record<string, { total: number; present: number; absent: number }> = {};

    records.forEach((rec, idx) => {
      const rowNum = startRow + 1 + idx;
      const row = ws.getRow(rowNum);
      const teacherName = rec.teacherName || 'Unknown';
      const status = String(rec.status || 'Present');

      let dayName = '-';
      try {
        if (rec.date) {
          const d = new Date(rec.date);
          dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        }
      } catch {
        // Ignore date parse error
      }

      const rowValues = [
        rec.teacherCode || rec.teacherUid || '-',
        teacherName,
        rec.date || '-',
        dayName,
        status,
        rec.markedBy || 'Principal'
      ];

      const isZebra = idx % 2 === 1;
      const bgFillColor = isZebra ? 'FFF8FAFC' : 'FFFFFFFF';

      rowValues.forEach((val, colIdx) => {
        const cell = row.getCell(colIdx + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', size: 10 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        if (colIdx === 4) {
          if (status.toLowerCase() === 'present') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF166534' } };
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF991B1B' } };
          }
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgFillColor } };
          cell.alignment = colIdx === 0 || colIdx === 2 ? { horizontal: 'center', vertical: 'middle' } : { horizontal: 'left', vertical: 'middle' };
        }
      });

      if (!summaryData[teacherName]) {
        summaryData[teacherName] = { total: 0, present: 0, absent: 0 };
      }
      summaryData[teacherName].total += 1;
      if (status.toLowerCase() === 'present') {
        summaryData[teacherName].present += 1;
      } else {
        summaryData[teacherName].absent += 1;
      }
    });

    // Summary Section
    const sumStartRow = startRow + records.length + 3;
    ws.mergeCells(`A${sumStartRow}:E${sumStartRow}`);
    const sumTitle = ws.getCell(`A${sumStartRow}`);
    sumTitle.value = 'TEACHER-WISE ATTENDANCE SUMMARY';
    sumTitle.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    sumTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    sumTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(sumStartRow).height = 24;

    const sumHeaders = ['Teacher Name', 'Total Days', 'Present', 'Absent', 'Attendance %'];
    const sumHdrRow = ws.getRow(sumStartRow + 1);
    sumHeaders.forEach((sh, sIdx) => {
      const cell = sumHdrRow.getCell(sIdx + 1);
      cell.value = sh;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    let sRowIdx = sumStartRow + 2;
    for (const [name, stats] of Object.entries(summaryData)) {
      const row = ws.getRow(sRowIdx);
      const pct = stats.total > 0 ? ((stats.present / stats.total) * 100).toFixed(1) + '%' : '0.0%';
      const rowVals = [name, stats.total, stats.present, stats.absent, pct];

      rowVals.forEach((val, vIdx) => {
        const cell = row.getCell(vIdx + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', size: 10 };
        cell.alignment = vIdx === 0 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      });
      sRowIdx++;
    }

    ws.columns.forEach((column) => {
      let maxLen = 14;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const cellVal = cell.value ? String(cell.value) : '';
        if (cellVal.length > maxLen && cellVal.length < 50) {
          maxLen = cellVal.length;
        }
      });
      column.width = maxLen + 3;
    });

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
