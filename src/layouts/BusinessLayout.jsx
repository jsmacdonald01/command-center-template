import { useEffect, useState } from 'react';
import Section from '../components/Section.jsx';
import Panel from '../components/Panel.jsx';
import EditableValue from '../components/EditableValue.jsx';
import ChecklistWidget from '../widgets/ChecklistWidget.jsx';
import ListWidget from '../widgets/ListWidget.jsx';
import MoneyWidget from '../widgets/MoneyWidget.jsx';
import DocumentsWidget from '../widgets/DocumentsWidget.jsx';
import './business.css';

/*
 * The Business page, laid out the same way every time:
 *
 *   (business name) — the page title, typed right here
 *   Company card     | Jobs              | Unpaid invoices
 *   Clients          | Leads & quotes    | Expenses this month
 *                    |                   | Contracts & paperwork
 *
 * The ids are fixed — Workload on the Home page reads `jobs`, and the agent
 * finds the rest by name — so they are listed in the config file too.
 */
export const BUSINESS_BOXES = {
  company: 'business',
  jobs: 'jobs',
  clients: 'clients',
  leads: 'leads',
  invoices: 'invoices',
  expenses: 'expenses',
  docs: 'business-docs'
};

const BOXES = {
  jobs: {
    id: BUSINESS_BOXES.jobs, type: 'checklist', title: 'Jobs', placeholder: 'A job to do',
    hint: 'Add the work you need to get done. Open jobs also show on the Home page under Workload.'
  },
  clients: {
    id: BUSINESS_BOXES.clients, type: 'list', title: 'Clients', placeholder: 'Client name',
    hint: 'Add each client. Use the date for when you last spoke, and the note for what they need.'
  },
  leads: {
    id: BUSINESS_BOXES.leads, type: 'list', title: 'Leads & quotes', placeholder: 'Who, and what they want',
    hint: 'People who might hire you, and quotes you have sent. Add a date to follow up.'
  },
  invoices: {
    id: BUSINESS_BOXES.invoices, type: 'money', title: 'Unpaid invoices',
    hint: 'Money you are owed. Remove an invoice once it is paid.'
  },
  expenses: {
    id: BUSINESS_BOXES.expenses, type: 'money', title: 'Expenses this month',
    hint: 'Business costs this month — supplies, fuel, software.'
  },
  docs: {
    id: BUSINESS_BOXES.docs, type: 'documents', title: 'Contracts & paperwork',
    hint: 'Attach contracts, licenses, insurance and tax papers. You can search inside them later.'
  }
};

/** The company card: logo, kind of business, state and EIN. */
function CompanyCard({ facts, actions }) {
  const [logo, setLogo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!facts.logo || !window.cc) { setLogo(null); return undefined; }
    window.cc.files.image(facts.logo)
      .then((url) => { if (!cancelled) setLogo(typeof url === 'string' ? url : null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [facts.logo]);

  const chooseLogo = async () => {
    const res = await window.cc.files.chooseImage(BUSINESS_BOXES.company, 'logo');
    if (res && res.ok) actions.setField(BUSINESS_BOXES.company, 'logo', res.filePath);
  };

  const Fact = ({ label, field, placeholder }) => (
    <div className="cc-company-fact">
      <div className="cc-field-label">{label}</div>
      <div className="cc-company-value">
        <EditableValue
          label={label}
          value={facts[field] || ''}
          placeholder={placeholder}
          onCommit={(v) => actions.setField(BUSINESS_BOXES.company, field, v)}
        />
      </div>
    </div>
  );

  return (
    <Panel className="cc-company">
      <button
        type="button"
        className={`cc-company-logo${logo ? ' is-set' : ''}`}
        onClick={chooseLogo}
        title={logo ? 'Change logo' : 'Add your logo'}
      >
        {logo ? <img src={logo} alt="" /> : <span>+ Logo</span>}
      </button>
      <div className="cc-company-facts">
        <Fact label="Type" field="type" placeholder="LLC, sole proprietor…" />
        <Fact label="State issued" field="state" placeholder="(state)" />
        <Fact label="EIN" field="ein" placeholder="00-0000000" />
      </div>
    </Panel>
  );
}

export default function BusinessLayout({ page, data, actions }) {
  const facts = (data.fields && data.fields[BUSINESS_BOXES.company]) || {};
  const rows = (id) => (data.items && data.items[id]) || [];
  const box = (b, Component) => (
    <Component widget={b} rows={rows(b.id)} values={{}} actions={actions} />
  );

  return (
    <Section id={page.id} fit>
      {/* The page title is the business name, typed right here. */}
      <header className="cc-section-header">
        <div className="cc-section-header-left">
          <h2 className="cc-section-title cc-business-title">
            <EditableValue
              label="Business name"
              value={facts.name || ''}
              placeholder="(business name)"
              onCommit={(v) => actions.setField(BUSINESS_BOXES.company, 'name', v)}
            />
          </h2>
        </div>
      </header>

      <div className="cc-business-grid">
        <div className="cc-business-col">
          <CompanyCard facts={facts} actions={actions} />
          {box(BOXES.clients, ListWidget)}
        </div>
        <div className="cc-business-col">
          {box(BOXES.jobs, ChecklistWidget)}
          {box(BOXES.leads, ListWidget)}
        </div>
        <div className="cc-business-col">
          {box(BOXES.invoices, MoneyWidget)}
          {box(BOXES.expenses, MoneyWidget)}
          {box(BOXES.docs, DocumentsWidget)}
        </div>
      </div>
    </Section>
  );
}
