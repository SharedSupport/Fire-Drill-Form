# Shared Support - Fire Drill App

iPad web app for recording fire drills and generating audit-ready PDF reports. Reports are emailed directly to compliance on submit.

## Architecture

```
iPad (Safari/Web Clip)
  |
  | POST /api/submit-drill (form JSON)
  v
Azure Static Web App (free tier)
  |-- index.html          (frontend form)
  |-- api/
      |-- submit-drill/   (Azure Function)
          |-- Generates PDF with jsPDF
          |-- Emails PDF via SendGrid
          |-- Returns success/failure
```

## Setup

### 1. SendGrid (free tier: 100 emails/day)
1. Create account at https://sendgrid.com
2. Verify a sender email (e.g. firedrill@sharedsupport.org)
3. Create an API key with Mail Send permission

### 2. Azure Static Web App
1. Azure Portal > Create Resource > Static Web App (Free plan)
2. Source: GitHub > select this repo
3. App location: `/` | API location: `api` | Output: blank
4. After creation, add Application Settings:
   - SENDGRID_API_KEY = your key
   - SENDGRID_FROM_EMAIL = your verified sender

### 3. Intune Web Clip
1. Apps > iOS/iPadOS > Add > iOS/iPadOS Web Clip
2. Name: Fire Drill | URL: your Azure URL | Full Screen: Yes
3. Assign to iPad device group

## Updating
Push changes to this repo. Azure auto-deploys. iPads get updates on next open.

## Recipients
- Chrissy Strauser (cstrauser@sharedsupport.org)
- Michele Treas (mtreas@sharedsupport.org)

To change: edit RECIPIENTS in api/submit-drill/index.js
