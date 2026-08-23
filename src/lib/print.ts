/** Print without browser header (title) and footer (URL). */
export function printPage(options?: { title?: string }) {
  const previousTitle = document.title;
  document.title = options?.title ?? ' ';

  const cleanup = () => {
    document.title = previousTitle;
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
  window.print();
}
