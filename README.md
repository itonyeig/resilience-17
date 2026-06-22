
## Implemented API

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/creator-cards` | Create a creator card |
| `GET` | `/creator-cards/:slug` | Retrieve a published creator card |
| `DELETE` | `/creator-cards/:slug` | Soft-delete a creator card |

## Requirements

- Node.js
- MongoDB
- npm

## Environment

Create a `.env` file from `.env.example` and set at minimum:

```env
PORT=8811
MONGODB_URI=mongodb://127.0.0.1:27017/node-template
PINO_LOG_LEVEL=info
LOG_APP_REQUEST=0
```

`PORT` may be overridden by the deployment platform. `MONGODB_URI` must point to the MongoDB instance used by the deployed app.

## Run Locally

```sh
npm install
npm start
```

The app starts from `bootstrap.js`.

Example local URL:

```text
http://localhost:8811
```

## Test

```sh
npm test
```

The test command runs the Creator Card test suite with mock model support enabled and exits after completion.

