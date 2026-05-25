import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useT } from '../i18n';

export function NotFoundPage() {
  const t = useT();
  return (
    <Layout>
      <div className="hero">
        <h1>{t('notFound.title')}</h1>
        <p>{t('notFound.body')}</p>
        <Link to="/" className="btn">{t('story.backHome')}</Link>
      </div>
    </Layout>
  );
}
