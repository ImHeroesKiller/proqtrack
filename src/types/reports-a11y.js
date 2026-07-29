// Accessibility hardening for dynamically rendered report forms.
// Ensures every visible label is explicitly associated with a form control.

let scheduled = false;

function slug(value = '') {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'field';
}

function associateLabels(root = document) {
  const forms = root.querySelectorAll('#rptFilterForm, .rpt-builder form');

  forms.forEach((form, formIndex) => {
    form.querySelectorAll('label').forEach((label, labelIndex) => {
      if (label.htmlFor) return;

      const nestedControl = label.querySelector('input, select, textarea, button');
      const siblingControl = label.parentElement?.querySelector(':scope > input, :scope > select, :scope > textarea');
      const control = nestedControl || siblingControl;
      if (!control) return;

      if (!control.id) {
        const base = control.name || slug(label.textContent);
        control.id = `rpt-${slug(base)}-${formIndex + 1}-${labelIndex + 1}`;
      }

      label.htmlFor = control.id;
    });

    const submitButton = form.querySelector('button.btn-primary:not([type])');
    if (submitButton) submitButton.type = 'submit';
  });
}

function scheduleFix() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    associateLabels();
  });
}

new MutationObserver(scheduleFix).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

window.addEventListener('hashchange', scheduleFix);
associateLabels();

export {};
