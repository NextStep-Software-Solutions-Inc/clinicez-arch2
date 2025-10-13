# CLINIC EZ

## Clinic App

This is the official clinic-level mobile application of the Clinic EZ platform, made using the React Native framework Expo.

Following are the instructions in installing the mobile app locally for `development`.

### Installation

First, create an `.env` file for development (e.g., `env.development.local`) and copy paste the following code shown below.

```bash
# .env.example
# CLERK
EXPO_CLERK_PUBLISHABLE_KEY=<your-publishable-key-here>
```

Where your `EXPO_CLERK_PUBLISHABLE_KEY` is the key from your Clerk application. Visit your [Clerk Dashboard](https://www.dashboard.clerk.com) for more information.

> [!IMPORTANT]
> There are two deployments available when dealing with Clerk: `production` and `environment`. Make sure to specify the appropriate environment for your `EXPO_CLERK_PUBLISHABLE_KEY`!
