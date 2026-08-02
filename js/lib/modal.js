const root = document.getElementById('modal-root');

export function openModal(innerHtml, { onMount } = {}) {
  root.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal">${innerHtml}</div></div>`;
  const backdrop = document.getElementById('modal-backdrop');
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', escHandler);
  if (onMount) onMount(root);
}

function escHandler(e) {
  if (e.key === 'Escape') closeModal();
}

export function closeModal() {
  root.innerHTML = '';
  document.removeEventListener('keydown', escHandler);
}
