# Angular VPMS - Vehicle Parking Management System

**Frontend Application** | Built with Angular 19

A modern, enterprise-grade vehicle parking management system frontend built with Angular, providing comprehensive pass management, reporting, and administrative capabilities.

[![GitHub repo](https://img.shields.io/badge/GitHub-Repo-181717?style=flat&logo=github)](https://github.com/anchitchourasia/vpsm_project/tree/angularvpms)
[![Angular](https://img.shields.io/badge/Angular-19-DD0031?style=flat&logo=angular)](https://angular.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat)](LICENSE)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Development](#development)
- [Build & Deployment](#build--deployment)
- [Configuration](#configuration)
- [API Integration](#api-integration)
- [Code Quality](#code-quality)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

This Angular application serves as the frontend interface for the Vehicle Parking Management System (VPMS). It provides a complete solution for managing vehicle passes, generating reports, tracking entry/exit history, and administrative oversight.

The application follows Angular's standalone component architecture with modern best practices including reactive forms, routing, and HTTP client integration.

---

## Features

### Core Modules

- **Authentication** - Secure login system with role-based access control
- **Dashboard** - Home module with system overview and quick actions
- **Pass Management** - Create, view, and manage vehicle passes
- **Pass Entry** - Record vehicle entry/exit transactions
- **Pass Sticker** - Generate and print pass stickers
- **History Tracking** - View complete transaction history
- **Reports** - Generate analytical reports and export data
- **Authority Management** - Admin panel for user and system management

### Key Capabilities

- Reactive forms with validation
- Dynamic workflow state management
- Advanced filtering and search
- Document download and export
- Responsive design for various screen sizes
- RESTful API integration

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Angular 19.0.0 |
| **Language** | TypeScript 5.6 |
| **Styling** | CSS3 |
| **Build Tool** | Angular CLI 19 |
| **Package Manager** | npm 10.9 |
| **Code Quality** | ESLint, Prettier |

### Key Dependencies

- `@angular/core`, `@angular/common`, `@angular/router` - Core Angular packages
- `@angular/forms`, `@angular/platform-browser` - Forms and browser support
- `rxjs` - Reactive programming with RxJS 7.8
- `zone.js` - Change detection

### Development Dependencies

- `typescript` ~5.6.2
- `@angular-devkit/build-angular` - Build system
- `@angular-eslint/*` - ESLint integration
- `eslint`, `prettier` - Code formatting and linting

---

## Project Structure

```
Frontend/
├── src/
│   ├── app/
│   │   ├── authority/          # Admin and user management
│   │   ├── core/               # Core utilities and guards
│   │   ├── history/            # Transaction history module
│   │   ├── home/               # Dashboard and landing page
│   │   ├── login/              # Authentication module
│   │   ├── pass-entry/         # Vehicle entry/exit module
│   │   ├── pass-sticker/       # Pass sticker generation
│   │   ├── passes/             # Pass CRUD operations
│   │   ├── reports/            # Reporting and analytics
│   │   ├── services/           # Shared services and HTTP clients
│   │   ├── app.config.ts       # Application configuration
│   │   ├── app.routes.ts       # Route definitions
│   │   └── app.ts              # Root component
│   ├── assets/                 # Static assets (images, fonts, etc.)
│   ├── environments/           # Environment configurations
│   │   └── environment.ts      # Environment variables
│   ├── index.html              # Main HTML template
│   ├── main.ts                 # Application bootstrap
│   └── styles.css              # Global styles
├── public/                     # Public assets
├── angular.json                # Angular CLI configuration
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── .editorconfig               # Editor settings
├── .eslintrc.json              # ESLint rules
└── .prettierrc                 # Prettier configuration
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 20.x
- **npm** >= 10.x
- **Angular CLI** >= 19.x

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/anchitchourasia/vpsm_project.git
cd vpsm_project/Frontend
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment**

Update the `src/environments/environment.ts` file with your API endpoint:

```typescript
export const environment = {
  production: false,
  apiUrl: 'YOUR_API_ENDPOINT_HERE'
};
```

4. **Start development server**

```bash
npm start
```

The application will be available at `http://localhost:4200/`

---

## Development

### Development Server

Run the development server with hot module replacement:

```bash
npm start
# or
ng serve
```

### Code Scaffolding

Generate new components, services, or modules using Angular CLI:

```bash
ng generate component component-name
ng generate service service-name
ng generate module module-name
```

### Running Tests

Execute unit tests with Karma:

```bash
npm test
# or
ng test
```

### Code Linting

Run ESLint to check code quality:

```bash
npm run lint
# or
ng lint
```

---

## Build & Deployment

### Production Build

Create an optimized production build:

```bash
npm run build
# or
ng build --configuration production
```

Build artifacts will be stored in the `dist/` directory.

### Deployment Options

#### Deploy to Apache Tomcat

1. Build the application:

```bash
ng build --configuration production
```

2. Copy the contents of `dist/` to Tomcat's `webapps/` directory

3. Configure Tomcat server and restart

#### Deploy to Static Hosting

The build output can be deployed to any static hosting service:

- Netlify
- Vercel
- GitHub Pages
- Firebase Hosting
- AWS S3 + CloudFront

---

## Configuration

### Environment Variables

Environment-specific configurations are managed in `src/environments/`:

- `environment.ts` - Development environment
- `environment.prod.ts` - Production environment (create as needed)

### Application Configuration

Main application settings are defined in `src/app/app.config.ts`:

- HTTP client configuration
- Route providers
- Application providers

### TypeScript Configuration

TypeScript settings are configured in:

- `tsconfig.json` - Base configuration
- `tsconfig.app.json` - Application-specific settings
- `tsconfig.spec.json` - Test configuration

---

## API Integration

The application communicates with a RESTful backend API. Configure the API endpoint in the environment file.

### Services

API services are located in `src/app/services/` and include:

- HTTP client setup
- Request/response interceptors
- Error handling
- Authentication tokens

### Example Service Usage

```typescript
import { HttpClient } from '@angular/common/http';

constructor(private http: HttpClient) {}

getData() {
  return this.http.get(`${environment.apiUrl}/endpoint`);
}
```

---

## Code Quality

### ESLint

This project uses ESLint with Angular-specific rules. Configuration is in `.eslintrc.json`.

```bash
npm run lint
```

### Prettier

Code formatting is enforced with Prettier. Configuration is in `.prettierrc`.

```bash
npx prettier --write "src/**/*.ts"
```

### EditorConfig

Editor settings are standardized with `.editorconfig` for consistent indentation and formatting across editors.

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow Angular style guide
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed
- Ensure linting passes before submitting PR

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support

For issues, questions, or contributions, please open an issue on the [GitHub repository](https://github.com/anchitchourasia/vpsm_project/issues).

---

**Built with ❤️ using Angular**
