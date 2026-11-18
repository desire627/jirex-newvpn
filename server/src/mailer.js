import nodemailer from 'nodemailer';
import { config } from './config.js';

// SMTP settings come from server/.env (never commit that file). Without SMTP_HOST, codes are
// printed in the API log instead, which is only allowed outside production.
const transport = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    })
  : null;

export async function checkMailer() {
  if (!transport) {
    if (config.isProduction) throw new Error('SMTP_HOST is not set: emails (verification codes) cannot be sent.');
    console.warn('[mail] SMTP not configured: verification codes will be printed here instead of emailed.');
    return;
  }
  try {
    await transport.verify();
    console.log(`[mail] SMTP ready (${config.smtp.host}:${config.smtp.port} as ${config.smtp.user})`);
  } catch (err) {
    console.error(`[mail] SMTP login failed: ${err.message}`);
  }
}

const TEXT = {
  en: {
    verify: {
      subject: 'Your JIREX verification code',
      intro: 'Welcome to JIREX! Use this code to confirm your email address:',
      ignore: 'If you didn’t create a JIREX account, you can ignore this email.',
    },
    login: {
      subject: 'Your JIREX sign-in code',
      intro: 'Use this code to finish signing in to JIREX:',
      ignore: 'If this wasn’t you, someone knows your password. Reset it from the sign-in page.',
    },
    reset: {
      subject: 'Reset your JIREX password',
      intro: 'Use this code to set a new password for your JIREX account:',
      ignore: 'If you didn’t ask to reset your password, you can ignore this email.',
    },
    email: {
      subject: 'Confirm your new JIREX email',
      intro: 'Use this code to confirm this as the new email address for your JIREX account:',
      ignore: 'If you didn’t ask to change your email, you can ignore this message.',
    },
    hi: (name) => (name ? `Hi ${name},` : 'Hi,'),
    expires: 'This code expires in 10 minutes. Never share it with anyone, including us.',
  },
  ru: {
    verify: {
      subject: 'Код подтверждения JIREX',
      intro: 'Добро пожаловать в JIREX! Введите этот код, чтобы подтвердить почту:',
      ignore: 'Если вы не создавали аккаунт JIREX, просто проигнорируйте это письмо.',
    },
    login: {
      subject: 'Код для входа в JIREX',
      intro: 'Введите этот код, чтобы завершить вход в JIREX:',
      ignore: 'Если это были не вы, кто-то знает ваш пароль. Смените его на странице входа.',
    },
    reset: {
      subject: 'Сброс пароля JIREX',
      intro: 'Введите этот код, чтобы задать новый пароль для аккаунта JIREX:',
      ignore: 'Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.',
    },
    email: {
      subject: 'Подтвердите новую почту JIREX',
      intro: 'Введите этот код, чтобы подтвердить этот адрес как новую почту аккаунта JIREX:',
      ignore: 'Если вы не меняли почту, просто проигнорируйте это письмо.',
    },
    hi: (name) => (name ? `Здравствуйте, ${name}!` : 'Здравствуйте!'),
    expires: 'Код действует 10 минут. Никому его не сообщайте — даже нам.',
  },
};

const escape = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function render({ code, purpose, lang, name }) {
  const t = TEXT[lang] || TEXT.en;
  const p = t[purpose];
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  const text = `${t.hi(name)}\n\n${p.intro}\n\n${spaced}\n\n${t.expires}\n\n${p.ignore}\n\n— JIREX`;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f5f9;font-family:Segoe UI,Arial,sans-serif;color:#14161f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3e6ef">
<tr><td style="background:#0a0e15;padding:22px 28px;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:.04em">
<span style="display:inline-block;width:28px;height:28px;border-radius:8px;background:#34e3a4;color:#04170f;text-align:center;line-height:28px;font-size:13px;margin-right:10px;vertical-align:middle">JD</span>JIREX</td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 12px;font-size:16px">${escape(t.hi(name))}</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.5;color:#3d4457">${escape(p.intro)}</p>
<div style="text-align:center;margin:0 0 22px"><span style="display:inline-block;padding:16px 26px;border-radius:12px;background:#ecfdf6;border:1px solid #9df0d0;font-family:Consolas,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:.2em;color:#04170f">${spaced}</span></div>
<p style="margin:0 0 10px;font-size:13px;color:#646b80;line-height:1.5">${escape(t.expires)}</p>
<p style="margin:0;font-size:13px;color:#646b80;line-height:1.5">${escape(p.ignore)}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject: `${p.subject}: ${spaced}`, text, html };
}

export async function sendCodeEmail({ to, code, purpose, lang, name }) {
  const msg = render({ code, purpose, lang: lang === 'ru' ? 'ru' : 'en', name });
  if (!transport) {
    console.log(`[mail] (not sent, SMTP off) ${purpose} code for ${to}: ${code}`);
    return;
  }
  await transport.sendMail({ from: config.smtp.from, to, subject: msg.subject, text: msg.text, html: msg.html });
}
