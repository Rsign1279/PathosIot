/* PATHOS contact: progressive enhancement, with confirmed delivery only. */
const INBOX = 'rsignsv1279@gmail.com';
const ERROR_MESSAGES = {
  name: () => 'Enter your name.',
  email: field => field.value.trim()
    ? 'Enter an email address like name@example.org.'
    : 'Enter your email address.',
  interest: () => 'Choose the type of interest.',
  message: () => 'Write a short message so we know how to help.',
};

export function initContact() {
  const form = document.getElementById('contactForm');
  const status = document.getElementById('formStatus');

  // Copy is optional; its failure never interrupts the form or hides the address.
  document.querySelectorAll('[data-copy]').forEach(button => {
    if (button.dataset.copyReady) return;
    button.dataset.copyReady = 'true';
    let resetTimer;
    const initialMarkup = button.innerHTML;
    const initialLabel = button.getAttribute('aria-label');
    button.addEventListener('click', async () => {
      clearTimeout(resetTimer);
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(button.dataset.copy);
        button.textContent = 'Copied';
        button.setAttribute('aria-label', 'Email address copied');
      } catch {
        button.textContent = 'Select email';
        button.setAttribute('aria-label', 'Copy unavailable. Select the email address beside this button.');
      }
      resetTimer = setTimeout(() => {
        button.innerHTML = initialMarkup;
        if (initialLabel) button.setAttribute('aria-label', initialLabel);
        else button.removeAttribute('aria-label');
      }, 3000);
    });
  });

  if (!form || !status || form.dataset.contactReady) return;
  const submit = form.querySelector('button[type="submit"]');
  if (!submit) return;
  form.dataset.contactReady = 'true';
  form.noValidate = true;
  const initialButtonMarkup = submit.innerHTML;
  const fields = Array.from(form.querySelectorAll('input[required], select[required], textarea[required]'));
  let sending = false, validationStarted = false;

  const announce = (message, state) => {
    status.textContent = message;
    status.classList.remove('error', 'success', 'sending');
    status.classList.add('form-status', state);
    status.hidden = false;
  };
  const setError = (field, message = '') => {
    const error = document.getElementById(`${field.id}Error`);
    if (message) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
    if (error) {
      error.textContent = message;
      error.hidden = !message;
    }
  };
  const validate = field => {
    // Whitespace alone does not satisfy a required field. Trim email so a
    // pasted address with surrounding whitespace has the intended result.
    if (field.type === 'email') field.value = field.value.trim();
    const valid = Boolean(field.value.trim()) && field.checkValidity();
    const message = ERROR_MESSAGES[field.name]?.(field) || 'Check this field and try again.';
    setError(field, valid ? '' : message);
    return valid;
  };
  const updateValidationSummary = () => {
    const invalid = fields.filter(field => field.getAttribute('aria-invalid') === 'true');
    if (invalid.length) {
      const message = invalid.length === 1 ? 'One field needs attention.' : `${invalid.length} fields need attention.`;
      if (status.textContent !== message || status.hidden) announce(message, 'error');
    } else {
      status.hidden = true;
      status.textContent = '';
      status.classList.remove('error');
    }
  };
  fields.forEach(field => {
    field.addEventListener(field.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (!validationStarted) return;
      validate(field);
      updateValidationSummary();
    });
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    const invalid = fields.filter(field => !validate(field));
    if (invalid.length) {
      validationStarted = true;
      updateValidationSummary();
      invalid[0].focus();
      return;
    }

    const data = Object.fromEntries(new FormData(form));
    if (data._honey) return;
    validationStarted = false;
    const payload = {
      name: (data.name || '').trim(),
      email: (data.email || '').trim(),
      organization: (data.organization || '').trim() || 'Not given',
      interest: data.interest,
      message: (data.message || '').trim(),
      _subject: `PATHOS: ${data.interest} from ${(data.name || '').trim()}`,
      _replyto: (data.email || '').trim(),
      _template: 'table',
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    sending = true;
    submit.disabled = true;
    submit.textContent = 'Sending…';
    form.setAttribute('aria-busy', 'true');
    announce('Sending your message…', 'sending');

    try {
      const response = await fetch(form.dataset.ajaxAction || form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || String(result.success) !== 'true') {
        announce(`Your message could not be sent. Your text is still here. Please try again, or email ${INBOX}.`, 'error');
        return;
      }
      announce(`Thanks, ${payload.name}. Your message was sent. We’ll reply to ${payload.email}.`, 'success');
      form.reset();
      fields.forEach(field => setError(field));
    } catch (error) {
      announce(error.name === 'AbortError'
        ? `The connection timed out. Your text is still here. Please try again, or email ${INBOX}.`
        : `The connection failed. Your text is still here. Please try again, or email ${INBOX}.`, 'error');
    } finally {
      clearTimeout(timeout);
      sending = false;
      submit.disabled = false;
      submit.innerHTML = initialButtonMarkup;
      form.removeAttribute('aria-busy');
    }
  });
}
