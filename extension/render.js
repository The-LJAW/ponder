// Renders a study pack into the page. Shared by the web app and the Chrome
// extension (copied there by `npm run sync`). Builds DOM nodes with
// textContent only, never innerHTML, since content comes from video transcripts.

const KIND_INFO = {
  Apply: 'Use it in your own life',
  Connect: 'Link it to what you know',
  'Push back': 'Challenge the reasoning',
  Transfer: 'Move it to a new domain',
  Decide: 'Commit to a choice',
};

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const notesKey = (video) => `ponder:notes:${video.key}`;

export function loadNotes(video) {
  try {
    return JSON.parse(localStorage.getItem(notesKey(video)) || '{}');
  } catch {
    return {};
  }
}

function saveNotes(video, notes) {
  try {
    localStorage.setItem(notesKey(video), JSON.stringify(notes));
  } catch {}
}

/**
 * @param {HTMLElement} root
 * @param {{video: any, pack: any, meta?: any}} data API response body
 */
export function renderPack(root, data) {
  const { video, pack } = data;
  const notes = loadNotes(video);
  root.replaceChildren();

  // Header
  const title = video.title || pack.title || 'Your study pack';
  root.append(
    el(
      'header',
      { class: 'pk-head' },
      el('p', { class: 'pk-eyebrow' }, 'Study pack'),
      el('h2', { class: 'pk-title' }, title),
      el(
        'p',
        { class: 'pk-sub' },
        video.author ? `${video.author} · ` : '',
        el('a', { href: video.url, target: '_blank', rel: 'noopener' }, 'Watch the video'),
      ),
      pack.note ? el('p', { class: 'pk-note' }, pack.note) : null,
      data.meta?.truncated
        ? el('p', { class: 'pk-note' }, 'This video is very long, so the pack covers about the first 2.5 hours.')
        : null,
    ),
  );

  // Reflection questions: the heart of it, so they come first.
  const reflect = el(
    'section',
    { class: 'pk-section pk-reflect' },
    el('h3', {}, 'Ponder these'),
    el(
      'p',
      { class: 'pk-lede' },
      'Five questions with no right answer. Write a few lines for each; that is where the understanding happens.',
    ),
  );
  for (const q of pack.reflection) {
    const slug = q.kind.toLowerCase().replace(/\s+/g, '-');
    const textarea = el('textarea', {
      rows: '3',
      placeholder: 'Your thinking…',
      'aria-label': `Your answer to the ${q.kind} question`,
    });
    textarea.value = notes[q.kind] || '';
    let t;
    textarea.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        notes[q.kind] = textarea.value;
        saveNotes(video, notes);
      }, 300);
    });

    const nudge = q.nudge
      ? el('details', { class: 'pk-nudge' }, el('summary', {}, 'Need a nudge?'), el('p', {}, q.nudge))
      : null;

    reflect.append(
      el(
        'article',
        { class: `pk-q pk-q--${slug}` },
        el(
          'div',
          { class: 'pk-q-kind' },
          el('span', { class: 'pk-badge' }, q.kind),
          el('span', { class: 'pk-q-hint' }, KIND_INFO[q.kind] || ''),
        ),
        el('p', { class: 'pk-q-text' }, q.question),
        nudge,
        textarea,
      ),
    );
  }
  root.append(reflect);

  // Summary
  root.append(el('section', { class: 'pk-section' }, el('h3', {}, 'Summary'), el('p', { class: 'pk-summary' }, pack.summary)));

  // Outline
  if (pack.outline?.length) {
    root.append(
      el(
        'section',
        { class: 'pk-section' },
        el('h3', {}, 'Outline'),
        el(
          'ol',
          { class: 'pk-outline' },
          pack.outline.map((s) =>
            el('li', {}, el('strong', {}, s.heading), el('ul', {}, s.points.map((p) => el('li', {}, p)))),
          ),
        ),
      ),
    );
  }

  // Flashcards
  if (pack.flashcards?.length) {
    root.append(
      el(
        'section',
        { class: 'pk-section' },
        el('h3', {}, 'Flashcards ', el('span', { class: 'pk-count' }, `${pack.flashcards.length} cards · tap to flip`)),
        el(
          'div',
          { class: 'pk-cards' },
          pack.flashcards.map((c) =>
            el(
              'button',
              {
                class: 'pk-card',
                type: 'button',
                'aria-pressed': 'false',
                onclick: (e) => {
                  const b = e.currentTarget;
                  b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
                },
              },
              el('span', { class: 'pk-card-front' }, c.front),
              el('span', { class: 'pk-card-back' }, c.back),
            ),
          ),
        ),
      ),
    );
  }

  // Export
  const copyBtn = el('button', { class: 'pk-btn-ghost', type: 'button' }, 'Copy as Markdown');
  copyBtn.addEventListener('click', async () => {
    const md = packToMarkdown(data, loadNotes(video));
    try {
      await navigator.clipboard.writeText(md);
      copyBtn.textContent = 'Copied';
    } catch {
      copyBtn.textContent = 'Copy failed';
    }
    setTimeout(() => (copyBtn.textContent = 'Copy as Markdown'), 1800);
  });
  root.append(
    el(
      'footer',
      { class: 'pk-foot' },
      copyBtn,
      el('span', { class: 'pk-foot-hint' }, 'Includes your answers. Paste into Notion, Obsidian, or your notes.'),
    ),
  );
}

export function packToMarkdown({ video, pack }, notes = {}) {
  const lines = [`# ${video.title || pack.title}`, '', `Video: ${video.url}`, '', '## Ponder these', ''];
  for (const q of pack.reflection) {
    lines.push(`**${q.kind}:** ${q.question}`, '');
    if (notes[q.kind]?.trim()) lines.push(`> ${notes[q.kind].trim().replace(/\n/g, '\n> ')}`, '');
  }
  lines.push('## Summary', '', pack.summary, '', '## Outline', '');
  pack.outline.forEach((s, i) => {
    lines.push(`${i + 1}. **${s.heading}**`);
    s.points.forEach((p) => lines.push(`   - ${p}`));
  });
  lines.push('', '## Flashcards', '');
  pack.flashcards.forEach((c) => lines.push(`- **Q:** ${c.front}`, `  **A:** ${c.back}`));
  return lines.join('\n') + '\n';
}
