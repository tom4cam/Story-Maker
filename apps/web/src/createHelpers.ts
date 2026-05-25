import type { YesNoNode } from './components/HelpYesNo';
import type { StringKey } from './i18n/strings/en';

export const HERO_TREE: YesNoNode = {
  prompt: { en: 'Is your hero an animal?', sv: 'Är hjälten ett djur?' },
  yes: {
    prompt: { en: 'A small fuzzy one?', sv: 'En liten luddig?' },
    yes: { answer: { en: 'a small fuzzy bunny named Pip', sv: 'en liten luddig kanin som heter Pip' } },
    no:  { answer: { en: 'a brave little dragon named Spark', sv: 'en modig liten drake som heter Gnista' } },
  },
  no: {
    prompt: { en: 'A brave kid?', sv: 'Ett modigt barn?' },
    yes: { answer: { en: 'a brave kid named Max', sv: 'ett modigt barn som heter Max' } },
    no:  { answer: { en: 'a kind robot named Beep', sv: 'en snäll robot som heter Pip' } },
  },
};

export const SETTING_TREE: YesNoNode = {
  prompt: { en: 'Is it outside?', sv: 'Är det utomhus?' },
  yes: {
    prompt: { en: 'In a forest?', sv: 'I en skog?' },
    yes: { answer: { en: 'in a magic forest with tall trees', sv: 'i en magisk skog med höga träd' } },
    no:  { answer: { en: 'on a sunny beach by the sea', sv: 'på en solig strand vid havet' } },
  },
  no: {
    prompt: { en: 'In a house?', sv: 'I ett hus?' },
    yes: { answer: { en: 'in a cozy little house full of books', sv: 'i ett mysigt litet hus fullt av böcker' } },
    no:  { answer: { en: 'in a spaceship far above the clouds', sv: 'i ett rymdskepp högt över molnen' } },
  },
};

export const GOAL_TREE: YesNoNode = {
  prompt: { en: 'Are they looking for something?', sv: 'Letar de efter något?' },
  yes: {
    prompt: { en: 'Something to eat?', sv: 'Något att äta?' },
    yes: { answer: { en: 'to find the worlds biggest cookie', sv: 'att hitta världens största kaka' } },
    no:  { answer: { en: 'to find a hidden treasure', sv: 'att hitta en gömd skatt' } },
  },
  no: {
    prompt: { en: 'Are they helping someone?', sv: 'Hjälper de någon?' },
    yes: { answer: { en: 'to help a lost friend get home', sv: 'att hjälpa en vilsen vän hem' } },
    no:  { answer: { en: 'to learn a new song', sv: 'att lära sig en ny sång' } },
  },
};

export interface QuestionHelpers {
  simplerKey?: StringKey;
  tree?: YesNoNode;
}

export const QUESTION_HELPERS: Record<string, QuestionHelpers> = {
  hero:    { simplerKey: 'q.hero.simpler',    tree: HERO_TREE },
  setting: { simplerKey: 'q.setting.simpler', tree: SETTING_TREE },
  goal:    { simplerKey: 'q.goal.simpler',    tree: GOAL_TREE },
};
