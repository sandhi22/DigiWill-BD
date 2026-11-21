# DigiWill BD – View and Edit Saved Assets

## 1. Feature Overview
This module implements the View and Edit Saved Assets feature of the DigiWill BD system. It allows authenticated users to access and manage their saved digital assets.

## 2. Main Functionalities
- View saved assets.
- Search and filter saved assets.
- View asset details.
- Edit existing saved assets.
- Delete saved assets.
- Manage encrypted asset documents.

## 3. Technologies Used

### Frontend
- React
- JavaScript
- Vite
- CSS

### Backend
- Python
- Django
- Django REST Framework
- JWT Authentication
- SQLite (local development)

## 4. Project Structure

- frontend/ – React application.
- backend/ – Django application.
- backend/vault/ – Saved asset management.
- backend/accounts/ – User accounts.
- backend/legacy/ – Related supporting functionality.

## 5. Backend Setup

1. Open the backend directory.
2. Create and activate a Python virtual environment.
3. Install dependencies:

   pip install -r requirements.txt

4. Run database migrations:

   python manage.py migrate

5. Start the backend:

   python manage.py runserver

## 6. Frontend Setup

1. Open the frontend directory.
2. Install dependencies:

   npm install

3. Configure the API URL in .env:

   VITE_API_URL=http://localhost:8000/api

4. Start the frontend:

   npm run dev

## 7. Testing

The following checks were completed:

- Django system check: Passed.
- Database migrations: Passed.
- Backend tests: 10 tests passed.
- Frontend production build: Passed.
- Frontend ESLint check: Passed.

## 8. Purpose

This feature helps users securely view and manage their saved digital assets within the DigiWill BD system.

