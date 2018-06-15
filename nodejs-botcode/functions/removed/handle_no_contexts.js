app.intent('handle_no_contexts', conv => {
  /*
  The purpose of this intent is to handle situations where a context was required but not present within the user's device. This intent ideally is never called, but was triggered during development of v1 occasionally.
  */
  conv.user.storage.fallbackCount = 0; // Required for tracking fallback attempts!

  const fallback_messages = [
    "Sorry, what do you want to do next?",
    "I didn't catch that. Do you want to rank movies, receive movie recommendations, view your leaderboard position or discover the GOAT movies?",
    "I'm having difficulties understanding what you want to do with Vote Goat. Do you want to rank movies, receive personalized movie recommendations, view your Vote Goat leaderboard position or discover the greatest movies of all time?"
  ];

  store_fallback_response(conv, fallback_messages, suggestions);

  const textToSpeech = `<speak>` +
    `Sorry, you've taken a wrong turn. <break time="0.5s" /> ` +
    `What would you like to do instead? <break time="0.25s" /> ` +
    `Rank Movies? <break time="0.25s" /> ` +
    `Get a Movie Recommendation? <break time="0.25s" /> ` +
    `View your stats? <break time="0.25s" /> ` +
    `View the Greated movies of all time? <break time="0.25s" /> ` +
    `Or do you need help? <break time="0.25s" /> ` +
    `</speak>`;

  const textToDisplay = `Sorry, you've taken a wrong turn.! \n\n ` +
               `What would you like to do instead? \n\n ` +
               `🗳 Rank Movies? \n\n ` +
               `🤔 Get a Movie Recommendation? \n\n ` +
               `🏆 View your stats? \n\n ` +
               `🐐 View GOAT movies? \n\n ` +
               `📑 Or do you need help?`;

  store_repeat_response(conv, 'handle_no_contexts', textToSpeech, textToDisplay); // Storing repeat info

  conv.ask(
    new SimpleResponse({
      speech: textToSpeech,
      text: textToDisplay
    })
  );

  if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
    conv.ask(
      new Suggestions('🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`)
    );
  }
});
