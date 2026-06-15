/**
 * Destaca um trecho de evidência/gap no textarea original.
 * Como <textarea> não renderiza HTML, selecionamos o trecho correspondente
 * (case-insensitive), focamos e rolamos até ele, com um flash visual breve.
 */
export function highlightEvidence(textarea, snippet) {
  if (!textarea || !snippet) return;
  const haystack = textarea.value.toLowerCase();
  const needle = snippet.trim().toLowerCase();
  const index = haystack.indexOf(needle);

  textarea.focus();
  if (index >= 0) {
    textarea.setSelectionRange(index, index + needle.length);
    scrollToSelection(textarea, index);
  }

  textarea.classList.add("evidence-highlight");
  setTimeout(() => textarea.classList.remove("evidence-highlight"), 700);
  textarea.scrollIntoView({ behavior: "smooth", block: "center" });
}

function scrollToSelection(textarea, index) {
  const before = textarea.value.slice(0, index);
  const lineNumber = before.split("\n").length - 1;
  const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
  textarea.scrollTop = Math.max(0, lineNumber * lineHeight - textarea.clientHeight / 2);
}
