// Example pack returned when PONDER_MOCK=1, so the UI can be built and
// tested without API keys. Written for an imagined lecture on the spacing effect.

export const SAMPLE_PACK = {
  title: 'Why Cramming Fails: The Science of Spaced Practice',
  summary:
    'Memories fade on a predictable curve, and the lecture argues that the best time to review something is just as you are about to forget it. Spreading the same study time across several sessions beats one long session, often by a wide margin on tests taken weeks later. The catch is that spaced practice feels harder and less productive in the moment, which is why most students keep cramming. The speaker closes with a simple schedule: review after one day, then three, then a week.',
  outline: [
    {
      heading: 'The forgetting curve',
      points: [
        'Ebbinghaus found that recall drops steeply within the first day, then levels off.',
        'Each successful review flattens the curve, so the next review can come later.',
      ],
    },
    {
      heading: 'Spacing versus massing',
      points: [
        'Same total study time, split into sessions, produces better long-term recall.',
        'Massed study (cramming) can win on a test the next morning but loses a week later.',
      ],
    },
    {
      heading: 'Why it feels wrong',
      points: [
        'Re-reading fresh material feels fluent, which we mistake for learning.',
        'Effortful retrieval after a gap feels worse but builds stronger memories ("desirable difficulty").',
      ],
    },
    {
      heading: 'A practical schedule',
      points: [
        'Review after 1 day, 3 days, 1 week, then monthly.',
        'Test yourself instead of re-reading; flashcards and blank-page recall both work.',
      ],
    },
  ],
  flashcards: [
    { front: 'What is the forgetting curve?', back: 'The steep early drop, then plateau, in how much we recall over time after learning something.' },
    { front: 'Who first measured the forgetting curve?', back: 'Hermann Ebbinghaus, in the 1880s, using lists of nonsense syllables.' },
    { front: 'What is the spacing effect?', back: 'Spreading study over several sessions produces better long-term retention than the same time in one session.' },
    { front: 'When can cramming beat spacing?', back: 'On a test very soon after studying, such as the next morning. It loses on delayed tests.' },
    { front: 'What is a "desirable difficulty"?', back: 'A learning condition that feels harder in the moment but improves long-term retention.' },
    { front: 'Why do students prefer re-reading?', back: 'It feels fluent and easy, which they mistake for mastery.' },
    { front: "What review schedule does the lecture suggest?", back: 'After 1 day, 3 days, 1 week, then about monthly.' },
    { front: 'Retrieval practice versus re-reading: which works better?', back: 'Retrieval practice (testing yourself) produces stronger long-term memory.' },
  ],
  reflection: [
    {
      kind: 'Apply',
      question:
        'Pick one exam or skill you have coming up in the next month. What would a 1-day, 3-day, 1-week review schedule look like on your actual calendar, and what is the first session you would have to move or cancel to make it fit?',
      nudge: 'Think about where your week already has small gaps, not where it has big ones.',
    },
    {
      kind: 'Connect',
      question:
        'The lecture says fluency while re-reading feels like learning but is not. Where else in your life does something feel productive while you are doing it but leave little behind?',
      nudge: 'Consider meetings, scrolling, or practice routines that never get harder.',
    },
    {
      kind: 'Push back',
      question:
        'Most spacing studies use word lists and simple facts. Is there a kind of learning you care about, such as debugging code or writing an argument, where you suspect a long, focused session beats spaced short ones?',
      nudge: 'Ask what the skill needs that a 10-minute review cannot give it.',
    },
    {
      kind: 'Transfer',
      question:
        'If spacing works for memory, what would it mean for building a relationship, a habit, or a team: lots of small contacts over time instead of one intense burst? What part of the analogy breaks?',
      nudge: 'Look for what plays the role of "forgetting" in that domain.',
    },
    {
      kind: 'Decide',
      question:
        'You have six hours to prepare for an exam in two weeks. Do you spend them in one Saturday block or in six one-hour sessions, knowing the spaced plan will feel worse each time? Commit to one and say what would make you abandon it.',
      nudge: 'Be honest about which plan you would actually follow through on.',
    },
  ],
  note: '',
};
