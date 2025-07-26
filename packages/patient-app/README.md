## Onboarding Process

When a patient first opens the ClinicEZ Patient App, they are guided through a short onboarding tutorial that introduces the app's features and navigation.

After the tutorial, patients must find and join their clinic. This can be done in two ways:

- **Invitation Code or Email:** Patients may receive an invitation code or email from their clinic. Entering this code or following the email link allows them to join the clinic as a patient.
- **Clinic Search:** Patients can search for their clinic within the app and request to join as a member.

Patients cannot use the app's core features until they are associated with at least one clinic. This ensures that all health records, appointments, and communications are securely linked to the correct clinic.

# ClinicEZ Patient App

This is the official patient-facing mobile application for ClinicEZ. Built with Expo and React Native, it allows patients to manage appointments, view health records, communicate with clinics, and more—all from their mobile device.

> **Architecture Note:**
> The ClinicEZ Patient App is designed as a local-first (offline-first) application. All patient data is stored securely in a local database on the device using WatermelonDB. When the device has internet connectivity, the app automatically synchronizes data with the backend of the respective clinic, ensuring that records and updates are always up to date both locally and on the clinic's server.

## Features

- Book and manage appointments
- View personal health records
- Receive notifications and reminders
- Communicate securely with clinic staff
- Offline-first experience with local data storage (WatermelonDB)
- Join and manage multiple clinics as a patient
- Switch between different clinics within the app session

## Getting Started

To run the ClinicEZ Patient App locally:

1. Install dependencies:

   ```bash
   yarn install
   ```

2. Start the Expo development server:

   ```bash
   yarn start
   ```

3. Follow the Expo CLI instructions to open the app on an emulator, simulator, or physical device using Expo Go.


> **Note:**
> The ClinicEZ Patient App allows users to be members of multiple clinics. Patients can easily switch between different clinics during a session, accessing appointments, records, and communications for each clinic as needed.

For more information about the overall architecture and backend setup, see the root README in the repository.


## Development Notes

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

In the output, you'll find options to open the app in a:

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

## Get a fresh project


When you're ready, run:

```bash
yarn run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
