# Vehicle Permission Management System (VPMS) - Frontend

A modern, enterprise-grade Angular frontend application for managing vehicle gate entry permissions, pass requests, multi-stage approval workflows, document verification, printable pass sticker generation, and reporting.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack & Architecture](#tech-stack--architecture)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Environment Configuration](#environment-configuration)
- [Available Scripts & Commands](#available-scripts--commands)
- [Project Structure](#project-structure)
- [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
- [Troubleshooting](#troubleshooting)

---

## Overview

**VPMS (Vehicle Permission Management System)** streamlines organizational vehicle access control. It enables employees and contractors to request vehicle passes, submit mandatory vehicle documentation (Registration Certificate, Vehicle Insurance, Driving License), track pass requests through multi-tier verification workflows, generate printable vehicle stickers, and maintain comprehensive audit trail histories.

### Pass Request Workflow

```
[ Pass Entry / Request ] 
          │
          ▼
   [ Saved / Draft ] ──(Submit with Docs)──► [ Submitted ]
                                                    │
                                                    ▼
                                            [ Confirmed ] (Confirmer Role)
                                                    │
                                                    ▼
                                            [ Approved ] (Approver Role)
                                                    │
                                                    ▼
                                        [ Printable Pass Sticker ]
```

---

## Key Features

- **Pass Entry & Management**: Create, update, submit, and track vehicle pass applications.
- **Document Verification**: Enforces upload and validation of mandatory vehicle documents (`RC`, `INSURANCE`, `LICENSE`).
- **Multi-Stage Approval Workflow**: Configurable multi-role workflow (`UPLOADER` ➔ `CONFIRMER` ➔ `APPROVER` ➔ `ADMIN`).
- **Printable Pass Stickers**: Render printable vehicle pass stickers with dynamic formatting and download capabilities using `html2canvas`.
- **Pass Registry & Active Passes**: View, search, filter, and update pass statuses (`Active`, `Surrendered`, `Expired`).
- **Audit History**: Track every pass status transition, editor details, and timestamp logs.
- **Exportable Reports**: Generate PDF reports (`jspdf`, `jspdf-autotable`) and Excel spreadsheets (`xlsx`, `file-saver`) for department and employee passes.
- **Role-Based Routing & Guards**: Angular functional route guards protecting views based on user session roles and assigned security gates.

---

## Tech Stack & Architecture

- **Framework**: [Angular 21](https://angular.dev/) (v21.2.0) utilizing Standalone Components, Angular Signals, and RxJS 7.8.
- **Build System**: Angular CLI (`@angular/cli` ^21.2.12) with `@angular/build` (backed by Vite/esbuild).
- **TypeScript**: TypeScript 5.9.
- **UI & Icons**: Custom CSS styling with [Bootstrap Icons](https://icons.getbootstrap.com/) (`bootstrap-icons` ^1.13.1).
- **Testing**: [Vitest 4](https://vitest.dev/) (`vitest` ^4.0.8, `@angular/build:unit-test`, `jsdom`).
- **Document & PDF Libraries**: `jspdf`, `jspdf-autotable`, `xlsx`, `file-saver`, `html2canvas`.

---

## Prerequisites

Ensure you have the following installed on your machine before running the application:

- **Node.js**: `v18.x`, `v20.x`, or higher recommended.
- **npm**: `v10.x` or `v11.x` (`npm@11.12.1` specified as package manager).
- **Angular CLI**: Installed globally or executable via `npx ng`.

```bash
node -v
npm -v
```

---

## Installation & Setup

1. **Clone the repository** (if applicable) and navigate to the `Frontend` workspace:

   ```bash
   cd D:\VPMS_Frontend\Frontend
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create or copy `src/environments/environment.ts` from `src/environments/environment.example.ts`:

   ```bash
   cp src/environments/environment.example.ts src/environments/environment.ts
   ```

4. **Start the local development server**:

   ```bash
   npm start
   ```

   Navigate to `http://localhost:4200/` in your web browser. The app will automatically reload if you change any source files.

---

## Environment Configuration

Environment configuration is managed inside `src/environments/environment.ts`.

### Environment Schema (`src/environments/environment.ts`)

```typescript
export const environment = {
  production: false,
  apiBaseUrl: 'http://<your-backend-host>:<port>/vpms',
  apiKey: 'YOUR_API_KEY_HERE',
  cvpsBaseUrl: 'http://<your-cvps-host>:<port>/cvps'
};
```

| Property | Type | Description |
| :--- | :--- | :--- |
| `production` | `boolean` | Flags whether the app is running in production mode (`true`) or development (`false`). |
| `apiBaseUrl` | `string` | Base REST API URL for VPMS backend services. |
| `apiKey` | `string` | Header key (`x-api-key`) passed for authentication with backend REST endpoints. |
| `cvpsBaseUrl` | `string` | Base URL for CVPS integration endpoints. |

> **Note**: Do not commit real secret keys, API tokens, or production URLs to source control.

---

## Available Scripts & Commands

All development, build, and test scripts are executed using `npm`:

| Command | Description |
| :--- | :--- |
| `npm start` | Launches `ng serve` to host the dev server at `http://localhost:4200/`. |
| `npm run build` | Compiles the production build into the `dist/vpm-ui` directory. |
| `npm run watch` | Builds the project in development mode with continuous file watching. |
| `npm run test` | Runs unit tests using Vitest (`ng test`). |
| `npm run ng` | Runs Angular CLI commands directly. |

---

## Project Structure

```
Frontend/
├── .vscode/                 # VS Code editor & task configurations
├── public/                  # Static assets and public resources
│   ├── favicon.ico
│   └── logos/
├── src/
│   ├── app/
│   │   ├── authority/       # Authority delegation and approval views
│   │   │   ├── approval/    # Pass request approval/confirmation workflows
│   │   │   └── authority.*  # Company authority management component
│   │   ├── core/            # Core singleton services, guards, and interceptors
│   │   │   ├── api.config.ts           # Central API endpoint registry
│   │   │   ├── auth.guard.ts           # Route guard protecting private routes
│   │   │   ├── auth.service.ts          # Authentication state, session, & RBAC
│   │   │   └── http-error.interceptor.ts # Global HTTP error handling
│   │   ├── history/         # Audit trail and history logging component
│   │   ├── home/            # Dashboard landing page & navigation cards
│   │   ├── login/           # User authentication login view
│   │   ├── pass-entry/      # Vehicle pass creation, edit, & document management
│   │   ├── pass-sticker/    # Visual pass sticker renderer & exporter
│   │   ├── passes/          # Pass registry & active passes table
│   │   ├── reports/         # Reporting view with PDF and Excel export features
│   │   ├── services/        # Feature state & HTTP services
│   │   │   ├── pass.service.ts
│   │   │   └── pass-state.service.ts
│   │   ├── app.config.ts    # Application configuration & providers
│   │   ├── app.routes.ts    # Angular router definitions
│   │   └── app.ts           # Root component wrapper
│   ├── assets/              # Logos and static images
│   ├── environments/        # Environment configurations
│   │   ├── environment.example.ts
│   │   └── environment.ts
│   ├── index.html           # Main HTML entry file
│   ├── main.ts              # Angular main entry bootstrap script
│   └── styles.css           # Global stylesheet
├── angular.json             # Angular CLI configuration
├── package.json             # NPM dependencies and project metadata
├── tsconfig.json            # Root TypeScript compiler options
└── README.md                # Project documentation
```

---

## Role-Based Access Control (RBAC)

The application enforces user role privileges resolved via `AuthService` (`src/app/core/auth.service.ts`).

### Role Hierarchy & Privileges

1. **`EMPLOYEE`**: Basic user access; can view assigned entries.
2. **`UPLOADER`**: Can create, edit, save draft passes, and upload mandatory documents.
3. **`CONFIRMER`**: Can verify uploaded documents and confirm pass applications for approval.
4. **`APPROVER`**: Can grant final approval or reject pass applications.
5. **`ADMIN`**: Full administrative access across all gates, authority assignments, and management features.

---

## Troubleshooting

### 1. Unit Tests (`npm run test`) Fail with `ActivatedRoute` Error
**Symptom**: Running `npm run test` reports `No provider found for ActivatedRoute` in `app.spec.ts` and `pass-sticker.spec.ts`.  
**Cause**: The generated component tests inspect components that depend on Angular Routing without including routing providers in `TestBed.configureTestingModule`.  
**Resolution**: Update test spec files to include `provideRouter([])` in the providers array:
```typescript
import { provideRouter } from '@angular/router';

TestBed.configureTestingModule({
  imports: [App],
  providers: [provideRouter([])]
});
```

### 2. CommonJS Warning during Build (`html2canvas`)
**Symptom**: `npm run build` outputs a warning: `Module 'html2canvas' used by 'src/app/pass-sticker/pass-sticker.ts' is not ESM`.  
**Details**: This warning is informational and indicates that `html2canvas` uses CommonJS module packaging. The build finishes successfully without affecting runtime functionality.

### 3. Backend Network Error on Login (`Cannot reach server`)
**Symptom**: Login fails with error `Cannot reach server. Check backend network.`  
**Resolution**: Verify that the backend API server is running and accessible at the host/port specified in `apiBaseUrl` within `src/environments/environment.ts`.

---
