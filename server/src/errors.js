// Every message a customer can see has a code. The website translates the code
// (English / Russian); `error` is the English fallback.
const MESSAGES = {
  // auth
  names_required: 'Enter your first and last name',
  invalid_email: 'Enter a valid email address',
  password_short: 'Password must be at least 8 characters',
  email_taken: 'An account with this email already exists',
  wrong_login: 'Wrong email or password',
  not_logged_in: 'Not logged in',
  admins_only: 'Admins only',
  too_many_requests: 'Too many attempts. Please wait a few minutes and try again.',
  code_invalid: 'That code is wrong or has expired. Check your email or request a new code.',
  too_many_attempts: 'Too many wrong codes. Request a new code.',
  resend_wait: 'Please wait {seconds} seconds before requesting another code.',
  too_many_codes: 'Too many codes requested. Please try again in an hour.',
  email_send_failed: 'We couldn’t send the email right now. Please try again in a minute.',
  challenge_expired: 'This step has expired. Please start again.',
  password_mismatch: 'The two passwords don’t match',
  email_disposable: 'Temporary email addresses can’t be used. Please use your real email.',
  email_domain_invalid: 'This email address can’t receive mail. Check it for typos.',
  too_many_signups: 'Too many sign-ups from your network. Please try again later.',
  wrong_password: 'That password isn’t right',
  wrong_key: 'That access key isn’t right',
  names_too_long: 'Names can be at most 50 characters',
  same_email: 'That’s already your email address',
  not_for_key_accounts: 'Key accounts don’t use an email or password',
  not_for_email_accounts: 'Only key accounts have an access key',
  admin_not_customer: 'Admin accounts can’t use customer features. Sign in with a customer account.',
  // devices
  plan_required: 'You need an active plan to add a device',
  choose_location: 'Choose a server location',
  device_limit: 'You can have at most {max} devices. Remove one first.',
  server_full: 'This server is full',
  try_again: 'Please try again',
  device_not_found: 'Device not found',
  invalid_installation: 'Invalid device installation identifier',
  // payments
  choose_plan: 'Choose a plan',
  payer_name_required: 'Enter the name the payment was sent from',
  paid_on_required: 'Enter the date you paid',
  too_many_pending: 'You already have receipts waiting for review. We’ll check them shortly.',
  receipt_type: 'Please attach your receipt as a PDF, JPG, PNG or WebP file.',
  receipt_too_large: 'That file is too large. The maximum is 4 MB.',
  receipt_one_file: 'Please attach one receipt file.',
  receipt_not_found: 'Receipt not found',
  // admin
  days_range: 'Days must be between 1 and 3650',
  user_not_found: 'User not found',
  plan_name_required: 'Enter a name for the plan',
  plan_name_long: 'Plan names can be up to 40 characters',
  plan_days_range: 'Length must be between 1 and 3650 days',
  plan_price_range: 'Enter a whole price of at least 1',
  plan_not_found: 'Plan not found',
  plan_in_use: 'Customers have paid for this plan, so it can’t be deleted. Hide it instead.',
  last_plan: 'Keep at least one plan on sale.',
  account_deleted: 'This account was deleted. Restore it first.',
  already_reviewed: 'This payment was already reviewed.',
  reason_required: 'Tell the customer why, so they can fix it.',
  server_fields_missing: 'Missing: {fields}',
  agent_unreachable: 'Could not reach the server’s agent: {detail}',
  obfuscation_invalid: 'The AmneziaWG settings in the server details are missing or invalid.',
  server_not_found: 'Server not found',
  // generic
  not_found: 'Not found',
  server_error: 'Something went wrong',
};

function format(text, params) {
  return text.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? `{${k}}`));
}

export function errorBody(code, params = {}) {
  return { error: format(MESSAGES[code] || MESSAGES.server_error, params), code, params };
}

// res.status(400).json(errorBody(...)) shortcut
export function fail(res, status, code, params) {
  return res.status(status).json(errorBody(code, params));
}

// For throwing from helpers; the error handler turns it into a JSON response.
export class HttpError extends Error {
  constructor(status, code, params = {}) {
    super(errorBody(code, params).error);
    this.status = status;
    this.code = code;
    this.params = params;
  }
}
