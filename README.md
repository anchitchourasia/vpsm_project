# VPSM Project - Frontend

**Vehicle Pass Management System (VPMS)** - HEG Limited

## 📋 Overview

This is the Angular-based frontend for the Vehicle Pass Management System used by HEG Limited. The application manages vehicle passes, compliance documents, and gate movements for both company employees and contractors.

## 🏗️ Architecture

- **Framework**: Angular (latest)
- **Styling**: Custom CSS with Bootstrap Icons
- **Deployment**: Static files on Apache Tomcat 10.1.31
- **Base Path**: `/vpms-ui/`
- **API Integration**: Spring Boot REST APIs

## 🚀 Quick Start

### Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- Angular CLI 17.x or higher

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd vpsm_project/Frontend

# Install dependencies
npm install

# Start development server
ng serve
```

### Development Server

The app will be available at `http://localhost:4200/`

## 📦 Build for Production

### Build Command

```bash
ng build --configuration production --output-path dist/vpms-ui --base-href /vpms-ui/
```

### Output Structure

```
dist/vpms-ui/browser/
├── index.html
├── main-*.js
├── styles-*.css
├── chunk-*.js
├── assets/
└── ...
```

### Deployment to Tomcat

1. Copy contents of `dist/vpms-ui/browser/` to:
   ```
   <TOMCAT_HOME>/webapps/vpms-ui/
   ```

2. Ensure Tomcat has SPA fallback configured (see below)

3. Access the application at:
   ```
   http://<server>:<port>/vpms-ui/
   ```

## 🔧 Tomcat Configuration (Required)

### Enable RewriteValve

Edit `<TOMCAT_HOME>/conf/server.xml`:

```xml
<Host name="localhost" appBase="webapps" unpackWARs="true" autoDeploy="true">
    <Valve className="org.apache.catalina.valves.rewrite.RewriteValve" />
</Host>
```

### Add Rewrite Rule

Create `<TOMCAT_HOME>/conf/Catalina/localhost/rewrite.config`:

```
RewriteRule ^/vpms-ui/(?!.*\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map)$).*$ /vpms-ui/index.html [L]
```

### Restart Tomcat

```bash
# Stop Tomcat
# Start Tomcat
```

## 📁 Project Structure

```
Frontend/
├── src/
│   ├── app/
│   │   ├── app.ts              # Main AppComponent
│   │   ├── app.html            # App template (sidebar, navigation)
│   │   ├── app.css             # App styles
│   │   ├── app.config.ts       # App configuration (providers)
│   │   ├── app.routes.ts       # Route definitions
│   │   ├── core/               # Core services, guards, interceptors
│   │   ├── login/              # Login component
│   │   ├── home/               # Home/dashboard component
│   │   ├── pass-entry/         # Pass entry form
│   │   ├── passes/             # Pass list/registry
│   │   ├── reports/            # Reports component
│   │   ├── authority/          # Authority/admin panels
│   │   ├── history/            # Audit history
│   │   └── vehicles/           # Vehicle master management
│   ├── assets/                 # Static assets (images, logos)
│   ├── index.html              # Main HTML file
│   ├── main.ts                 # Bootstrap file
│   └── styles.css              # Global styles
├── public/                     # Public assets
├── angular.json                # Angular configuration
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript configuration
└── README.md                   # This file
```

## 🛣️ Routes

| Route | Description | Guard |
|-------|-------------|-------|
| `/login` | Login page | Public |
| `/` | Home/Dashboard | Authenticated |
| `/pass-entry` | Create new pass | Authenticated |
| `/passes/all` | All passes registry | Authenticated |
| `/passes/active` | Active passes | Authenticated |
| `/passes/expiring` | Expiring passes | Authenticated |
| `/passes/expired` | Expired passes | Authenticated |
| `/passes/surrendered` | Surrendered passes | Authenticated |
| `/my-pass` | User's pass list | Authenticated |
| `/reports` | Reports dashboard | Authenticated |
| `/history` | Audit history | Authenticated |
| `/authority/company` | Company policies | Admin |
| `/authority/approval` | Approval config | Approver |
| `/authority/gate` | Gate authority | Admin |
| `/authority/confirmer` | Confirmer panel | Confirmer |
| `/authority/uploader` | Uploader applications | Uploader |
| `/vehicles/all` | All vehicles | Admin |
| `/vehicles/active` | Active vehicles | Admin |
| `/vehicles/blacklisted` | Blacklisted vehicles | Admin |
| `/docs/*` | Document management | Admin |
| `/**` | Fallback to home | - |

## 🔐 User Roles

- **Regular Employee**: Can submit pass applications, view own passes
- **Uploader**: Can create passes, view all passes, access reports
- **Confirmer**: Can confirm passes, view pending confirmations
- **Approver**: Can approve passes, view pending approvals
- **Admin**: Full access to all modules, master data, and configuration

## 🧪 Testing

```bash
# Run unit tests
ng test

# Run e2e tests (if configured)
ng e2e
```

## 📝 Code Style

- **Prettier**: Code formatting
- **ESLint**: Linting (if configured)
- **EditorConfig**: Editor settings

## 🔑 Key Features

- ✅ Role-based access control
- ✅ Session management with `sessionStorage`
- ✅ Auth guards for protected routes
- ✅ Lazy-loaded components
- ✅ Responsive sidebar navigation
- ✅ Compliance document tracking (PUC, Insurance, Fitness, Load Test)
- ✅ Pass lifecycle management (Active, Expired, Surrendered)
- ✅ Audit trail for all pass movements
- ✅ Real-time badge counts for pending actions

## 🐛 Common Issues

### 404 on Route Refresh

**Problem**: Refreshing `/vpms-ui/passes/all` returns 404

**Solution**: Configure Tomcat SPA fallback (see Tomcat Configuration above)

### Assets Not Loading

**Problem**: CSS/JS files return 404

**Solution**: Ensure `--base-href /vpms-ui/` is used in build command

### Navigation Causes Full Page Reload

**Problem**: Clicking links reloads entire page

**Solution**: Use `routerLink` instead of `href`, use `router.navigate()` instead of `window.location`

## 📞 Support

For issues or questions, contact the development team or create an issue in the repository.

---

**Last Updated**: August 2026
**Version**: 6.4 (VPMS_FRONTEND branch)
