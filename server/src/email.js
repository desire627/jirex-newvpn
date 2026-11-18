import dns from 'node:dns/promises';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Big free providers where several spellings reach the same inbox.
const GMAIL = new Set(['gmail.com', 'googlemail.com']);
const YANDEX = new Set(['yandex.ru', 'yandex.com', 'ya.ru', 'yandex.by', 'yandex.kz', 'yandex.ua', 'narod.ru']);

// One person = one account. The canonical form folds the variants of an address that all
// deliver to the same mailbox, so they can't be used to open several accounts:
//   anna.petrova+promo@gmail.com  →  annapetrova@gmail.com
//   Anna-Petrova@ya.ru            →  anna-petrova@yandex.ru
export function canonicalEmail(email) {
  const [rawLocal, rawDomain] = email.toLowerCase().split('@');
  let local = rawLocal.split('+')[0]; // "+tag" sub-addressing is the same inbox almost everywhere
  let domain = rawDomain;
  if (GMAIL.has(domain)) {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  } else if (YANDEX.has(domain)) {
    local = local.replace(/\./g, '-'); // Yandex treats "." and "-" as the same
    domain = 'yandex.ru';
  }
  return `${local}@${domain}`;
}

// Throwaway inbox services used for spam sign-ups.
const DISPOSABLE = new Set(
  `mailinator.com 10minutemail.com 10minutemail.net 20minutemail.com guerrillamail.com guerrillamail.net
guerrillamail.org guerrillamailblock.com sharklasers.com grr.la spam4.me yopmail.com yopmail.net yopmail.fr
temp-mail.org temp-mail.io tempmail.com tempmail.net tempmailo.com tempmail.plus tempr.email tmpmail.org
tmpmail.net trashmail.com trashmail.de trashmail.net getnada.com nada.email dispostable.com maildrop.cc
mailnesia.com mintemail.com mohmal.com emailondeck.com fakeinbox.com throwawaymail.com moakt.com
mail.tm mail.gw burnermail.io dropmail.me 33mail.com spamgourmet.com mailcatch.com inboxkitten.com
emailfake.com fakemail.net mytemp.email tempinbox.com discard.email harakirimail.com mailpoof.com
luxusmail.org minuteinbox.com crazymailing.com tempmailaddress.com 1secmail.com 1secmail.net 1secmail.org
byom.de wegwerfmail.de einrot.com mvrht.com cuvox.de armyspy.com dayrep.com fleckens.hu gustr.com
jourrapide.com rhyta.com superrito.com teleworm.us mailforspam.com spambox.us anonbox.net tempail.com
emltmp.com dropjar.com 10mail.org`.split(/\s+/),
);

export function isDisposable(email) {
  const domain = email.split('@')[1].toLowerCase();
  return DISPOSABLE.has(domain) || [...DISPOSABLE].some((d) => domain.endsWith(`.${d}`));
}

// The domain must be able to receive email (has MX records, or at least an address).
// If our own DNS lookup fails for another reason, we don't block the person.
export async function domainAcceptsMail(email) {
  const domain = email.split('@')[1];
  const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 4000));
  const lookup = (async () => {
    try {
      const mx = await dns.resolveMx(domain);
      if (mx.length && !(mx.length === 1 && mx[0].exchange === '')) return true; // "null MX" = refuses mail
      return false;
    } catch (err) {
      if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
        try {
          return (await dns.resolve4(domain)).length > 0;
        } catch {
          return false;
        }
      }
      return true;
    }
  })();
  const result = await Promise.race([lookup, timeout]);
  return result !== false;
}

export function validEmailFormat(email) {
  return EMAIL_RE.test(email) && email.length <= 254;
}
