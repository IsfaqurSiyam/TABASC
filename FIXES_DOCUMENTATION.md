# Registration flow and prior fix

## Current registration behavior

1. The frontend displays the current TABASC Participation Agreement and sends
   the accepted agreement version with the registration request.
2. `client/routes/auth.js` creates an encrypted wallet and stores the new
   account as an inactive, pending consumer. Wallet funding is deferred.
3. Registration does not return a login token. Pending accounts cannot log in.
4. An administrator approves and activates the account through the admin
   dashboard. First activation funds the wallet and returns the funding
   transaction hash. Requested on-chain roles are approved separately.
5. `client/models/User.js` hashes passwords in an async Mongoose save hook using
   bcrypt cost 12.

## Earlier Mongoose hook correction

The User model previously mixed an async save hook with a callback parameter.
The current promise-based hook has no `next` callback: it exits when the
password is unchanged and otherwise awaits bcrypt hashing. This avoids calling
an unavailable callback in promise-style Mongoose middleware.

## Current implementation and tests

- Backend: `client/routes/auth.js`, `client/routes/admin.js`,
  `client/models/User.js`
- Frontend: `frontend/src/pages/Register.jsx`,
  `frontend/src/context/AuthContext.jsx`
- Regression coverage: `client/tests/agreementRegistration.test.js`
- Run backend tests with `npm test --prefix client`.
