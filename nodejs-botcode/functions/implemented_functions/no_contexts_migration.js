app.intent('handle_no_contexts', conv => {
  /*
  Any ghost contexts shall never haunt us again!
  We shall catch cases where the user got to an intent when they shouldn't have.
  Shouldn't be neccessary with correct dialogflow input contexts... :(
  */
  conv.user.storage.fallbackCount = 0; // Required for tracking fallback attempts!

  const intent_fallback_messages = [
    "Sorry, what do you want to do next?",
    "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or discover the GOAT movies?",
    "I'm having difficulties understanding what you want to do with Vote Goat. Do you want to rank movies, receive personalized movie recommendations, view your Vote Goat leaderboard position or discover the greatest movies of all time?"
  ];

  const textToSpeech = `<speak>` +
    `Sorry, you've taken the wrong turn. <break time="0.5s" /> ` +
    `What would you like to do instead? <break time="0.25s" /> ` +
    `Rank Movies? <break time="0.25s" /> ` +
    `Get a Movie Recommendation? <break time="0.25s" /> ` +
    `View your stats? <break time="0.25s" /> ` +
    `View the Greated movies of all time? <break time="0.25s" /> ` +
    `Or do you need help? <break time="0.25s" /> ` +
    `</speak>`;

  const textToDisplay = `Sorry, you've taken the wrong turn.! \n\n ` +
               `What would you like to do instead? \n\n ` +
               `🗳 Rank Movies? \n\n ` +
               `🤔 Get a Movie Recommendation? \n\n ` +
               `🏆 View your stats? \n\n ` +
               `🐐 View GOAT movies? \n\n ` +
               `📑 Or do you need help?`;

  conv.ask(
    new SimpleResponse({
      speech: textToSpeech,
      text: textToDisplay
    })
  );

  const hasScreen = conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');

  if (hasScreen === true) {
    conv.ask(
      new Suggestions('🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`)
    );
  }

  /*
  app.setContext('handle_no_contexts', 1, {
    "placeholder": "placeholder"
  });
  */
});
