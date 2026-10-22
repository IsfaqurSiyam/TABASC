const crypto = require('node:crypto');

const AGREEMENT_VERSION = '1.0';
const AGREEMENT_TERMS = [
  'Use your own account and keep your password and wallet access secure. Tell us promptly if you think they have been compromised.',
  'Give accurate information about your identity, role, products, handling, and supply-chain events. Do not forge, hide, or alter records.',
  'Use the network only for lawful supply-chain work. Do not access another person’s account, misuse their information, or interfere with the service.',
  'Follow applicable food-safety, privacy, and other laws, and the rules for your approved role. Do not put personal or confidential information on the public blockchain.',
  'A reported violation may be reviewed by a TABASC administrator. Temporary restrictions may be used to address an immediate safety or security risk.',
  'A confirmed violation may lead to a warning, account suspension, or removal of your on-chain role. Where appropriate or required, information may be referred to the relevant authorities. Only those authorities or a court can decide whether to bring or determine a legal case.',
  'Blockchain records may be public and difficult or impossible to change. The platform can restrict network privileges, but cannot erase existing public-chain records or itself impose a court sentence.'
];
const AGREEMENT_HASH = crypto
  .createHash('sha256')
  .update(AGREEMENT_TERMS.join('\n'))
  .digest('hex');

const isAgreementAcceptanceValid = (accepted, version) => (
  accepted === true && version === AGREEMENT_VERSION
);

module.exports = {
  AGREEMENT_VERSION,
  AGREEMENT_TERMS,
  AGREEMENT_HASH,
  isAgreementAcceptanceValid
};
