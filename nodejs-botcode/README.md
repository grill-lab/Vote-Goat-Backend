# Vote Goat NodeJS Cloud functions

We use Firebase Cloud Functions (NodeJS) for Vote Goat's Web Hook back end.

GET requests are performed against the HUG REST API from within the cloud functions.

## Setup environment

You need to install [NodeJS v6.14.0](https://nodejs.org/dist/v6.14.0/)

> ###### Why 6.14.0 & not the latest NodeJS?
> Firebase does not yet run the latest NodeJS version - this limits our coding capabilities, however this is likely a temporary limitation (May require v3 migration once support for latest NodeJS exists).

If you're using Linux, use [NVM](https://github.com/creationix/nvm) to manage your [NodeJS installation](https://github.com/creationix/nvm#install-script) then perform the following commands:

```
nvm install v6.14.0
nvm use v6.14.0
```

## initialize Firebase

Set up and initialize the Firebase CLI. If the following command fails with an EACCES error, you may need to change npm permissions.

```
npm install -g firebase-tools
```

Authenticate the firebase tool with your Google account:
```
firebase login
```
Start the project directory where you saved your Actions project. You'll be asked to select which Firebase CLI features you want to setup for your Actions project. Choose Functions and other features you might want to use, like Firestore, then press Enter to confirm and continue:

```
# Note: Use an empty folder for now!
mkdir Vote_Goat_Firebase
cd Vote_Goat_Firebase
firebase init
```

Associate the firebase tool with your Actions project by selecting it using the arrow keys to navigate the projects list:
```
=== Functions Setup

A functions directory will be created in your project with a Node.js
package pre-configured. Functions can be deployed with firebase deploy.


? What language would you like to use to write Cloud Functions? (Use arrow keys)
> JavaScript
TypeScript
```

After choosing the project, the firebase tool will start the Functions setup asking you what language you want to use. Select using the arrow keys and press Enter to continue.
```
=== Functions Setup
```
A functions directory will be created in your project with a Node.js package pre-configured. Functions can be deployed with ```firebase deploy```

```
? What language would you like to use to write Cloud Functions? (Use arrow keys)
> JavaScript
TypeScript
```
Choose if you want to use ESLint to catch probable bugs and enforce style typing Y:
```
? Do you want to use ESLint to catch probable bugs and enforce style? Y
```
Get the project dependencies by typing Y to the prompt:
```
? Do you want to install dependencies with npm now? (Y/n)
```
Once the setup is completed, you'll see an output similar to the following:
```
✔  Firebase initialization complete!
```

## Clone repo & Move files

Git clone this repository into a separate folder
```
cd ..
git clone https://github.com/know-ail/Vote-Goat-Backend.git
```

Move the files:
```
cd Vote-Goat-Backend/functions/
mv index_v2_staging.js ../../Vote_Goat_Firebase/functions/
mv package.json ../../Vote_Goat_Firebase/functions/
```

Install the npm package dependencies in the package.json
```
cd ../../Vote_Goat_Firebase/functions/
npm install
```

If the above fails, use the following commands:
```
npm install actions-on-google
npm install firebase-admin
npm install firebase-functions
npm install request
```

### Deploy Firebase Cloud Function

#### :warning: Warning!

> ***Do not deploy staging code to production***, always make sure that you're logged into the staging firebase project before performing the following commands during development/staging.

From within the ```Vote_Goat_Firebase``` folder in the terminal, run the command
`npm run deploy` (MAC: `npm run mdp`)


The deployment takes a few minutes. Once completed, you'll see output similar to the following.

```
✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/myprojectname-ab123/overview
Function URL (cloudFunctionName): https://us-central1-myprojectname-ab123.cloudfunctions.net/cloudFunctionName
```

Copy down the copied Function URL (not the above readme example URL) to enter in Dialogflow:

![](https://i.imgur.com/2WpYF05.png)

Congratulations! Your Web Hook should now be online & your personal Vote Goat bot should be operational in the test simulator.

# Troubleshooting

###### Web hook isn't working despite successful deploy?

* Check that you've provided the authentication keys for your web hook to authenticate with dialogflow (TODO!).
* Make sure you're using the 'Blaze' Firebase billing option, otherwise external calls to HUG won't work.
* Make sure you've deployed the HUG REST API servers & they're accessible publicly (though not without a private API KEY) & you've replaced the HUG URL targets from the placeholder URLs to your own domain.

###### Failed to deploy to firebase?

* Fix any issues that ESLint is complaining about.
* Close & relaunch terminal, log out & back into firebase.

###### Couldn't install npm packages

* Make sure you're using the correct NodeJS version: v6.14.0
* If you've messed up your dev environment, consider spinning up a low spec VM or VPS & start the install from scratch, it's not a compute intensive task so you don't need expensive equipment.

# Credit

Google's "[Deploy-Fulfillment](https://developers.google.com/actions/dialogflow/deploy-fulfillment)" guide for a lot of the above steps!
