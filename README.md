# VPSM Project - Angular CVPS

A modern Angular-based web application for managing vehicle permissions and contractor verification workflows.

## 📋 Overview

This project is part of the VPSM (Vehicle Permission System Management) ecosystem, providing a responsive frontend interface for handling vehicle permission requests, contractor verification, and authority management. Built with Angular, it offers a clean, component-based architecture for enterprise-level workflow management.

## 🚀 Features

- **Authentication & Authorization** - Secure login system with role-based access control
- **Vehicle Permission Management** - Create, view, and track vehicle permission requests
- **Contractor Workflows** - Multi-stage verification process (approver, confirmer, verifier)
- **Authority Dashboard** - Administrative interface for oversight and management
- **Responsive Design** - Mobile-friendly interface with modern UI/UX
- **Real-time Updates** - Dynamic data binding and state management

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Angular 19+ |
| **Language** | TypeScript |
| **Styling** | CSS3 |
| **Build Tool** | Angular CLI |
| **Package Manager** | npm |
| **Code Quality** | Prettier, EditorConfig |

## 📦 Project Structure

```
vpsm_project/
├── src/
│   ├── app/
│   │   ├── authority/          # Authority management module
│   │   ├── core/               # Core utilities and guards
│   │   ├── home/               # Home/dashboard module
│   │   ├── login/              # Authentication module
│   │   ├── services/           # Shared services (CVPS API integration)
│   │   ├── vehicle-permission/ # Vehicle permission workflows
│   │   │   ├── contractor-approver/
│   │   │   ├── contractor-confirmer/
│   │   │   ├── contractor-verifier/
│   │   │   ├── vehicle-permission-form/
│   │   │   ├── vehicle-permission-list/
│   │   │   └── vehicle-permission-pass/
│   │   ├── app.config.ts       # Application configuration
│   │   ├── app.routes.ts       # Route definitions
│   │   └── app.ts              # Main application component
│   ├── assets/                 # Static assets (images, icons, etc.)
│   ├── environments/           # Environment configurations
│   ├── index.html              # Application entry point
│   ├── main.ts                 # Bootstrap file
│   └── styles.css              # Global styles
├── angular.json                # Angular workspace configuration
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── .editorconfig               # Code style consistency
├── .prettierrc                 # Code formatting rules
└── .gitignore                  # Git ignore patterns
```

## 🔧 Prerequisites

Before running this project, ensure you have the following installed:

- **Node.js** (v18.x or later)
- **npm** (v9.x or later)
- **Angular CLI** (v19.x or later)

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/anchitchourasia/vpsm_project.git
cd vpsm_project/vpsm_project
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Configure the environment variables in `src/environments/environment.ts` with your backend API endpoints.

**⚠️ Important:** Do not commit sensitive information (API keys, credentials, IP addresses) to version control. Use environment-specific configuration files and `.gitignore` appropriately.

### 4. Run Development Server

```bash
ng serve
```

The application will be available at `http://localhost:4200/`

### 5. Build for Production

```bash
ng build --configuration production
```

Production builds are optimized and stored in the `dist/` directory.

## 📝 Available Scripts

| Command | Description |
|---------|-------------|
| `ng serve` | Start development server with hot reload |
| `ng build` | Build application for production |
| `ng test` | Run unit tests |
| `ng lint` | Run ESLint for code quality |
| `ng generate component <name>` | Generate a new Angular component |
| `ng generate service <name>` | Generate a new Angular service |

## 🔑 Key Modules

### Authentication (`/login`)
- User login with credential validation
- Session management and token handling
- Role-based navigation post-login

### Dashboard (`/home`)
- Overview of pending permissions
- Quick access to common actions
- User-specific widgets and notifications

### Vehicle Permission (`/vehicle-permission`)
- **Form** - Create new vehicle permission requests
- **List** - View and filter existing permissions
- **Pass** - Generate and download permission passes
- **Contractor Workflows** - Multi-stage approval process

### Authority (`/authority`)
- Administrative dashboard
- User and role management
- System-wide configuration

## 🔌 API Integration

The application communicates with backend services through the `CvpsService` (`src/app/services/cvps.service.ts`), which handles:

- HTTP client configuration
- Request/response interceptors
- Error handling and logging
- Authentication token management

## 🎨 Code Style

This project enforces consistent code style using:

- **Prettier** - Automated code formatting
- **EditorConfig** - Editor-agnostic settings
- **TypeScript strict mode** - Type safety and error prevention

Run formatting before committing:

```bash
npx prettier --write "src/**/*.ts"
```

## 🧪 Testing

```bash
# Run unit tests
ng test

# Run tests with coverage
ng test --code-coverage
```

## 📄 License

This project is proprietary software. All rights reserved.

## 👨‍💻 Author

**Anchit Chourasia**

- GitHub: [@anchitchourasia](https://github.com/anchitchourasia)

## 🤝 Contributing

For internal development and contribution guidelines, please refer to the project documentation or contact the development team.

## 📞 Support

For issues, questions, or support requests, please:

1. Check existing documentation
2. Review error logs in browser console
3. Contact the development team

---

**Note:** This README is intended for development purposes. Ensure all sensitive configuration details are kept private and not committed to the repository.
