import Section, { SectionHeader } from './Section.jsx';
import GlyphMark from './GlyphMark.jsx';
import Widget from '../widgets/Widget.jsx';
import HomeLayout from '../layouts/HomeLayout.jsx';
import FinanceLayout from '../layouts/FinanceLayout.jsx';
import LogLayout from '../layouts/LogLayout.jsx';
import BusinessLayout from '../layouts/BusinessLayout.jsx';

/**
 * One page from the config file.
 *
 * Four pages have a fixed, ready-made layout, picked by `"layout"`:
 *   "home"    — greeting, coursework, to do, calendar, weather, markets, news
 *   "finance"  — links, bills, income, savings
 *   "business" — business name, company card, clients, jobs, leads,
 *                invoices, expenses, contracts
 *   "log"      — history, library, settings
 *
 * Every other page is a grid of boxes. The grid is one screen tall;
 * `columns` and `rows` set its size, and each box's `colSpan` and `rowSpan`
 * say how many cells it covers (default 1). Boxes fill in left to right,
 * top to bottom. Every box scrolls its own contents, so a long list never
 * pushes the page taller.
 */
export default function Page({ page, data, live, actions, ctx }) {
  if (page.layout === 'home') return <HomeLayout page={page} data={data} live={live} actions={actions} ctx={ctx} />;
  if (page.layout === 'finance') return <FinanceLayout page={page} data={data} actions={actions} />;
  if (page.layout === 'log') return <LogLayout page={page} data={data} actions={actions} ctx={ctx} />;
  if (page.layout === 'business') return <BusinessLayout page={page} data={data} actions={actions} />;

  const columns = Math.max(1, Number(page.columns) || 3);
  const rows = Math.max(1, Number(page.rows) || 2);

  return (
    <Section id={page.id} fit>
      <SectionHeader
        title={page.title}
        mark={page.glyph ? <GlyphMark name={page.glyph} title={page.title} /> : undefined}
      />

      <div
        className="cc-page-grid"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`
        }}
      >
        {(page.widgets || []).map((w) => (
          <div
            key={w.id}
            className={`cc-page-cell cc-page-cell--${w.type}`}
            style={{
              gridColumn: `span ${Math.min(columns, Math.max(1, Number(w.colSpan) || 1))}`,
              gridRow: `span ${Math.min(rows, Math.max(1, Number(w.rowSpan) || 1))}`
            }}
          >
            <Widget widget={{ ...w, pageId: page.id }} data={data} live={live} actions={actions} ctx={ctx} />
          </div>
        ))}
      </div>
    </Section>
  );
}
