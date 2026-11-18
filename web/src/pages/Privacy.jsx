import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BRAND } from '../brand.js';
import { LangSwitch, useI18n } from '../i18n/index.jsx';
import { Logo } from '../ui.jsx';

// Public privacy policy. Keep it in step with what the system actually stores
// (see README "How it works"). Texts live in i18n/en.js and i18n/ru.js under "privacy".
export default function Privacy() {
  const { t, tr } = useI18n();
  const vars = { brand: BRAND.name, email: BRAND.supportEmail };

  return (
    <div className="legal">
      <header className="legal-top">
        <div className="container container-sm row between">
          <Logo />
          <LangSwitch />
        </div>
      </header>
      <main className="container container-sm legal-body">
        <Link to="/" className="link-btn center-link" style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={15} /> {t('privacy.back')}
        </Link>
        <h1>{t('privacy.title')}</h1>
        <p className="muted">{t('privacy.updated')}</p>
        <p>{tr('privacy.intro', vars)}</p>
        {t('privacy.sections').map((s, i) => (
          <section key={i}>
            <h2>{s.h}</h2>
            {s.p && <p>{tr(`privacy.sections.${i}.p`, vars)}</p>}
            {s.items && (
              <ul>
                {s.items.map((_, j) => (
                  <li key={j}>{tr(`privacy.sections.${i}.items.${j}`, vars)}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
