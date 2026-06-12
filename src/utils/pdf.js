// utils/pdf.js
// ── Ovoz berganlar ro'yxatini PDF (Buffer) ko'rinishida tayyorlash ──────────
const PDFDocument = require('pdfkit');

function formatDate(date) {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Guruhga ovoz berganlar ro'yxatidan PDF buffer yaratadi.
 * @param {Object} opts
 * @param {Object} opts.teacher  - Teacher hujjati
 * @param {Object} opts.group    - Group hujjati
 * @param {Array}  opts.voters   - [{ user, votedAt }] ro'yxati
 * @returns {Promise<Buffer>}
 */
function buildVotersPdf({ teacher, group, voters }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Sarlavha ──────────────────────────────────────────────────────────
      doc.fontSize(18).font('Helvetica-Bold')
        .text('Ovoz berganlar royxati', { align: 'center' });
      doc.moveDown(0.5);

      doc.fontSize(11).font('Helvetica');
      doc.text(`Oqituvchi: ${teacher?.name || '-'}`);
      doc.text(`Guruh: ${group?.name || '-'}  (#${group?.groupId ?? '-'})`);
      doc.text(`Vaqt: ${group?.timeSlot || '-'}   Kunlar: ${group?.weekType || '-'}`);
      doc.text(`Jami ovozlar: ${voters.length}`);
      doc.text(`Hisobot sanasi: ${formatDate(new Date())}`);
      doc.moveDown(0.8);

      // ── Jadval ustunlari ──────────────────────────────────────────────────
      const startX = doc.page.margins.left;
      const cols = [
        { label: '#',          width: 25 },
        { label: 'Ism Familiya', width: 130 },
        { label: 'Username',   width: 90 },
        { label: 'Telefon',    width: 90 },
        { label: 'Telegram ID', width: 80 },
        { label: 'Sana',       width: 100 }
      ];

      const drawRow = (cells, isHeader = false) => {
        const y = doc.y;
        let x = startX;
        doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
        cells.forEach((cell, i) => {
          doc.text(String(cell ?? '-'), x + 2, y + 3, {
            width: cols[i].width - 4,
            ellipsis: true,
            lineBreak: false
          });
          x += cols[i].width;
        });
        const rowH = 16;
        // chiziq
        doc.moveTo(startX, y + rowH).lineTo(x, y + rowH)
          .strokeColor('#cccccc').lineWidth(0.5).stroke();
        doc.y = y + rowH;
      };

      drawRow(cols.map(c => c.label), true);

      if (!voters.length) {
        doc.moveDown(1);
        doc.font('Helvetica').fontSize(11)
          .text('Bu guruhga hali hech kim ovoz bermagan.', { align: 'center' });
      } else {
        voters.forEach(({ user, votedAt }, idx) => {
          // Sahifa to'lsa — yangi sahifa va sarlavha qatori
          if (doc.y > doc.page.height - doc.page.margins.bottom - 20) {
            doc.addPage();
            drawRow(cols.map(c => c.label), true);
          }
          const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || '-';
          const username = user?.username ? '@' + user.username : '-';
          drawRow([
            idx + 1,
            fullName,
            username,
            user?.phone || '-',
            user?.telegramId ?? '-',
            formatDate(votedAt)
          ]);
        });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildVotersPdf };
