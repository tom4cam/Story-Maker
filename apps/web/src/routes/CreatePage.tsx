import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { MicInput } from '../components/MicInput';
import { createStory } from '../api';
import { cancelSpeech, speak } from '../speech';
import { useLang, useT } from '../i18n';
import type { Lang } from '../i18n';
import type { StoryAnswer } from '../types';
import type { StringKey } from '../i18n/strings/en';

interface Question {
  id: string;
  promptKey: StringKey;
  spokenKey: StringKey;
  placeholderKey: StringKey;
  required: boolean;
}

// The first three are required. The remaining ones are offered as optional
// extras once the kid has the basics; this matches the spec's "2 to 6
// adaptive questions" intent.
const QUESTIONS: Question[] = [
  { id: 'hero', promptKey: 'q.hero.prompt', spokenKey: 'q.hero.spoken', placeholderKey: 'q.hero.placeholder', required: true },
  { id: 'setting', promptKey: 'q.setting.prompt', spokenKey: 'q.setting.spoken', placeholderKey: 'q.setting.placeholder', required: true },
  { id: 'goal', promptKey: 'q.goal.prompt', spokenKey: 'q.goal.spoken', placeholderKey: 'q.goal.placeholder', required: true },
  { id: 'friend', promptKey: 'q.friend.prompt', spokenKey: 'q.friend.spoken', placeholderKey: 'q.friend.placeholder', required: false },
  { id: 'problem', promptKey: 'q.problem.prompt', spokenKey: 'q.problem.spoken', placeholderKey: 'q.problem.placeholder', required: false },
  { id: 'ending', promptKey: 'q.ending.prompt', spokenKey: 'q.ending.spoken', placeholderKey: 'q.ending.placeholder', required: false },
];

export function CreatePage() {
  const t = useT();
  const { lang: uiLang } = useLang();
  const navigate = useNavigate();

  // Story language is initialized from UI language but pickable per story.
  const [storyLang, setStoryLang] = useState<Lang | null>(null);
  const suggestedLang: Lang = uiLang;

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spokenForRef = useRef<number>(-1);

  const q = QUESTIONS[step];
  const totalDone = Object.keys(answers).length;
  const minDone = QUESTIONS.filter((x) => x.required).length;
  const canFinish = totalDone >= minDone;
  const isLastQuestion = step >= QUESTIONS.length - 1;

  useEffect(() => {
    if (!storyLang) return;
    if (!q) return;
    if (spokenForRef.current === step) return;
    spokenForRef.current = step;
    speak(t(q.spokenKey));
    return () => cancelSpeech();
  }, [step, q, storyLang, t]);

  useEffect(() => () => cancelSpeech(), []);

  // Step 0: pick the story's language.
  if (!storyLang) {
    return (
      <Layout>
        <div className="card">
          <div className="question">{t('create.langStepTitle')}</div>
          <div className="row" style={{ marginTop: 16 }}>
            <button
              type="button"
              className={`btn${suggestedLang === 'en' ? ' sun' : ''}`}
              onClick={() => setStoryLang('en')}
            >
              {t('create.langStepEn')}
            </button>
            <button
              type="button"
              className={`btn${suggestedLang === 'sv' ? ' sun' : ''}`}
              onClick={() => setStoryLang('sv')}
            >
              {t('create.langStepSv')}
            </button>
          </div>
          <p className="subtle" style={{ marginTop: 16 }}>
            {t('home.heroBody')}
          </p>
        </div>
      </Layout>
    );
  }

  // Once we run past the last question.
  if (!q) {
    return (
      <Layout>
        <div className="card">
          <div className="question">{t('create.allSet')}</div>
          <p>{t('create.allSetHint')}</p>
        </div>
      </Layout>
    );
  }

  const acceptCurrent = () => {
    const trimmed = current.trim();
    if (!trimmed) {
      setError(t('create.typeOrSpeak'));
      return;
    }
    setError(null);
    setAnswers((prev) => ({ ...prev, [q.id]: trimmed }));
    setCurrent('');
    setStep((s) => s + 1);
  };

  const skipOptional = () => {
    setError(null);
    setCurrent('');
    setStep((s) => s + 1);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const payload: StoryAnswer[] = QUESTIONS
      .filter((qq) => answers[qq.id])
      .map((qq) => ({ question: t(qq.promptKey), answer: answers[qq.id] }));
    try {
      const story = await createStory(payload, storyLang);
      // The trigger returns 202 immediately with a pending story id;
      // the story page polls until the background worker finishes.
      navigate(`/s/${story.id}`);
    } catch (e) {
      setSubmitting(false);
      setError((e as Error).message);
    }
  };

  if (submitting) {
    return (
      <Layout>
        <div className="card loading">
          <div className="spinner" />
          <div className="question">{t('create.sending')}</div>
        </div>
      </Layout>
    );
  }

  const progressPct = Math.min(100, Math.round((step / QUESTIONS.length) * 100));

  return (
    <Layout>
      <div className="progress" aria-hidden="true">
        <div style={{ width: `${progressPct}%` }} />
      </div>
      <div className="card">
        <div className="question">{t(q.promptKey)}</div>
        <p className="subtle">
          {q.required ? t('create.required') : t('create.optional')}
        </p>
        <button type="button" className="btn ghost" onClick={() => speak(t(q.spokenKey))}>
          {t('create.hearAgain')}
        </button>

        <div style={{ marginTop: 16 }}>
          <MicInput
            value={current}
            onChange={setCurrent}
            placeholder={t(q.placeholderKey)}
            ariaLabel={t(q.promptKey)}
            language={storyLang}
          />
        </div>

        {error && <div className="error">{error}</div>}

        <div className="row between" style={{ marginTop: 16 }}>
          <div className="row">
            {!q.required && (
              <button type="button" className="btn ghost" onClick={skipOptional}>
                {t('create.skipThis')}
              </button>
            )}
          </div>
          <div className="row">
            {canFinish && !isLastQuestion && (
              <button type="button" className="btn secondary" onClick={submit}>
                {t('create.makeStory')}
              </button>
            )}
            <button type="button" className="btn" onClick={acceptCurrent}>
              {isLastQuestion ? t('create.saveAnswer') : t('create.next')}
            </button>
            {canFinish && isLastQuestion && (
              <button type="button" className="btn sun" onClick={submit}>
                {t('create.makeStory')}
              </button>
            )}
          </div>
        </div>
      </div>

      {totalDone > 0 && (
        <div className="card">
          <div className="subtle" style={{ marginBottom: 6 }}>{t('create.soFar')}</div>
          <ul className="answer-list">
            {QUESTIONS.filter((qq) => answers[qq.id]).map((qq) => (
              <li key={qq.id}>
                <b>{t(qq.promptKey)}</b><br />
                {answers[qq.id]}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Layout>
  );
}
