const crypto = require('crypto');

app.intent('userIDProof', conv => {
  /*
    Providing the user a proof of userID ownership by signing the userID with our openssl private key.
    Our public key can be used to verify that the userID has been signed by Vote Goat.
    Why? So you can prove cryptographically that you've done work & it may serve as the basis of crypto distribution (future projects - proof of concept!).

    TODO: Handle user message input, enabling 2-way public key handshake
  */

  const hasScreen = conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');

  var textToSpeech;
  var textToDisplay;
  var hashed_userID;
  var signed_userID;

  var showSignature = false;

  if (hasScreen === true && userIDCheck === true) {
    // Hashing then signing the userId
    // Code from: https://nodejs.org/api/crypto.html

    const hash = crypto.createHash('SHA512'); // Setting hashing algo to SHA512
    hash.update(conv.user.userId); // Setting the hashing target to the user's anonymous Google ID
    hash.digest('base64'); // Hashing the user's anonymous Google ID & outputing as base64 for efficiency

    const sign = crypto.createSign('SHA512'); // Setting signing algo to SHA512
    sign.update(hash); // Targetting the hashed userID
    const privateKey = functions.config().votegoat.private_signing_key;

    // TODO: NEED TO SET ABOVE KEY IN FIREBASE CLI:
    // firebase functions:config:set votegoat.private_signing_key="THE RSA PRIVATE KEY"
    // https://firebase.google.com/docs/functions/config-env

    signed_userID = sign.sign(privateKey, 'base64');
    hashed_userID = hash;

    showSignature = true;

    textToSpeech = `<speak>` +
      `Successfully created your proof of UserID ownership!` +
      `Please copy and paste the following codes, keep them somewhere safe!` +
      `</speak>`;

    textToDisplay = `I've successfully created your proof of UserID ownership!` +
    `Please copy and paste the following codes, keep them somewhere safe!`;

    chatbase_analytics(
      conv,
      'User provided proof of ID ownership', // input_message
      'userIDProof', // input_intent
      'Win' // win_or_fail
    );

  } else if (hasScreen === false && userIDCheck === 'valid') {
    textToSpeech = `<speak>` +
      `Sorry, you require a screen to access this functionality.` +
      `What would you like to do next?` +
      `</speak>`;

    textToDisplay = `Sorry, you require a screen to access this functionality.` +
      `What would you like to do next?`;

    chatbase_analytics(
      conv,
      `Couldn't provide proof of ID ownership due to screen`, // input_message
      'userIDProof', // input_intent
      'Win' // win_or_fail
    );
  } else {
    /*
      The user doesn't have a valid userID for this intent.
      Likely cause is that they've not enabled personalization, thus aren't eligible.
      TODO: Reject non-personalized userID users.
    */
    textToSpeech = `<speak>` +
      `Sorry, you're not eligible for this functionality unless you enable personalization.` +
      `What would you like to do next?` +
      `</speak>`;

    textToDisplay = `Sorry, you're not eligible for this functionality unless you enable personalization.` +
      `What would you like to do next?`;

    chatbase_analytics(
      conv,
      `Couldn't provide proof of ID ownership due to userID.`, // input_message
      'userIDProof', // input_intent
      'Win' // win_or_fail
    );
  }

  // Displaying initial response to user
  conv.close(
    new SimpleResponse({
      speech: textToSpeech,
      text: textToDisplay
    })
  );

  if (showSignature === true) {
    /*
     Displaying the signature to the user
     There's no copy/paste functionality, so we're sending them to about:blank to share the data via the URL!
    */
    conv.close(
      new BasicCard({
        title: `Success - Proof generated!`,
        text: `Clicking the button will launch a blank web page, copy the contents of the URL and store it safely for future use.`,
        buttons: new Button({
          title: `👉 Click for code!`,
          url: `about:blank?id=${hashed_userID}&code=${signed_userID}`, // TODO: Potentially replace about:blank, however ideally this data isn't sent across the internet!
        }),
        /*
        image: { // Mostly, you can provide just the raw API objects
          url: `${movie_element.poster_url}`,
          accessibilityText: `${movie_element.title}`,
        },
        */
        display: 'WHITE'
      })
    );
  }
})
