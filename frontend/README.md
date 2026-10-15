# TABASC frontend

The frontend uses Vite for development and production builds, with Vitest and
Testing Library for component tests.

## Commands

```powershell
npm start --prefix frontend
npm test --prefix frontend
npm run test:watch --prefix frontend
npm run build --prefix frontend
```

The API base URL defaults to `http://localhost:5000/api`. Override it by
setting `VITE_API_URL` in `frontend/.env`.
