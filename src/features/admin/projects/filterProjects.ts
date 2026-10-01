/** One row of the admin projects list. */
export type AdminProjectRow = {
  id: string;
  title: string;
  clientName: string;
  status: string;
  /** Unix ms; 0 when unknown. */
  createdAt: number;
  /** The project's group chat, once one exists (at the first hire). */
  chatId: string | null;
};

/**
 * The admin projects search: rows whose title or client name contains the
 * term, any case; an empty term keeps everything. Newest first either way.
 */
export function filterProjects(rows: AdminProjectRow[], term: string): AdminProjectRow[] {
  const q = term.trim().toLocaleLowerCase();
  const hit = (r: AdminProjectRow) =>
    !q || r.title.toLocaleLowerCase().includes(q) || r.clientName.toLocaleLowerCase().includes(q);
  return rows.filter(hit).sort((a, b) => b.createdAt - a.createdAt);
}
