export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  const iso = dateStr.slice(0, 10);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));

  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function startOfMonthISO(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export function generateReportEmail(c: {
  pet_name: string;
  owner_surname: string;
  species: string;
  exam_type: string;
  exam_date: string;
  findings_text: string;
  image_notes: string;
  image_count?: number;
}): { subject: string; body: string } {
  const subject = `Ultrasound report — ${c.pet_name} ${c.owner_surname} — ${c.exam_date}`;

  const imageLines: string[] = [];
  if (c.image_count && c.image_count > 0) {
    imageLines.push(
      `Images attached: ${c.image_count} screenshot${c.image_count === 1 ? '' : 's'} on file`,
    );
  }
  if (c.image_notes.trim()) {
    imageLines.push(
      c.image_count && c.image_count > 0
        ? `Image notes: ${c.image_notes}`
        : `Images attached: ${c.image_notes}`,
    );
  }
  if (imageLines.length === 0) {
    imageLines.push('Images attached: none');
  }

  const body = [
    `Patient: ${c.pet_name}`,
    `Owner: ${c.owner_surname}`,
    `Species: ${c.species}`,
    `Examination: ${c.exam_type}`,
    `Date: ${c.exam_date}`,
    '',
    c.findings_text,
    '',
    ...imageLines,
  ].join('\n');

  return { subject, body };
}
