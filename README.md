# Codeaxi Server v2 🚀

[![GitHub Repo stars](https://img.shields.io/github/stars/zeelapatel/Codeaxi-server-v2?style=flat-square)](https://github.com/zeelapatel/Codeaxi-server-v2/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/zeelapatel/Codeaxi-server-v2?style=flat-square)](https://github.com/zeelapatel/Codeaxi-server-v2/issues)
[![License](https://img.shields.io/github/license/zeelapatel/Codeaxi-server-v2?style=flat-square)](https://github.com/zeelapatel/Codeaxi-server-v2/blob/main/LICENSE)

A modern Node.js/Express backend for managing code projects, documentation, and intelligent code analysis. Integrates with GitHub, OpenAI, ChromaDB, and more to automate documentation workflows and code insights.

---

## 📑 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Requirements](#requirements)
- [Quickstart](#quickstart)
- [Configuration](#configuration)
- [API Endpoints](#api-endpoints)
- [Scripts & Commands](#scripts--commands)
- [Folder Structure](#folder-structure)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgements](#acknowledgements)

---

## ✨ Features

- 🔐 **JWT Authentication**: Secure user login & project access.
- 📦 **Project Management**: CRUD for projects linked to GitHub repos.
- 🧠 **Code Ingestion & Analysis**: Parses codebases, identifies key components using LLMs.
- 📄 **Automated Documentation**: Generates and serves API docs from code.
- 🌐 **External Integrations**: OpenAI, ChromaDB, Pinecone, and more.
- ⚡ **Modern Dev Experience**: Hot-reload, clear configs, and robust error handling.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express
- **Database**: MongoDB (Mongoose)
- **Auth**: JWT
- **AI/LLM**: OpenAI API
- **Code Parsing**: tree-sitter
- **Vector DB**: ChromaDB, Pinecone
- **Other**: GitHub API, Nodemon

---

## 📋 Requirements

- Node.js v16+
- npm
- MongoDB instance
- OpenAI API key
- (Optional) ChromaDB, Pinecone API keys

---

## ⚡ Quickstart

```bash
# 1. Clone the repo
git clone https://github.com/zeelapatel/Codeaxi-server-v2.git
cd Codeaxi-server-v2

# 2. Install dependencies
npm install

# 3. Copy and edit environment variables
cp .env.example .env
# Edit .env with your keys and config

# 4. Start the server (dev mode)
npm run dev

# 5. Run tests (if available)
npm test
```

---

## ⚙️ Configuration

All sensitive and environment-specific settings are managed via `.env`:

| Variable           | Description                       |
|--------------------|-----------------------------------|
| `PORT`             | Server port (default: 3000)       |
| `MONGODB_URI`      | MongoDB connection string         |
| `JWT_SECRET`       | JWT signing secret                |
| `OPENAI_API_KEY`   | OpenAI API key                    |
| `CHROMA_API_KEY`   | ChromaDB API key (optional)       |
| `PINECONE_API_KEY` | Pinecone API key (optional)       |
| ...                | See `.env.example` for all vars   |

---

## 📚 API Endpoints (Summary)

| Method | Endpoint                | Description                      | Auth Required |
|--------|-------------------------|----------------------------------|--------------|
| POST   | `/api/auth/register`    | Register new user                | ❌           |
| POST   | `/api/auth/login`       | Login and get JWT                | ❌           |
| GET    | `/api/projects`         | List user projects               | ✅           |
| POST   | `/api/projects`         | Create new project               | ✅           |
| GET    | `/api/projects/:id`     | Get project details              | ✅           |
| PUT    | `/api/projects/:id`     | Update project                   | ✅           |
| DELETE | `/api/projects/:id`     | Delete (soft) project            | ✅           |
| POST   | `/api/projects/:id/sync`| Re-ingest/sync project           | ✅           |
| GET    | `/api/docs/:projectId`  | Get generated docs for project   | ✅           |
| ...    | See API docs for more   |                                  |              |

---

## 🏃 Scripts & Commands

| Script         | Description                  |
|----------------|-----------------------------|
| `npm run dev`  | Start server with nodemon   |
| `npm start`    | Start server (prod)         |
| `npm test`     | Run tests (if available)    |
| `npm run lint` | Lint codebase (if setup)    |

---

## 📁 Folder Structure

```
Codeaxi-server-v2/
├── src/
│   ├── controllers/    # Route handlers
│   ├── models/         # Mongoose schemas
│   ├── routes/         # Express routes
│   ├── services/       # Core business logic
│   ├── middleware/     # Auth, error handling, etc.
│   └── utils/          # Helpers/utilities
├── public/             # Static docs & assets
├── .env.example        # Env variable template
├── package.json
└── README.md
```

---

## 🤝 Contributing

Contributions welcome! Please open issues or PRs for bugs, features, or improvements.

---

## 📄 License

[MIT](LICENSE)

---

## 🙏 Acknowledgements

- [OpenAI](https://openai.com/)
- [ChromaDB](https://www.trychroma.com/)
- [Pinecone](https://www.pinecone.io/)
- [tree-sitter](https://tree-sitter.github.io/tree-sitter/)
- [Express](https://expressjs.com/)
- [MongoDB](https://www.mongodb.com/)
- All contributors and open-source libraries!

---

**Made with ❤️ by the Codeaxi community.**
