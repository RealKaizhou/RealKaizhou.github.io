document.addEventListener('DOMContentLoaded', () => {
  bulmaCarousel.attach('.carousel', {
    slidesToScroll: 1,
    slidesToShow: 1,
    loop: true,
    infinite: true,
    autoplay: true,
    autoplaySpeed: 5000,
  });
});

// Copy exactly the citation shown on the page, with success and failure feedback.
document.addEventListener('DOMContentLoaded', () => {
  const button = document.querySelector('.copy-bibtex-btn');
  const code = document.querySelector('#bibtex-code code');
  if (!button || !code) return;
  const label = button.querySelector('.copy-text');
  let feedbackTimer;

  function copyWithSelection(text) {
    const field = document.createElement('textarea');
    field.value = text;
    field.readOnly = true;
    field.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(field);
    try {
      field.select();
      if (!document.execCommand('copy')) throw new Error('Copy failed');
    } finally {
      field.remove();
      button.focus({ preventScroll: true });
    }
  }

  button.addEventListener('click', async () => {
    clearTimeout(feedbackTimer);
    let copied = false;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(code.textContent);
      copied = true;
    } catch {
      try { copyWithSelection(code.textContent); copied = true; } catch { /* Show manual-copy feedback below. */ }
    }
    button.classList.toggle('copied', copied);
    label.textContent = copied ? 'Copied!' : 'Select to copy';
    if (!copied) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(code);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    feedbackTimer = setTimeout(() => {
      button.classList.remove('copied');
      label.textContent = 'Copy';
    }, 2000);
  });
});
