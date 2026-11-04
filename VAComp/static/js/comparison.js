// Size every column heading so "Uncompensated" spans its image column.
const headingReference = document.querySelector('#comparison-size-reference');
const comparisonHeadings = headingReference.closest('.comparison-headers');
function fitComparisonHeadings() {
  const textWidth = headingReference.getBoundingClientRect().width;
  const columnWidth = headingReference.parentElement.getBoundingClientRect().width;
  if (!textWidth || !columnWidth) return;
  const currentSize = parseFloat(getComputedStyle(headingReference).fontSize);
  const fittedSize = currentSize * columnWidth * 0.99 / textWidth;
  if (Math.abs(fittedSize - currentSize) > 0.05) {
    document.documentElement.style.setProperty('--comparison-heading-size', `${fittedSize.toFixed(2)}px`);
  }
}
new ResizeObserver(fitComparisonHeadings).observe(comparisonHeadings);
document.fonts.ready.then(fitComparisonHeadings);
fitComparisonHeadings();

// Synchronize the same crop across all eight methods in each scene.
document.querySelectorAll('.comparison-row').forEach(row => {
  const boxes = [...row.querySelectorAll('.comparison-image')];
  const details = [...row.querySelectorAll('.comparison-detail')];
  const magnification = 4;
  const cropWidth = 1 / magnification;
  const cropHeight = cropWidth * 9 / 16;
  const initial = { x: Number(row.dataset.startX), y: Number(row.dataset.startY) };
  let position = { ...initial };
  let locked = false;
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

  function updateLockState() {
    row.dataset.locked = String(locked);
    boxes.forEach(box => {
      box.setAttribute('aria-pressed', String(locked));
      box.title = locked ? 'Click to resume following the pointer' : 'Click to lock this zoom position';
    });
  }

  function render() {
    const left = clamp(position.x - cropWidth / 2, 0, 1 - cropWidth);
    const top = clamp(position.y - cropHeight / 2, 0, 1 - cropHeight);
    boxes.forEach((box, index) => {
      const lens = box.querySelector('.zoom-cursor');
      lens.style.left = `${left * 100}%`;
      lens.style.top = `${top * 100}%`;
      const preview = details[index];
      const size = preview.clientWidth * magnification;
      preview.style.backgroundImage = `url("${box.querySelector('img').getAttribute('src')}")`;
      preview.style.backgroundSize = `${size}px ${size}px`;
      preview.style.backgroundPosition = `${-left * size}px ${-top * size}px`;
    });
  }

  function moveToPointer(event, box) {
    const rect = box.getBoundingClientRect();
    position = {
      x: clamp((event.clientX - rect.left) / rect.width, cropWidth / 2, 1 - cropWidth / 2),
      y: clamp((event.clientY - rect.top) / rect.height, cropHeight / 2, 1 - cropHeight / 2)
    };
    render();
  }

  boxes.forEach(box => {
    box.addEventListener('pointermove', event => {
      if (!locked && event.pointerType !== 'touch') moveToPointer(event, box);
    });
    box.addEventListener('pointerdown', event => {
      if (!locked && event.button === 0) moveToPointer(event, box);
    });
    box.addEventListener('click', () => {
      locked = !locked;
      updateLockState();
    });
    box.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
      event.preventDefault();
      if (locked) return;
      const step = event.shiftKey ? 0.05 : 0.02;
      if (event.key === 'ArrowLeft') position.x -= step;
      else if (event.key === 'ArrowRight') position.x += step;
      else if (event.key === 'ArrowUp') position.y -= step;
      else if (event.key === 'ArrowDown') position.y += step;
      else if (event.key === 'Home') position = { ...initial };
      position.x = clamp(position.x, cropWidth / 2, 1 - cropWidth / 2);
      position.y = clamp(position.y, cropHeight / 2, 1 - cropHeight / 2);
      render();
    });
  });

  // Keep the most recently inspected region visible when the pointer leaves.
  new ResizeObserver(render).observe(row.querySelector('.comparison-grid'));
  updateLockState();
  render();
});
